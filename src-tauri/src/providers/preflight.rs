//! One preflight pass over every provider, as the Providers screen shows it.
use super::{CodexSignIn, Discovery, Provider, codex_signin, discover, operator_codex_home};
use serde::Serialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct ProviderCheck {
    pub discovery: Discovery,
    pub signin: SignInCheck,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum SignInCheck {
    /// Nothing found on PATH to ask.
    NoBinary,
    /// Claude has no status command; its canary is another slice.
    NotCheckedYet,
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

pub struct CodexHomes {
    pub operator: PathBuf,
    pub workers: PathBuf,
}

pub fn preflight(search_path: &OsStr, homes: &CodexHomes, timeout: Duration) -> Vec<ProviderCheck> {
    [Provider::ClaudeCode, Provider::Codex]
        .into_iter()
        .map(|provider| {
            let discovery = discover(provider, search_path, timeout);
            let signin = match (&discovery.found, provider) {
                (None, _) => SignInCheck::NoBinary,
                (Some(_), Provider::ClaudeCode) => SignInCheck::NotCheckedYet,
                (Some(found), Provider::Codex) => SignInCheck::Homes(
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
            };
            ProviderCheck { discovery, signin }
        })
        .collect()
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
    let homes = CodexHomes {
        operator: operator_codex_home(
            std::env::var_os("CODEX_HOME").as_deref(),
            &paths.home_dir().map_err(|e| e.to_string())?,
        ),
        workers: workers_codex_home(
            std::env::consts::OS,
            &paths.app_data_dir().map_err(|e| e.to_string())?,
            &paths.data_dir().map_err(|e| e.to_string())?,
        ),
    };
    let search_path = std::env::var_os("PATH").unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || preflight(&search_path, &homes, TIMEOUT))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
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
                signin: SignInCheck::NotCheckedYet,
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
                    "signin": { "kind": "notCheckedYet" }
                },
                {
                    "discovery": {
                        "provider": "codex",
                        "found": null,
                        "rejected": [
                            { "path": "/bun/codex", "reason": { "kind": "says", "detail": "0.2.3" } }
                        ]
                    },
                    "signin": { "kind": "noBinary" }
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

    #[cfg(unix)]
    mod with_fake_clis {
        use super::*;
        use crate::providers::testing::Dir;
        use std::fs;

        const TIMEOUT: Duration = Duration::from_secs(5);

        /// Real-looking codex: version, then `login status` from `$CODEX_HOME/said`.
        const CODEX: &str = r#"[ "$1" = "--version" ] && { echo "codex-cli 0.163.0"; exit 0; }
[ "$*" = "login status" ] || exit 64
cat "$CODEX_HOME/said" >&2
exit "$(cat "$CODEX_HOME/code")""#;

        /// Script at `<dir>/<sub>/<name>`; returns its folder for PATH.
        fn bin(dir: &Dir, sub: &str, name: &str, body: &str) -> PathBuf {
            let script = dir.script(&format!("{sub}/{name}"), body);
            script.parent().unwrap().to_path_buf()
        }

        fn signed_in_home(dir: &Dir) -> PathBuf {
            let home = dir.0.join("operator");
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
            let claude = bin(&dir, "claude", "claude", "echo '2.1.312 (Claude Code)'");
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers-missing"),
            };
            let path = std::env::join_paths([&claude, &bun, &real]).unwrap();

            assert_eq!(
                preflight(&path, &homes, TIMEOUT),
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
                        signin: SignInCheck::NotCheckedYet,
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
                    },
                ]
            );
        }

        #[test]
        fn nothing_found_means_no_signin_check() {
            let dir = Dir::new();
            let bun = bin(&dir, "bun", "codex", "echo 0.2.3");
            let homes = CodexHomes {
                operator: signed_in_home(&dir),
                workers: dir.0.join("workers"),
            };
            let checks = preflight(bun.as_os_str(), &homes, TIMEOUT);

            let signins: Vec<_> = checks.iter().map(|c| &c.signin).collect();
            assert_eq!(signins, [&SignInCheck::NoBinary, &SignInCheck::NoBinary]);
            assert_eq!(checks[1].discovery.rejected.len(), 1);
        }
    }
}
