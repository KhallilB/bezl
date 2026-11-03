import { describe, expect, test } from "vitest";
import { needsYou } from "../approvals/fixtures";
import { tasks } from "./fixtures";
import {
  type CompareRow,
  type Comparison,
  ciText,
  contextOf,
  coverageText,
  diffLabel,
  entriesOf,
  estimate,
  firstPick,
  type JourneyTask,
  type Light,
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

describe("entriesOf", () => {
  const task = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) throw new Error(`no fixture ${id}`);
    return t;
  };
  const asked = (id: string) => needsYou.filter((i) => i.taskId === id);
  const dispute = needsYou.find((i) => i.id === "empty-state-dispute");
  if (!dispute) throw new Error("no dispute");

  test("Review's checks that are no line come after the lines, before the loose entry", () => {
    const entries = entriesOf(task("empty-state"), "review", asked("empty-state"), []);
    expect(entries.map((e) => e.key)).toEqual([
      "line-0",
      "line-1",
      "line-2",
      "line-3",
      "other",
      "loose",
    ]);
    const other = entries[4];
    expect(other).toMatchObject({ title: "Other checks", light: "done", reason: "2 checks" });
    expect(other?.checks.map((c) => [c.label, c.was?.text, c.now?.text])).toEqual([
      ["Tests", "47", "48, one for zero projects"],
      ["New dependencies", "None", "None"],
    ]);
    expect(entriesOf(task("snapshot"), "check", [], []).map((e) => e.key)).not.toContain("other");
  });

  test("a line per done-when line, each tied to what its trace reaches", () => {
    const [shows, oneWay, , tests, , loose] = entriesOf(
      task("empty-state"),
      "review",
      asked("empty-state"),
      [],
    );
    // Main's screenshot of the same screen ties to no line, so it comes along as Before.
    expect(shows).toMatchObject({
      key: "line-0",
      light: "done",
      was: "failed",
      shots: ["a", "today"],
    });
    expect(oneWay?.questions.map((q) => q.id)).toEqual(["empty-state-dispute"]);
    expect(oneWay).toMatchObject({ light: "needsYou", reason: "1 question for you" });
    expect(oneWay?.was).toBeUndefined();
    expect(oneWay?.code.map((n) => n.title)).toEqual(["EmptyState", "ImportLink"]);
    expect(oneWay?.ran.map((n) => n.title)).toContain("Codex review");
    expect(oneWay?.claimed).toBe(true);
    expect(tests?.ran.map((n) => n.title)).toEqual(["bun run test"]);
    expect(loose).toMatchObject({ key: "loose" });
    expect(loose?.files.map((f) => f.path)).toEqual(["src/pages/Projects.test.tsx"]);
  });

  test("an answered question leaves the line's state to what the review found", () => {
    const [, oneWay] = entriesOf(
      task("empty-state"),
      "review",
      [],
      [{ item: dispute, choice: dispute.choices[0] as (typeof dispute.choices)[number] }],
    );
    expect(oneWay?.questions).toEqual([]);
    expect(oneWay?.answered).toHaveLength(1);
    expect(oneWay).toMatchObject({ light: "needsYou", was: "failed" });
    expect(oneWay?.reason).toBeUndefined();
  });

  test("problems land on the line their trace leads back to", () => {
    const entries = entriesOf(task("snapshot"), "check", [], []);
    expect(entries.map((e) => e.key)).toEqual(["line-0", "line-1"]);
    expect(entries[0]).toMatchObject({ light: "failed", reason: "2 problems" });
    expect(entries[1]).toMatchObject({ light: "done", reason: "proven" });
  });

  test("before Check a line is not checked yet; what maps to no line is loose", () => {
    const entries = entriesOf(task("deny-scopes"), "build", asked("deny-scopes"), []);
    expect(entries[0]).toMatchObject({ light: "waiting", reason: "Tests check" });
    const loose = entries.at(-1);
    expect(loose?.questions).toHaveLength(2);
    expect(loose?.files.map((f) => f.path)).toEqual(["crates/bezl-domain/tests/policy.rs"]);
    expect(loose?.light).toBe("needsYou");
  });

  const review = (rows: CompareRow[]): JourneyTask => {
    const t = task("empty-state");
    const compare = t.views.review.compare as Comparison;
    return {
      ...t,
      views: { ...t.views, review: { ...t.views.review, compare: { ...compare, rows } } },
    };
  };
  const cells = (light: Light) => ({
    before: { light: "done" as Light, text: "" },
    after: { light, text: "" },
  });

  test("other checks light the worst of now: working and waiting are not Works", () => {
    const other = (lights: Light[]) =>
      entriesOf(
        review(lights.map((l) => ({ group: "Checks", label: l, cells: cells(l) }))),
        "review",
        [],
        [],
      ).find((e) => e.key === "other")?.light;
    expect(other(["done", "working"])).toBe("working");
    expect(other(["done", "waiting"])).toBe("waiting");
    expect(other(["waiting", "working"])).toBe("working");
    expect(other(["working", "needsYou"])).toBe("needsYou");
    expect(other(["needsYou", "failed"])).toBe("failed");
  });

  test("a Review row joins its line by proof node before text, and counts once", () => {
    const entries = entriesOf(
      review([
        {
          group: "Done when",
          label: "Renamed since Define",
          cells: cells("failed"),
          proof: { node: "i1" },
        },
      ]),
      "review",
      [],
      [],
    );
    expect(entries[0]).toMatchObject({ light: "failed", was: "done" });
    expect(entries.map((e) => e.key)).not.toContain("other");
  });

  test("a changed file is tied by its full path, not a shared name", () => {
    const t = task("empty-state");
    const change = (id: string, path: string) =>
      ({ id, column: "change", title: id, meta: "index.ts:3", light: "done", path }) as const;
    const tied: JourneyTask = {
      ...t,
      doneWhen: [{ text: "Works", checker: "Tests check", light: "done", status: "", node: "i" }],
      trace: {
        nodes: [
          { id: "i", column: "intent", title: "Works", meta: "", light: "done" },
          change("c", "src/a/index.ts"),
        ],
        links: [{ from: "i", to: "c" }],
      },
      views: {
        ...t.views,
        review: { ...t.views.review, takes: [] },
        build: {
          ...t.views.build,
          takes: [
            {
              id: "A",
              model: "Claude Code",
              state: "Ready",
              light: "done",
              files: [
                { path: "src/a/index.ts", added: 1, removed: 0 },
                { path: "src/b/index.ts", added: 1, removed: 0 },
              ],
            },
          ],
        },
      },
    };
    const loose = entriesOf(tied, "build", [], []).find((e) => e.key === "loose");
    expect(loose?.files.map((f) => f.path)).toEqual(["src/b/index.ts"]);
  });

  test("nothing loose, no loose entry; before Build no files", () => {
    expect(entriesOf(task("empty-state"), "define", [], []).map((e) => e.key)).toEqual([
      "line-0",
      "line-1",
      "line-2",
      "line-3",
    ]);
  });
});

describe("firstPick", () => {
  const pick = (id: string, stage: "build" | "check" | "review", open = false) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) throw new Error(`no fixture ${id}`);
    return firstPick(entriesOf(t, stage, open ? needsYou.filter((i) => i.taskId === id) : [], []));
  };

  test("the first entry that needs you, else the first that fails, else the first", () => {
    expect(pick("empty-state", "review", true)).toBe("line-1");
    expect(pick("snapshot", "check")).toBe("line-0");
    expect(pick("deny-scopes", "build", true)).toBe("loose");
    expect(pick("debounce", "build")).toBe("line-0");
  });
});
