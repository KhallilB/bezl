import { describe, expect, test } from "vitest";
import { paneStatus } from "./model";

describe("paneStatus", () => {
  test("a pane is starting until its agent runs", () => {
    expect(paneStatus({ kind: "starting" })).toEqual({
      tone: "neutral",
      label: "Starting",
      icon: "idle",
      live: false,
    });
  });

  test("a running agent is live", () => {
    expect(paneStatus({ kind: "running" })).toMatchObject({ tone: "running", live: true });
  });

  test("exit 0 is finished, any other exit is shown with its code", () => {
    expect(paneStatus({ kind: "exited", code: 0 })).toMatchObject({
      tone: "success",
      label: "Exited 0",
      icon: "finished",
    });
    expect(paneStatus({ kind: "exited", code: 137 })).toMatchObject({
      tone: "blocked",
      label: "Exited 137",
      icon: "blocked",
    });
  });

  test("an exit with no status and a failed start say so", () => {
    expect(paneStatus({ kind: "exited", code: null })).toMatchObject({
      tone: "blocked",
      label: "Exited, status unknown",
    });
    expect(paneStatus({ kind: "failed", says: "No such file" })).toMatchObject({
      tone: "blocked",
      label: "Could not start",
    });
  });
});
