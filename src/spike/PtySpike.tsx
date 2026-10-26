import { Channel, invoke } from "@tauri-apps/api/core";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

type Config = {
  enabled: boolean;
  payload: string;
  expected_bytes: number;
  result_path: string;
  pid: number;
};

type Msg = ArrayBuffer | Uint8Array | number[] | { exit: number };

function toBytes(m: Msg): Uint8Array | null {
  if (m instanceof ArrayBuffer) return new Uint8Array(m);
  if (m instanceof Uint8Array) return m;
  if (Array.isArray(m)) return Uint8Array.from(m);
  return null;
}

type PaneResult = { id: number; bytes: number; exit: number; streamMs: number; renderMs: number };

function runPane(id: number, cmd: string[], el: HTMLElement): Promise<PaneResult> {
  return new Promise((resolve, reject) => {
    const term = new Terminal({ cols: 120, rows: 40, scrollback: 1000 });
    term.open(el);
    let webgl = true;
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      webgl = false;
    }
    term.loadAddon(new FitAddon());
    term.writeln(`pane ${id} webgl=${webgl}`);
    const start = performance.now();
    let bytes = 0;
    let lastRender = start;
    const ch = new Channel<Msg>();
    ch.onmessage = (m) => {
      const b = toBytes(m);
      if (b) {
        bytes += b.byteLength;
        const n = b.byteLength;
        term.write(b, () => {
          lastRender = performance.now();
          void invoke("spike_ack", { id, n });
        });
        return;
      }
      const streamMs = performance.now() - start;
      // Let xterm drain its write queue before reading the render clock.
      term.write("", () => {
        resolve({
          id,
          bytes,
          exit: (m as { exit: number }).exit,
          streamMs,
          renderMs: performance.now() - start,
        });
        void lastRender;
      });
    };
    invoke("spike_start", { id, cmd, onMsg: ch }).catch(reject);
  });
}

async function echoLatency(samples: number): Promise<number[]> {
  const id = 99;
  // PTY echo plus cat means every token comes back twice; match on the token, not on "any bytes".
  let want = "";
  let resolver: ((t: number) => void) | null = null;
  let seen = "";
  const ch = new Channel<Msg>();
  ch.onmessage = (m) => {
    const b = toBytes(m);
    if (!b) return;
    void invoke("spike_ack", { id, n: b.byteLength });
    seen += new TextDecoder().decode(b);
    if (resolver && want && seen.includes(want)) {
      const r = resolver;
      resolver = null;
      r(performance.now());
    }
  };
  await invoke("spike_start", { id, cmd: ["cat"], onMsg: ch });
  const out: number[] = [];
  for (let i = 0; i < samples; i++) {
    want = `<tok${i}>`;
    seen = "";
    const arrived = new Promise<number>((res) => {
      resolver = res;
    });
    const t0 = performance.now();
    await invoke("spike_write", { id, data: want });
    out.push((await arrived) - t0);
    await new Promise((r) => setTimeout(r, 20));
  }
  return out;
}

const PANES = ["primary", "reviewer-a", "reviewer-b"];

export function PtySpike({ config }: { config: Config }) {
  const els = useRef<Record<string, HTMLDivElement | null>>({});
  const [status, setStatus] = useState("running");
  const started = useRef(false);
  useEffect(() => {
    // StrictMode runs effects twice; the PTYs must spawn once.
    if (started.current) return;
    started.current = true;
    const log = (m: string) => invoke("spike_log", { msg: m }).catch(() => {});
    window.onerror = (m) => void log(`window.onerror ${String(m)}`);
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      void log(
        `console.error ${args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : JSON.stringify(a))).join(" ")}`,
      );
      origError(...args);
    };
    window.onunhandledrejection = (e) => void log(`unhandledrejection ${String(e.reason)}`);
    (async () => {
      const targets = PANES.map((p) => els.current[p]);
      if (targets.some((e) => !e)) return;
      await log(`start expected_bytes=${config.expected_bytes}`);
      const t0 = performance.now();
      const panes = await Promise.all(
        targets.map((el, i) => runPane(i, ["cat", config.payload], el as HTMLElement)),
      );
      const totalMs = performance.now() - t0;
      await log(
        `panes done total_ms=${Math.round(totalMs)} bytes=${panes.map((p) => p.bytes).join(",")}`,
      );
      const latency = await echoLatency(20);
      await log("latency done");
      const sorted = [...latency].sort((a, b) => a - b);
      const report = {
        expected_bytes: config.expected_bytes,
        panes,
        all_bytes_ok: panes.every((p) => p.bytes === config.expected_bytes),
        total_stream_ms: totalMs,
        echo_latency_ms: {
          median: sorted[Math.floor(sorted.length / 2)],
          max: sorted.at(-1),
          samples: latency,
        },
        pid: config.pid,
        ua: navigator.userAgent,
      };
      setStatus(JSON.stringify(report));
      await invoke("spike_finish", {
        path: config.result_path,
        report: JSON.stringify(report, null, 2),
      });
    })().catch((e) => {
      void log(`spike failed: ${String(e)}`);
      setStatus(`failed: ${String(e)}`);
      void invoke("spike_finish", {
        path: config.result_path,
        report: JSON.stringify({ error: String(e) }),
      });
    });
  }, [config]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, height: "100vh" }}>
      {PANES.map((p) => (
        <div
          key={p}
          ref={(el) => {
            els.current[p] = el;
          }}
          style={{ minHeight: 0 }}
        />
      ))}
      <pre style={{ gridColumn: "1 / -1", fontSize: 10 }}>{status}</pre>
    </div>
  );
}

export function useSpikeConfig(): Config | null {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    invoke<Config>("spike_config").then(setCfg, () => setCfg(null));
  }, []);
  return cfg;
}
