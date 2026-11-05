import type { StageId } from "../journey/model";
import type { drafts } from "../newtask/fixtures";
import type { NewTaskStep } from "../newtask/NewTask";
import { oneOf, type Theme, themes } from "./states";

export const chapters = [
  "Get set up",
  "Start a task",
  "While it runs",
  "Review and ship",
  "Look back",
  "When something's off",
] as const;
export type Chapter = (typeof chapters)[number];

export type Draft = keyof typeof drafts;

export type Preflight = "ready" | "noWriter";

export type TourView =
  | { kind: "choose" }
  | { kind: "providers"; result: Preflight }
  | { kind: "empty" }
  | { kind: "newTask"; draft: Draft; step?: NewTaskStep }
  | { kind: "started" }
  /** `kept`: the list after the attempt was approved on Review; `shipped`, after its pull request opened. */
  | {
      kind: "task";
      taskId: string;
      stage: StageId;
      kept?: boolean;
      shipped?: "checking" | "merged";
      /** The list after Bezl closed mid-Build. */
      interrupted?: boolean;
    }
  | { kind: "approvals" }
  | { kind: "history" };

export type Step = { id: string; chapter: Chapter; title: string; note: string; view: TourView };

export const steps: Step[] = [
  {
    id: "open-repo",
    chapter: "Get set up",
    title: "Choose a repository",
    note: "Pick a folder you've cloned with git.",
    view: { kind: "choose" },
  },
  {
    id: "providers",
    chapter: "Get set up",
    title: "Check your agents",
    note: "Green means ready to write code.",
    view: { kind: "providers", result: "ready" },
  },
  {
    id: "empty-list",
    chapter: "Get set up",
    title: "Start your first task",
    note: "Click New task.",
    view: { kind: "empty" },
  },
  {
    id: "new-task",
    chapter: "Start a task",
    title: "Describe the change",
    note: "A sentence or two is enough.",
    view: { kind: "newTask", draft: "blank" },
  },
  {
    id: "task-read",
    chapter: "Start a task",
    title: "Check, then start",
    note: "Change anything that's off, then press Start task.",
    view: { kind: "newTask", draft: "partial", step: "review" },
  },
  {
    id: "preparing",
    chapter: "While it runs",
    title: "Follow the stages",
    note: "Teal means working. Amber means it needs you.",
    view: { kind: "started" },
  },
  {
    id: "question",
    chapter: "While it runs",
    title: "Answer its questions",
    note: "Pick an answer; the recommended one is marked.",
    view: { kind: "task", taskId: "deny-scopes", stage: "build" },
  },
  {
    id: "approvals",
    chapter: "While it runs",
    title: "All questions, one place",
    note: "Every task's questions wait here too.",
    view: { kind: "approvals" },
  },
  {
    id: "problems",
    chapter: "Review and ship",
    title: "Send problems back",
    note: "Failed checks come first. Send them back in one go.",
    view: { kind: "task", taskId: "snapshot", stage: "check" },
  },
  {
    id: "review",
    chapter: "Review and ship",
    title: "Settle the review",
    note: "Pick a line to see its proof, then settle any disagreement.",
    view: { kind: "task", taskId: "empty-state", stage: "review" },
  },
  {
    id: "ship",
    chapter: "Review and ship",
    title: "Open the pull request",
    note: "Bezl writes it. Merging stays your call.",
    view: { kind: "task", taskId: "empty-state", stage: "ship", kept: true },
  },
  {
    id: "merged",
    chapter: "Review and ship",
    title: "Confirm it landed",
    note: "Checks run again on the merged commit.",
    view: { kind: "task", taskId: "empty-state", stage: "ship", shipped: "merged" },
  },
  {
    id: "history",
    chapter: "Look back",
    title: "See how it got here",
    note: "Every step, with your time next to the agents'.",
    view: { kind: "history" },
  },
  {
    id: "no-writer",
    chapter: "When something's off",
    title: "No agent can write yet",
    note: "Run the fix shown on a card, then Check again.",
    view: { kind: "providers", result: "noWriter" },
  },
  {
    id: "come-back",
    chapter: "When something's off",
    title: "Back after a restart",
    note: "The work is kept. Run the step again, or stop.",
    view: { kind: "task", taskId: "debounce", stage: "build", interrupted: true },
  },
];

export type Tour = { index: number; theme: Theme };

export function parseTour(search: string): Tour {
  const query = new URLSearchParams(search);
  const index = steps.findIndex((s) => s.id === query.get("step"));
  return { index: Math.max(index, 0), theme: oneOf(themes, query.get("theme")) ?? "dark" };
}

export function tourSearch({ index, theme }: Tour): string {
  return `?screen=walkthrough&step=${steps[index]?.id ?? steps[0]?.id}&theme=${theme}`;
}

export function step(tour: Tour, by: 1 | -1): Tour {
  return { ...tour, index: Math.min(Math.max(tour.index + by, 0), steps.length - 1) };
}

export type TourAction = { type: "step"; by: 1 | -1 } | { type: "theme" };

const keys: Record<string, TourAction> = {
  ArrowRight: { type: "step", by: 1 },
  ArrowLeft: { type: "step", by: -1 },
  t: { type: "theme" },
  T: { type: "theme" },
};

export function keyAction(key: string): TourAction | null {
  return keys[key] ?? null;
}
