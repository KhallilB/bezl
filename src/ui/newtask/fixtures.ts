import type { JourneyTask, StageView } from "../journey/model";
import type { BriefDraft, CheckId, CrewProvider, DoneWhen, Suggestion } from "./model";

// Sample data; from M6 the code map supplies the suggestions.

export const crew: CrewProvider[] = [
  { id: "claude", name: "Claude Code", vendor: "Anthropic", canWrite: true, readOnly: true },
  { id: "codex", name: "Codex", vendor: "OpenAI", canWrite: true, readOnly: true },
  { id: "local", name: "Local model", vendor: "Ollama", canWrite: false, readOnly: false },
];

const who = "New users right after sign-up";
const doneWhen: DoneWhen[] = [
  { text: "The empty state shows when there are no projects", checker: "bezl" },
  { text: "There's one clear way to create the first project", checker: "you" },
  { text: "The page passes accessibility checks", checker: "bezl" },
];
const avoid = "Reuse EmptyState rather than adding a new card component";
const example = "The Inbox page's empty state";

export const suggestions: Partial<Record<CheckId, Suggestion>> = {
  who: { who },
  done: { doneWhen },
  avoid: { avoid },
  example: { example },
};

const text =
  "When someone has no projects yet, the Projects page should help them start one instead of showing an empty table.";

export const drafts = {
  blank: { text: "", doneWhen: [] },
  partial: { text, doneWhen: [] },
  ready: { text, who, doneWhen, avoid, example },
} satisfies Record<string, BriefDraft>;

export const paths = ["src/pages/Projects.tsx", "src/pages/Projects.test.tsx"];

const briefView: StageView = {
  lead: "Your brief is saved exactly as you wrote it.",
  quote: text,
  sections: [
    {
      title: "It's done when",
      rows: doneWhen.map((d) => ({
        text: d.text,
        meta: d.checker === "bezl" ? "Bezl checks" : "You check",
        light: "done" as const,
      })),
    },
  ],
};

/** Task just started: setup waits on you, then its copy of your code is set up. */
export function startedTask(setup: "asking" | "allowed"): JourneyTask {
  const asking = setup === "asking";
  return {
    id: "empty-state",
    title: "Empty state for Projects",
    repo: "studio-web",
    current: "plan",
    stages: {
      brief: "done",
      plan: asking ? "needsYou" : "working",
      build: "waiting",
      check: "waiting",
      review: "waiting",
      ship: "waiting",
    },
    views: {
      brief: briefView,
      plan: {
        lead: asking ? "Setup needs your go-ahead." : "Getting things ready.",
        rest: asking
          ? "Bezl never runs anything without asking first."
          : "Bezl is setting up the task's copy of your code, and then it will make the plan.",
        sections: [
          {
            title: "Its copy of your code",
            rows: [
              { text: "bezl/empty-state from main", mono: true, light: "done" },
              { text: "bun install", mono: true, light: asking ? "needsYou" : "working" },
              { text: "Make a plan with Claude Code", light: "waiting" },
            ],
          },
        ],
      },
      build: {
        lead: "Build hasn't started.",
        rest: "It starts once the plan is ready.",
        sections: [],
      },
      check: {
        lead: "Checks haven't run yet.",
        rest: "They start once Build finishes.",
        sections: [],
      },
      review: {
        lead: "Review hasn't started.",
        rest: "It starts once Check is done.",
        sections: [],
      },
      ship: {
        lead: "Nothing to ship yet.",
        rest: "Ship opens once you choose which attempt to keep.",
        sections: [],
      },
    },
  };
}
