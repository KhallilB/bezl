import { describe, expect, test } from "vitest";
import { type StageLights, stageMarker, taskLight } from "./model";

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
