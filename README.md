# Bezl

**Any agent writes the change. Bezl measures it. You decide.**

Bezl is a local app for working with AI coding agents, in early development. The stack and UI (M0) are done, and the evidence engine (E1) is next; the [roadmap](docs/roadmap.md) says what exists today. Bezl will run the official agent CLIs, Claude Code and Codex for now, as separate workers:

- one writer per task worktree;
- reviewers that cannot write, from a different provider when you have two.

Bezl will run the checks itself, show which changed code no test runs, and record every step on your machine.

Bezl never holds a key. Agent CLIs keep their own sign-in, and model endpoints such as Ollama run on this machine by default. Between agents, Bezl passes only what it produced or checked itself: the diff from git, its own check results, and verified findings. It never passes one agent's conversation or claims to another ([handoff rules](docs/crew-protocol.md#handoff-rules)).

## Stack

| Layer | Choice |
|---|---|
| Host | Tauri 2; the Rust core owns the domain and policy |
| Live terminal | `@xterm/xterm` and `portable-pty`, bytes over a raw IPC channel |
| Terminal snapshots | `libghostty-vt` headless (spike 2), with `@xterm/addon-serialize` as the fallback |
| Records | Append-only JSONL events and TOML manifests in `.git/bezl/`, per clone and never tracked |
| UI | React 19 and kbui 0.4.0, from GitHub release tarballs |
| Model endpoints | Ollama on this machine, local or cloud models, for jobs without tools (spike 4) |

## Layout

```text
src/            React UI. src/ui/task is the interim Task screen (replaced by the task journey in M5); src/ui/theme is the app theme
src-tauri/      Tauri shell and thin commands
crates/         bezl-domain, bezl-app, bezl-infra (from M2)
spikes/         time-boxed experiments; each finished one has a RESULT.md
```

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

Checks run locally until v1, the MVP release. The GitHub workflow in `.github/workflows/ci.yml` runs only when started by hand.

Each spike under `spikes/` builds on its own; its `RESULT.md` or README gives the command and the verdict.

## Docs

- [North star](docs/north-star.md): who Bezl is for, the one metric, the moat hypothesis and the non-goals. Every other doc answers to it.
- [Roadmap](docs/roadmap.md): each milestone's goal, demo, pass mark and Definition of Done.
- [Product vision](docs/vision.md): the task journey the app is shaped around, and the preview canvas. Interactive sketch in [docs/sketches/journey](docs/sketches/journey/README.md).
- [Crew protocol](docs/crew-protocol.md): how several models work on one task, what may pass between them, and when it stops.
- [Product outline](docs/product.md): the app's areas and where each one sits in the journey.
- [UI styling](docs/ui-styling.md): the app theme, the state colours and the kbui rules.
- [Glossary](docs/glossary.md): one word for each idea.

## License

[MIT](LICENSE)
