import type { StageId } from "../journey/model";
import type { drafts } from "../newtask/fixtures";
import { oneOf, type Scene, type Theme, themes } from "./states";

export const chapters = ["Getting started", "Start a task", "Your tasks", "Design states"] as const;
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
  | { kind: "task"; taskId: string; stage: StageId }
  | { kind: "state"; scene: Scene }
  | { kind: "overview" };

export type Step = { id: string; chapter: Chapter; title: string; note: string; view: TourView };

export const steps: Step[] = [
  {
    id: "open-repo",
    chapter: "Getting started",
    title: "Open a repository",
    note: "Bezl works inside a git repository and keeps every record in it, on this machine.",
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
    title: "Preflight",
    note: "Bezl finds each agent CLI by its version output and checks its sign-in. One status line shows progress.",
    view: { kind: "providers", result: "checking" },
  },
  {
    id: "providers",
    chapter: "Getting started",
    title: "Providers",
    note: "One card per CLI: version, sign-in, the read-only probe and usage reporting.",
    view: { kind: "providers", result: "ready" },
  },
  {
    id: "impostor",
    chapter: "Getting started",
    title: "An impostor on PATH",
    note: "A binary named codex that is not Codex is rejected and named, never run as a worker.",
    view: { kind: "providers", result: "impostor" },
  },
  {
    id: "no-writer",
    chapter: "Getting started",
    title: "No writer yet",
    note: "Without a CLI that can write, Providers says why and names the command to run. Bezl never signs in for you.",
    view: { kind: "providers", result: "noWriter" },
  },
  {
    id: "empty-list",
    chapter: "Getting started",
    title: "Ready for a first task",
    note: "Once a CLI can write, the task list opens empty, with one action: New task.",
    view: { kind: "empty" },
  },
  {
    id: "new-task",
    chapter: "Start a task",
    title: "Write the brief",
    note: "In your own words. Readiness checks five things as you type; none of them blocks starting.",
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
    title: "Done when, and who checks",
    note: "Bezl checks its items after every step; yours wait for you at Review.",
    view: { kind: "newTask", draft: "ready" },
  },
  {
    id: "crew",
    chapter: "Start a task",
    title: "Choose the crew",
    note: "Only providers that passed preflight. A reviewer from the writer's own vendor is allowed, and labelled.",
    view: { kind: "newTask", draft: "ready", focus: "crew" },
  },
  {
    id: "setup",
    chapter: "Start a task",
    title: "Setup asks first",
    note: "A setup command is a needs-you item. Bezl runs nothing in your repository unasked.",
    view: { kind: "setup" },
  },
  {
    id: "preparing",
    chapter: "Start a task",
    title: "Preparing",
    note: "Bezl makes the task's worktree and branch, then Plan starts.",
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
    note: "Each stage has a light; click one to open it. Brief keeps your words and the done-when list.",
    view: { kind: "task", taskId: "empty-state", stage: "brief" },
  },
  {
    id: "working",
    chapter: "Your tasks",
    title: "Work in progress",
    note: "A writer works in its own worktree; the plan lights up step by step.",
    view: { kind: "task", taskId: "debounce", stage: "build" },
  },
  {
    id: "question",
    chapter: "Your tasks",
    title: "A question waits on you",
    note: "When a worker stops to ask, the task turns amber where you will see it.",
    view: { kind: "task", taskId: "deny-scopes", stage: "build" },
  },
  {
    id: "problems",
    chapter: "Your tasks",
    title: "Problems first",
    note: "Check runs in the worktree and lists failures and code no test runs.",
    view: { kind: "task", taskId: "snapshot", stage: "check" },
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
    note: "The writer's plane is lit; a comet travels its write edge.",
    view: { kind: "state", scene: "running" },
  },
  {
    id: "state-blocked",
    chapter: "Design states",
    title: "Blocked",
    note: "The writer waits for an answer, so its plane casts warning light.",
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
