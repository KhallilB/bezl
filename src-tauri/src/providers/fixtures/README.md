# CLI captures

One directory per pinned CLI version, `<binary>-<version>/`, holding every output Bezl parses: the version line, sign-in, the Claude canary, usage and limits, the read-only probe, and errors. `contract.rs` lists them (`CAPTURES`) and the pinned versions (`PINNED`). `cargo test` parses every capture of every pinned version against its contract.

A file named `<stem>-synthesized.<ext>` stands in where no run of that version could produce the output.

## Live mode

Off by default. It reruns every capture on the installed CLIs, checks the same contracts, diffs each output's shape against the pinned capture, and reports what it spent. For Claude Code it also reruns the hooks probe: a signed-out control run with hooks and MCP left on must write both markers, and the reviewer run must write neither.

```bash
env -u CLAUDECODE cargo test -p bezl --lib providers::contract::tests::live -- --ignored --nocapture
```

- `BEZL_LIVE_CLAUDE`, `BEZL_LIVE_CODEX`: binary paths. Without them, the first real one on `PATH` is used.
- `BEZL_LIVE_CODEX_HOME`: a signed-in Codex home. It defaults to `CODEX_HOME`, else `~/.codex`.
- Cost on 2026-10-30: about $0.004–0.008 of Claude Code (canary, stream canary and probe; signed-out runs are free), plus two Codex calls of about 26k and 52k input tokens. The Codex `exec` run is not ephemeral, so it leaves one session in that Codex home.

An installed version that is not pinned fails, and is reported as unpinned, never parsed against another version's captures.

## Adding a pinned version

1. Install the new CLI and run live mode with `BEZL_CONTRACT_CAPTURE=1`. It writes each capture the version's directory lacks, but only those that passed their contract, with scratch paths, the home directory and Codex's `plan_type` redacted. Outputs no run can produce, such as Claude's out-of-quota result, are copied from the newest pin as `-synthesized`.
2. Read every written file for anything private, then add the version to `PINNED`.
3. Run `cargo test`. A missing capture or a broken contract fails it.

## Synthesized captures

- `claude-2.1.312/out-of-quota-synthesized.json`: no real quota error could be forced. It is the 401 capture with status 429 and the CLI's limit wording.
- `codex-0.163.0/version-synthesized.txt`, `login-status-synthesized.txt`, `login-status-signed-out-synthesized.txt`: 0.163.0 was no longer installed when these shapes joined the suite. They are the lines Bezl's identity and sign-in tests already used, which 0.165.0-alpha.1.2 printed unchanged.
- `codex-0.163.0/exec-signed-out-synthesized.jsonl`: trimmed from 0.165.0-alpha.1.2's signed-out `exec --json` run, with request ids removed.
