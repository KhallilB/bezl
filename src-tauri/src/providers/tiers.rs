//! Coordination tiers for batches, probed once per CLI version. Recorded only; nothing reads them before M9.
use super::Provider;
use super::exec;
use super::identity::Found;
use super::probe::{self, Cost, Scratch};
use super::usage::{claude_usage, codex_usage, events};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::fs;
use std::io::{BufRead, BufReader, ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Tier {
    /// 0: batch facts reach the agent in its brief, one step per call.
    StepBoundary,
    /// 1: a read-only Bezl MCP tool the agent can call mid-step.
    McpTool,
    /// 2: input pushed into a step while it runs.
    LiveInput,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum TierOutcome {
    Holds { evidence: String },
    Missing { evidence: String },
    Unknown { why: String },
}

pub type Tiers = BTreeMap<Tier, TierOutcome>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierRecord {
    pub provider: Provider,
    pub version: String,
    /// Unix seconds.
    pub probed_at: u64,
    pub tiers: Tiers,
    pub cost: Cost,
}

/// What the probe saw beside the CLI's own output.
#[derive(Debug, Default)]
pub struct Seen {
    /// The Bezl server was asked for its tools.
    pub listed: bool,
    /// `None`: no tool call started, so nothing was pushed.
    pub pushed: Option<Result<(), String>>,
}

pub const TOOL: &str = "batch_state";
const CODE_WORD: &str = "PAPAYA";
const LIVE_INPUT: &str = "The code word is PAPAYA.";
/// Two calls leave a step boundary after the input is pushed.
const PROMPT: &str = "Call the batch_state tool from the bezl MCP server, then call it a second \
     time. Then reply with one line: the code word from my messages, or NONE if I gave none.";
const NO_PUSH: &str = "the agent started no tool call, so nothing was pushed mid-step";
/// `codex queue` and `codex delete` answer at once.
const SIDE_TIMEOUT: Duration = Duration::from_secs(30);

/// `Err` is why the run proves nothing, so it is not recorded.
pub fn verdict(provider: Provider, stdout: &str, seen: &Seen) -> Result<Tiers, String> {
    let events: Vec<Value> = events(stdout).collect();
    match provider {
        Provider::ClaudeCode => claude_verdict(&events, seen),
        Provider::Codex => codex_verdict(&events, seen),
    }
}

fn claude_verdict(events: &[Value], seen: &Seen) -> Result<Tiers, String> {
    let init = events
        .iter()
        .find(|e| e["type"] == "system" && e["subtype"] == "init")
        .ok_or("no init event")?;
    let results: Vec<&Value> = events.iter().filter(|e| e["type"] == "result").collect();
    let first = results.first().ok_or("no result event")?;
    if first["is_error"] != false {
        return Err(first["result"].as_str().unwrap_or("error result").into());
    }
    let tool = format!("mcp__bezl__{TOOL}");
    let listed = init["tools"]
        .as_array()
        .is_some_and(|tools| tools.iter().any(|t| t == tool.as_str()));
    let mcp_tool = match listed {
        true => holds(format!("init lists {tool}")),
        false => {
            let status = init["mcp_servers"]
                .as_array()
                .into_iter()
                .flatten()
                .find(|s| s["name"] == "bezl")
                .and_then(|s| s["status"].as_str())
                .unwrap_or("absent");
            missing(format!("init lists no {tool}; bezl server: {status}"))
        }
    };
    let named = |r: &&Value| r["result"].as_str().is_some_and(|t| t.contains(CODE_WORD));
    let live_input = match &seen.pushed {
        None => unknown(NO_PUSH),
        Some(Err(e)) => unknown(format!("the input could not be pushed: {e}")),
        Some(Ok(())) if named(first) => {
            holds("input written mid-step reached it: the step's result names the code word".into())
        }
        Some(Ok(())) if results[1..].iter().any(named) => {
            missing("input written mid-step waited for the next turn".into())
        }
        Some(Ok(())) => missing("the step ended without the input written mid-step".into()),
    };
    Ok(Tiers::from([
        (
            Tier::StepBoundary,
            holds("one -p call ran one step and ended with its result event".into()),
        ),
        (Tier::McpTool, mcp_tool),
        (Tier::LiveInput, live_input),
    ]))
}

fn codex_verdict(events: &[Value], seen: &Seen) -> Result<Tiers, String> {
    if !events.iter().any(|e| e["type"] == "turn.completed") {
        let said = events.iter().rev().find_map(|e| match e["type"].as_str() {
            Some("turn.failed") => e["error"]["message"].as_str(),
            Some("error") => e["message"].as_str(),
            _ => None,
        });
        return Err(said.unwrap_or("no turn.completed event").into());
    }
    let items = || {
        events
            .iter()
            .filter(|e| e["type"] == "item.completed")
            .map(|e| &e["item"])
    };
    let called = items().any(|i| {
        i["type"] == "mcp_tool_call"
            && i["server"] == "bezl"
            && i["tool"] == TOOL
            && i["status"] == "completed"
    });
    let mcp_tool = match (called, seen.listed) {
        (true, _) => holds(format!(
            "exec --json has no init tool list; the agent called bezl's {TOOL}"
        )),
        (false, true) => unknown(format!(
            "exec --json has no init tool list, and the agent did not call {TOOL}"
        )),
        (false, false) => missing("the bezl server was never asked for its tools".into()),
    };
    let last_message = items()
        .filter(|i| i["type"] == "agent_message")
        .filter_map(|i| i["text"].as_str())
        .next_back()
        .unwrap_or("");
    let live_input = match &seen.pushed {
        None => unknown(NO_PUSH),
        Some(Err(e)) => unknown(format!("codex queue failed: {e}")),
        Some(Ok(())) if last_message.contains(CODE_WORD) => holds(
            "codex queue took the input mid-step and the step's last message names the code word"
                .into(),
        ),
        Some(Ok(())) => {
            missing("codex queue took the input mid-step, but the step ended without it".into())
        }
    };
    Ok(Tiers::from([
        (
            Tier::StepBoundary,
            holds("one exec call ran one turn and ended with turn.completed".into()),
        ),
        (Tier::McpTool, mcp_tool),
        (Tier::LiveInput, live_input),
    ]))
}

fn holds(evidence: String) -> TierOutcome {
    TierOutcome::Holds { evidence }
}

fn missing(evidence: String) -> TierOutcome {
    TierOutcome::Missing { evidence }
}

fn unknown(why: impl Into<String>) -> TierOutcome {
    TierOutcome::Unknown { why: why.into() }
}

/// Claude's dollars are a running total, so the last result has them all.
pub fn cost(provider: Provider, stdout: &str) -> Cost {
    match provider {
        Provider::ClaudeCode => Cost {
            usd: events(stdout)
                .filter(|e| e["type"] == "result")
                .filter_map(|e| e["total_cost_usd"].as_f64())
                .last(),
            tokens: claude_usage(stdout).tokens,
        },
        Provider::Codex => Cost {
            usd: None,
            tokens: codex_usage(stdout).tokens,
        },
    }
}

pub fn probe(
    provider: Provider,
    found: &Found,
    envs: &[(&str, &OsStr)],
    timeout: Duration,
) -> Result<TierRecord, String> {
    let (stdout, seen) = run(provider, found, envs, timeout)?;
    Ok(TierRecord {
        provider,
        version: found.version.clone(),
        probed_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_secs()),
        tiers: verdict(provider, &stdout, &seen)?,
        cost: cost(provider, &stdout),
    })
}

/// One step with a Bezl MCP server attached; input is pushed when its first tool call starts.
fn run(
    provider: Provider,
    found: &Found,
    envs: &[(&str, &OsStr)],
    timeout: Duration,
) -> Result<(String, Seen), String> {
    let scratch = Scratch::new().map_err(|e| e.to_string())?;
    let server = Server::start().map_err(|e| e.to_string())?;
    let mut child = Command::new(&found.path)
        .args(probe_args(provider, &scratch.0, &server.url()))
        .envs(envs.iter().copied())
        .current_dir(&scratch.0)
        .stdin(match provider {
            Provider::ClaudeCode => Stdio::piped(),
            Provider::Codex => Stdio::null(),
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let lines = lines(child.stdout.take());
    let mut stdin = child.stdin.take();
    if let Some(pipe) = &mut stdin
        && let Err(e) = write_message(pipe, PROMPT)
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(e.to_string());
    }
    let deadline = Instant::now() + timeout;
    let (mut stdout, mut pushed, mut thread) = (String::new(), None, None);
    loop {
        let line = match lines.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(line) => line,
            Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("timed out".into());
            }
        };
        stdout.push_str(&line);
        stdout.push('\n');
        let Ok(event) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(id) = event["thread_id"].as_str() {
            thread = Some(id.to_string());
        }
        if pushed.is_none() && tool_started(&event) {
            pushed = Some(match &mut stdin {
                Some(pipe) => write_message(pipe, LIVE_INPUT).map_err(|e| e.to_string()),
                None => queue(found, envs, thread.as_deref()),
            });
            server.release();
        }
        // Claude: closing stdin after the step's result ends the run.
        if event["type"] == "result" {
            stdin = None;
        }
    }
    drop(stdin);
    server.release();
    wait(&mut child, deadline)?;
    if let (Provider::Codex, Some(id)) = (provider, &thread) {
        // The thread was kept for `codex queue`; it is the probe's own.
        if let Err(e) = side_run(found, &["delete", "--force", id], envs) {
            log::warn!("tier probe thread {id} not deleted: {e}");
        }
    }
    let seen = Seen {
        listed: server.listed(),
        pushed,
    };
    Ok((stdout, seen))
}

