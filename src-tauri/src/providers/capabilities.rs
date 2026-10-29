//! How each provider's reviewer is kept read-only: by flag or sandbox, or only by asking.
use super::Provider;
use serde::{Deserialize, Serialize};

/// A way a reviewer could change state.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Capability {
    FileWrites,
    Shell,
    McpTools,
    Hooks,
    Network,
}

pub const CAPABILITIES: [Capability; 5] = [
    Capability::FileWrites,
    Capability::Shell,
    Capability::McpTools,
    Capability::Hooks,
    Capability::Network,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum Enforcement {
    /// `flag` is the reviewer-arg run that stops it.
    Blocked {
        flag: &'static [&'static str],
    },
    InstructionOnly,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub provider: Provider,
    pub capability: Capability,
    pub enforcement: Enforcement,
    /// CLI version a probe proved it on; `None` = never probed.
    pub established_on: Option<&'static str>,
}

const CLAUDE_TOOLS: &[&str] = &["--tools", "Read,Glob,Grep"];
const CLAUDE_NO_MCP: &[&str] = &[
    "--strict-mcp-config",
    "--mcp-config",
    r#"{"mcpServers":{}}"#,
];
const CLAUDE_NO_HOOKS: &[&str] = &["--settings", r#"{"disableAllHooks":true}"#];
const CODEX_READ_ONLY: &[&str] = &["--sandbox", "read-only"];

// The read-only probe (`probe.rs`) ran on these, 2026-10-29.
const CLAUDE_PROBED: Option<&str> = Some("2.1.312");
const CODEX_PROBED: Option<&str> = Some("0.163.0");

const fn blocked(
    provider: Provider,
    capability: Capability,
    flag: &'static [&'static str],
    established_on: Option<&'static str>,
) -> Entry {
    Entry {
        provider,
        capability,
        enforcement: Enforcement::Blocked { flag },
        established_on,
    }
}

/// `established_on` `None`: unprobed is not proven blocked, so it counts as told only.
const fn instruction_only(
    provider: Provider,
    capability: Capability,
    established_on: Option<&'static str>,
) -> Entry {
    Entry {
        provider,
        capability,
        enforcement: Enforcement::InstructionOnly,
        established_on,
    }
}

pub const RECORD: &[Entry] = {
    use Capability::*;
    use Provider::*;
    &[
        blocked(ClaudeCode, FileWrites, CLAUDE_TOOLS, CLAUDE_PROBED),
        blocked(ClaudeCode, Shell, CLAUDE_TOOLS, CLAUDE_PROBED),
        blocked(ClaudeCode, McpTools, CLAUDE_NO_MCP, CLAUDE_PROBED),
        blocked(ClaudeCode, Hooks, CLAUDE_NO_HOOKS, CLAUDE_PROBED),
        // Init tool list had no WebFetch, WebSearch or Bash.
        blocked(ClaudeCode, Network, CLAUDE_TOOLS, CLAUDE_PROBED),
        blocked(Codex, FileWrites, CODEX_READ_ONLY, CODEX_PROBED),
        blocked(Codex, Shell, CODEX_READ_ONLY, CODEX_PROBED),
        // A configured MCP server starts outside the sandbox.
        instruction_only(Codex, McpTools, CODEX_PROBED),
        instruction_only(Codex, Hooks, None),
        blocked(Codex, Network, CODEX_READ_ONLY, CODEX_PROBED),
    ]
};

