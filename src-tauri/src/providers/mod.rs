//! Agent CLIs Bezl can drive, found and identified by preflight.
pub mod claude;
mod codex;
mod exec;
mod identity;
pub mod preflight;
#[cfg(all(test, unix))]
mod testing;
pub mod usage;

pub use codex::{CodexSignIn, SignInMethod, codex_signin, operator_codex_home};
pub use exec::RunError;
pub use identity::{Discovery, Found, Identity, Rejected, Rejection, discover, identify};

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub enum Provider {
    #[serde(rename = "claude")]
    ClaudeCode,
    #[serde(rename = "codex")]
    Codex,
}

impl Provider {
    /// File name looked up on PATH. Only a hint: the version output decides.
    pub fn binary_name(self) -> &'static str {
        match self {
            Provider::ClaudeCode => "claude",
            Provider::Codex => "codex",
        }
    }
}
