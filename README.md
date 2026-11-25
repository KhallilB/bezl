# Bezl

**Bezl is retired.** The source and v0.1.0 prerelease are available for reference. My current work on coordinating tasks across repositories is [Waveboard](https://kcb.pro/work/waveboard).

Bezl was a local desktop prototype for working with coding agents. It shipped an app shell, a live terminal, and a task screen with sample data. The planned writer and reviewer workflow never shipped.

## Archived builds

Find the original builds on the [Releases page](https://github.com/KhallilB/bezl/releases). Each release says which file fits your computer.

| Your computer | File to download |
|---|---|
| Mac with Apple silicon (M1 or later) | `bezl_<version>_aarch64.dmg` |
| Mac with an Intel chip | `bezl_<version>_x64.dmg` |
| Windows | `bezl_<version>_x64-setup.exe` |
| Linux | `.AppImage` for most distributions, `.deb` for Debian or Ubuntu, `.rpm` for Fedora |

These builds aren't code-signed yet, so your computer will warn you the first time you open Bezl.

- **macOS:** open the `.dmg` and drag Bezl into Applications. If macOS won't open it or says it's damaged, run this once in Terminal, then open Bezl again:

  ```bash
  xattr -dr com.apple.quarantine /Applications/bezl.app
  ```

- **Windows:** if SmartScreen stops the installer, click **More info**, then **Run anyway**.
- **Linux:** make the AppImage executable with `chmod +x`, then run it.

You can also build Bezl from source; see [Develop](#develop).

## Stack

| Layer | Choice | Status |
|---|---|---|
| Host | Tauri 2; the Rust core will own the domain and policy | Shell built |
| Live terminal | `@xterm/xterm` and `portable-pty`, bytes over a raw IPC channel with backpressure | Built |
| Terminal snapshots | `libghostty-vt` headless, saved in `.git/bezl/terminals/` | Built |
| Records | Append-only JSONL events and TOML manifests in `.git/bezl/`, per clone and never tracked | Planned |
| UI | React 19 and kbui 0.10.2 (`@kb.ui/*`), from npm | Built |
| Model endpoints | Ollama on this machine, local or cloud models, for jobs without tools | Planned |

## Layout

```text
src/ui/task/    Task screen, on fixture data for now
src/ui/theme/   app theme and tokens
src/ui/terminals/ agent terminals and their snapshots
src-tauri/      Tauri shell and thin commands
```

This repository holds the app only. Planning docs, research and experiments are kept outside it.

Agent instruction and settings files are gitignored at any depth: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.mcp.json`, `.claude/`, `.codex/`, `.agents/` and `.cursor/`. Keep yours local.

## Develop

```bash
mise install && bun install
```

The Rust build also needs Zig 0.15.2 for `libghostty-vt` (`brew install zig@0.15`), and fetches Ghostty the first time.

```bash
bun run check
```

```bash
cargo check -p bezl
```

```bash
bun tauri dev
```

`bun run check` runs the typecheck, Biome, the jsdom unit tests and the Chromium tests. The Chromium tests run an axe scan of the Task screen in light and dark, with and without the app theme. kbui installs from npm as `@kb.ui/*`, so no local kbui checkout is needed.

Checks run locally for now. The GitHub workflow in `.github/workflows/ci.yml` runs only when started by hand.

## Historical release process

To build a release, push a tag like `v0.2.0` that matches the version in `src-tauri/tauri.conf.json`. GitHub Actions then builds the installers for macOS, Windows and Linux and puts them in a draft release (`.github/workflows/release.yml`). Look the draft over, then publish it.

## License

[MIT](LICENSE)