/// Claude reads the prompt from stdin so it can take more mid-step. Codex keeps its thread for `codex queue`.
fn probe_args(provider: Provider, dir: &Path, url: &str) -> Vec<String> {
    match provider {
        Provider::ClaudeCode => [
            "-p",
            "--input-format",
            "stream-json",
            "--output-format",
            "stream-json",
            "--verbose",
            "--model",
            "haiku",
            "--no-session-persistence",
            "--tools",
            "",
            // Unlisted, `-p` denies the call, so the first call is never held.
            "--allowedTools",
            "mcp__bezl__batch_state",
            "--strict-mcp-config",
            "--mcp-config",
            &json!({ "mcpServers": { "bezl": { "type": "http", "url": url } } }).to_string(),
            "--settings",
            r#"{"disableAllHooks":true}"#,
        ]
        .map(String::from)
        .to_vec(),
        Provider::Codex => vec![
            "exec".into(),
            "--json".into(),
            "--skip-git-repo-check".into(),
            "-C".into(),
            dir.to_string_lossy().into_owned(),
            "--sandbox".into(),
            "read-only".into(),
            "-c".into(),
            format!("mcp_servers.bezl.url={}", Value::from(url)),
            // Exec never asks, so an unapproved MCP call is refused.
            "-c".into(),
            r#"mcp_servers.bezl.default_tools_approval_mode="approve""#.into(),
            PROMPT.into(),
        ],
    }
}

