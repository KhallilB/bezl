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
  { text: "One clear way to create the first project", checker: "you" },
  { text: "Passes accessibility checks", checker: "bezl" },
];
const avoid = "Reuse EmptyState; no new card component";
const example = "Inbox's empty state";

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
  lead: "Brief kept as written.",
  quote: text,
  sections: [
    {
      title: "Done when",
      rows: doneWhen.map((d) => ({
        text: d.text,
        meta: d.checker === "bezl" ? "Bezl" : "you",
        light: "done" as const,
      })),
    },
  ],
};

/** The task just started: setup waits on you, then the worktree is prepared. */
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
        lead: asking ? "Setup needs you." : "Preparing.",
        rest: asking ? "Bezl runs nothing unasked." : "The worktree comes first, then the plan.",
        sections: [
          {
            title: "Worktree",
            rows: [
              { text: "bezl/empty-state from main", mono: true, light: "done" },
              { text: "bun install", mono: true, light: asking ? "needsYou" : "working" },
              { text: "Plan with Claude Code", light: "waiting" },
            ],
          },
        ],
      },
      build: { lead: "Not yet.", rest: "Build follows the plan.", sections: [] },
      check: { lead: "Not yet.", rest: "Checks run after Build.", sections: [] },
      review: { lead: "Not yet.", rest: "Review follows Check.", sections: [] },
      ship: { lead: "Not yet.", rest: "Ship opens once you keep a take.", sections: [] },
    },
  };
}
