//! One preflight pass over every provider, as the Providers screen shows it.
use super::capabilities::{self, Capability, Enforcement};
use super::claude::{ClaudeSignIn, run_canary, signin_from};
use super::probe::{self, ProbeRecord};
use super::usage::{Usage, claude_usage};
use super::{CodexSignIn, Discovery, Found, Provider, codex_signin, discover, operator_codex_home};
use serde::Serialize;
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCheck {
    pub discovery: Discovery,
    pub signin: SignInCheck,
    pub usage: Usage,
    pub read_only: ReadOnlyCheck,
    /// How Bezl's reviewer args hold each capability, found or not.
    pub enforcement: BTreeMap<Capability, Enforcement>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum ReadOnlyCheck {
    NoBinary,
    /// No record for this version, and the reviewer cannot run signed out.
    NeedsSignIn,
    /// From this version's record, or probed now and recorded.
    Probed(ProbeRecord),
    /// Not recorded, so the next preflight probes again.
    CouldNotRun {
        says: String,
    },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum SignInCheck {
    /// Nothing found on PATH to ask.
    NoBinary,
    /// Claude Code's one-call canary.
    Canary(ClaudeSignIn),
    Homes(Vec<HomeSignIn>),
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct HomeSignIn {
    pub home: Home,
    pub path: PathBuf,
    pub signin: CodexSignIn,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Home {
    Operator,
    Workers,
}

/// Per CLI run; a hung CLI costs at most this.
const TIMEOUT: Duration = Duration::from_secs(10);
/// Live canary took 8-9s on 2026-10-29, mostly the API round trip.
const CANARY_TIMEOUT: Duration = Duration::from_secs(30);
/// Live probes took 10-12s on 2026-10-29; the reviewer may try several tools.
const PROBE_TIMEOUT: Duration = Duration::from_secs(180);

/// Probe records live in `cache`, one per provider and CLI version.
pub struct Probes {
    pub cache: PathBuf,
    pub timeout: Duration,
}

pub struct CodexHomes {
    pub operator: PathBuf,
    pub workers: PathBuf,
}

pub fn preflight(
    search_path: &OsStr,
    homes: &CodexHomes,
    probes: &Probes,
    timeout: Duration,
    canary_timeout: Duration,
) -> Vec<ProviderCheck> {
    [Provider::ClaudeCode, Provider::Codex]
        .into_iter()
        .map(|provider| {
            let discovery = discover(provider, search_path, timeout);
            let (signin, usage) = match (&discovery.found, provider) {
                (None, _) => (SignInCheck::NoBinary, Usage::UNKNOWN),
                (Some(found), Provider::ClaudeCode) => {
                    let ran = run_canary(&found.path, canary_timeout);
                    let usage = ran
                        .as_ref()
                        .map_or(Usage::UNKNOWN, |ran| claude_usage(&ran.stdout));
                    (SignInCheck::Canary(signin_from(ran)), usage)
                }
                // No preflight Codex call reports usage; a paid one is not worth it.
                (Some(found), Provider::Codex) => (
                    SignInCheck::Homes(
                        [
                            (Home::Operator, &homes.operator),
                            (Home::Workers, &homes.workers),
                        ]
                        .into_iter()
                        .map(|(home, path)| HomeSignIn {
                            home,
                            path: path.clone(),
                            signin: codex_signin(&found.path, path, timeout),
                        })
                        .collect(),
                    ),
                    Usage::UNKNOWN,
                ),
            };
            let read_only = match &discovery.found {
                None => ReadOnlyCheck::NoBinary,
                Some(found) => read_only(provider, found, reviewer_env(&signin, homes), probes),
            };
            ProviderCheck {
                discovery,
                signin,
                usage,
                read_only,
                enforcement: capabilities::enforcement(provider),
            }
        })
        .collect()
}

/// Env a signed-in reviewer runs with; `None` when it is not signed in.
fn reviewer_env<'a>(
    signin: &SignInCheck,
    homes: &'a CodexHomes,
) -> Option<Vec<(&'static str, &'a OsStr)>> {
    match signin {
        SignInCheck::Canary(ClaudeSignIn::SignedIn { .. }) => Some(vec![]),
        SignInCheck::Homes(signins) => signins
            .iter()
            .any(|h| h.home == Home::Workers && matches!(h.signin, CodexSignIn::SignedIn(_)))
            .then(|| vec![("CODEX_HOME", homes.workers.as_os_str())]),
        _ => None,
    }
}

/// A version recorded with today's reviewer args is never probed again: each probe is a paid call.
fn read_only(
    provider: Provider,
    found: &Found,
    env: Option<Vec<(&str, &OsStr)>>,
    probes: &Probes,
) -> ReadOnlyCheck {
    if let Some(record) = probe::load(&probes.cache, provider, &found.version) {
        return ReadOnlyCheck::Probed(record);
    }
    let Some(env) = env else {
        return ReadOnlyCheck::NeedsSignIn;
    };
    match probe::probe(provider, found, &env, probes.timeout) {
        Ok(record) => {
            if let Err(e) = probe::store(&probes.cache, &record) {
                log::warn!("read-only probe record not stored: {e}");
            }
            ReadOnlyCheck::Probed(record)
        }
        Err(says) => ReadOnlyCheck::CouldNotRun { says },
    }
}

/// macOS: Tauri's app data dir. Linux: `$XDG_DATA_HOME/bezl`, not Tauri's `dev.bezl.app`.
pub fn workers_codex_home(os: &str, app_data_dir: &Path, data_dir: &Path) -> PathBuf {
    match os {
        "linux" => data_dir.join("bezl").join("codex-home"),
        _ => app_data_dir.join("codex-home"),
    }
}

/// PATH as Bezl was launched with it; a Finder launch gets launchd's short PATH.
#[tauri::command]
pub async fn providers_preflight(app: tauri::AppHandle) -> Result<Vec<ProviderCheck>, String> {
    use tauri::Manager;
    let paths = app.path();
    let app_data = paths.app_data_dir().map_err(|e| e.to_string())?;
    let probes = Probes {
        cache: app_data.join("probes"),
        timeout: PROBE_TIMEOUT,
    };
    let homes = CodexHomes {
        operator: operator_codex_home(
            std::env::var_os("CODEX_HOME").as_deref(),
            &paths.home_dir().map_err(|e| e.to_string())?,
        ),
        workers: workers_codex_home(
            std::env::consts::OS,
            &app_data,
            &paths.data_dir().map_err(|e| e.to_string())?,
        ),
    };
    let search_path = std::env::var_os("PATH").unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        preflight(&search_path, &homes, &probes, TIMEOUT, CANARY_TIMEOUT)
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::capabilities::enforcement;
    use crate::providers::probe::{Cost, Outcome};
    use crate::providers::usage::Tokens;
    use crate::providers::{Found, Rejected, Rejection, RunError, SignInMethod};
    use serde_json::json;

    #[test]
    fn workers_home_on_macos_is_in_app_data() {
        assert_eq!(
            workers_codex_home(
                "macos",
                Path::new("/Users/me/Library/Application Support/dev.bezl.app"),
                Path::new("/Users/me/Library/Application Support"),
            ),
            PathBuf::from("/Users/me/Library/Application Support/dev.bezl.app/codex-home")
        );
    }

    #[test]
    fn workers_home_on_linux_is_xdg_data_bezl() {
        assert_eq!(
            workers_codex_home(
                "linux",
                Path::new("/home/me/.local/share/dev.bezl.app"),
                Path::new("/home/me/.local/share"),
            ),
            PathBuf::from("/home/me/.local/share/bezl/codex-home")
        );
    }

    #[test]
    fn a_report_serializes_for_the_screen() {
        let report = vec![
            ProviderCheck {
                discovery: Discovery {
                    provider: Provider::ClaudeCode,
                    found: Some(Found {
                        path: "/bin/claude".into(),
                        version: "2.1.312".into(),
                    }),
                    rejected: vec![],
                },
                signin: SignInCheck::Canary(ClaudeSignIn::SignedIn {
                    model: "claude-haiku-5-5".into(),
                }),
                usage: Usage::UNKNOWN,
                read_only: ReadOnlyCheck::CouldNotRun {
                    says: "timed out".into(),
                },
                enforcement: enforcement(Provider::ClaudeCode),
            },
            ProviderCheck {
                discovery: Discovery {
                    provider: Provider::Codex,
                    found: None,
                    rejected: vec![Rejected {
                        path: "/bun/codex".into(),
                        reason: Rejection::Says("0.2.3".into()),
                    }],
                },
                signin: SignInCheck::NoBinary,
                usage: Usage::UNKNOWN,
                read_only: ReadOnlyCheck::NoBinary,
                enforcement: enforcement(Provider::Codex),
            },
        ];
        assert_eq!(
            serde_json::to_value(&report).unwrap(),
            json!([
                {
                    "discovery": {
                        "provider": "claude",
                        "found": { "path": "/bin/claude", "version": "2.1.312" },
                        "rejected": []
                    },
                    "signin": {
                        "kind": "canary",
                        "detail": { "kind": "signedIn", "detail": { "model": "claude-haiku-5-5" } }
                    },
                    "usage": { "tokens": { "kind": "unknown" }, "limits": { "kind": "unknown" } },
                    "readOnly": { "kind": "couldNotRun", "detail": { "says": "timed out" } },
                    "enforcement": serde_json::to_value(enforcement(Provider::ClaudeCode)).unwrap()
                },
                {
                    "discovery": {
                        "provider": "codex",
                        "found": null,
                        "rejected": [
                            { "path": "/bun/codex", "reason": { "kind": "says", "detail": "0.2.3" } }
                        ]
                    },
                    "signin": { "kind": "noBinary" },
                    "usage": { "tokens": { "kind": "unknown" }, "limits": { "kind": "unknown" } },
                    "readOnly": { "kind": "noBinary" },
                    "enforcement": serde_json::to_value(enforcement(Provider::Codex)).unwrap()
                }
            ])
        );
    }

    #[test]
    fn home_signins_serialize_with_their_home() {
        let check = SignInCheck::Homes(vec![
            HomeSignIn {
                home: Home::Operator,
                path: "/Users/me/.codex".into(),
                signin: CodexSignIn::SignedIn(SignInMethod::ChatGpt),
            },
            HomeSignIn {
                home: Home::Workers,
                path: "/w".into(),
                signin: CodexSignIn::Failed(RunError::TimedOut),
            },
        ]);
        assert_eq!(
            serde_json::to_value(&check).unwrap(),
            json!({
                "kind": "homes",
                "detail": [
                    {
                        "home": "operator",
                        "path": "/Users/me/.codex",
                        "signin": { "kind": "signedIn", "detail": "chatGpt" }
                    },
                    {
                        "home": "workers",
                        "path": "/w",
                        "signin": { "kind": "failed", "detail": { "kind": "timedOut" } }
                    }
                ]
            })
        );
    }

    #[test]
    fn every_rejection_serializes_with_a_kind() {
        let cases = [
            (Rejection::NoOutput, json!({ "kind": "noOutput" })),
            (Rejection::TimedOut, json!({ "kind": "timedOut" })),
            (
                Rejection::Exited {
                    code: Some(2),
                    says: "boom".into(),
                },
                json!({ "kind": "exited", "detail": { "code": 2, "says": "boom" } }),
            ),
            (
                Rejection::DidNotStart("denied".into()),
                json!({ "kind": "didNotStart", "detail": "denied" }),
            ),
        ];
        for (reason, want) in cases {
            assert_eq!(serde_json::to_value(&reason).unwrap(), want);
        }
    }

    #[test]
    fn every_codex_signin_serializes_with_a_kind() {
        let cases = [
            (CodexSignIn::SignedOut, json!({ "kind": "signedOut" })),
            (CodexSignIn::HomeMissing, json!({ "kind": "homeMissing" })),
            (
                CodexSignIn::SignedIn(SignInMethod::ApiKey),
                json!({ "kind": "signedIn", "detail": "apiKey" }),
            ),
            (
                CodexSignIn::Unrecognized {
                    code: None,
                    says: "?".into(),
                },
                json!({ "kind": "unrecognized", "detail": { "code": null, "says": "?" } }),
            ),
            (
                CodexSignIn::Failed(RunError::DidNotStart("gone".into())),
                json!({ "kind": "failed", "detail": { "kind": "didNotStart", "detail": "gone" } }),
            ),
        ];
        for (signin, want) in cases {
            assert_eq!(serde_json::to_value(&signin).unwrap(), want);
        }
    }

    #[test]
    fn every_claude_signin_serializes_with_a_kind() {
        let cases = [
            (
                ClaudeSignIn::SignedOut {
                    says: "Not logged in".into(),
                },
                json!({ "kind": "signedOut", "detail": { "says": "Not logged in" } }),
            ),
            (
                ClaudeSignIn::OutOfQuota {
                    says: "limit".into(),
                },
                json!({ "kind": "outOfQuota", "detail": { "says": "limit" } }),
            ),
            (
                ClaudeSignIn::Unrecognized {
                    code: Some(1),
                    says: "?".into(),
                },
                json!({ "kind": "unrecognized", "detail": { "code": 1, "says": "?" } }),
            ),
            (
                ClaudeSignIn::Failed(RunError::TimedOut),
                json!({ "kind": "failed", "detail": { "kind": "timedOut" } }),
            ),
        ];
        for (signin, want) in cases {
            assert_eq!(serde_json::to_value(&signin).unwrap(), want);
        }
    }

    #[test]
    fn every_read_only_check_serializes_with_a_kind() {
        let record = ProbeRecord {
            provider: Provider::Codex,
            version: "0.163.0".into(),
            reviewer_args: vec!["--sandbox".into()],
            probed_at: 1,
            capabilities: [(Capability::Hooks, Outcome::Passed)].into(),
            cost: Cost {
                usd: Some(0.5),
                tokens: Tokens::Unknown,
            },
        };
        let cases = [
            (ReadOnlyCheck::NoBinary, json!({ "kind": "noBinary" })),
            (ReadOnlyCheck::NeedsSignIn, json!({ "kind": "needsSignIn" })),
            (
                ReadOnlyCheck::CouldNotRun { says: "x".into() },
                json!({ "kind": "couldNotRun", "detail": { "says": "x" } }),
            ),
            (
                ReadOnlyCheck::Probed(record.clone()),
                json!({ "kind": "probed", "detail": serde_json::to_value(&record).unwrap() }),
            ),
        ];
        for (check, want) in cases {
            assert_eq!(serde_json::to_value(&check).unwrap(), want);
        }
    }

    #[cfg(unix)]
    mod with_fake_clis {
        use super::*;
        use crate::providers::capabilities::{CAPABILITIES, reviewer_args};
        use crate::providers::probe;
        use crate::providers::testing::Dir;
        use crate::providers::usage::claude_usage;
        use std::fs;

        const TIMEOUT: Duration = Duration::from_secs(5);

        /// Real-looking codex: version, `login status` from `$CODEX_HOME/said`, `exec` prints `probe`.
        const CODEX: &str = r#"[ "$1" = "--version" ] && { echo "codex-cli 0.163.0"; exit 0; }
[ "$1" = "exec" ] && { echo "$CODEX_HOME" > "$(dirname "$0")/probed-home"; cat "$(dirname "$0")/probe"; exit 0; }
[ "$*" = "login status" ] || exit 64
cat "$CODEX_HOME/said" >&2
exit "$(cat "$CODEX_HOME/code")""#;

        /// Real-looking claude: version; the probe (stream-json) prints `probe`, the canary `said`.
        const CLAUDE: &str = r#"[ "$1" = "--version" ] && { echo "2.1.312 (Claude Code)"; exit 0; }
[ "$1" = "-p" ] || exit 64
case "$*" in *stream-json*) cat "$(dirname "$0")/probe"; exit 0;; esac
cat "$(dirname "$0")/said""#;
        const SIGNED_IN: &str = include_str!("fixtures/claude-2.1.312/signed-in.json");
        const NOT_LOGGED_IN: &str = include_str!("fixtures/claude-2.1.312/not-logged-in.json");
        const CLAUDE_PROBE: &str = include_str!("fixtures/claude-2.1.312/probe-read-only.jsonl");
        const CODEX_PROBE: &str = include_str!("fixtures/codex-0.163.0/probe-read-only.jsonl");
        /// Each run appends a line to `runs` beside the fake.
        const COUNTED: &str = "echo >> \"$(dirname \"$0\")/runs\"; ";

        fn probes(dir: &Dir) -> Probes {
            Probes {
                cache: dir.0.join("probes"),
                timeout: TIMEOUT,
            }
        }

        /// A record already on disk for `provider` at `version`.
        fn recorded(dir: &Dir, provider: Provider, version: &str) -> ProbeRecord {
            let record = ProbeRecord {
                provider,
                version: version.into(),
                reviewer_args: reviewer_args(provider)
                    .iter()
                    .map(|a| a.to_string())
                    .collect(),
                probed_at: 1,
                capabilities: CAPABILITIES.map(|c| (c, Outcome::Passed)).into(),
                cost: Cost {
                    usd: None,
                    tokens: Tokens::Unknown,
                },
            };
            probe::store(&probes(dir).cache, &record).unwrap();
            record
        }

        fn runs(bin: &Path) -> usize {
            fs::read_to_string(bin.join("runs")).map_or(0, |r| r.lines().count())
        }

        /// Script at `<dir>/<sub>/<name>`; returns its folder for PATH.
        fn bin(dir: &Dir, sub: &str, name: &str, body: &str) -> PathBuf {
            let script = dir.script(&format!("{sub}/{name}"), body);
            script.parent().unwrap().to_path_buf()
        }

        fn signed_in_home(dir: &Dir) -> PathBuf {
            signed_in(dir, "operator")
        }

        fn signed_in(dir: &Dir, name: &str) -> PathBuf {
            let home = dir.0.join(name);
            fs::create_dir_all(&home).unwrap();
            fs::write(home.join("said"), "Logged in using ChatGPT\n").unwrap();
            fs::write(home.join("code"), "0").unwrap();
            home
        }

        #[test]
        fn checks_each_provider_and_codex_in_both_homes() {
            let dir = Dir::new();
            let bun = bin(&dir, "bun", "codex", "echo 0.2.3");
            let real = bin(&dir, "real", "codex", CODEX);
            let claude = bin(&dir, "claude", "claude", CLAUDE);
            fs::write(claude.join("said"), SIGNED_IN).unwrap();
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers-missing"),
            };
            let path = std::env::join_paths([&claude, &bun, &real]).unwrap();
            let record = recorded(&dir, Provider::ClaudeCode, "2.1.312");

            assert_eq!(
                preflight(&path, &homes, &probes(&dir), TIMEOUT, TIMEOUT),
                vec![
                    ProviderCheck {
                        discovery: Discovery {
                            provider: Provider::ClaudeCode,
                            found: Some(Found {
                                path: claude.join("claude"),
                                version: "2.1.312".into(),
                            }),
                            rejected: vec![],
                        },
                        signin: SignInCheck::Canary(ClaudeSignIn::SignedIn {
                            model: "claude-haiku-5-5".into(),
                        }),
                        usage: claude_usage(SIGNED_IN),
                        read_only: ReadOnlyCheck::Probed(record),
                        enforcement: enforcement(Provider::ClaudeCode),
                    },
                    ProviderCheck {
                        discovery: Discovery {
                            provider: Provider::Codex,
                            found: Some(Found {
                                path: real.join("codex"),
                                version: "0.163.0".into(),
                            }),
                            rejected: vec![Rejected {
                                path: bun.join("codex"),
                                reason: Rejection::Says("0.2.3".into()),
                            }],
                        },
                        signin: SignInCheck::Homes(vec![
                            HomeSignIn {
                                home: Home::Operator,
                                path: homes.operator.clone(),
                                signin: CodexSignIn::SignedIn(SignInMethod::ChatGpt),
                            },
                            HomeSignIn {
                                home: Home::Workers,
                                path: homes.workers.clone(),
                                signin: CodexSignIn::HomeMissing,
                            },
                        ]),
                        // No preflight Codex call reports usage; a paid one is not worth it.
                        usage: Usage::UNKNOWN,
                        // Reviewers run in the workers' home.
                        read_only: ReadOnlyCheck::NeedsSignIn,
                        enforcement: enforcement(Provider::Codex),
                    },
                ]
            );
        }

        #[test]
        fn one_canary_run_feeds_both_signin_and_usage() {
            let dir = Dir::new();
            let counted = CLAUDE.replace("cat ", &format!("{COUNTED}cat "));
            let claude = bin(&dir, "claude", "claude", &counted);
            fs::write(claude.join("said"), SIGNED_IN).unwrap();
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers"),
            };
            recorded(&dir, Provider::ClaudeCode, "2.1.312");
            let checks = preflight(claude.as_os_str(), &homes, &probes(&dir), TIMEOUT, TIMEOUT);

            assert!(matches!(checks[0].usage.tokens, Tokens::Known { .. }));
            assert_eq!(runs(&claude), 1);
        }

        #[test]
        fn the_canary_gets_its_own_longer_timeout() {
            let dir = Dir::new();
            let slow = CLAUDE.replace("cat ", "sleep 2; cat ");
            let claude = bin(&dir, "claude", "claude", &slow);
            fs::write(claude.join("said"), SIGNED_IN).unwrap();
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers"),
            };
            recorded(&dir, Provider::ClaudeCode, "2.1.312");
            let checks = preflight(
                claude.as_os_str(),
                &homes,
                &probes(&dir),
                Duration::from_secs(1),
                TIMEOUT,
            );

            assert_eq!(
                checks[0].signin,
                SignInCheck::Canary(ClaudeSignIn::SignedIn {
                    model: "claude-haiku-5-5".into(),
                })
            );
        }

        #[test]
        fn nothing_found_means_no_signin_check() {
            let dir = Dir::new();
            let bun = bin(&dir, "bun", "codex", "echo 0.2.3");
            // Not Claude Code by its version; any canary run would leave `ran`.
            let old = bin(
                &dir,
                "old",
                "claude",
                r#"[ "$1" = "-p" ] && touch "$(dirname "$0")/ran"; echo 0.9"#,
            );
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers"),
            };
            let path = std::env::join_paths([&bun, &old]).unwrap();
            let checks = preflight(&path, &homes, &probes(&dir), TIMEOUT, TIMEOUT);

            let signins: Vec<_> = checks.iter().map(|c| &c.signin).collect();
            assert_eq!(signins, [&SignInCheck::NoBinary, &SignInCheck::NoBinary]);
            assert!(
                checks
                    .iter()
                    .all(|c| c.read_only == ReadOnlyCheck::NoBinary)
            );
            assert!(checks.iter().all(|c| c.usage == Usage::UNKNOWN));
            assert_eq!(checks[0].discovery.rejected.len(), 1);
            assert_eq!(checks[1].discovery.rejected.len(), 1);
            assert!(!old.join("ran").exists(), "canary ran on a rejected claude");
        }

        #[test]
        fn an_unrecorded_version_is_probed_once_then_read_from_its_record() {
            let dir = Dir::new();
            let counted = CLAUDE.replace("cat ", &format!("{COUNTED}cat "));
            let claude = bin(&dir, "claude", "claude", &counted);
            fs::write(claude.join("said"), SIGNED_IN).unwrap();
            fs::write(claude.join("probe"), CLAUDE_PROBE).unwrap();
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers"),
            };
            let first = preflight(claude.as_os_str(), &homes, &probes(&dir), TIMEOUT, TIMEOUT);
            let ReadOnlyCheck::Probed(record) = &first[0].read_only else {
                panic!("{:?}", first[0].read_only);
            };
            assert_eq!(
                (record.provider, record.version.as_str()),
                (Provider::ClaudeCode, "2.1.312")
            );
            assert!(record.capabilities.values().all(|o| *o == Outcome::Passed));
            assert_eq!(runs(&claude), 2, "canary and probe");

            let second = preflight(claude.as_os_str(), &homes, &probes(&dir), TIMEOUT, TIMEOUT);
            assert_eq!(second[0].read_only, first[0].read_only);
            assert_eq!(runs(&claude), 3, "the second preflight ran the canary only");
        }

        #[test]
        fn a_record_probed_with_other_reviewer_args_is_probed_again() {
            let dir = Dir::new();
            let counted = CLAUDE.replace("cat ", &format!("{COUNTED}cat "));
            let claude = bin(&dir, "claude", "claude", &counted);
            fs::write(claude.join("said"), SIGNED_IN).unwrap();
            fs::write(claude.join("probe"), CLAUDE_PROBE).unwrap();
            let stale = ProbeRecord {
                reviewer_args: vec!["--tools".into(), "Read".into()],
                ..recorded(&dir, Provider::ClaudeCode, "2.1.312")
            };
            probe::store(&probes(&dir).cache, &stale).unwrap();
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers"),
            };
            let checks = preflight(claude.as_os_str(), &homes, &probes(&dir), TIMEOUT, TIMEOUT);

            let ReadOnlyCheck::Probed(record) = &checks[0].read_only else {
                panic!("{:?}", checks[0].read_only);
            };
            assert_eq!(record.reviewer_args, reviewer_args(Provider::ClaudeCode));
            assert_eq!(runs(&claude), 2, "canary and probe");
            assert_eq!(
                probe::load(&probes(&dir).cache, Provider::ClaudeCode, "2.1.312").as_ref(),
                Some(record)
            );
        }

        #[test]
        fn a_probe_that_proves_nothing_is_reported_and_not_recorded() {
            let dir = Dir::new();
            let claude = bin(&dir, "claude", "claude", CLAUDE);
            fs::write(claude.join("said"), SIGNED_IN).unwrap();
            fs::write(claude.join("probe"), "error: unknown option\n").unwrap();
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers"),
            };
            let checks = preflight(claude.as_os_str(), &homes, &probes(&dir), TIMEOUT, TIMEOUT);

            assert_eq!(
                checks[0].read_only,
                ReadOnlyCheck::CouldNotRun {
                    says: "no init event".into()
                }
            );
            assert_eq!(
                probe::load(&probes(&dir).cache, Provider::ClaudeCode, "2.1.312"),
                None
            );
        }

        #[test]
        fn a_claude_that_is_not_signed_in_is_not_probed() {
            let dir = Dir::new();
            let counted = CLAUDE.replace("cat ", &format!("{COUNTED}cat "));
            let claude = bin(&dir, "claude", "claude", &counted);
            fs::write(claude.join("said"), NOT_LOGGED_IN).unwrap();
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers"),
            };
            let checks = preflight(claude.as_os_str(), &homes, &probes(&dir), TIMEOUT, TIMEOUT);

            assert_eq!(checks[0].read_only, ReadOnlyCheck::NeedsSignIn);
            assert_eq!(runs(&claude), 1, "canary only");
        }

        #[test]
        fn codex_is_probed_in_the_workers_home() {
            let dir = Dir::new();
            let codex = bin(&dir, "real", "codex", CODEX);
            fs::write(codex.join("probe"), CODEX_PROBE).unwrap();
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: signed_in(&dir, "workers"),
            };
            let checks = preflight(codex.as_os_str(), &homes, &probes(&dir), TIMEOUT, TIMEOUT);

            let ReadOnlyCheck::Probed(record) = &checks[1].read_only else {
                panic!("{:?}", checks[1].read_only);
            };
            assert_eq!(
                (record.provider, record.version.as_str()),
                (Provider::Codex, "0.163.0")
            );
            assert_eq!(
                record.capabilities[&Capability::FileWrites],
                Outcome::Passed
            );
            assert_eq!(
                fs::read_to_string(codex.join("probed-home"))
                    .unwrap()
                    .trim(),
                homes.workers.to_str().unwrap()
            );
        }
    }
}
