import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX, line, linkHorizontal } from "d3-shape";
import type { TaskView, WorkerView } from "./model";

export const MAP_WIDTH = 1000;
/** Vertical room one node's two-line label needs. */
export const LABEL_GAP = 44;
const MIN_HEIGHT = 240;
const PAD = 56;
const RX = 300;
const RY = 82;

export type Point = { x: number; y: number };

export type MapNode = Point & {
  id: string;
  worker: WorkerView;
  access: "write" | "read";
  /** Label anchor: right of the hub reads left to right, left of it right to left. */
  side: "start" | "end";
  edge: string;
};

export type MapLayout = {
  width: number;
  height: number;
  hub: Point;
  rx: number;
  ry: number;
  nodes: MapNode[];
};

const round = (n: number) => Math.round(n * 10) / 10;
const byId = (a: WorkerView, b: WorkerView) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const link = linkHorizontal<
  { source: [number, number]; target: [number, number] },
  [number, number]
>();

/**
 * Pure: same task and workers give the same geometry, whatever their order.
 * Writers sit right of the hub, readers left, each side a column spaced by LABEL_GAP on an ellipse.
 */
export function layoutWorkerMap(_task: TaskView, workers: WorkerView[]): MapLayout {
  const writers = workers.filter((w) => w.role === "primary").sort(byId);
  const readers = workers.filter((w) => w.role === "reviewer").sort(byId);
  const span = (Math.max(writers.length, readers.length, 1) - 1) * LABEL_GAP;
  const height = Math.max(MIN_HEIGHT, span + 2 * PAD);
  const hub = { x: MAP_WIDTH / 2, y: height / 2 };
  const ry = Math.max(RY, span / 2 + LABEL_GAP / 2);

  const column = (side: WorkerView[], dir: 1 | -1): MapNode[] =>
    side.map((worker, i) => {
      const y = round(hub.y + (i - (side.length - 1) / 2) * LABEL_GAP);
      const t = (y - hub.y) / ry;
      const x = round(hub.x + dir * RX * Math.sqrt(1 - t * t));
      return {
        id: worker.id,
        worker,
        x,
        y,
        access: worker.role === "primary" ? "write" : "read",
        side: dir === 1 ? "start" : "end",
        edge: link({ source: [hub.x, hub.y], target: [x, y] }) ?? "",
      };
    });

  return {
    width: MAP_WIDTH,
    height,
    hub,
    rx: RX,
    ry,
    nodes: [...column(writers, 1), ...column(readers, -1)],
  };
}

export const TRACE_WIDTH = 600;
export const TRACE_HEIGHT = 64;

/** Monotone curves never overshoot their samples, so the trace never claims output that was not there. */
export function tracePaths(samples: number[]) {
  if (samples.length < 2) return null;
  const x = scaleLinear()
    .domain([0, samples.length - 1])
    .range([0, TRACE_WIDTH]);
  const y = scaleLinear()
    .domain([0, Math.max(...samples, 1)])
    .range([TRACE_HEIGHT - 6, 8]);
  const at = (_: number, i: number) => x(i);
  return {
    width: TRACE_WIDTH,
    height: TRACE_HEIGHT,
    line: line<number>().x(at).y(y).curve(curveMonotoneX)(samples) ?? "",
    area: area<number>().x(at).y0(TRACE_HEIGHT).y1(y).curve(curveMonotoneX)(samples) ?? "",
  };
}
