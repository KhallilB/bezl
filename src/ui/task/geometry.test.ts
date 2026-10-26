import { describe, expect, test } from "vitest";
import { blocked, running, task } from "./fixtures";
import { LABEL_GAP, layoutWorkerMap, tracePaths } from "./geometry";
import type { WorkerView } from "./model";

const reviewers = (n: number): WorkerView[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    name: `Reviewer ${i + 1}`,
    role: "reviewer" as const,
    provider: "Claude Code",
    state: "idle" as const,
    summary: "",
  }));

describe("layoutWorkerMap", () => {
  test("returns identical geometry for identical input", () => {
    expect(layoutWorkerMap(task, running)).toEqual(layoutWorkerMap(task, running));
  });

  test("places each worker by id, not by input order", () => {
    const byId = (workers: WorkerView[]) =>
      Object.fromEntries(layoutWorkerMap(task, workers).nodes.map((n) => [n.id, [n.x, n.y]]));
    expect(byId([...running].reverse())).toEqual(byId(running));
  });

  test("puts the primary right of the hub and reviewers left of it", () => {
    const { hub, nodes } = layoutWorkerMap(task, blocked);
    for (const n of nodes) {
      if (n.access === "write") expect(n.x).toBeGreaterThan(hub.x);
      else expect(n.x).toBeLessThan(hub.x);
    }
  });

  test.each([1, 3, 5, 8])("keeps %i reviewers' labels at least a label apart", (count) => {
    const { nodes, height } = layoutWorkerMap(task, reviewers(count));
    const ys = nodes.map((n) => n.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThanOrEqual(LABEL_GAP);
    }
    for (const y of ys) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(height);
    }
  });

  test.each([
    ["a level writer", running],
    ["stacked reviewers", blocked],
  ])("arcs every edge above its endpoints, including %s", (_, workers) => {
    const { hub, nodes } = layoutWorkerMap(task, workers);
    for (const n of nodes) {
      // d3 paths are flat x,y pairs, so every second number is a y.
      const nums: number[] = n.edge.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];
      const ys = nums.filter((_v, i) => i % 2 === 1);
      expect(Math.min(...ys), n.id).toBeLessThan(Math.min(hub.y, n.y) - 20);
    }
  });

  test("draws each edge from the hub to its node", () => {
    const { hub, nodes } = layoutWorkerMap(task, running);
    for (const n of nodes) {
      expect(n.edge.startsWith(`M${hub.x},${hub.y}`)).toBe(true);
      expect(n.edge.endsWith(`${n.x},${n.y}`)).toBe(true);
    }
  });
});

describe("tracePaths", () => {
  test("returns identical paths for identical samples", () => {
    expect(tracePaths([3, 9, 4, 12])).toEqual(tracePaths([3, 9, 4, 12]));
  });

  test("draws nothing for fewer than two samples", () => {
    expect(tracePaths([5])).toBeNull();
  });

  test("never overshoots the data: every y stays inside the drawing", () => {
    const paths = tracePaths([0, 20, 0, 20, 0, 20]);
    // d3 paths are flat x,y pairs, so every second number is a y.
    const nums: number[] = paths?.line.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)?.map(Number) ?? [];
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(ys.length).toBeGreaterThan(5);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(paths?.height ?? 0);
    }
  });
});
