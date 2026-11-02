import { describe, expect, test } from "vitest";
import {
  ciText,
  contextOf,
  diffLabel,
  type StageLights,
  stageIds,
  stageLabel,
  stageMarker,
  taskLight,
} from "./model";

const quiet: StageLights = {
  define: "done",
  plan: "done",
  build: "done",
  check: "waiting",
  review: "waiting",
  ship: "waiting",
};

describe("taskLight", () => {
  test("needs you outranks a failure and live work", () => {
    expect(taskLight({ ...quiet, build: "working", check: "failed", review: "needsYou" })).toBe(
      "needsYou",
    );
  });

  test("a failure outranks live work", () => {
    expect(taskLight({ ...quiet, build: "working", check: "failed" })).toBe("failed");
  });

  test("live work shows as working", () => {
    expect(taskLight({ ...quiet, build: "working" })).toBe("working");
  });

  test("every stage done means passed", () => {
    expect(
      taskLight({
        define: "done",
        plan: "done",
        build: "done",
        check: "done",
        review: "done",
        ship: "done",
      }),
    ).toBe("passed");
  });

  test("anything else is idle", () => {
    expect(taskLight(quiet)).toBe("idle");
  });
});

test("stageMarker numbers a waiting stage and names every other light", () => {
  expect(stageMarker("waiting", 4)).toBe("5");
  expect(stageMarker("done", 0)).toBe("done");
  expect(stageMarker("needsYou", 5)).toBe("needs you");
});

describe("diffLabel", () => {
  test("shows lines added and removed, and drops a zero removal", () => {
    expect(diffLabel({ path: "a.ts", added: 31, removed: 4 })).toBe("+31 −4");
    expect(diffLabel({ path: "a.ts", added: 43, removed: 0 })).toBe("+43");
  });
});

describe("ciText", () => {
  const check = (name: string, state: "passed" | "failed" | "running") => ({
    name,
    state,
    url: `https://github.com/acme/studio-web/actions/runs/${name}`,
  });

  test("counts what passed and what is still running on the pull request", () => {
    expect(
      ciText({ on: "pullRequest", checks: [check("lint", "passed"), check("e2e", "running")] }),
    ).toBe("1 of 2 checks has passed, and 1 is still running.");
  });

  test("a failure comes first", () => {
    expect(
      ciText({
        on: "pullRequest",
        checks: [check("lint", "passed"), check("e2e", "failed"), check("unit", "running")],
      }),
    ).toBe("1 of 3 checks failed. Open its log to see why.");
  });

  test("names the merged commit once every check there has passed", () => {
    expect(
      ciText({
        on: "merge",
        commit: "3f9c2ab",
        checks: [check("lint", "passed"), check("e2e", "passed")],
      }),
    ).toBe("All 2 checks passed on the merged commit 3f9c2ab.");
  });
});

test("the journey runs Define to Ship", () => {
  expect(stageIds.map((id) => stageLabel[id])).toEqual([
    "Define",
    "Plan",
    "Build",
    "Check",
    "Review",
    "Ship",
  ]);
});

describe("contextOf", () => {
  const view = { lead: "", sections: [] };
  const task = {
    id: "t",
    title: "T",
    repo: "r",
    current: "build" as const,
    stages: quiet,
    views: {
      define: { ...view, quote: "Refuse empty scopes." },
      plan: view,
      build: view,
      check: view,
      review: view,
      ship: view,
    },
  };
  const take = (id: string, files: [string, number, number][]) => ({
    id,
    model: "Codex",
    state: "",
    light: "done" as const,
    files: files.map(([path, added, removed]) => ({ path, added, removed })),
  });

  test("before any code changes, it says so and nothing is proven", () => {
    expect(contextOf(task)).toEqual({
      goal: "Refuse empty scopes.",
      touches: "Nothing changed yet",
      screens: 0,
      evidence: "Not checked yet",
    });
  });

  test("one attempt shows its files and lines", () => {
    const build = {
      ...view,
      takes: [
        take("A", [
          ["a.ts", 31, 4],
          ["b.ts", 12, 0],
        ]),
      ],
    };
    expect(contextOf({ ...task, views: { ...task.views, build } }).touches).toBe(
      "2 files · +43 −4",
    );
  });

  test("several attempts count each file once", () => {
    const review = {
      ...view,
      takes: [
        take("A", [
          ["a.ts", 1, 0],
          ["b.ts", 1, 0],
        ]),
        take("B", [
          ["a.ts", 1, 0],
          ["c.ts", 1, 0],
        ]),
      ],
    };
    expect(contextOf({ ...task, views: { ...task.views, review } }).touches).toBe(
      "3 files across 2 attempts",
    );
  });

  test("Ship counts only the attempt you kept", () => {
    const ship = {
      ...view,
      ship: {
        title: "",
        summary: "",
        facts: [],
        files: [{ path: "a.ts", added: 5, removed: 1 }],
        history: [],
        pullRequest: { number: 1, url: "" },
      },
    };
    const review = { ...view, takes: [take("A", [["a.ts", 5, 1]]), take("B", [["z.ts", 9, 0]])] };
    expect(contextOf({ ...task, views: { ...task.views, review, ship } }).touches).toBe(
      "1 file · +5 −1",
    );
  });

  test("screens the change shows count once, however many states", () => {
    const shot = (id: string, screen: string, example = false) => ({
      id,
      name: id,
      screen,
      from: "attempt A",
      commit: "abc",
      images: { phone: "", desktop: "" },
      example,
    });
    const build = {
      ...view,
      takes: [take("A", [["a.ts", 1, 0]])],
      shots: [shot("1", "Projects"), shot("2", "Projects"), shot("3", "Settings")],
    };
    const examples = [shot("4", "Welcome", true)];
    expect(contextOf({ ...task, examples, views: { ...task.views, build } }).touches).toBe(
      "1 file · +1 · 2 screens",
    );
  });

  test("evidence counts the done-when lines Bezl has proven", () => {
    const doneWhen = [
      { text: "a", checker: "Tests check", light: "done" as const, status: "proven" },
      { text: "b", checker: "You check", light: "needsYou" as const, status: "you check" },
      { text: "c", checker: "Tests check", light: "failed" as const, status: "1 failing" },
    ];
    expect(contextOf({ ...task, doneWhen }).evidence).toBe("1 of 3 proven");
  });
});
