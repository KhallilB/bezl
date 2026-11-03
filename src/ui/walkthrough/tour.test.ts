import { describe, expect, test } from "vitest";
import { chapters, keyAction, parseTour, step, steps, tourSearch } from "./tour";

describe("steps", () => {
  test("have unique ids and belong to a known chapter", () => {
    const ids = steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of steps) expect(chapters).toContain(s.chapter);
  });

  test("run chapter by chapter, never interleaved", () => {
    const order = steps.map((s) => s.chapter).filter((c, i, all) => c !== all[i - 1]);
    expect(order).toEqual([...chapters]);
  });

  test("tell the product's story, ending at History", () => {
    expect(chapters).toEqual([
      "Getting started",
      "Start a task",
      "Your tasks",
      "Needs you",
      "Look back",
    ]);
    expect(steps.at(-1)?.id).toBe("history");
  });

  test("put the restart after the task loop, and name Review for what it shows", () => {
    const ids = steps.map((s) => s.id);
    expect(ids.slice(ids.indexOf("trace"), ids.indexOf("approvals"))).toEqual([
      "trace",
      "review",
      "full-screen",
      "ship",
      "pr-checks",
      "merged",
      "come-back",
    ]);
  });

  test("notes name what each screen now shows", () => {
    const note = (id: string) => steps.find((s) => s.id === id)?.note ?? "";
    expect(note("task-read")).toContain("Limits");
    expect(note("context")).toContain("measured from");
    expect(note("preview")).toContain("only when Bezl captured screenshots");
    expect(note("trace")).toContain("the plan's claim");
    expect(note("preflight")).toContain("GitHub");
  });
});

describe("parseTour", () => {
  test("defaults to the first step, dark", () => {
    expect(parseTour("")).toEqual({ index: 0, theme: "dark" });
  });

  test("reads step and theme", () => {
    const last = steps.length - 1;
    expect(parseTour(`?screen=walkthrough&step=${steps[last]?.id}&theme=light`)).toEqual({
      index: last,
      theme: "light",
    });
  });

  test("ignores unknown values", () => {
    expect(parseTour("?step=nope&theme=sepia")).toEqual(parseTour(""));
  });
});

test("tourSearch round-trips", () => {
  const tour = { index: 2, theme: "light" } as const;
  expect(parseTour(tourSearch(tour))).toEqual(tour);
});

describe("step", () => {
  test("moves by one and stops at either end", () => {
    expect(step({ index: 0, theme: "dark" }, -1).index).toBe(0);
    expect(step({ index: 0, theme: "dark" }, 1).index).toBe(1);
    const last = steps.length - 1;
    expect(step({ index: last, theme: "dark" }, 1).index).toBe(last);
  });
});

describe("keyAction", () => {
  test("arrows step, T flips the theme", () => {
    expect(keyAction("ArrowRight")).toEqual({ type: "step", by: 1 });
    expect(keyAction("ArrowLeft")).toEqual({ type: "step", by: -1 });
    expect(keyAction("t")).toEqual({ type: "theme" });
  });

  test("other keys do nothing", () => {
    expect(keyAction("ArrowUp")).toBeNull();
    expect(keyAction("1")).toBeNull();
  });
});
