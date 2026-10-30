import { invoke } from "@tauri-apps/api/core";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { StreamCheck } from "./bench";
import { tauriPort } from "./port";
import { type PaneConfig, Terminals } from "./Terminals";

type Bench = { payload: string; result: string };

const STREAMS = 3;
const SETTLE_MS = 15_000;
const REST_MS = 10_000;
const SAMPLES = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** M4's pass-mark run, opened by `scripts/terminal-bench/run.sh`. */
export function TerminalBench() {
  const [bench, setBench] = useState<Bench | null | undefined>();
  useEffect(() => {
    invoke<Bench | null>("terminal_bench").then(setBench, () => setBench(null));
  }, []);
  if (bench === undefined) return null;
  if (bench === null) return <p>No bench: run scripts/terminal-bench/run.sh.</p>;
  return <BenchRun bench={bench} />;
}

function BenchRun({ bench }: { bench: Bench }) {
  const run = useRef<ReturnType<typeof startRun> | null>(null);
  run.current ??= startRun(bench);
  return <Terminals port={tauriPort} panes={run.current.panes} />;
}

function startRun(bench: Bench) {
  const start = Date.now();
  const checks = Array.from({ length: STREAMS }, () => new StreamCheck());
  const exits: { code: number | null; ms: number }[] = [];
  let allExited: () => void = () => {};
  const streamsDone = new Promise<void>((r) => (allExited = r));
  let echo: Terminal | null = null;
  let awaiting: { token: string; resolve: () => void } | null = null;
  let seen = "";
  const decoder = new TextDecoder();

  const panes: PaneConfig[] = checks.map((check, i) => ({
    label: `Stream ${i + 1}`,
    argv: ["cat", bench.payload],
    onDrawn: (chunk) => check.push(chunk),
    onExit: (code) => {
      exits[i] = { code, ms: Date.now() - start };
      if (exits.filter(Boolean).length === STREAMS) allExited();
    },
  }));
  panes.push({
    label: "Echo",
    argv: ["cat"],
    onTerminal: (t) => (echo = t),
    // Echo is timed to the draw, not to the byte's arrival.
    onDrawn: (chunk) => {
      seen += decoder.decode(chunk);
      if (awaiting && seen.includes(awaiting.token)) awaiting.resolve();
    },
  });

  async function echoOnce(i: number): Promise<number> {
    const token = `<echo${i}>`;
    seen = "";
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      awaiting = { token, resolve };
      echo?.input(token);
    });
    awaiting = null;
    return performance.now() - t0;
  }

  void (async () => {
    await sleep(1000);
    const burst: number[] = [];
    let done = false;
    void streamsDone.then(() => (done = true));
    for (let i = 0; !done && burst.length < SAMPLES; i++) {
      burst.push(await echoOnce(i));
      await sleep(250);
    }
    await streamsDone;
    const streamsAt = Date.now();
    await sleep(5000);
    const rest: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      rest.push(await echoOnce(100 + i));
      await sleep(50);
    }
    const restStart = streamsAt + SETTLE_MS;
    await sleep(Math.max(0, restStart - Date.now()) + REST_MS);
    const report = {
      payload: bench.payload,
      panes: checks.map((c, i) => ({ ...c.result(), ...exits[i] })),
      echoMs: { burst, rest },
      canvases: document.querySelectorAll(".xterm-screen canvas").length,
      t: { start, streamsDone: streamsAt, restStart, restEnd: restStart + REST_MS },
    };
    await invoke("terminal_bench_done", { report: JSON.stringify(report, null, 2) });
  })();

  return { panes };
}
