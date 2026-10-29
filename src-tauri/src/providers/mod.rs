//! Agent CLIs Bezl can drive, found and identified by preflight.
mod exec;
mod identity;
#[cfg(all(test, unix))]
mod testing;

pub use identity::{Discovery, Found, Identity, Rejected, Rejection, discover, identify};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    ClaudeCode,
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
