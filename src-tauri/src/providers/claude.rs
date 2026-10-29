//! Claude Code has no status command, so a one-line Haiku call proves sign-in.
use super::exec::{self, RunError};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum ClaudeSignIn {
    /// Answered; `model` is the one that served it.
    SignedIn {
        model: String,
    },
    SignedOut {
        says: String,
    },
    OutOfQuota {
        says: String,
    },
    Unrecognized {
        code: Option<i32>,
        says: String,
    },
    Failed(RunError),
}

/// Hooks off: they run past `--tools`, even before sign-in is checked.
pub const CANARY_ARGS: &[&str] = &[
    "-p",
    "Reply with OK",
    "--model",
    "haiku",
    "--tools",
    "",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--settings",
    r#"{"disableAllHooks":true}"#,
];

pub fn claude_signin(claude: &Path, timeout: Duration) -> ClaudeSignIn {
    let ran = match exec::run(claude, CANARY_ARGS, &[], timeout) {
        Ok(ran) => ran,
        Err(e) => return ClaudeSignIn::Failed(e),
    };
    let Ok(out) = serde_json::from_str::<Value>(&ran.stdout) else {
        return ClaudeSignIn::Unrecognized {
            code: ran.code,
            says: ran.says().into(),
        };
    };
    let says = out["result"]
        .as_str()
        .unwrap_or_else(|| ran.says())
        .to_string();
    let model = out["modelUsage"]
        .as_object()
        .and_then(|usage| usage.keys().next().cloned());
    match (model, out["api_error_status"].as_u64()) {
        (Some(model), _) if ran.success() && out["is_error"] == false => {
            ClaudeSignIn::SignedIn { model }
        }
        (_, Some(429)) => ClaudeSignIn::OutOfQuota { says },
        (_, Some(401 | 403)) => ClaudeSignIn::SignedOut { says },
        _ if says.starts_with("Not logged in") => ClaudeSignIn::SignedOut { says },
        _ => ClaudeSignIn::Unrecognized {
            code: ran.code,
            says,
        },
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::providers::testing::Dir;
    use std::fs;

    const TIMEOUT: Duration = Duration::from_secs(5);
    const SIGNED_IN: &str = include_str!("fixtures/claude-2.1.312/signed-in.json");
    const NOT_LOGGED_IN: &str = include_str!("fixtures/claude-2.1.312/not-logged-in.json");
    const INVALID_KEY: &str = include_str!("fixtures/claude-2.1.312/invalid-api-key.json");
    // No real quota error could be forced: the 401 capture with status 429.
    const OUT_OF_QUOTA: &str =
        include_str!("fixtures/claude-2.1.312/out-of-quota-synthesized.json");

    /// Fake `claude` that logs its args one per line, prints `output`, exits `code`.
    struct Fake {
        dir: Dir,
        claude: std::path::PathBuf,
    }

    impl Fake {
        fn new(output: &str, code: i32) -> Self {
            let dir = Dir::new();
            fs::write(dir.0.join("output"), output).unwrap();
            let claude = dir.script(
                "claude",
                &format!(
                    "d=$(dirname \"$0\")\nprintf '%s\\n' \"$@\" > \"$d/args\"\ncat \"$d/output\"\nexit {code}"
                ),
            );
            Fake { dir, claude }
        }

        fn signin(&self) -> ClaudeSignIn {
            claude_signin(&self.claude, TIMEOUT)
        }

        fn args(&self) -> Vec<String> {
            fs::read_to_string(self.dir.0.join("args"))
                .unwrap()
                .lines()
                .map(String::from)
                .collect()
        }
    }

    #[test]
    fn signed_in_names_the_model_that_answered() {
        let fake = Fake::new(SIGNED_IN, 0);
        assert_eq!(
            fake.signin(),
            ClaudeSignIn::SignedIn {
                model: "claude-haiku-5-5".into()
            }
        );
    }

    #[test]
    fn runs_one_haiku_call_with_no_tools_no_session_and_no_hooks() {
        let fake = Fake::new(SIGNED_IN, 0);
        fake.signin();
        assert_eq!(fake.args(), CANARY_ARGS);
    }

    #[test]
    fn not_logged_in_is_signed_out() {
        let fake = Fake::new(NOT_LOGGED_IN, 1);
        assert_eq!(
            fake.signin(),
            ClaudeSignIn::SignedOut {
                says: "Not logged in · Please run /login".into()
            }
        );
    }

    #[test]
    fn a_rejected_api_key_is_signed_out() {
        let fake = Fake::new(INVALID_KEY, 1);
        assert_eq!(
            fake.signin(),
            ClaudeSignIn::SignedOut {
                says: "Invalid API key · Fix external API key".into()
            }
        );
    }

    #[test]
    fn a_429_is_out_of_quota() {
        let fake = Fake::new(OUT_OF_QUOTA, 1);
        assert_eq!(
            fake.signin(),
            ClaudeSignIn::OutOfQuota {
                says: "You've hit your limit · resets 5pm".into()
            }
        );
    }

    #[test]
    fn an_answer_without_model_usage_is_unrecognized() {
        let output = SIGNED_IN.replace(
            &SIGNED_IN[SIGNED_IN.find("\"modelUsage\"").unwrap()
                ..SIGNED_IN.find(",\"permission_denials\"").unwrap()],
            "\"modelUsage\":{}",
        );
        let fake = Fake::new(&output, 0);
        assert_eq!(
            fake.signin(),
            ClaudeSignIn::Unrecognized {
                code: Some(0),
                says: "OK".into()
            }
        );
    }

    #[test]
    fn an_error_result_on_exit_zero_is_not_signed_in() {
        let output = SIGNED_IN.replace("\"is_error\":false", "\"is_error\":true");
        let fake = Fake::new(&output, 0);
        assert_eq!(
            fake.signin(),
            ClaudeSignIn::Unrecognized {
                code: Some(0),
                says: "OK".into()
            }
        );
    }

    #[test]
    fn output_that_is_not_json_is_unrecognized_with_its_first_line() {
        let fake = Fake::new("error: unknown option '--tools'\n", 1);
        assert_eq!(
            fake.signin(),
            ClaudeSignIn::Unrecognized {
                code: Some(1),
                says: "error: unknown option '--tools'".into()
            }
        );
    }

    #[test]
    fn a_hang_is_reported_not_waited_on() {
        let dir = Dir::new();
        let claude = dir.script("claude", "exec sleep 5");
        assert_eq!(
            claude_signin(&claude, Duration::from_millis(200)),
            ClaudeSignIn::Failed(RunError::TimedOut)
        );
    }
}
