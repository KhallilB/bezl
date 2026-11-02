import { describe, expect, test } from "vitest";
import { ciText, diffLabel, type StageLights, stageMarker, taskLight } from "./model";

const quiet: StageLights = {
  brief: "done",
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
        brief: "done",
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
