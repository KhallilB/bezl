use super::exec::{self, Ran, RunError};
use serde::Serialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum CodexSignIn {
    SignedIn(SignInMethod),
    SignedOut,
    /// Codex refuses a `CODEX_HOME` that does not exist, so it is not run.
    HomeMissing,
    Unrecognized {
        code: Option<i32>,
        says: String,
    },
    Failed(RunError),
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SignInMethod {
    ChatGpt,
    ApiKey,
}

/// `CODEX_HOME` when set and non-empty, else `~/.codex`, as Codex resolves it.
pub fn operator_codex_home(codex_home: Option<&OsStr>, home: &Path) -> PathBuf {
    match codex_home {
        Some(dir) if !dir.is_empty() => PathBuf::from(dir),
        _ => home.join(".codex"),
    }
}

/// Runs `codex login status` against one Codex home.
pub fn codex_signin(codex: &Path, home: &Path, timeout: Duration) -> CodexSignIn {
    if !home.is_dir() {
        return CodexSignIn::HomeMissing;
    }
    let env = [("CODEX_HOME", home.as_os_str())];
    signin_from(exec::run(codex, &["login", "status"], &env, timeout))
}

/// Split from the run so contract tests parse captured output.
pub(crate) fn signin_from(ran: Result<Ran, RunError>) -> CodexSignIn {
    let ran = match ran {
        Ok(ran) => ran,
        Err(e) => return CodexSignIn::Failed(e),
    };
    // Codex may print warnings first; the status line can be any line.
    let has = |prefix: &str| {
        ran.stdout
            .lines()
            .chain(ran.stderr.lines())
            .any(|l| l.trim().starts_with(prefix))
    };
    match ran.code {
        Some(0) if has("Logged in using ChatGPT") => CodexSignIn::SignedIn(SignInMethod::ChatGpt),
        Some(0) if has("Logged in using an API key") => CodexSignIn::SignedIn(SignInMethod::ApiKey),
        Some(1) if has("Not logged in") => CodexSignIn::SignedOut,
        code => CodexSignIn::Unrecognized {
            code,
            says: ran.says().into(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operator_home_is_codex_home_when_set() {
        assert_eq!(
            operator_codex_home(Some(OsStr::new("/srv/codex")), Path::new("/Users/me")),
            PathBuf::from("/srv/codex")
        );
    }

    #[test]
    fn operator_home_defaults_to_dot_codex() {
        let want = PathBuf::from("/Users/me/.codex");
        assert_eq!(operator_codex_home(None, Path::new("/Users/me")), want);
        assert_eq!(
            operator_codex_home(Some(OsStr::new("")), Path::new("/Users/me")),
            want
        );
    }

    #[cfg(unix)]
    mod with_fake_codex {
        use super::super::*;
        use crate::providers::testing::Dir;
        use std::fs;

        const TIMEOUT: Duration = Duration::from_secs(5);

        /// Answers only `login status`, from files in the `CODEX_HOME` it was given.
        const FAKE: &str = r#"touch "$CODEX_HOME/ran"
[ "$*" = "login status" ] || { echo "unexpected args: $*" >&2; exit 64; }
cat "$CODEX_HOME/said" >&2
exit "$(cat "$CODEX_HOME/code")""#;

        struct Fixture {
            dir: Dir,
            codex: PathBuf,
        }

        impl Fixture {
            fn new() -> Self {
                let dir = Dir::new();
                let codex = dir.script("codex", FAKE);
                Fixture { dir, codex }
            }

            fn home(&self, name: &str, said: &str, code: i32) -> PathBuf {
                let home = self.dir.0.join(name);
                fs::create_dir_all(&home).unwrap();
                fs::write(home.join("said"), format!("{said}\n")).unwrap();
                fs::write(home.join("code"), code.to_string()).unwrap();
                home
            }

            fn signin(&self, home: &Path) -> CodexSignIn {
                codex_signin(&self.codex, home, TIMEOUT)
            }
        }

        #[test]
        fn signed_in_with_chatgpt() {
            let f = Fixture::new();
            let home = f.home("op", "Logged in using ChatGPT", 0);
            assert_eq!(
                f.signin(&home),
                CodexSignIn::SignedIn(SignInMethod::ChatGpt)
            );
        }

        #[test]
        fn signed_in_with_an_api_key_keeps_no_key() {
            let f = Fixture::new();
            let home = f.home("op", "Logged in using an API key - sk-proj-***ABCDE", 0);
            assert_eq!(f.signin(&home), CodexSignIn::SignedIn(SignInMethod::ApiKey));
        }

        #[test]
        fn signed_out() {
            let f = Fixture::new();
            let home = f.home("op", "Not logged in", 1);
            assert_eq!(f.signin(&home), CodexSignIn::SignedOut);
        }

        #[test]
        fn a_warning_before_the_status_line_is_skipped() {
            let f = Fixture::new();
            let home = f.home(
                "op",
                "WARNING: proceeding, even though we could not create PATH aliases\nLogged in using ChatGPT",
                0,
            );
            assert_eq!(
                f.signin(&home),
                CodexSignIn::SignedIn(SignInMethod::ChatGpt)
            );
        }

        #[test]
        fn each_home_is_checked_on_its_own() {
            let f = Fixture::new();
            let operator = f.home("op", "Logged in using ChatGPT", 0);
            let workers = f.home("workers", "Not logged in", 1);
            assert_eq!(
                f.signin(&operator),
                CodexSignIn::SignedIn(SignInMethod::ChatGpt)
            );
            assert_eq!(f.signin(&workers), CodexSignIn::SignedOut);
        }

        #[test]
        fn a_missing_home_is_reported_without_running_codex() {
            let f = Fixture::new();
            let home = f.dir.0.join("never-made");
            assert_eq!(f.signin(&home), CodexSignIn::HomeMissing);
            assert!(!home.exists());
        }

        #[test]
        fn an_error_is_unrecognized_with_what_it_said() {
            let f = Fixture::new();
            let home = f.home("op", "Error checking login status: disk full", 1);
            assert_eq!(
                f.signin(&home),
                CodexSignIn::Unrecognized {
                    code: Some(1),
                    says: "Error checking login status: disk full".into()
                }
            );
        }

        #[test]
        fn a_status_line_with_the_wrong_exit_code_is_unrecognized() {
            let f = Fixture::new();
            let failed = f.home("a", "Logged in using ChatGPT", 1);
            let passed = f.home("b", "Not logged in", 0);
            assert_eq!(
                f.signin(&failed),
                CodexSignIn::Unrecognized {
                    code: Some(1),
                    says: "Logged in using ChatGPT".into()
                }
            );
            assert_eq!(
                f.signin(&passed),
                CodexSignIn::Unrecognized {
                    code: Some(0),
                    says: "Not logged in".into()
                }
            );
        }

        #[test]
        fn a_hang_is_reported_not_waited_on() {
            let dir = Dir::new();
            let codex = dir.script("codex", "exec sleep 5");
            assert_eq!(
                codex_signin(&codex, &dir.0, Duration::from_millis(200)),
                CodexSignIn::Failed(RunError::TimedOut)
            );
        }
    }
}