/// Claude: an assistant tool_use. Codex: an MCP or command item starting.
fn tool_started(event: &Value) -> bool {
    let claude = event["type"] == "assistant"
        && event["message"]["content"]
            .as_array()
            .is_some_and(|c| c.iter().any(|p| p["type"] == "tool_use"));
    let codex = event["type"] == "item.started"
        && ["mcp_tool_call", "command_execution"]
            .contains(&event["item"]["type"].as_str().unwrap_or(""));
    claude || codex
}

fn write_message(pipe: &mut ChildStdin, text: &str) -> std::io::Result<()> {
    let message = json!({ "type": "user", "message": { "role": "user", "content": text } });
    writeln!(pipe, "{message}")?;
    pipe.flush()
}

fn queue(found: &Found, envs: &[(&str, &OsStr)], thread: Option<&str>) -> Result<(), String> {
    let thread = thread.ok_or("no thread id to queue on")?;
    side_run(
        found,
        &["queue", "--thread", thread, "--message", LIVE_INPUT],
        envs,
    )
}

fn side_run(found: &Found, args: &[&str], envs: &[(&str, &OsStr)]) -> Result<(), String> {
    let ran = exec::run(&found.path, args, envs, SIDE_TIMEOUT).map_err(|e| format!("{e:?}"))?;
    match ran.success() {
        true => Ok(()),
        false => Err(ran.says().to_string()),
    }
}

fn lines(pipe: Option<ChildStdout>) -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for line in pipe.into_iter().flat_map(|p| BufReader::new(p).lines()) {
            let Ok(line) = line else { break };
            if tx.send(line).is_err() {
                break;
            }
        }
    });
    rx
}

fn wait(child: &mut Child, deadline: Instant) -> Result<(), String> {
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return Ok(()),
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(10)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("timed out".into());
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// A Bezl MCP server over HTTP on loopback, serving one read-only tool.
struct Server {
    port: u16,
    shared: Arc<Shared>,
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
struct Shared {
    state: Mutex<State>,
    released: Condvar,
}

#[derive(Default)]
struct State {
    listed: bool,
    calls: u32,
    released: bool,
}

/// A first call held this long is let go, so a probe that never pushes cannot hang the server.
const HOLD: Duration = Duration::from_secs(60);
const READ_TIMEOUT: Duration = Duration::from_secs(30);

impl Server {
    fn start() -> std::io::Result<Server> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let shared = Arc::new(Shared::default());
        let stop = Arc::new(AtomicBool::new(false));
        let (serving, stopped) = (shared.clone(), stop.clone());
        thread::spawn(move || {
            while !stopped.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let shared = serving.clone();
                        thread::spawn(move || serve(stream, &shared));
                    }
                    Err(e) if e.kind() == ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10))
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Server { port, shared, stop })
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}/mcp", self.port)
    }

    /// Lets the held first tool call answer.
    fn release(&self) {
        self.shared.state.lock().unwrap().released = true;
        self.shared.released.notify_all();
    }

    fn listed(&self) -> bool {
        self.shared.state.lock().unwrap().listed
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        self.release();
    }
}

