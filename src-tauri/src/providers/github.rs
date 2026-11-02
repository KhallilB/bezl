//! GitHub sign-in through the user's own `gh` (D7). Bezl never signs in or holds a token.
use super::exec::{self, RunError, first_line};
use super::identity::candidates;
use serde::Serialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum GitHubCheck {
    NoBinary,
    Found {
        path: PathBuf,
        version: String,
        signin: GhSignIn,
    },
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum GhSignIn {
    SignedIn {
        login: String,
    },
    SignedOut,
    /// gh has an account, but GitHub refused it or could not be asked.
    Failing {
        says: String,
    },
    /// Includes a gh before 2.81.0, which has no `--json` here.
    Unrecognized {
        code: Option<i32>,
        says: String,
    },
    Failed(RunError),
}

/// Status only, for github.com: `--json` output never carries the token.
const STATUS: [&str; 6] = [
    "auth",
    "status",
    "--hostname",
    "github.com",
    "--json",
    "hosts",
];

pub fn github_check(search_path: &OsStr, timeout: Duration) -> GitHubCheck {
    candidates("gh", search_path)
        .into_iter()
        .find_map(|path| {
            let version = gh_version(&path, timeout)?;
            let signin = gh_signin(&path, timeout);
            Some(GitHubCheck::Found {
                path,
                version,
                signin,
            })
        })
        .unwrap_or(GitHubCheck::NoBinary)
}

/// `None` unless the binary calls itself GitHub CLI.
fn gh_version(path: &Path, timeout: Duration) -> Option<String> {
    let ran = exec::run(path, &["--version"], &[], timeout).ok()?;
    let rest = ran.says().strip_prefix("gh version ")?;
    rest.split_whitespace().next().map(str::to_owned)
}

fn gh_signin(path: &Path, timeout: Duration) -> GhSignIn {
    let ran = match exec::run(path, &STATUS, &[], timeout) {
        Ok(ran) => ran,
        Err(e) => return GhSignIn::Failed(e),
    };
    let status = ran
        .success()
        .then(|| serde_json::from_str::<Status>(&ran.stdout).ok())
        .flatten();
    let Some(status) = status else {
        return GhSignIn::Unrecognized {
            code: ran.code,
            says: ran.says().into(),
        };
    };
    let active = status
        .hosts
        .get("github.com")
        .and_then(|accounts| accounts.iter().find(|a| a.active));
    match active {
        None => GhSignIn::SignedOut,
        Some(Account { state, login, .. }) if state == "success" => GhSignIn::SignedIn {
            login: login.clone(),
        },
        // Error text can quote GitHub's whole response body.
        Some(Account { error, .. }) => GhSignIn::Failing {
            says: first_line(error.split(" body:").next().unwrap_or_default()).into(),
        },
    }
}

/// gh asks GitHub, so a slow network costs up to this.
const TIMEOUT: Duration = Duration::from_secs(10);

/// Runs apart from the agent CLIs' preflight: it takes a second, theirs minutes.
#[tauri::command]
pub async fn github_preflight() -> Result<GitHubCheck, String> {
    let search_path = std::env::var_os("PATH").unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || github_check(&search_path, TIMEOUT))
        .await
        .map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
struct Status {
    hosts: std::collections::BTreeMap<String, Vec<Account>>,
}

#[derive(serde::Deserialize)]
struct Account {
    state: String,
    active: bool,
    #[serde(default)]
    login: String,
    #[serde(default)]
    error: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_github_check_serializes_with_a_kind() {
        let cases = [
            (GitHubCheck::NoBinary, json!({ "kind": "noBinary" })),
            (
                GitHubCheck::Found {
                    path: "/bin/gh".into(),
                    version: "2.92.0".into(),
                    signin: GhSignIn::SignedIn {
                        login: "octocat".into(),
                    },
                },
                json!({
                    "kind": "found",
                    "detail": {
                        "path": "/bin/gh",
                        "version": "2.92.0",
                        "signin": { "kind": "signedIn", "detail": { "login": "octocat" } }
                    }
                }),
            ),
        ];
        for (check, want) in cases {
            assert_eq!(serde_json::to_value(&check).unwrap(), want);
        }
    }

    #[test]
    fn every_gh_signin_serializes_with_a_kind() {
        let cases = [
            (GhSignIn::SignedOut, json!({ "kind": "signedOut" })),
            (
                GhSignIn::Failing { says: "401".into() },
                json!({ "kind": "failing", "detail": { "says": "401" } }),
            ),
            (
                GhSignIn::Unrecognized {
                    code: Some(1),
                    says: "?".into(),
                },
                json!({ "kind": "unrecognized", "detail": { "code": 1, "says": "?" } }),
            ),
            (
                GhSignIn::Failed(RunError::TimedOut),
                json!({ "kind": "failed", "detail": { "kind": "timedOut" } }),
            ),
        ];
        for (signin, want) in cases {
            assert_eq!(serde_json::to_value(&signin).unwrap(), want);
        }
    }

    #[cfg(unix)]
    mod with_fake_gh {
        use super::*;
        use crate::providers::testing::Dir;
        use std::fs;

        const TIMEOUT: Duration = Duration::from_secs(5);

        /// Real-looking gh: version, and only the read-only status call, printing `said` and `err`.
        const GH: &str = r#"[ "$1" = "--version" ] && { echo "gh version 2.92.0 (2026-04-28)"; echo "https://github.com/cli/cli/releases/tag/v2.92.0"; exit 0; }
[ "$*" = "auth status --hostname github.com --json hosts" ] || { echo "unexpected: $*" >&2; exit 64; }
cat "$(dirname "$0")/err" >&2 2>/dev/null
cat "$(dirname "$0")/said"
exit "$(cat "$(dirname "$0")/code" 2>/dev/null || echo 0)""#;

        /// gh 2.92.0, 2026-11-02, login redacted.
        const SIGNED_IN: &str = r#"{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat","tokenSource":"keyring","scopes":"gist, read:org, repo, workflow","gitProtocol":"https"}]}}"#;
        /// gh 2.92.0 with an empty `GH_CONFIG_DIR`.
        const SIGNED_OUT: &str = r#"{"hosts":{}}"#;
        const SIGNED_OUT_ERR: &str =
            "You are not logged into any GitHub hosts. To log in, run: gh auth login";
        /// gh 2.92.0 with `GH_TOKEN=bogus`.
        const BAD_TOKEN: &str = r#"{"hosts":{"github.com":[{"state":"error","error":"non-200 OK status code: 401 Unauthorized body: \"{\\r\\n  \\\"message\\\": \\\"Bad credentials\\\",\\r\\n  \\\"documentation_url\\\": \\\"https://docs.github.com/rest\\\",\\r\\n  \\\"status\\\": \\\"401\\\"\\r\\n}\"","active":true,"host":"github.com","login":"","tokenSource":"GH_TOKEN","gitProtocol":"https"}]}}"#;

        fn gh(dir: &Dir, said: &str, err: &str, code: i32) -> PathBuf {
            let script = dir.script("gh/gh", GH);
            let bin = script.parent().unwrap().to_path_buf();
            fs::write(bin.join("said"), said).unwrap();
            fs::write(bin.join("err"), err).unwrap();
            fs::write(bin.join("code"), code.to_string()).unwrap();
            bin
        }

        fn signin(check: GitHubCheck) -> GhSignIn {
            match check {
                GitHubCheck::Found { signin, .. } => signin,
                GitHubCheck::NoBinary => panic!("gh not found"),
            }
        }

        #[test]
        fn a_signed_in_gh_names_its_account() {
            let dir = Dir::new();
            let bin = gh(&dir, SIGNED_IN, "", 0);
            assert_eq!(
                github_check(bin.as_os_str(), TIMEOUT),
                GitHubCheck::Found {
                    path: bin.join("gh"),
                    version: "2.92.0".into(),
                    signin: GhSignIn::SignedIn {
                        login: "octocat".into()
                    },
                }
            );
        }

        #[test]
        fn no_github_com_account_is_signed_out() {
            let dir = Dir::new();
            let bin = gh(&dir, SIGNED_OUT, SIGNED_OUT_ERR, 0);
            assert_eq!(
                signin(github_check(bin.as_os_str(), TIMEOUT)),
                GhSignIn::SignedOut
            );
        }

        #[test]
        fn an_inactive_account_is_not_signed_in() {
            let dir = Dir::new();
            let bin = gh(
                &dir,
                &SIGNED_IN.replace(r#""active":true"#, r#""active":false"#),
                "",
                0,
            );
            assert_eq!(
                signin(github_check(bin.as_os_str(), TIMEOUT)),
                GhSignIn::SignedOut
            );
        }

        #[test]
        fn a_refused_token_says_why_without_the_response_body() {
            let dir = Dir::new();
            let bin = gh(&dir, BAD_TOKEN, "", 0);
            assert_eq!(
                signin(github_check(bin.as_os_str(), TIMEOUT)),
                GhSignIn::Failing {
                    says: "non-200 OK status code: 401 Unauthorized".into()
                }
            );
        }

        #[test]
        fn a_gh_without_json_status_is_unrecognized() {
            let dir = Dir::new();
            let bin = gh(
                &dir,
                "",
                "unknown flag: --json\n\nUsage:  gh auth status [flags]",
                1,
            );
            assert_eq!(
                signin(github_check(bin.as_os_str(), TIMEOUT)),
                GhSignIn::Unrecognized {
                    code: Some(1),
                    says: "unknown flag: --json".into()
                }
            );
        }

        #[test]
        fn a_hung_gh_fails_at_the_deadline() {
            let dir = Dir::new();
            let script = dir.script(
                "gh/gh",
                &GH.replace("cat \"$(dirname \"$0\")/said\"", "sleep 5"),
            );
            let bin = script.parent().unwrap();
            assert_eq!(
                signin(github_check(bin.as_os_str(), Duration::from_millis(500))),
                GhSignIn::Failed(RunError::TimedOut)
            );
        }

        #[test]
        fn a_gh_that_is_not_github_cli_is_skipped() {
            let dir = Dir::new();
            let other = dir.script("other/gh", "echo 'gh 0.1 (a git helper)'");
            let real = gh(&dir, SIGNED_IN, "", 0);
            let path = std::env::join_paths([other.parent().unwrap(), &real]).unwrap();
            let GitHubCheck::Found { path: found, .. } = github_check(&path, TIMEOUT) else {
                panic!("gh not found");
            };
            assert_eq!(found, real.join("gh"));
        }

        #[test]
        fn nothing_on_path_is_no_binary() {
            let dir = Dir::new();
            assert_eq!(
                github_check(dir.0.as_os_str(), TIMEOUT),
                GitHubCheck::NoBinary
            );
        }
    }
}
