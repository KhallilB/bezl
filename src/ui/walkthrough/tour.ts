import type { StageId } from "../journey/model";
import type { drafts } from "../newtask/fixtures";
import { oneOf, type Scene, type Theme, themes } from "./states";

export const chapters = [
  "Getting started",
  "Start a task",
  "Your tasks",
  "Needs you",
  "Look back",
  "Design states",
] as const;
export type Chapter = (typeof chapters)[number];

export type Draft = keyof typeof drafts;

export type Preflight = "checking" | "ready" | "impostor" | "noWriter";

export type TourView =
  | { kind: "choose"; refused?: boolean }
  | { kind: "providers"; result: Preflight }
  | { kind: "empty" }
  | { kind: "newTask"; draft: Draft; focus?: "crew" }
  | { kind: "setup" }
  | { kind: "started" }
  /** `kept`: the list after take A was kept on Review. */
  | { kind: "task"; taskId: string; stage: StageId; kept?: boolean }
  | { kind: "approvals"; cleared?: boolean }
  | { kind: "history" }
  | { kind: "state"; scene: Scene }
  | { kind: "overview" };

export type Step = { id: string; chapter: Chapter; title: string; note: string; view: TourView };

export const steps: Step[] = [
  {
    id: "open-repo",
    chapter: "Getting started",
    title: "Open a repository",
    note: "Bezl works inside a git repository and keeps each task's history there, on this computer.",
    view: { kind: "choose" },
  },
  {
    id: "not-git",
    chapter: "Getting started",
    title: "Only a git repository",
    note: "Any other folder is refused, with the reason and what to choose instead.",
    view: { kind: "choose", refused: true },
  },
  {
    id: "preflight",
    chapter: "Getting started",
    title: "Agent check",
    note: "Bezl looks for each coding agent on this computer and checks that it's signed in. One line shows progress.",
    view: { kind: "providers", result: "checking" },
  },
  {
    id: "providers",
    chapter: "Getting started",
    title: "Coding agents",
    note: "One card per coding agent: its version, sign-in, safety tests and usage.",
    view: { kind: "providers", result: "ready" },
  },
  {
    id: "impostor",
    chapter: "Getting started",
    title: "Not the real one",
    note: "A program named codex that isn't Codex is shown with where it lives. Bezl never runs it.",
    view: { kind: "providers", result: "impostor" },
  },
  {
    id: "no-writer",
    chapter: "Getting started",
    title: "No coding agent can write yet",
    note: "When no coding agent can write code, Coding agents says why and shows the command to run. Bezl never signs in for you.",
    view: { kind: "providers", result: "noWriter" },
  },
  {
    id: "empty-list",
    chapter: "Getting started",
    title: "Ready for a first task",
    note: "Once a coding agent can write code, the task list opens empty, with one action: New task.",
    view: { kind: "empty" },
  },
  {
    id: "new-task",
    chapter: "Start a task",
    title: "Write the brief",
    note: "Write it in your own words. Bezl checks five things as you type. None of them stops you from starting.",
    view: { kind: "newTask", draft: "blank" },
  },
  {
    id: "readiness",
    chapter: "Start a task",
    title: "Fill the gaps",
    note: "Each gap says why it matters and offers a suggestion you can add in one click.",
    view: { kind: "newTask", draft: "partial" },
  },
  {
    id: "brief-ready",
    chapter: "Start a task",
    title: "It's done when, and who checks",
    note: "Bezl checks its items after every step. The ones you check wait for you at Review.",
    view: { kind: "newTask", draft: "ready" },
  },
  {
    id: "crew",
    chapter: "Start a task",
    title: "Choose who works on it",
    note: "Only coding agents that passed the agent check. A reviewer from the same company as the writer is allowed, and labelled.",
    view: { kind: "newTask", draft: "ready", focus: "crew" },
  },
  {
    id: "setup",
    chapter: "Start a task",
    title: "Setup asks first",
    note: "A setup command waits for you to allow it. Bezl runs nothing in your repository without asking.",
    view: { kind: "setup" },
  },
  {
    id: "preparing",
    chapter: "Start a task",
    title: "Preparing",
    note: "Bezl sets up the task's own copy of your code and its branch, then Plan starts.",
    view: { kind: "started" },
  },
  {
    id: "tasks",
    chapter: "Your tasks",
    title: "Every task in one list",
    note: "Amber needs you, teal is working, red failed. Pick a task to open it.",
    view: { kind: "task", taskId: "empty-state", stage: "review" },
  },
  {
    id: "stages",
    chapter: "Your tasks",
    title: "Brief to Ship",
    note: "Each stage has a light. Click one to open it. Brief keeps your words and the list of things to be done.",
    view: { kind: "task", taskId: "empty-state", stage: "brief" },
  },
  {
    id: "working",
    chapter: "Your tasks",
    title: "Work in progress",
    note: "Each attempt works in its own copy of your code. One line says what it's doing, and you can send it a message.",
    view: { kind: "task", taskId: "debounce", stage: "build" },
  },
  {
    id: "question",
    chapter: "Your tasks",
    title: "A question waits on you",
    note: "When a coding agent stops to ask, the task turns amber and the question waits in its stage. Answer it there.",
    view: { kind: "task", taskId: "deny-scopes", stage: "build" },
  },
  {
    id: "problems",
    chapter: "Your tasks",
    title: "Problems first",
    note: "Failures and changed code with no test come first, each with what Bezl saw. Passed checks stay collapsed.",
    view: { kind: "task", taskId: "snapshot", stage: "check" },
  },
  {
    id: "review-takes",
    chapter: "Your tasks",
    title: "Two attempts, two reviews",
    note: "Each attempt is reviewed by the other coding agent. Keep the one that should ship.",
    view: { kind: "task", taskId: "empty-state", stage: "review" },
  },
  {
    id: "ship",
    chapter: "Your tasks",
    title: "Ready to ship",
    note: "The pull request beside how it got here. That history goes into its description.",
    view: { kind: "task", taskId: "empty-state", stage: "ship", kept: true },
  },
  {
    id: "approvals",
    chapter: "Needs you",
    title: "One queue for you",
    note: "Questions, access requests and disputed issues from every task wait here. Each choice says what happens next.",
    view: { kind: "approvals" },
  },
  {
    id: "approvals-clear",
    chapter: "Needs you",
    title: "Nothing needs you",
    note: "An empty queue says so. Every answer stays in its task's history.",
    view: { kind: "approvals", cleared: true },
  },
  {
    id: "history",
    chapter: "Look back",
    title: "How it got here",
    note: "Every event, the terminal snapshots and what each attempt changed, with your time beside the agents' time.",
    view: { kind: "history" },
  },
  {
    id: "state-idle",
    chapter: "Design states",
    title: "Idle",
    note: "The interim Task screen with no task running.",
    view: { kind: "state", scene: "idle" },
  },
  {
    id: "state-running",
    chapter: "Design states",
    title: "Running",
    note: "The writer's panel lights up, and a dot moves along its line in the map.",
    view: { kind: "state", scene: "running" },
  },
  {
    id: "state-blocked",
    chapter: "Design states",
    title: "Blocked",
    note: "The writer waits for an answer, so its panel glows as a warning.",
    view: { kind: "state", scene: "blocked" },
  },
  {
    id: "state-long",
    chapter: "Design states",
    title: "Long content",
    note: "Long output scrolls inside its panel and never spills.",
    view: { kind: "state", scene: "longContent" },
  },
  {
    id: "overview",
    chapter: "Design states",
    title: "Every state, both themes",
    note: "Click any screen to open it full size.",
    view: { kind: "overview" },
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
