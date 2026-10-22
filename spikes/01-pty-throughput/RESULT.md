# Spike 1: PTY throughput into WKWebView (Tauri 2 + xterm.js)

Date: 2026-10-22. Host: macOS 27.0.1, Apple Silicon, Tauri 2.12.5, `@xterm/xterm` 6.0.0 with WebGL addon, `portable-pty` 0.9.0. Three panes each run `cat payload.txt` (20,263,158 bytes, 76-char lines; 20,526,316 bytes after PTY `onlcr`). Bytes travel Rust to webview as `InvokeResponseBody::Raw` over a `Channel`, arriving as `ArrayBuffer`.

## Threshold (set before running)

Pass: no dropped bytes, input echo latency under 100 ms, memory under 300 MB.

## Results

| Run | Flow-control high-water | 3 x 20 MB stream | Echo latency (20 samples) | Peak RSS, app + its WebKit helpers | Idle after |
|---|---|---|---|---|---|
| 1 (`result-run1-hw1m.json`) | 1 MiB | 14.7 s (4.2 MB/s aggregate) | invalid probe (PTY echo doubled tokens) | 789 MB | ~120 MB |
| 2 (`result-run2-hw256k.json`) | 256 KiB | 38.3 s (1.6 MB/s aggregate) | median 2 ms, max 5 ms | 492 MB | ~120 MB |

Byte counts: every pane received the full payload plus a 1 to 7 byte surplus (never a deficit). The surplus source is not identified; the count test needs a content hash before it counts as proof of no corruption.

## Verdict: PASS on bytes and latency, FAIL on the memory line as written

- No deficit, latency 20x under the threshold, three WebGL panes render a 60 MB burst in 15 s.
- Peak memory misses 300 MB in both runs. The peak is transient and lands in WebKit's content and GPU processes, not in the Rust core. Idle returns to about 120 MB.
- Without flow control the first attempt grew past 3 GB (unbounded Channel queue plus xterm write buffer). Flow control is not optional: the Rust reader blocks until xterm's write callback acks below the high-water mark (`spike_ack`).

Decision (owner, 2026-10-22): keep Tauri. The 300 MB line is replaced by two trip-wires: idle under 150 MB, burst peak under 600 MB at the 1 MiB high-water mark (run 1 measured 789 MB at that mark, so the burst wire is a target the first real `TerminalPort` must meet, not a result already in hand). Revisit with the DOM or canvas renderer and a smaller scrollback if a real session breaches either wire. Electron would carry the same WebKit-class memory in Chromium plus Node.

## Findings that change the product

- `TerminalPort` must expose backpressure; a fire-and-forget byte stream is a memory leak.
- Vite's watcher must ignore `src-tauri/`, `spikes/` and `target/`, or Rust build output reloads the page mid-run.
- React StrictMode double-runs effects; PTY spawn needs an explicit once-guard.
- Memory attribution: WKWebView helpers are not children of the app; sample WebKit pids that appear after launch (`run.sh`).

## Reproduce

```bash
head -c 15000000 /dev/urandom | base64 -b 76 > payload.txt
./run.sh        # writes result.json, prints peak_mb
```