/// One request per connection, then close.
fn serve(stream: TcpStream, shared: &Shared) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_read_timeout(Some(READ_TIMEOUT));
    let mut reader = BufReader::new(&stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }
    let mut length = 0;
    loop {
        let mut header = String::new();
        if reader.read_line(&mut header).is_err() || header.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = header.split_once(':')
            && name.trim().eq_ignore_ascii_case("content-length")
        {
            length = value.trim().parse().unwrap_or(0);
        }
    }
    let mut body = vec![0; length];
    if reader.read_exact(&mut body).is_err() {
        return;
    }
    let (status, reply) = match request_line.split_whitespace().next() {
        Some("POST") => respond(&body, shared),
        _ => ("405 Method Not Allowed", None),
    };
    let reply = reply.map(|r| r.to_string()).unwrap_or_default();
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        reply.len()
    );
    let mut stream = &stream;
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(reply.as_bytes());
}

/// JSON-RPC: a notification gets 202 and no body. The first tool call waits for `release`.
fn respond(body: &[u8], shared: &Shared) -> (&'static str, Option<Value>) {
    let Ok(request) = serde_json::from_slice::<Value>(body) else {
        return ("400 Bad Request", None);
    };
    let Some(id) = request.get("id").cloned() else {
        return ("202 Accepted", None);
    };
    let result = match request["method"].as_str() {
        Some("initialize") => json!({
            "protocolVersion": request["params"]["protocolVersion"].as_str().unwrap_or("2025-06-18"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "bezl", "version": env!("CARGO_PKG_VERSION") },
        }),
        Some("tools/list") => {
            shared.state.lock().unwrap().listed = true;
            json!({ "tools": [{
                "name": TOOL,
                "description": "Read the batch state.",
                "inputSchema": { "type": "object", "properties": {} },
                "annotations": { "readOnlyHint": true },
            }]})
        }
        Some("tools/call") => {
            let mut state = shared.state.lock().unwrap();
            state.calls += 1;
            if state.calls == 1 {
                let _ = shared
                    .released
                    .wait_timeout_while(state, HOLD, |s| !s.released);
            }
            json!({ "content": [{ "type": "text", "text": "Batch state: no changes." }] })
        }
        _ => {
            let error = json!({ "code": -32601, "message": "method not found" });
            return (
                "200 OK",
                Some(json!({ "jsonrpc": "2.0", "id": id, "error": error })),
            );
        }
    };
    (
        "200 OK",
        Some(json!({ "jsonrpc": "2.0", "id": id, "result": result })),
    )
}

/// Beside the read-only record: `<provider>-<version>.tiers.json`.
pub fn record_path(dir: &Path, provider: Provider, version: &str) -> PathBuf {
    probe::record_path(dir, provider, version).with_extension("tiers.json")
}

/// A record that is missing, unreadable or for another CLI is no record.
pub fn load(dir: &Path, provider: Provider, version: &str) -> Option<TierRecord> {
    let text = fs::read_to_string(record_path(dir, provider, version)).ok()?;
    let record: TierRecord = serde_json::from_str(&text).ok()?;
    (record.provider == provider && record.version == version).then_some(record)
}

