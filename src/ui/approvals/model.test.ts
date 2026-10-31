import { describe, expect, test } from "vitest";
import { answer, itemsFor, type NeedsYouItem } from "./model";

const item = (id: string, taskId: string, stage: NeedsYouItem["stage"]): NeedsYouItem => ({
  id,
  taskId,
  taskTitle: taskId,
  stage,
  kind: "question",
  from: "Codex",
  prompt: `Prompt ${id}`,
  waited: "1 min",
  choices: [
    { id: "yes", label: "Yes", next: "Codex goes on." },
    { id: "no", label: "No", next: "Codex stops." },
  ],
});

const queue = [item("q1", "a", "build"), item("q2", "b", "review"), item("q3", "a", "build")];

describe("itemsFor", () => {
  test("gives one task's items for one stage, in queue order", () => {
    expect(itemsFor(queue, "a", "build").map((i) => i.id)).toEqual(["q1", "q3"]);
    expect(itemsFor(queue, "a", "review")).toEqual([]);
  });
});

describe("answer", () => {
  test("removes the item and says what happens next", () => {
    const result = answer(queue, "q2", "no");
    expect(result?.items.map((i) => i.id)).toEqual(["q1", "q3"]);
    expect(result?.answered).toEqual({ taskTitle: "b", label: "No", next: "Codex stops." });
  });

  test("an unknown item or choice changes nothing", () => {
    expect(answer(queue, "q9", "yes")).toBeNull();
    expect(answer(queue, "q1", "maybe")).toBeNull();
  });
});
