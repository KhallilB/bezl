import { describe, expect, test } from "vitest";
import {
  type BriefDraft,
  briefFromIssue,
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
      note: "The writer and reviewer come from the same company",
    });
    expect(choices.find((c) => c.id === "claude")?.disabled).toBeUndefined();
    expect(choices.find((c) => c.id === "codex")?.note).toBeUndefined();
  });
});

describe("briefFromIssue", () => {
  const issue = {
    number: 128,
    title: "Projects page shows an empty table for new users",
    body: "New users land here right after sign-up and see nothing to do.\n\n- [ ] The empty state shows when there are no projects\n- [x] There's one clear way to create the first project\n",
    url: "https://github.com/acme/studio-web/issues/128",
  };

  test("the title and prose become the goal, and checklist items become done checks", () => {
    const draft = briefFromIssue(issue);
    expect(draft.text).toBe(
      "Projects page shows an empty table for new users\n\nNew users land here right after sign-up and see nothing to do.",
    );
    expect(draft.doneWhen).toEqual([
      { text: "The empty state shows when there are no projects", checker: "you" },
      { text: "There's one clear way to create the first project", checker: "you" },
    ]);
    expect(draft.issue).toEqual({ number: 128, url: issue.url });
  });

  test("reads Windows line endings, as GitHub often stores them", () => {
    const draft = briefFromIssue({ ...issue, body: issue.body.replaceAll("\n", "\r\n") });
    expect(draft.doneWhen).toHaveLength(2);
    expect(draft.text).not.toContain("\r");
  });

  test("an issue with no body is just its title", () => {
    expect(briefFromIssue({ ...issue, body: "" })).toEqual({
      text: issue.title,
      doneWhen: [],
      issue: { number: 128, url: issue.url },
    });
  });
});
