# Bezl

Local control plane for AI coding workers. One native window directs Codex, Claude Code and Gemini CLI as separate account-authenticated workers: one primary with write authority per task worktree, read-only reviewers, task-scoped capabilities, and an append-only local evidence trail.

Bezl never holds a key and never relays one provider's output into another. It reaches models in two ways: it launches the official agent CLIs in PTYs, and it may call model endpoints on localhost, such as Ollama serving local models or Ollama's cloud models after `ollama signin`. Credentials stay with those tools. Bezl records what happened.

## Stack

| Layer | Choice |
|---|---|
| Host | Tauri 2, Rust core owns domain and policy |
| Live terminal | `@xterm/xterm` + `portable-pty`, bytes over a raw IPC channel |
| Evidence snapshots | `libghostty-vt` headless (spike 2), `@xterm/addon-serialize` as fallback |
| Persistence | append-only JSONL events, TOML manifests, `.ai/` inside each target repo |
| UI | React 19 + KBUI 0.1.0 (GitHub release tarballs) |
| Model endpoints | Ollama on localhost, local or cloud, for jobs without tools (spike 4) |

## Layout

```text
src/            React UI; src/ui/skin holds the Faceted Operations token overrides, see docs/ui-styling.md
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

`bun run check` runs typecheck, Biome, the jsdom unit tests and the Chromium tests (axe scan of the Control Room in light and dark, skinned and unskinned). kbui is installed from its GitHub release tarballs, so no local kbui checkout is needed.

Spikes under `spikes/` build on their own; see each `RESULT.md` for the command and the verdict.

## Docs

- [MVP roadmap](docs/roadmap.md): the milestones, each with the pass mark it is recorded against in `progress.json`.
- [Crew protocol](docs/crew-protocol.md): how several models work on one task without looping or wasting tokens.
- [Product vision](docs/vision.md): the task journey the app is shaped around, the preview canvas, and how both map onto the milestones. Interactive sketch in [docs/sketches/journey](docs/sketches/journey/README.md).

## License

[MIT](LICENSE)
