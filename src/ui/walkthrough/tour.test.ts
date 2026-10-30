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
