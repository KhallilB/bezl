# Spike 2: libghostty-vt headless snapshot on macOS

Date: 2026-10-22. Host: macOS 27.0.1, aarch64, Rust 1.96.0, libghostty-vt 0.2.2 (pins Ghostty a887df42, minimum Zig 0.15.2).

## Threshold

Pass: clean `cargo build` under 5 minutes on a clean runner; plain-text snapshot of a vim screen matches expected text.

## Result: PASS, with a toolchain caveat

| Zig | Source | Outcome |
|---|---|---|
| 0.15.2 upstream tarball | ziglang.org | FAIL: `undefined symbol: _getcwd` and 9 more; even `zig build-exe hello.zig -lc` fails on macOS 27 (`build-0.15.2.log`) |
| 0.15.2 + SDKROOT | ziglang.org | FAIL: same link errors (`build-0.15.2-sdk.log`) |
| 0.16.0 upstream | ziglang.org | FAIL: Ghostty's `src/build/zig.zig` rejects any version but 0.15.2 (`build-0.16.0.log`) |
| 0.15.2 Homebrew bottle `zig@0.15` | brew | PASS: clean build 42 s, exit 0 (`build-brew-0.15.log`) |
| mise `zig = "latest"` | mise | FAIL: resolves 0.17.0, 404; mise's download URL scheme is stale |

Snapshot run (`./target/debug/spike-libghostty-vt`):

```text
scripted ok=true lines=24
real_vim ok=true bytes_fed=2301
spike2 result: scripted=true real_vim=true
```

The real-vim case spawns `vim -u NONE` through `portable-pty`, types a line, feeds PTY bytes to `Terminal::vt_write`, and reads `Formatter` plain text. First line equals the typed text.

## Consequences for Bezl

- Evidence snapshots can come from libghostty-vt (route A). API used: `Terminal::new`, `vt_write`, `fmt::Formatter` with `Format::Plain`.
- CI needs a Zig that links on the runner's macOS: `brew install zig@0.15` is the proven path. Pin that in CI, never `latest`.
- The sys crate fetches Ghostty with `git clone` during `cargo build`. Air-gapped builds need `GHOSTTY_SOURCE_DIR` or `GHOSTTY_ZIG_SYSTEM_DIR`.
- Pre-1.0 bindings. Pin `libghostty-vt = "=0.2.2"` and expect breaking bumps; `@xterm/addon-serialize` stays the fallback behind the port.

## Reproduce

```bash
./build.sh "$(brew --prefix zig@0.15)/bin" && ./target/debug/spike-libghostty-vt
```
