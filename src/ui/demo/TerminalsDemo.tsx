import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { type SavedRef, tauriPort, tauriRecord } from "../terminals/port";
import { type PaneConfig, Terminals } from "../terminals/Terminals";
import { drive, sleep, snap, until } from "./driver";
import { EchoTimer } from "./echo";
import { Asserts } from "./result";

const STREAM_S = 60;
const SAMPLES = 20;
const SAMPLE_GAP_MS = 1000;
// M4's pass mark.
const ECHO_LIMIT_MS = 100;
const STREAM = [
  "/bin/bash",
  "-c",
  `end=$((SECONDS + ${STREAM_S})); while ((SECONDS < end)); do seq 1 100000; done`,
];

type Stream = { bytes: number; exit?: number | null };

/** M4's demo: two panes stream for a minute while the third echoes typing; its snapshot reopens. */
export function TerminalsDemo() {
  const root = useRef<HTMLDivElement>(null);
  const run = useRef<ReturnType<typeof setup> | null>(null);
  run.current ??= setup();
  useEffect(() => run.current?.start(root.current as HTMLDivElement), []);
  return (
    <div ref={root}>
      <Terminals port={tauriPort} record={tauriRecord} panes={run.current.panes} />
    </div>
  );
}

function setup() {
  const streams: Stream[] = [{ bytes: 0 }, { bytes: 0 }];
  const echo = new EchoTimer();
  let term: Terminal | null = null;
  let echoOpen = false;
  let saved: SavedRef | null = null;
  const panes: PaneConfig[] = streams.map((s, i) => ({
    label: `Stream ${i + 1}`,
    argv: STREAM,
    onDrawn: (chunk) => (s.bytes += chunk.byteLength),
    onExit: (code) => (s.exit = code),
  }));
  panes.push({
    label: "Echo",
    argv: ["cat"],
    onTerminal: (t) => (term = t),
    onHandle: () => (echoOpen = true),
    onSnapshot: (ref) => (saved = ref),
    onDrawn: (chunk) => echo.drawn(chunk),
  });
  let started = false;

  function start(el: HTMLDivElement) {
    if (started) return;
    started = true;
    const a = new Asserts("terminals");
    void drive(a, async () => {
      const t = await until("the echo pane", () => echoOpen && term, 10_000);
      await until("both streams drawing", () => streams.every((s) => s.bytes > 0), 10_000);
      await sleep(3000);
      await snap(a, "streaming");

      const echoPane = el.querySelectorAll("[data-pane]")[2] as HTMLElement;
      const ms: number[] = [];
      let underLoad = true;
      let token = "";
      for (let i = 0; i < SAMPLES; i++) {
        token = `<echo${i}>`;
        ms.push(await echo.time(token, (tok) => t.input(tok)));
        underLoad &&= streams.every((s) => s.exit === undefined);
        if (i === 0) await snap(a, "echo typed", echoPane);
        await sleep(SAMPLE_GAP_MS);
      }
      const painted = await until(
        "the echo pane to paint what was typed",
        () => echoPane.querySelector(".xterm-rows")?.textContent?.includes(token),
        10_000,
      ).catch(() => false);
      a.check(
        "echo pane paints what was typed",
        painted,
        painted ? `shows ${token}` : `${token} drawn but never painted`,
      );
      await snap(a, "echo done", echoPane);
      a.check(
        `echo under ${ECHO_LIMIT_MS} ms`,
        Math.max(...ms) < ECHO_LIMIT_MS,
        `${ms.length} samples, max ${Math.max(...ms).toFixed(1)} ms: ${ms.map((m) => m.toFixed(1)).join(", ")}`,
      );
      a.check(
        "echo timed while both streams ran",
        underLoad,
        underLoad ? "no stream exited before the last sample" : "a stream exited mid-sampling",
      );

      const button = [...echoPane.querySelectorAll("button")].find(
        (b) => b.textContent === "Snapshot",
      );
      button?.click();
      const viewer = await until(
        "the snapshot viewer",
        () => document.querySelector<HTMLElement>(".snapshot-dialog [data-snapshot-viewer]"),
        10_000,
      );
      const shown = await until(
        "the viewer to draw the echo",
        () => {
          const text = viewer.querySelector(".xterm-rows")?.textContent ?? "";
          return text.includes(token) && text;
        },
        10_000,
      );
      await snap(a, "snapshot viewer");
      const title = viewer.querySelector(".terminal-title")?.textContent;
      const ref = saved as SavedRef | null;
      a.check(
        "echo snapshot reopens in the viewer",
        ref !== null && title === ref.pane && shown.includes(token),
        `saved ${ref ? `${ref.pane}@${ref.takenAt}` : "nothing"}; viewer titled ${JSON.stringify(title)}, shows ${token}`,
      );
      const close = [...document.querySelectorAll(".snapshot-dialog button")].find(
        (b) => b.textContent === "Close",
      ) as HTMLButtonElement | undefined;
      close?.click();

      await until(
        "both streams to exit",
        () => streams.every((s) => s.exit !== undefined),
        (STREAM_S + 60) * 1000,
      );
      await snap(a, "streams done");
      a.check(
        "streams ran to the end",
        streams.every((s) => s.exit === 0),
        streams
          .map(
            (s, i) =>
              `Stream ${i + 1}: exit ${s.exit}, ${(s.bytes / 1048576).toFixed(1)} MiB drawn`,
          )
          .join("; "),
      );
    });
  }

  return { panes, start };
}