/// Claude: one `--settings` only; with two the first wins and hooks run.
pub fn reviewer_args(provider: Provider) -> &'static [&'static str] {
    match provider {
        Provider::ClaudeCode => &[
            "--tools",
            "Read,Glob,Grep",
            "--strict-mcp-config",
            "--mcp-config",
            r#"{"mcpServers":{}}"#,
            "--settings",
            r#"{"disableAllHooks":true}"#,
        ],
        Provider::Codex => CODEX_READ_ONLY,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use Capability::*;
    use Enforcement::*;
    use Provider::*;

    // The read-only probe (`probe.rs`) passed on these.
    const CLAUDE_PROBED: Option<&str> = Some("2.1.312");
    const CODEX_PROBED: Option<&str> = Some("0.163.0");

    fn entry(provider: Provider, capability: Capability) -> Entry {
        let found: Vec<_> = RECORD
            .iter()
            .filter(|e| e.provider == provider && e.capability == capability)
            .collect();
        assert_eq!(found.len(), 1, "{provider:?} {capability:?}");
        *found[0]
    }

    fn blocked(
        flag: &'static [&'static str],
        on: Option<&'static str>,
    ) -> (Enforcement, Option<&'static str>) {
        (Blocked { flag }, on)
    }

    fn check(provider: Provider, capability: Capability, want: (Enforcement, Option<&str>)) {
        let e = entry(provider, capability);
        assert_eq!(
            (e.enforcement, e.established_on),
            want,
            "{provider:?} {capability:?}"
        );
    }

    #[test]
    fn record_has_one_entry_per_provider_and_capability() {
        assert_eq!(RECORD.len(), 2 * CAPABILITIES.len());
        for provider in [ClaudeCode, Codex] {
            for capability in CAPABILITIES {
                entry(provider, capability);
            }
        }
    }

    #[test]
    fn claude_file_writes_blocked_by_tool_list() {
        check(
            ClaudeCode,
            FileWrites,
            blocked(&["--tools", "Read,Glob,Grep"], CLAUDE_PROBED),
        );
    }

    #[test]
    fn claude_shell_blocked_by_tool_list() {
        check(
            ClaudeCode,
            Shell,
            blocked(&["--tools", "Read,Glob,Grep"], CLAUDE_PROBED),
        );
    }

    #[test]
    fn claude_mcp_blocked_by_strict_empty_config() {
        check(
            ClaudeCode,
            McpTools,
            blocked(
                &[
                    "--strict-mcp-config",
                    "--mcp-config",
                    r#"{"mcpServers":{}}"#,
                ],
                CLAUDE_PROBED,
            ),
        );
    }

    #[test]
    fn claude_hooks_blocked_by_disable_all_hooks() {
        check(
            ClaudeCode,
            Hooks,
            blocked(
                &["--settings", r#"{"disableAllHooks":true}"#],
                CLAUDE_PROBED,
            ),
        );
    }

    #[test]
    fn claude_network_blocked_by_tool_list() {
        // WebFetch, WebSearch and Bash are absent from the init tool list.
        check(
            ClaudeCode,
            Network,
            blocked(&["--tools", "Read,Glob,Grep"], CLAUDE_PROBED),
        );
    }

    #[test]
    fn codex_file_writes_blocked_by_read_only_sandbox() {
        check(
            Codex,
            FileWrites,
            blocked(&["--sandbox", "read-only"], CODEX_PROBED),
        );
    }

    #[test]
    fn codex_shell_blocked_by_read_only_sandbox() {
        // Probe's denial came from zsh inside the seatbelt.
        check(
            Codex,
            Shell,
            blocked(&["--sandbox", "read-only"], CODEX_PROBED),
        );
    }

    #[test]
    fn codex_mcp_is_instruction_only_as_probed() {
        // A configured MCP server started outside the sandbox and wrote its marker.
        check(Codex, McpTools, (InstructionOnly, CODEX_PROBED));
    }

    #[test]
    fn codex_hooks_are_instruction_only_until_probed() {
        // Codex runs only trusted hooks; the probe does not reach that.
        check(Codex, Hooks, (InstructionOnly, None));
    }

    #[test]
    fn codex_network_blocked_by_read_only_sandbox() {
        // Probe's curl to a 127.0.0.1 listener exited 7; the listener saw nothing.
        check(
            Codex,
            Network,
            blocked(&["--sandbox", "read-only"], CODEX_PROBED),
        );
    }

    #[test]
    fn codex_reviewer_args_are_read_only_sandbox() {
        assert_eq!(reviewer_args(Codex), ["--sandbox", "read-only"]);
    }

    #[test]
    fn claude_reviewer_args_apply_spike_three_flags() {
        assert_eq!(
            reviewer_args(ClaudeCode),
            [
                "--tools",
                "Read,Glob,Grep",
                "--strict-mcp-config",
                "--mcp-config",
                r#"{"mcpServers":{}}"#,
                "--settings",
                r#"{"disableAllHooks":true}"#,
            ]
        );
    }

    #[test]
    fn claude_reviewer_args_carry_exactly_one_settings() {
        // First of two wins: a second would drop disableAllHooks.
        let settings = reviewer_args(ClaudeCode)
            .iter()
            .filter(|a| a.starts_with("--settings"))
            .count();
        assert_eq!(settings, 1);
    }

    #[test]
    fn every_blocking_flag_is_in_the_reviewer_args() {
        for e in RECORD {
            if let Blocked { flag } = e.enforcement {
                let args = reviewer_args(e.provider);
                assert!(
                    args.windows(flag.len()).any(|w| w == flag),
                    "{:?} {:?}: {flag:?} not in {args:?}",
                    e.provider,
                    e.capability
                );
            }
        }
    }

    #[test]
    fn serializes_for_the_screen() {
        assert_eq!(
            serde_json::to_value(entry(Codex, FileWrites)).unwrap(),
            serde_json::json!({
                "provider": "codex",
                "capability": "fileWrites",
                "enforcement": {"kind": "blocked", "detail": {"flag": ["--sandbox", "read-only"]}},
                "establishedOn": "0.163.0",
            })
        );
        assert_eq!(
            serde_json::to_value(entry(Codex, McpTools)).unwrap(),
            serde_json::json!({
                "provider": "codex",
                "capability": "mcpTools",
                "enforcement": {"kind": "instructionOnly"},
                "establishedOn": "0.163.0",
            })
        );
    }
}
