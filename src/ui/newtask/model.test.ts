import { describe, expect, test } from "vitest";
import {
  type BriefDraft,
  type CrewProvider,
  readiness,
  reviewerChoices,
  suggest,
  writerChoices,
} from "./model";

const empty: BriefDraft = { text: "", doneWhen: [] };
const met = (draft: BriefDraft) =>
  readiness(draft)
    .filter((c) => c.met)
    .map((c) => c.id);

describe("readiness", () => {
  test("checks five things, in order, each with why it matters", () => {
    const checks = readiness(empty);
    expect(checks.map((c) => c.id)).toEqual(["what", "who", "done", "avoid", "example"]);
    expect(checks.every((c) => !c.met && c.why.length > 0)).toBe(true);
  });

  test("a sentence of intent meets what; a word or two does not", () => {
    expect(met({ ...empty, text: "Fix it" })).toEqual([]);
    expect(met({ ...empty, text: "Help people with no projects start their first one." })).toEqual([
      "what",
    ]);
  });

  test("each structured part meets its own check, blank text does not", () => {
    const full: BriefDraft = {
      text: "Help people with no projects start their first one.",
      who: "New users after sign-up",
      doneWhen: [{ text: "Shows with no projects", checker: "bezl" }],
      avoid: "Reuse EmptyState",
      example: "Inbox's empty state",
    };
    expect(met(full)).toEqual(["what", "who", "done", "avoid", "example"]);
    expect(met({ ...full, who: "  " })).not.toContain("who");
  });
});

describe("suggest", () => {
  test("fills only the gap it names and keeps the rest", () => {
    const draft: BriefDraft = { ...empty, text: "Help people start a project." };
    const next = suggest(draft, { who: "New users after sign-up" });
    expect(next).toEqual({ ...draft, who: "New users after sign-up" });
  });

  test("adds done-when items after the ones already there", () => {
    const draft: BriefDraft = { ...empty, doneWhen: [{ text: "A", checker: "you" }] };
    expect(suggest(draft, { doneWhen: [{ text: "B", checker: "bezl" }] }).doneWhen).toEqual([
      { text: "A", checker: "you" },
      { text: "B", checker: "bezl" },
    ]);
  });
});

const claude: CrewProvider = {
  id: "claude",
  name: "Claude Code",
  vendor: "Anthropic",
  canWrite: true,
  readOnly: true,
};
const codex: CrewProvider = {
  id: "codex",
  name: "Codex",
  vendor: "OpenAI",
  canWrite: true,
  readOnly: true,
};
const local: CrewProvider = {
  id: "local",
  name: "Local model",
  vendor: "Ollama",
  canWrite: false,
  readOnly: false,
};
const unproven: CrewProvider = { ...codex, id: "codex-new", name: "Codex 0.170", readOnly: false };

describe("writerChoices", () => {
  test("only a coding agent can write; anything else is greyed with the reason", () => {
    const choices = writerChoices([claude, codex, local]);
    expect(choices.map((c) => [c.id, c.disabled ?? null])).toEqual([
      ["claude", null],
      ["codex", null],
      ["local", "Not a coding agent, so it can't write code"],
    ]);
  });
});

describe("reviewerChoices", () => {
  test("a reviewer must be tested unable to change files", () => {
    const choices = reviewerChoices([codex, unproven, local], "claude");
    expect(choices.find((c) => c.id === "codex-new")?.disabled).toBe(
      "It might change files, so it can't review",
    );
    expect(choices.find((c) => c.id === "local")?.disabled).toBe(
      "It might change files, so it can't review",
    );
    expect(choices.find((c) => c.id === "codex")?.disabled).toBeUndefined();
  });

  test("the writer's own vendor is allowed, and labelled as self-review", () => {
    const choices = reviewerChoices([claude, codex], "claude");
    expect(choices.find((c) => c.id === "claude")).toMatchObject({
      note: "The same company's models write and review it",
    });
    expect(choices.find((c) => c.id === "claude")?.disabled).toBeUndefined();
    expect(choices.find((c) => c.id === "codex")?.note).toBeUndefined();
  });
});
