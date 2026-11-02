import { describe, expect, test } from "vitest";
import { tasks } from "./fixtures";
import {
  ciText,
  contextOf,
  coverageText,
  diffLabel,
  estimate,
  lightLabel,
  lineage,
  pathOf,
  planClaim,
  type StageLights,
  stageIds,
  stageLabel,
  stageLightLabel,
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

describe("ciText with nothing reported", () => {
  test("says no checks have reported, not that all 0 passed", () => {
    expect(ciText({ on: "pullRequest", checks: [] })).toBe(
      "No checks have reported on the pull request yet.",
    );
  });
});

describe("light labels", () => {
  test("only a stage reads not started; anything else waiting reads waiting", () => {
    expect(stageLightLabel.waiting).toBe("not started");
    expect(lightLabel.waiting).toBe("waiting");
  });
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
      proven: 0,
      lines: 0,
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

  test("a Review with no attempts yet falls back to Build's", () => {
    const build = { ...view, takes: [take("A", [["a.ts", 2, 1]])] };
    const review = { ...view, takes: [] };
    expect(contextOf({ ...task, views: { ...task.views, build, review } }).touches).toBe(
      "1 file · +2 −1",
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
    const context = contextOf({ ...task, examples, views: { ...task.views, build } });
    expect(context.touches).toBe("1 file · +1");
    expect(context.screens).toBe(2);
  });

  test("evidence counts the done-when lines Bezl has proven", () => {
    const doneWhen = [
      { text: "a", checker: "Tests check", light: "done" as const, status: "proven" },
      { text: "b", checker: "You check", light: "needsYou" as const, status: "you check" },
      { text: "c", checker: "Tests check", light: "failed" as const, status: "1 failing" },
    ];
    expect(contextOf({ ...task, doneWhen })).toMatchObject({
      evidence: "1 of 3 proven",
      proven: 1,
      lines: 3,
    });
  });
});

describe("estimate", () => {
  const options = {
    fixers: [
      { id: "codex", name: "Codex", minutes: 5, usage: "4% of Codex" },
      { id: "claude", name: "Claude Code", minutes: 8, usage: "6% of Claude Code" },
    ],
    checks: [
      { id: "tests", label: "Tests", note: "", minutes: 2 },
      { id: "a11y", label: "Accessibility", note: "", minutes: 3 },
    ],
    paths: ["src/**"],
  };

  test("the fixer's own time plus each check that runs after", () => {
    expect(estimate(options, { fixer: "codex", checks: ["tests", "a11y"] })).toEqual({
      minutes: 10,
      usage: "4% of Codex",
    });
    expect(estimate(options, { fixer: "claude", checks: ["tests"] })).toEqual({
      minutes: 10,
      usage: "6% of Claude Code",
    });
  });
});

describe("lineage", () => {
  const node = (id: string, column: "intent" | "change" | "measured" | "decide") => ({
    id,
    column,
    title: id,
    meta: "",
    light: "done" as const,
  });
  const trace = {
    nodes: [
      node("goal", "intent"),
      node("a11y", "intent"),
      node("list", "change"),
      node("button", "change"),
      node("tests", "measured"),
      node("axe", "measured"),
      node("untested", "decide"),
      node("unnamed", "decide"),
    ],
    links: [
      { from: "goal", to: "list" },
      { from: "goal", to: "button" },
      { from: "a11y", to: "button" },
      { from: "list", to: "tests" },
      { from: "button", to: "tests" },
      { from: "button", to: "axe" },
      { from: "tests", to: "untested", via: "list" },
      { from: "axe", to: "unnamed", via: "button" },
    ],
  };

  test("a finding traces back through the code it's about, not every file the run covered", () => {
    expect([...lineage(trace, "untested")].sort()).toEqual(["goal", "list", "tests", "untested"]);
  });

  test("a test run traces forward to every finding it made", () => {
    expect(lineage(trace, "tests").has("untested")).toBe(true);
  });

  test("a goal line traces forward to the findings on its own code", () => {
    expect([...lineage(trace, "a11y")].sort()).toEqual([
      "a11y",
      "axe",
      "button",
      "tests",
      "unnamed",
    ]);
  });
});

test("coverageText accounts for every changed line", () => {
  expect(coverageText({ covered: 29, uncovered: 2, unknown: 4, excluded: 2 })).toBe(
    "37 lines changed: 29 ran in a test, 2 never ran, 4 Bezl can't measure, 2 excluded",
  );
  expect(coverageText({ covered: 12, uncovered: 0, unknown: 0, excluded: 0 })).toBe(
    "12 lines changed: 12 ran in a test",
  );
});

describe("pathOf", () => {
  test("each step that needs you, with the done-when lines it blocks", () => {
    const trace = tasks.find((t) => t.id === "empty-state")?.trace;
    if (!trace) throw new Error("no trace");
    const path = pathOf(trace);
    expect(path.map((s) => s.node.id)).toEqual(["import", "look"]);
    expect(path[0]?.blocks.map((n) => n.id)).toEqual(["i2"]);
    expect(path[1]?.blocks.map((n) => n.id)).toEqual(["i1", "i2", "i3"]);
  });
});

test("a link from the goal to code is the plan's claim; every other link is measured", () => {
  const trace = tasks.find((t) => t.id === "empty-state")?.trace;
  if (!trace) throw new Error("no trace");
  expect(planClaim(trace, { from: "i2", to: "link" })).toBe(true);
  expect(planClaim(trace, { from: "link", to: "review" })).toBe(false);
});
