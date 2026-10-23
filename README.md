# Bezl

Local control plane for AI coding workers. One native window directs Codex, Claude Code and Gemini CLI as separate account-authenticated workers: one primary with write authority per task worktree, read-only reviewers, task-scoped capabilities, and an append-only local evidence trail.

Bezl never calls a provider API, never holds a provider credential, and never relays one provider's output into another. It launches the official CLIs in PTYs and records what happened.

## Stack

| Layer | Choice |
|---|---|
| Host | Tauri 2, Rust core owns domain and policy |
| Live terminal | `@xterm/xterm` + `portable-pty`, bytes over a raw IPC channel |
| Evidence snapshots | `libghostty-vt` headless (spike 2), `@xterm/addon-serialize` as fallback |
| Persistence | append-only JSONL events, TOML manifests, `.ai/` inside each target repo |
| UI | React 19 + KBUI 0.1.0 (GitHub release tarballs) |

## Layout

```text
src/            React UI; src/ui/task is the Task screen, src/ui/theme the app theme (see docs/ui-styling.md, docs/product.md)
src-tauri/      Tauri shell and thin commands
crates/         bezl-domain, bezl-app, bezl-infra (to come)
spikes/         time-boxed proofs with thresholds; each has RESULT.md
```

## Develop

```bash
mise install && bun install
bun run check
cargo check -p bezl
bun tauri dev
```

`bun run check` runs typecheck, Biome, the jsdom unit tests and the Chromium tests (axe scan of the Task screen in light and dark, with and without the app theme). kbui is installed from its GitHub release tarballs, so no local kbui checkout is needed.

Spikes under `spikes/` build on their own; see each `RESULT.md` for the command and the verdict.

## License

[MIT](LICENSE)