/// Written aside then renamed, so a crash never leaves half a record.
pub fn store(dir: &Path, record: &TierRecord) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let path = record_path(dir, record.provider, &record.version);
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(record)?)?;
    fs::rename(tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::usage::Tokens;
    use Tier::*;

    // Claude got the code word while its first batch_state call was held.
    const CLAUDE: &str = include_str!("fixtures/claude-2.1.312/tiers.jsonl");
    // Codex: `codex queue` took the code word mid-step; the step ended without it.
    const CODEX: &str = include_str!("fixtures/codex-0.163.0/tiers.jsonl");

    fn pushed() -> Seen {
        Seen {
            listed: true,
            pushed: Some(Ok(())),
        }
    }

    fn holds(evidence: &str) -> TierOutcome {
        TierOutcome::Holds {
            evidence: evidence.into(),
        }
    }

    fn missing(evidence: &str) -> TierOutcome {
        TierOutcome::Missing {
            evidence: evidence.into(),
        }
    }

    fn unknown(why: &str) -> TierOutcome {
        TierOutcome::Unknown { why: why.into() }
    }

    #[test]
    fn claude_holds_every_tier() {
        assert_eq!(
            verdict(Provider::ClaudeCode, CLAUDE, &pushed()),
            Ok(Tiers::from([
                (
                    StepBoundary,
                    holds("one -p call ran one step and ended with its result event")
                ),
                (McpTool, holds("init lists mcp__bezl__batch_state")),
                (
                    LiveInput,
                    holds(
                        "input written mid-step reached it: the step's result names the code word"
                    )
                ),
            ]))
        );
    }

    #[test]
    fn claude_without_the_bezl_tool_in_init_misses_tier_one() {
        let out = CLAUDE
            .replace(r#""tools":["mcp__bezl__batch_state"]"#, r#""tools":[]"#)
            .replace(r#""status":"connected""#, r#""status":"failed""#);
        let got = verdict(Provider::ClaudeCode, &out, &pushed()).unwrap();
        assert_eq!(
            got[&McpTool],
            missing("init lists no mcp__bezl__batch_state; bezl server: failed")
        );
    }

    #[test]
    fn claude_input_answered_in_a_later_turn_misses_tier_two() {
        let first = CLAUDE.replace(r#""result":"PAPAYA""#, r#""result":"NONE""#);
        let later = r#"{"type":"result","subtype":"success","is_error":false,"result":"PAPAYA","total_cost_usd":0.003}"#;
        let got = verdict(
            Provider::ClaudeCode,
            &format!("{first}{later}\n"),
            &pushed(),
        )
        .unwrap();
        assert_eq!(
            got[&LiveInput],
            missing("input written mid-step waited for the next turn")
        );
    }

    #[test]
    fn claude_step_that_ends_without_the_input_misses_tier_two() {
        let out = CLAUDE.replace(r#""result":"PAPAYA""#, r#""result":"NONE""#);
        let got = verdict(Provider::ClaudeCode, &out, &pushed()).unwrap();
        assert_eq!(
            got[&LiveInput],
            missing("the step ended without the input written mid-step")
        );
    }

    #[test]
    fn nothing_pushed_leaves_tier_two_unknown() {
        let seen = Seen {
            listed: true,
            pushed: None,
        };
        let why = unknown("the agent started no tool call, so nothing was pushed mid-step");
        for (provider, out) in [(Provider::ClaudeCode, CLAUDE), (Provider::Codex, CODEX)] {
            assert_eq!(verdict(provider, out, &seen).unwrap()[&LiveInput], why);
        }
    }

    #[test]
    fn a_push_that_failed_leaves_tier_two_unknown() {
        let seen = Seen {
            listed: true,
            pushed: Some(Err("broken pipe".into())),
        };
        assert_eq!(
            verdict(Provider::ClaudeCode, CLAUDE, &seen).unwrap()[&LiveInput],
            unknown("the input could not be pushed: broken pipe")
        );
        assert_eq!(
            verdict(Provider::Codex, CODEX, &seen).unwrap()[&LiveInput],
            unknown("codex queue failed: broken pipe")
        );
    }

    #[test]
    fn claude_without_init_or_result_proves_nothing() {
        let no_init: String = CLAUDE
            .lines()
            .filter(|l| !l.contains(r#""subtype":"init""#))
            .map(|l| format!("{l}\n"))
            .collect();
        assert_eq!(
            verdict(Provider::ClaudeCode, &no_init, &pushed()),
            Err("no init event".into())
        );
        let no_result: String = CLAUDE
            .lines()
            .filter(|l| !l.contains(r#""type":"result""#))
            .map(|l| format!("{l}\n"))
            .collect();
        assert_eq!(
            verdict(Provider::ClaudeCode, &no_result, &pushed()),
            Err("no result event".into())
        );
    }

    #[test]
    fn claude_error_result_proves_nothing() {
        let out = CLAUDE.replace(r#""is_error":false"#, r#""is_error":true"#);
        assert_eq!(
            verdict(Provider::ClaudeCode, &out, &pushed()),
            Err("PAPAYA".into())
        );
    }

    #[test]
    fn codex_holds_tiers_zero_and_one_but_not_two() {
        assert_eq!(
            verdict(Provider::Codex, CODEX, &pushed()),
            Ok(Tiers::from([
                (
                    StepBoundary,
                    holds("one exec call ran one turn and ended with turn.completed")
                ),
                (
                    McpTool,
                    holds("exec --json has no init tool list; the agent called bezl's batch_state")
                ),
                (
                    LiveInput,
                    missing("codex queue took the input mid-step, but the step ended without it")
                ),
            ]))
        );
    }

    #[test]
    fn codex_listing_without_a_call_leaves_tier_one_unknown() {
        let out: String = CODEX
            .lines()
            .filter(|l| !l.contains("mcp_tool_call"))
            .map(|l| format!("{l}\n"))
            .collect();
        assert_eq!(
            verdict(Provider::Codex, &out, &pushed()).unwrap()[&McpTool],
            unknown("exec --json has no init tool list, and the agent did not call batch_state")
        );
        let unlisted = Seen {
            listed: false,
            ..pushed()
        };
        assert_eq!(
            verdict(Provider::Codex, &out, &unlisted).unwrap()[&McpTool],
            missing("the bezl server was never asked for its tools")
        );
    }

    #[test]
    fn codex_input_that_reached_the_step_holds_tier_two() {
        let out = CODEX.replace(r#""text":"NONE""#, r#""text":"PAPAYA""#);
        assert_eq!(
            verdict(Provider::Codex, &out, &pushed()).unwrap()[&LiveInput],
            holds(
                "codex queue took the input mid-step and the step's last message names the code word"
            )
        );
    }

    #[test]
    fn codex_without_turn_completed_proves_nothing() {
        let out: String = CODEX
            .lines()
            .filter(|l| !l.contains("turn.completed"))
            .map(|l| format!("{l}\n"))
            .collect();
        assert_eq!(
            verdict(Provider::Codex, &out, &pushed()),
            Err("no turn.completed event".into())
        );
    }

    #[test]
    fn claude_cost_is_its_last_reported_dollars() {
        let later = r#"{"type":"result","subtype":"success","is_error":false,"result":"PAPAYA","total_cost_usd":0.25,"usage":{"input_tokens":1,"output_tokens":2}}"#;
        let got = cost(Provider::ClaudeCode, &format!("{CLAUDE}{later}\n"));
        assert_eq!(got.usd, Some(0.25));
    }

    #[test]
    fn codex_cost_is_tokens_only() {
        let got = cost(Provider::Codex, CODEX);
        assert_eq!(got.usd, None);
        assert_ne!(got.tokens, Tokens::Unknown);
    }

    fn record(version: &str) -> TierRecord {
        TierRecord {
            provider: Provider::Codex,
            version: version.into(),
            probed_at: 1,
            tiers: Tiers::from([(StepBoundary, holds("ran"))]),
            cost: Cost {
                usd: None,
                tokens: Tokens::Unknown,
            },
        }
    }

    #[test]
    fn a_record_serializes_for_the_screen() {
        let mut record = record("0.163.0");
        record.tiers.insert(McpTool, unknown("no list"));
        record.tiers.insert(LiveInput, missing("ended"));
        assert_eq!(
            serde_json::to_value(&record).unwrap(),
            serde_json::json!({
                "provider": "codex",
                "version": "0.163.0",
                "probedAt": 1,
                "tiers": {
                    "stepBoundary": {"kind": "holds", "detail": {"evidence": "ran"}},
                    "mcpTool": {"kind": "unknown", "detail": {"why": "no list"}},
                    "liveInput": {"kind": "missing", "detail": {"evidence": "ended"}},
                },
                "cost": {"usd": null, "tokens": {"kind": "unknown"}},
            })
        );
    }

    #[cfg(unix)]
    mod stored {
        use super::*;
        use crate::providers::probe;
        use crate::providers::testing::Dir;
        use std::fs;

        #[test]
        fn a_record_sits_beside_the_read_only_record_of_its_version() {
            let dir = Path::new("/cache");
            assert_eq!(
                record_path(dir, Provider::Codex, "0.163.0"),
                dir.join("codex-0.163.0.tiers.json")
            );
            assert_eq!(
                record_path(dir, Provider::Codex, "0.163.0").parent(),
                probe::record_path(dir, Provider::Codex, "0.163.0").parent()
            );
        }

        #[test]
        fn a_stored_record_loads_for_its_provider_and_version_only() {
            let dir = Dir::new();
            store(&dir.0, &record("0.163.0")).unwrap();
            assert_eq!(
                load(&dir.0, Provider::Codex, "0.163.0"),
                Some(record("0.163.0"))
            );
            assert_eq!(load(&dir.0, Provider::Codex, "0.164.0"), None);
            assert_eq!(load(&dir.0, Provider::ClaudeCode, "0.163.0"), None);
        }

        #[test]
        fn a_read_only_record_is_not_a_tier_record() {
            let dir = Dir::new();
            fs::write(dir.0.join("codex-0.163.0.tiers.json"), "{}").unwrap();
            assert_eq!(load(&dir.0, Provider::Codex, "0.163.0"), None);
        }
    }

    mod server {
        use super::*;

        /// One raw HTTP request; returns the status line and body.
        fn send(server: &Server, method: &str, body: &str) -> (String, String) {
            let mut stream = TcpStream::connect(("127.0.0.1", server.port)).unwrap();
            write!(
                stream,
                "{method} /mcp HTTP/1.1\r\nHost: x\r\ncontent-length: {}\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
            let mut reply = String::new();
            stream.read_to_string(&mut reply).unwrap();
            let (head, body) = reply.split_once("\r\n\r\n").unwrap();
            (head.lines().next().unwrap().to_string(), body.to_string())
        }

        fn rpc(server: &Server, method: &str, id: u32) -> Value {
            let body = json!({ "jsonrpc": "2.0", "id": id, "method": method,
                "params": { "protocolVersion": "2025-11-25" } });
            serde_json::from_str(&send(server, "POST", &body.to_string()).1).unwrap()
        }

        #[test]
        fn it_answers_initialize_in_the_clients_protocol_version() {
            let server = Server::start().unwrap();
            let got = rpc(&server, "initialize", 1);
            assert_eq!(got["id"], 1);
            assert_eq!(got["result"]["protocolVersion"], "2025-11-25");
            assert_eq!(got["result"]["capabilities"], json!({ "tools": {} }));
        }

        #[test]
        fn it_lists_one_read_only_tool_and_remembers_being_asked() {
            let server = Server::start().unwrap();
            assert!(!server.listed());
            let tools = &rpc(&server, "tools/list", 2)["result"]["tools"];
            assert_eq!(tools.as_array().unwrap().len(), 1);
            assert_eq!(tools[0]["name"], TOOL);
            assert_eq!(tools[0]["annotations"]["readOnlyHint"], true);
            assert!(server.listed());
        }

        #[test]
        fn notifications_get_202_and_other_methods_an_error() {
            let server = Server::start().unwrap();
            let note = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" });
            assert_eq!(
                send(&server, "POST", &note.to_string()),
                ("HTTP/1.1 202 Accepted".into(), String::new())
            );
            assert_eq!(rpc(&server, "server/discover", 3)["error"]["code"], -32601);
            assert_eq!(
                send(&server, "GET", "").0,
                "HTTP/1.1 405 Method Not Allowed"
            );
        }

        #[test]
        fn the_first_tool_call_waits_for_release() {
            let server = Arc::new(Server::start().unwrap());
            let calling = server.clone();
            let (tx, rx) = mpsc::channel();
            thread::spawn(move || tx.send(rpc(&calling, "tools/call", 4)).unwrap());
            assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
            server.release();
            let got = rx.recv_timeout(Duration::from_secs(5)).unwrap();
            assert_eq!(got["result"]["content"][0]["type"], "text");
            // Later calls answer at once.
            assert_eq!(rpc(&server, "tools/call", 5)["id"], 5);
        }
    }

    #[cfg(unix)]
    mod with_fake_clis {
        use super::*;
        use crate::providers::testing::Dir;

        const TIMEOUT: Duration = Duration::from_secs(5);

        /// Init and a tool call, then answers with the code word if the pushed line has it.
        const CLAUDE: &str = r#"printf '%s\n' "$@" > "$(dirname "$0")/args"
read -r prompt
echo '{"type":"system","subtype":"init","tools":["mcp__bezl__batch_state"],"mcp_servers":[{"name":"bezl","status":"connected"}]}'
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__bezl__batch_state"}]}}'
read -r pushed
case "$pushed" in *PAPAYA*) w=PAPAYA;; *) w=NONE;; esac
echo "{\"type\":\"result\",\"is_error\":false,\"result\":\"$w\",\"total_cost_usd\":0.001}""#;

        /// Waits for `codex queue` mid-step, then ends without the queued input.
        const CODEX: &str = r#"d=$(dirname "$0")
case "$1" in queue|delete) printf '%s\n' "$@" > "$d/$1"; exit 0;; esac
printf '%s\n' "$@" > "$d/args"
echo '{"type":"thread.started","thread_id":"t-1"}'
echo '{"type":"item.started","item":{"type":"mcp_tool_call","server":"bezl","tool":"batch_state"}}'
i=0; while [ ! -f "$d/queue" ] && [ $i -lt 100 ]; do sleep 0.05; i=$((i+1)); done
echo '{"type":"item.completed","item":{"type":"mcp_tool_call","server":"bezl","tool":"batch_state","status":"completed"}}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"NONE"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1}}'"#;

        fn fake(dir: &Dir, name: &str, body: &str) -> Found {
            Found {
                path: dir.script(name, body),
                version: "1.0.0".into(),
            }
        }

        fn lines(dir: &Dir, file: &str) -> Vec<String> {
            fs::read_to_string(dir.0.join(file))
                .unwrap()
                .lines()
                .map(String::from)
                .collect()
        }

        #[test]
        fn claude_gets_input_written_mid_step_on_stdin() {
            let dir = Dir::new();
            let claude = fake(&dir, "claude", CLAUDE);
            let record = probe(Provider::ClaudeCode, &claude, &[], TIMEOUT).unwrap();
            assert!(
                record
                    .tiers
                    .values()
                    .all(|t| matches!(t, TierOutcome::Holds { .. }))
            );
            assert_eq!(record.cost.usd, Some(0.001));
            let args = lines(&dir, "args");
            for flag in ["--input-format", "--allowedTools", "--strict-mcp-config"] {
                assert!(args.iter().any(|a| a == flag), "{flag} in {args:?}");
            }
        }

        #[test]
        fn codex_input_goes_through_codex_queue_and_its_thread_is_deleted() {
            let dir = Dir::new();
            let codex = fake(&dir, "codex", CODEX);
            let record = probe(Provider::Codex, &codex, &[], TIMEOUT).unwrap();
            assert_eq!(
                lines(&dir, "queue"),
                ["queue", "--thread", "t-1", "--message", LIVE_INPUT]
            );
            assert_eq!(lines(&dir, "delete"), ["delete", "--force", "t-1"]);
            assert!(matches!(
                record.tiers[&LiveInput],
                TierOutcome::Missing { .. }
            ));
            assert!(
                lines(&dir, "args")
                    .iter()
                    .any(|a| a.starts_with("mcp_servers.bezl.url="))
            );
        }

        #[test]
        fn a_cli_that_calls_no_tool_gets_nothing_pushed() {
            let dir = Dir::new();
            let body = CLAUDE
                .replace(r#"echo '{"type":"assistant""#, r#"true '"#)
                .replace("read -r pushed", "pushed=");
            let claude = fake(&dir, "claude", &body);
            let record = probe(Provider::ClaudeCode, &claude, &[], TIMEOUT).unwrap();
            assert_eq!(record.tiers[&LiveInput], unknown(NO_PUSH));
        }

        #[test]
        fn a_hung_cli_is_an_error() {
            let dir = Dir::new();
            let claude = fake(&dir, "claude", "sleep 30");
            let started = Instant::now();
            assert_eq!(
                probe(
                    Provider::ClaudeCode,
                    &claude,
                    &[],
                    Duration::from_millis(300)
                ),
                Err("timed out".into())
            );
            assert!(started.elapsed() < Duration::from_secs(5));
        }
    }

    #[cfg(unix)]
    mod live {
        use super::*;
        use crate::providers::exec;
        use crate::providers::identity::{Identity, identify};

        const TIMEOUT: Duration = Duration::from_secs(300);

        fn found(var: &str) -> Option<Found> {
            let path = PathBuf::from(std::env::var_os(var)?);
            let ran = exec::run(&path, &["--version"], &[], TIMEOUT).unwrap();
            let Identity::Known { version, .. } = identify(&ran.stdout) else {
                panic!("{var} is not an agent CLI: {}", ran.says());
            };
            Some(Found { path, version })
        }

        /// Prints the record; `BEZL_TIERS_CAPTURE` names a file for the raw output.
        fn probed(provider: Provider, found: &Found, envs: &[(&str, &OsStr)]) -> Tiers {
            let (stdout, seen) = run(provider, found, envs, TIMEOUT).unwrap();
            if let Some(file) = std::env::var_os("BEZL_TIERS_CAPTURE") {
                fs::write(file, &stdout).unwrap();
            }
            println!("{seen:?}\n{:?}", cost(provider, &stdout));
            let tiers = verdict(provider, &stdout, &seen).unwrap();
            println!("{}", serde_json::to_string_pretty(&tiers).unwrap());
            tiers
        }

        /// Run with `env -u CLAUDECODE` from inside Claude Code.
        #[test]
        #[ignore = "paid: runs the real Claude Code"]
        fn claude_holds_every_tier_live() {
            let Some(claude) = found("BEZL_LIVE_CLAUDE") else {
                return;
            };
            let tiers = probed(Provider::ClaudeCode, &claude, &[]);
            assert!(
                tiers
                    .values()
                    .all(|t| matches!(t, TierOutcome::Holds { .. })),
                "{tiers:?}"
            );
        }

        /// `BEZL_LIVE_CODEX_HOME` is a signed-in Codex home.
        #[test]
        #[ignore = "paid: runs the real Codex"]
        fn codex_holds_tiers_zero_and_one_live() {
            let Some(codex) = found("BEZL_LIVE_CODEX") else {
                return;
            };
            let home = std::env::var_os("BEZL_LIVE_CODEX_HOME").expect("BEZL_LIVE_CODEX_HOME");
            let tiers = probed(Provider::Codex, &codex, &[("CODEX_HOME", &home)]);
            assert!(
                matches!(tiers[&StepBoundary], TierOutcome::Holds { .. }),
                "{tiers:?}"
            );
            assert!(
                matches!(tiers[&McpTool], TierOutcome::Holds { .. }),
                "{tiers:?}"
            );
            assert!(
                matches!(tiers[&LiveInput], TierOutcome::Missing { .. }),
                "{tiers:?}"
            );
        }
    }
}
