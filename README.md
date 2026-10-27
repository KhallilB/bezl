# Bezl

**Any agent writes the change. Bezl measures it. You decide.**

Bezl is a local desktop app for working with AI coding agents. It is in early development: the app shell, a live terminal and the Task screen exist, and agents do not run inside it yet.

Bezl will run the official agent CLIs, Claude Code and Codex for now, as separate workers:

- one writer per task worktree;
- reviewers that cannot write, from a different provider when you have two.

Bezl will run the checks itself, show which changed code no test runs, and record every step on your machine.

Bezl never holds a key. Agent CLIs keep their own sign-in, and model endpoints such as Ollama run on this machine by default. Between agents, Bezl passes only what it produced or checked itself: the diff from git, its own check results, and verified findings. It never passes one agent's conversation or claims to another.

## Stack

| Layer | Choice | Status |
|---|---|---|
| Host | Tauri 2; the Rust core will own the domain and policy | Shell built |
| Live terminal | `@xterm/xterm` and `portable-pty`, bytes over a raw IPC channel | Prototype |
| Terminal snapshots | `libghostty-vt` headless, with `@xterm/addon-serialize` as the fallback | Planned |
| Records | Append-only JSONL events and TOML manifests in `.git/bezl/`, per clone and never tracked | Planned |
| UI | React 19 and kbui 0.4.0, from GitHub release tarballs | Built |
| Model endpoints | Ollama on this machine, local or cloud models, for jobs without tools | Planned |

## Layout

```text
src/ui/task/    Task screen, on fixture data for now
src/ui/theme/   app theme and tokens
src/spike/      live terminal prototype, removed once the real terminal lands
src-tauri/      Tauri shell and thin commands
```

This repository holds the app only. Planning docs, research and experiments are kept outside it.

Agent instruction and settings files are gitignored at any depth: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.mcp.json`, `.claude/`, `.codex/`, `.agents/` and `.cursor/`. Keep yours local.

## Develop

```bash
mise install && bun install
```

```bash
bun run check
```

```bash
cargo check -p bezl
```

```bash
bun tauri dev
```

`bun run check` runs the typecheck, Biome, the jsdom unit tests and the Chromium tests. The Chromium tests run an axe scan of the Task screen in light and dark, with and without the app theme. kbui installs from its GitHub release tarballs, so no local kbui checkout is needed.

Checks run locally for now. The GitHub workflow in `.github/workflows/ci.yml` runs only when started by hand.

## Releases

Pushing a tag `vX.Y.Z` that matches the version in `src-tauri/tauri.conf.json` runs `.github/workflows/release.yml`. It builds installers for macOS (Apple silicon and Intel), Linux and Windows into a draft GitHub release, which is published by hand. Installers are not code-signed yet.

## License

[MIT](LICENSE)
