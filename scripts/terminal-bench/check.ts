// Checks a terminal-bench run against M4's pass mark. Usage: bun check.ts <out-dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type BenchTimes, fnv1a, type MemSample, memoryMb } from "../../src/ui/terminals/bench";

const MIB = 1024 * 1024;
const out = process.argv[2] ?? ".";
const payload = readFileSync(join(out, "payload.txt"));

// The PTY's onlcr turns each LF into CRLF.
const crlf = new Uint8Array(payload.length + payload.filter((b) => b === 10).length);
let j = 0;
for (const b of payload) {
  if (b === 10) crlf[j++] = 13;
  crlf[j++] = b;
}
const expected = { bytes: crlf.length, hash: fnv1a(crlf) };

type Pane = { bytes: number; retriedCr: number; hash: number; code: number | null; ms: number };
const report = JSON.parse(readFileSync(join(out, "result.json"), "utf8")) as {
  panes: Pane[];
  echoMs: { burst: number[]; rest: number[] };
  snapshots: { pane: string; rows: number; matched: boolean }[];
  canvases: number;
  t: BenchTimes;
};
const mem = readFileSync(join(out, "mem.log"), "utf8")
  .trim()
  .split("\n")
  .map((l) => l.split(" ").map(Number) as MemSample);
const memory = memoryMb(mem, report.t);
const echo = [...report.echoMs.burst, ...report.echoMs.rest];
const lines = {
  noLostBytes: report.panes.every(
    (p) => p.code === 0 && p.hash === expected.hash && p.bytes - p.retriedCr === expected.bytes,
  ),
  restUnder150MbOverIdle: memory.restOverIdle < 150,
  burstUnder600Mb: memory.burstPeak < 600,
  echoUnder100Ms: echo.length > 0 && Math.max(...echo) < 100,
  snapshotsMatch: report.snapshots.length === report.panes.length && report.snapshots.every((s) => s.matched),
};
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const median = (xs: number[]) => sorted(xs)[Math.floor(xs.length / 2)];
console.log(
  JSON.stringify(
    {
      expected,
      panes: report.panes,
      streamSeconds: (report.t.streamsDone - report.t.start) / 1000,
      aggregateMBps: (3 * expected.bytes) / MIB / ((report.t.streamsDone - report.t.start) / 1000),
      memoryMb: { ...memory, samples: mem.length },
      echoMs: {
        burst: { n: report.echoMs.burst.length, median: median(report.echoMs.burst), max: Math.max(...report.echoMs.burst) },
        rest: { n: report.echoMs.rest.length, median: median(report.echoMs.rest), max: Math.max(...report.echoMs.rest) },
      },
      snapshots: report.snapshots,
      webglCanvases: report.canvases,
      lines,
    },
    null,
    2,
  ),
);
process.exit(Object.values(lines).every(Boolean) ? 0 : 1);
