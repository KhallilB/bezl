// Checks a terminal-bench run against M4's pass mark. Usage: bun check.ts <out-dir>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fnv1a } from "../../src/ui/terminals/bench";

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
  canvases: number;
  t: { start: number; streamsDone: number; restStart: number; restEnd: number };
};
const mem = readFileSync(join(out, "mem.log"), "utf8")
  .trim()
  .split("\n")
  .map((l) => l.split(" ").map(Number) as [number, number]);
const within = (from: number, to: number) =>
  Math.max(...mem.filter(([t]) => t >= from && t <= to).map(([, mb]) => mb));

const burstMb = within(report.t.start, report.t.streamsDone);
const restMb = within(report.t.restStart, report.t.restEnd);
const echo = [...report.echoMs.burst, ...report.echoMs.rest];
const lines = {
  noLostBytes: report.panes.every(
    (p) => p.code === 0 && p.hash === expected.hash && p.bytes - p.retriedCr === expected.bytes,
  ),
  restUnder150Mb: restMb < 150,
  burstUnder600Mb: burstMb < 600,
  echoUnder100Ms: echo.length > 0 && Math.max(...echo) < 100,
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
      memoryMb: { burstPeak: burstMb, restPeak: restMb, samples: mem.length },
      echoMs: {
        burst: { n: report.echoMs.burst.length, median: median(report.echoMs.burst), max: Math.max(...report.echoMs.burst) },
        rest: { n: report.echoMs.rest.length, median: median(report.echoMs.rest), max: Math.max(...report.echoMs.rest) },
      },
      webglCanvases: report.canvases,
      lines,
    },
    null,
    2,
  ),
);
process.exit(Object.values(lines).every(Boolean) ? 0 : 1);
