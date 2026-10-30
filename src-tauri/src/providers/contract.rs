//! Contract tests: every CLI output Bezl parses, captured per pinned CLI version.
//! Live mode reruns the captures on the installed CLIs; see `fixtures/README.md`.
use super::Provider;

/// Versions with captures in `fixtures/<binary>-<version>/`.
pub const PINNED: &[(Provider, &str)] = &[
    (Provider::ClaudeCode, "2.1.312"),
    (Provider::Codex, "0.163.0"),
];

/// Unpinned is untested: no capture shows Bezl parses its output.
pub fn pinned(provider: Provider, version: &str) -> bool {
    PINNED.iter().any(|&(p, v)| p == provider && v == version)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::providers::capabilities::Capability;
    use crate::providers::claude::{self, ClaudeSignIn};
    use crate::providers::codex::{self, CodexSignIn};
    use crate::providers::exec::{Ran, first_line};
    use crate::providers::identity::{Identity, identify};
    use crate::providers::probe::{self, Outcome, Seen};
    use crate::providers::usage::{Limits, Tokens, Usage, claude_usage, codex_usage, events};
    use Provider::*;
    use serde_json::Value;
    use std::collections::BTreeSet;
    use std::fs;
    use std::path::{Path, PathBuf};

    const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/src/providers/fixtures");

    /// One CLI output Bezl parses.
    struct Capture {
        provider: Provider,
        /// `<stem>-synthesized.<ext>` stands in where no CLI run could produce it.
        file: &'static str,
        /// Exit code of the captured run.
        code: i32,
        contract: fn(&Out) -> Result<(), String>,
    }

    struct Out<'a> {
        version: &'a str,
        text: &'a str,
        code: i32,
    }

    impl Out<'_> {
        fn ran(&self) -> Ran {
            Ran {
                code: Some(self.code),
                stdout: self.text.into(),
                stderr: String::new(),
            }
        }
    }

    const fn capture(
        provider: Provider,
        file: &'static str,
        code: i32,
        contract: fn(&Out) -> Result<(), String>,
    ) -> Capture {
        Capture {
            provider,
            file,
            code,
            contract,
        }
    }

    const CAPTURES: &[Capture] = &[
        capture(ClaudeCode, "version.txt", 0, claude_version),
        capture(ClaudeCode, "signed-in.json", 0, claude_signed_in),
        capture(ClaudeCode, "not-logged-in.json", 1, claude_signed_out),
        capture(ClaudeCode, "invalid-api-key.json", 1, claude_signed_out),
        capture(ClaudeCode, "out-of-quota.json", 1, claude_out_of_quota),
        capture(
            ClaudeCode,
            "stream-rate-limit-and-result.jsonl",
            0,
            claude_stream,
        ),
        capture(ClaudeCode, "probe-read-only.jsonl", 0, claude_probe),
        capture(
            ClaudeCode,
            "probe-hooks-and-mcp-unblocked.jsonl",
            1,
            claude_hooks,
        ),
        capture(Codex, "version.txt", 0, codex_version),
        capture(Codex, "login-status.txt", 0, codex_signed_in),
        capture(Codex, "login-status-signed-out.txt", 1, codex_signed_out),
        capture(Codex, "exec-ok.jsonl", 0, codex_exec_ok),
        capture(Codex, "exec-signed-out.jsonl", 1, codex_exec_failed),
        capture(Codex, "rollout-token-count.jsonl", 0, codex_rollout),
        capture(Codex, "probe-read-only.jsonl", 0, codex_probe),
    ];

    fn check(ok: bool, what: impl FnOnce() -> String) -> Result<(), String> {
        ok.then_some(()).ok_or_else(what)
    }

    fn known_as(out: &Out, provider: Provider) -> Result<(), String> {
        match identify(out.text) {
            Identity::Known {
                provider: p,
                version,
            } if p == provider && version == out.version => Ok(()),
            got => Err(format!("identified as {got:?}")),
        }
    }

    fn claude_version(out: &Out) -> Result<(), String> {
        known_as(out, ClaudeCode)
    }

    fn codex_version(out: &Out) -> Result<(), String> {
        known_as(out, Codex)
    }

    fn known_tokens(usage: &Usage) -> Result<(), String> {
        check(matches!(usage.tokens, Tokens::Known { .. }), || {
            format!("tokens {:?}", usage.tokens)
        })
    }

    /// Every window names its use and reset: what the screen shows.
    fn reported_windows(limits: &Limits) -> Result<(), String> {
        match limits {
            Limits::Reported { windows, .. }
                if !windows.is_empty()
                    && windows
                        .iter()
                        .all(|w| w.used_percent.is_some() && w.resets_at.is_some()) =>
            {
                Ok(())
            }
            got => Err(format!("limits {got:?}")),
        }
    }

    fn claude_signed_in(out: &Out) -> Result<(), String> {
        match claude::signin_from(Ok(out.ran())) {
            ClaudeSignIn::SignedIn { .. } => {}
            got => return Err(format!("sign-in {got:?}")),
        }
        let usage = claude_usage(out.text);
        match &usage.tokens {
            Tokens::Known { models, .. } if !models.is_empty() => Ok(()),
            got => Err(format!("tokens {got:?}")),
        }
    }

    fn claude_signed_out(out: &Out) -> Result<(), String> {
        match claude::signin_from(Ok(out.ran())) {
            ClaudeSignIn::SignedOut { .. } => Ok(()),
            got => Err(format!("sign-in {got:?}")),
        }
    }

    fn claude_out_of_quota(out: &Out) -> Result<(), String> {
        match claude::signin_from(Ok(out.ran())) {
            ClaudeSignIn::OutOfQuota { .. } => {}
            got => return Err(format!("sign-in {got:?}")),
        }
        match claude_usage(out.text).limits {
            Limits::Reported { hit: Some(_), .. } => Ok(()),
            got => Err(format!("limits {got:?}")),
        }
    }

    fn claude_stream(out: &Out) -> Result<(), String> {
        let usage = claude_usage(out.text);
        known_tokens(&usage)?;
        reported_windows(&usage.limits)
    }

    fn passed_all(provider: Provider, text: &str, seen: &Seen) -> Result<(), String> {
        let got = probe::verdict(provider, text, seen)?;
        check(got.values().all(|o| *o == Outcome::Passed), || {
            format!("verdict {got:?}")
        })
    }

    fn claude_probe(out: &Out) -> Result<(), String> {
        passed_all(ClaudeCode, out.text, &Seen::default())?;
        let cost = probe::cost(ClaudeCode, out.text);
        check(cost.usd.is_some(), || "no total_cost_usd".into())?;
        check(matches!(cost.tokens, Tokens::Known { .. }), || {
            format!("tokens {:?}", cost.tokens)
        })
    }

    /// Captured signed out, so its error result is ended by hand to reach the verdict.
    fn claude_hooks(out: &Out) -> Result<(), String> {
        let ended = out.text.replace("\"is_error\":true", "\"is_error\":false");
        let got = probe::verdict(ClaudeCode, &ended, &Seen::default())?;
        let failed_with = |capability, evidence: &str| match &got[&capability] {
            Outcome::Failed { evidence: e } if e.contains(evidence) => Ok(()),
            o => Err(format!("{capability:?} {o:?}, want evidence {evidence:?}")),
        };
        failed_with(Capability::Hooks, "hook_started")?;
        failed_with(Capability::McpTools, "init lists MCP servers")
    }

    fn codex_signed_in(out: &Out) -> Result<(), String> {
        match codex::signin_from(Ok(out.ran())) {
            CodexSignIn::SignedIn(_) => Ok(()),
            got => Err(format!("sign-in {got:?}")),
        }
    }

    fn codex_signed_out(out: &Out) -> Result<(), String> {
        match codex::signin_from(Ok(out.ran())) {
            CodexSignIn::SignedOut => Ok(()),
            got => Err(format!("sign-in {got:?}")),
        }
    }

    fn codex_exec_ok(out: &Out) -> Result<(), String> {
        known_tokens(&codex_usage(out.text))
    }

    /// The failure is reported in the CLI's own words, not as a missing event.
    fn codex_exec_failed(out: &Out) -> Result<(), String> {
        match probe::verdict(Codex, out.text, &Seen::default()) {
            Err(says) if says != "no turn.completed event" => Ok(()),
            got => Err(format!("verdict {got:?}")),
        }
    }

    fn codex_rollout(out: &Out) -> Result<(), String> {
        let usage = codex_usage(out.text);
        known_tokens(&usage)?;
        reported_windows(&usage.limits)
    }

    /// The listener port is read back from the command that tried it.
    fn codex_probe(out: &Out) -> Result<(), String> {
        let port = out
            .text
            .split("127.0.0.1:")
            .nth(1)
            .and_then(|rest| {
                let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
                digits.parse().ok()
            })
            .ok_or("no command tried 127.0.0.1")?;
        let seen = Seen {
            port,
            ..Seen::default()
        };
        sandbox_held(&probe::verdict(Codex, out.text, &seen)?)?;
        known_tokens(&codex_usage(out.text))
    }

    /// Codex runs hooks and MCP servers outside its sandbox; the sandbox holds the rest.
    fn sandbox_held(got: &probe::Outcomes) -> Result<(), String> {
        let held = [
            Capability::FileWrites,
            Capability::Shell,
            Capability::Network,
        ];
        check(held.iter().all(|c| got[c] == Outcome::Passed), || {
            format!("verdict {got:?}")
        })
    }

    fn dir(provider: Provider, version: &str) -> PathBuf {
        Path::new(FIXTURES).join(format!("{}-{version}", provider.binary_name()))
    }

    fn synthesized(file: &str) -> String {
        let (stem, ext) = file.rsplit_once('.').unwrap();
        format!("{stem}-synthesized.{ext}")
    }

    /// The capture, or its synthesized stand-in, in one version's dir.
    fn find(dir: &Path, file: &str) -> Option<(PathBuf, bool)> {
        [(dir.join(file), false), (dir.join(synthesized(file)), true)]
            .into_iter()
            .find(|(path, _)| path.is_file())
    }

    /// An unpinned version has no captures to parse against.
    fn pinned_dir(provider: Provider, version: &str) -> Result<PathBuf, String> {
        if pinned(provider, version) {
            return Ok(dir(provider, version));
        }
        let pins: Vec<&str> = PINNED
            .iter()
            .filter(|(p, _)| *p == provider)
            .map(|(_, v)| *v)
            .collect();
        Err(format!(
            "{} {version} is not pinned (pinned: {}); capture it as fixtures/README.md says",
            provider.binary_name(),
            pins.join(", ")
        ))
    }

    fn captures(provider: Provider) -> impl Iterator<Item = &'static Capture> {
        CAPTURES.iter().filter(move |c| c.provider == provider)
    }

    #[test]
    fn every_pinned_version_has_every_capture() {
        let missing: Vec<String> = PINNED
            .iter()
            .flat_map(|&(provider, version)| {
                let dir = dir(provider, version);
                captures(provider)
                    .filter(move |c| find(&dir, c.file).is_none())
                    .map(move |c| format!("{} {version}: {}", provider.binary_name(), c.file))
            })
            .collect();
        assert_eq!(missing, Vec::<String>::new());
    }

    #[test]
    fn every_fixture_dir_is_a_pinned_version() {
        let unpinned: Vec<String> = fs::read_dir(FIXTURES)
            .unwrap()
            .flatten()
            .filter(|e| e.path().is_dir())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| {
                !PINNED
                    .iter()
                    .any(|&(p, v)| *name == format!("{}-{v}", p.binary_name()))
            })
            .collect();
        assert_eq!(unpinned, Vec::<String>::new());
    }

    #[test]
    fn every_capture_meets_its_contract_on_every_pinned_version() {
        let mut broken = Vec::new();
        for &(provider, version) in PINNED {
            let dir = dir(provider, version);
            for c in captures(provider) {
                let Some((path, _)) = find(&dir, c.file) else {
                    continue;
                };
                let text = fs::read_to_string(&path).unwrap();
                let out = Out {
                    version,
                    text: &text,
                    code: c.code,
                };
                if let Err(why) = (c.contract)(&out) {
                    broken.push(format!("{}: {why}", path.display()));
                }
            }
        }
        assert_eq!(broken, Vec::<String>::new());
    }

    #[test]
    fn every_contract_rejects_empty_output() {
        for c in CAPTURES {
            let out = Out {
                version: "1.0.0",
                text: "",
                code: c.code,
            };
            assert!((c.contract)(&out).is_err(), "{}", c.file);
        }
    }

    #[test]
    fn a_renamed_field_breaks_its_contract() {
        let text = fs::read_to_string(dir(ClaudeCode, "2.1.312").join("signed-in.json")).unwrap();
        let out = Out {
            version: "2.1.312",
            text: &text.replace("\"modelUsage\"", "\"model_usage\""),
            code: 0,
        };
        assert!(claude_signed_in(&out).is_err());
    }

    #[test]
    fn a_version_line_for_another_version_breaks_its_contract() {
        let out = Out {
            version: "2.1.312",
            text: "2.1.313 (Claude Code)\n",
            code: 0,
        };
        assert_eq!(
            claude_version(&out),
            Err(format!(
                "identified as {:?}",
                Identity::Known {
                    provider: ClaudeCode,
                    version: "2.1.313".into()
                }
            ))
        );
    }

    #[test]
    fn an_unpinned_version_is_reported_not_parsed() {
        assert!(pinned(ClaudeCode, "2.1.312"));
        assert!(!pinned(ClaudeCode, "0.163.0"));
        assert_eq!(
            pinned_dir(Codex, "9.9.9"),
            Err("codex 9.9.9 is not pinned (pinned: 0.163.0); \
                 capture it as fixtures/README.md says"
                .into())
        );
    }

    /// Paths and value types of each event, keyed by its type; maps keyed by name collapse to `*`.
    fn shape(text: &str) -> BTreeSet<String> {
        const MAPS: [&str; 4] = [
            "modelUsage",
            "unifiedWindows",
            "wire_ingest_context",
            "wire_tool_inputs",
        ];
        fn walk(v: &Value, path: &str, out: &mut BTreeSet<String>) {
            match v {
                Value::Object(map) => {
                    let named = MAPS.iter().any(|m| path.ends_with(&format!(".{m}")));
                    for (k, x) in map {
                        let k = if named { "*" } else { k.as_str() };
                        walk(x, &format!("{path}.{k}"), out);
                    }
                }
                Value::Array(items) if items.is_empty() => {
                    out.insert(format!("{path}[]"));
                }
                Value::Array(items) => items
                    .iter()
                    .for_each(|x| walk(x, &format!("{path}[]"), out)),
                scalar => {
                    let kind = match scalar {
                        Value::Null => "null",
                        Value::Bool(_) => "bool",
                        Value::Number(_) => "number",
                        _ => "string",
                    };
                    out.insert(format!("{path}: {kind}"));
                }
            }
        }
        let mut out = BTreeSet::new();
        let mut parsed = false;
        for event in events(text) {
            parsed = true;
            let inner = match event["type"].as_str() {
                Some("event_msg") => &event["payload"],
                _ => &event,
            };
            let key = [&inner["type"], &inner["subtype"]]
                .iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join("/");
            walk(&event, &format!("[{key}]"), &mut out);
        }
        if !parsed {
            let line: String = first_line(text)
                .chars()
                .map(|c| if c.is_ascii_digit() { '9' } else { c })
                .collect();
            out.insert(format!("text: {line}"));
        }
        out
    }

    /// `-` in the fixture only, `+` in the live run only.
    fn diff(fixture: &str, live: &str) -> Vec<String> {
        let (was, now) = (shape(fixture), shape(live));
        was.difference(&now)
            .map(|p| format!("- {p}"))
            .chain(now.difference(&was).map(|p| format!("+ {p}")))
            .collect()
    }

    #[test]
    fn shape_keeps_paths_and_types_not_values() {
        assert_eq!(
            shape(
                r#"{"type":"result","usage":{"input_tokens":2},"modelUsage":{"m":{"x":1}},"tools":[]}"#
            ),
            BTreeSet::from([
                "[result].modelUsage.*.x: number".to_string(),
                "[result].tools[]".into(),
                "[result].type: string".into(),
                "[result].usage.input_tokens: number".into(),
            ])
        );
        assert_eq!(
            shape("codex-cli 0.165.0-alpha.1.2\n"),
            BTreeSet::from(["text: codex-cli 9.999.9-alpha.9.9".to_string()])
        );
    }

    #[test]
    fn diff_names_removed_and_added_paths() {
        assert_eq!(
            diff(
                r#"{"type":"result","usage":{"input_tokens":2}}"#,
                r#"{"type":"result","usage":{"inputTokens":2}}"#
            ),
            [
                "- [result].usage.input_tokens: number",
                "+ [result].usage.inputTokens: number"
            ]
        );
        assert_eq!(
            diff("2.1.312 (Claude Code)", "2.1.313 (Claude Code)"),
            Vec::<String>::new()
        );
    }

    mod live {
        use super::*;
        use crate::providers::capabilities::reviewer_args;
        use crate::providers::claude::CANARY_ARGS;
        use crate::providers::exec::{self, RunError};
        use crate::providers::identity::{Found, discover};
        use crate::providers::operator_codex_home;
        use crate::providers::testing::Dir;
        use std::ffi::{OsStr, OsString};
        use std::time::Duration;

        const QUICK: Duration = Duration::from_secs(15);
        const CALL: Duration = Duration::from_secs(90);
        const PROBE: Duration = Duration::from_secs(180);
        /// Never accepted, so a run with it is signed out without a paid call.
        const BAD_KEY: &str = "sk-ant-bezl-contract-invalid";
        /// Hooks and MCP left on: the control that proves the hooks probe can see a hook.
        const UNBLOCKED: &[&str] = &["--tools", "Read,Glob,Grep"];

        /// One live run of a capture.
        struct Live {
            file: &'static str,
            text: String,
            code: i32,
            /// What the scratch repo showed, for probe runs.
            seen: Option<Seen>,
        }

        #[derive(Default)]
        struct Report {
            lines: Vec<String>,
            failures: Vec<String>,
            usd: f64,
        }

        impl Report {
            fn say(&mut self, line: String) {
                self.lines.push(line);
            }

            fn fail(&mut self, line: String) {
                self.lines.push(format!("FAIL {line}"));
                self.failures.push(line);
            }
        }

        fn run(
            binary: &Path,
            args: &[&str],
            envs: &[(&str, &OsStr)],
            timeout: Duration,
        ) -> Result<(String, String, i32), String> {
            let ran = exec::run(binary, args, envs, timeout).map_err(|e| match e {
                RunError::TimedOut => "timed out".to_string(),
                RunError::DidNotStart(why) => why,
            })?;
            Ok((ran.stdout, ran.stderr, ran.code.unwrap_or(-1)))
        }

        /// Text captures keep stderr too: Bezl reads a sign-in line from either.
        fn live(file: &'static str, (stdout, stderr, code): (String, String, i32)) -> Live {
            let text = match file.ends_with(".txt") {
                true => stdout + &stderr,
                false => stdout,
            };
            Live {
                file,
                text,
                code,
                seen: None,
            }
        }

        fn probed(file: &'static str, (text, seen): (String, Seen), code: i32) -> Live {
            Live {
                file,
                text,
                code,
                seen: Some(seen),
            }
        }

        /// `BEZL_LIVE_<NAME>` names the binary; else the first real one on PATH.
        fn locate(provider: Provider, var: &str) -> Option<Found> {
            let search: OsString = match std::env::var_os(var) {
                Some(path) => Path::new(&path).parent()?.as_os_str().into(),
                None => std::env::var_os("PATH")?,
            };
            discover(provider, &search, QUICK).found
        }

        fn claude_runs(claude: &Path, scratch: &Dir) -> Result<Vec<Live>, String> {
            let empty = scratch.0.join("claude-config");
            fs::create_dir_all(&empty).map_err(|e| e.to_string())?;
            let signed_out = [("CLAUDE_CONFIG_DIR", empty.as_os_str())];
            let bad_key = [
                ("CLAUDE_CONFIG_DIR", empty.as_os_str()),
                ("ANTHROPIC_API_KEY", OsStr::new(BAD_KEY)),
            ];
            let stream: Vec<&str> = CANARY_ARGS
                .iter()
                .map(|a| if *a == "json" { "stream-json" } else { a })
                .chain(["--verbose"])
                .collect();
            // Signed out costs nothing; hooks fire before sign-in is checked.
            let control = probe::run(ClaudeCode, claude, UNBLOCKED, &signed_out, PROBE)?;
            Ok(vec![
                live("version.txt", run(claude, &["--version"], &[], QUICK)?),
                live("signed-in.json", run(claude, CANARY_ARGS, &[], CALL)?),
                live(
                    "not-logged-in.json",
                    run(claude, CANARY_ARGS, &signed_out, CALL)?,
                ),
                live(
                    "invalid-api-key.json",
                    run(claude, CANARY_ARGS, &bad_key, CALL)?,
                ),
                live(
                    "stream-rate-limit-and-result.jsonl",
                    run(claude, &stream, &[], CALL)?,
                ),
                probed(
                    "probe-read-only.jsonl",
                    probe::run(ClaudeCode, claude, reviewer_args(ClaudeCode), &[], PROBE)?,
                    0,
                ),
                probed("probe-hooks-and-mcp-unblocked.jsonl", control, 1),
            ])
        }

        fn codex_runs(codex: &Path, scratch: &Dir) -> Result<Vec<Live>, String> {
            let home = match std::env::var_os("BEZL_LIVE_CODEX_HOME") {
                Some(home) => PathBuf::from(home),
                None => operator_codex_home(
                    std::env::var_os("CODEX_HOME").as_deref(),
                    Path::new(&std::env::var_os("HOME").ok_or("HOME unset")?),
                ),
            };
            let empty = scratch.0.join("codex-home");
            let work = scratch.0.join("work");
            for d in [&empty, &work] {
                fs::create_dir_all(d).map_err(|e| e.to_string())?;
            }
            let operator = [("CODEX_HOME", home.as_os_str())];
            let signed_out = [("CODEX_HOME", empty.as_os_str())];
            let work = work.to_string_lossy();
            // Not ephemeral: the rollout it leaves holds the `token_count` event.
            let exec = [
                "exec",
                "--json",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "-C",
                &work,
                "Reply with OK",
            ];
            let ok = run(codex, &exec, &operator, CALL)?;
            let rollout = rollout(&home, &ok.0)?;
            Ok(vec![
                live("version.txt", run(codex, &["--version"], &[], QUICK)?),
                live(
                    "login-status.txt",
                    run(codex, &["login", "status"], &operator, QUICK)?,
                ),
                live(
                    "login-status-signed-out.txt",
                    run(codex, &["login", "status"], &signed_out, QUICK)?,
                ),
                live("exec-ok.jsonl", ok),
                live(
                    "exec-signed-out.jsonl",
                    run(codex, &exec, &signed_out, CALL)?,
                ),
                live("rollout-token-count.jsonl", (rollout, String::new(), 0)),
                probed(
                    "probe-read-only.jsonl",
                    probe::run(Codex, codex, reviewer_args(Codex), &operator, PROBE)?,
                    0,
                ),
            ])
        }

        /// Last `token_count` line of the rollout the `exec` run wrote.
        fn rollout(home: &Path, exec_out: &str) -> Result<String, String> {
            let thread = events(exec_out)
                .find(|e| e["type"] == "thread.started")
                .and_then(|e| e["thread_id"].as_str().map(String::from))
                .ok_or("exec reported no thread_id")?;
            let mut dirs = vec![home.join("sessions")];
            while let Some(dir) = dirs.pop() {
                for entry in fs::read_dir(&dir).into_iter().flatten().flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        dirs.push(path);
                    } else if entry.file_name().to_string_lossy().contains(&thread) {
                        let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
                        return text
                            .lines()
                            .rfind(|l| l.contains("\"token_count\""))
                            .map(|l| format!("{l}\n"))
                            .ok_or_else(|| format!("{} has no token_count", path.display()));
                    }
                }
            }
            Err(format!("no rollout for thread {thread}"))
        }

        /// Live-only checks: the real scratch repo after each probe run.
        fn check_seen(provider: Provider, l: &Live) -> Result<(), String> {
            let Some(seen) = &l.seen else {
                return Ok(());
            };
            match (provider, l.file) {
                (ClaudeCode, "probe-hooks-and-mcp-unblocked.jsonl") => {
                    check(seen.hook_marker && seen.mcp_marker, || {
                        format!(
                            "control wrote no marker (hook {}, mcp {}): the hooks probe cannot see a hook",
                            seen.hook_marker, seen.mcp_marker
                        )
                    })
                }
                (ClaudeCode, _) => passed_all(ClaudeCode, &l.text, seen),
                (Codex, _) => sandbox_held(&probe::verdict(Codex, &l.text, seen)?),
            }
        }

        /// Dollars where the CLI reports them, else a label naming its tokens.
        fn cost(provider: Provider, text: &str) -> (f64, String) {
            match provider {
                ClaudeCode => {
                    let usd: f64 = events(text)
                        .filter(|e| e["type"] == "result")
                        .filter_map(|e| e["total_cost_usd"].as_f64())
                        .sum();
                    let label = match usd > 0.0 {
                        true => format!(" (${usd:.4})"),
                        false => String::new(),
                    };
                    (usd, label)
                }
                Codex => match codex_usage(text).tokens {
                    Tokens::Known { total, .. } if total.input + total.output > 0 => (
                        0.0,
                        format!(
                            " ({} input ({} cached), {} output tokens)",
                            total.input, total.cache_read, total.output
                        ),
                    ),
                    _ => (0.0, String::new()),
                },
            }
        }

        /// Scratch paths and the home dir out; Codex's plan type redacted.
        fn redact(text: &str) -> String {
            let mut text = text.to_string();
            for (marker, to) in [
                ("bezl-probe-", "/tmp/bezl-probe"),
                ("bezl-providers-", "/tmp/bezl-contract"),
            ] {
                while let Some(at) = text.find(marker) {
                    let start = text[..at].rfind(['"', '\'', ' ', '=']).map_or(0, |i| i + 1);
                    let end = at
                        + marker.len()
                        + text[at + marker.len()..]
                            .find(|c: char| !c.is_ascii_digit() && c != '-')
                            .unwrap_or(text.len() - at - marker.len());
                    text.replace_range(start..end, to);
                }
            }
            if let Some(home) = std::env::var_os("HOME") {
                text = text.replace(&*home.to_string_lossy(), "~");
            }
            while let Some(at) = text.find("\"plan_type\":\"") {
                let value = at + "\"plan_type\":".len();
                let end = value + 1 + text[value + 1..].find('"').unwrap_or(0) + 1;
                text.replace_range(value..end, "null");
            }
            text
        }

        /// Writes each capture the version's dir lacks; never overwrites one, never writes a failed one.
        fn write_missing(provider: Provider, version: &str, runs: &[&Live], report: &mut Report) {
            let dir = dir(provider, version);
            let _ = fs::create_dir_all(&dir);
            for c in captures(provider) {
                if find(&dir, c.file).is_some() {
                    continue;
                }
                let (name, text) = match runs.iter().find(|l| l.file == c.file) {
                    Some(l) => (c.file.to_string(), redact(&l.text)),
                    // Not producible on demand: carried from the newest pin, as synthesized.
                    None => {
                        let Some(from) = PINNED
                            .iter()
                            .rev()
                            .filter(|(p, _)| *p == provider)
                            .find_map(|&(_, v)| find(&super::dir(provider, v), c.file))
                        else {
                            report.fail(format!("{}: nothing to carry over", c.file));
                            continue;
                        };
                        (synthesized(c.file), fs::read_to_string(from.0).unwrap())
                    }
                };
                fs::write(dir.join(&name), text).unwrap();
                report.say(format!("  wrote {}", dir.join(name).display()));
            }
        }

        /// A removed path can break a parse; an added one cannot, so it is only counted.
        fn report_diff(lines: &[String], report: &mut Report) {
            let added = lines.iter().filter(|l| l.starts_with('+')).count();
            for line in lines.iter().filter(|l| l.starts_with('-')) {
                report.say(format!("    {line}"));
            }
            if added > 0 {
                report.say(format!("    + {added} paths not in the fixture"));
            }
        }

        fn check_provider(provider: Provider, var: &str, report: &mut Report) {
            let name = provider.binary_name();
            let Some(found) = locate(provider, var) else {
                report.fail(format!("{name}: not found (set {var} or put it on PATH)"));
                return;
            };
            let version = found.version.as_str();
            report.say(format!("{name} {version} at {}", found.path.display()));
            let pinned = pinned_dir(provider, version);
            if let Err(why) = &pinned {
                report.fail(why.clone());
            }
            let scratch = Dir::new();
            let runs = match provider {
                ClaudeCode => claude_runs(&found.path, &scratch),
                Codex => codex_runs(&found.path, &scratch),
            };
            let runs = match runs {
                Ok(runs) => runs,
                Err(why) => return report.fail(format!("{name}: a live run failed: {why}")),
            };
            let mut passed = Vec::new();
            for c in captures(provider) {
                let Some(l) = runs.iter().find(|l| l.file == c.file) else {
                    report.say(format!("  {}: not producible live, fixture only", c.file));
                    continue;
                };
                let (usd, paid) = cost(provider, &l.text);
                report.usd += usd;
                let out = Out {
                    version,
                    text: &l.text,
                    code: l.code,
                };
                let checked = (c.contract)(&out)
                    .and_then(|()| {
                        check(l.code == c.code, || {
                            format!("exit {}, want {}", l.code, c.code)
                        })
                    })
                    .and_then(|()| check_seen(provider, l));
                match checked {
                    Ok(()) => {
                        report.say(format!("  ok {}{paid}", c.file));
                        passed.push(l);
                    }
                    Err(why) => report.fail(format!("{name} {version} {}: {why}{paid}", c.file)),
                }
                if let Some((path, false)) = pinned.as_ref().ok().and_then(|d| find(d, c.file)) {
                    let fixture = fs::read_to_string(path).unwrap();
                    report_diff(&diff(&fixture, &l.text), report);
                }
            }
            if std::env::var_os("BEZL_CONTRACT_CAPTURE").is_some() {
                write_missing(provider, version, &passed, report);
            }
        }

        /// Run with `env -u CLAUDECODE` from inside Claude Code; `--nocapture` prints the report.
        #[test]
        #[ignore = "paid: reruns every capture on the installed CLIs, a few cents"]
        fn installed_clis_meet_the_contracts() {
            let mut report = Report::default();
            check_provider(ClaudeCode, "BEZL_LIVE_CLAUDE", &mut report);
            check_provider(Codex, "BEZL_LIVE_CODEX", &mut report);
            report.say(format!(
                "Claude Code spent ${:.4}; Codex reports tokens only",
                report.usd
            ));
            println!("{}", report.lines.join("\n"));
            assert_eq!(report.failures, Vec::<String>::new());
        }

        #[test]
        fn redact_strips_scratch_paths_home_and_plan_type() {
            let home = std::env::var("HOME").unwrap();
            let text = format!(
                r#"{{"cwd":"/private/var/folders/x/T/bezl-probe-123-4/repo","home":"{home}/.codex","plan_type":"plus"}}"#
            );
            assert_eq!(
                redact(&text),
                r#"{"cwd":"/tmp/bezl-probe/repo","home":"~/.codex","plan_type":null}"#
            );
        }
    }
}
