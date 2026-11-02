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
  /** `issues`: the GitHub issue list starts open, or with #128 picked. */
  | { kind: "newTask"; draft: Draft; focus?: "crew"; issues?: "open" | "picked" }
  | { kind: "setup" }
  | { kind: "started" }
  /** `kept`: the list after take A was kept on Review; `shipped`, after its pull request opened. */
  | {
      kind: "task";
      taskId: string;
      stage: StageId;
      kept?: boolean;
      shipped?: "checking" | "merged";
    }
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
    note: "Bezl works inside a git repository, and it keeps each task's history right there in the repository, on this computer.",
    view: { kind: "choose" },
  },
  {
    id: "not-git",
    chapter: "Getting started",
    title: "It has to be a git repository",
    note: "If you pick a folder that isn't a git repository, Bezl tells you why it can't use it and asks you to choose the folder you cloned.",
    view: { kind: "choose", refused: true },
  },
  {
    id: "preflight",
    chapter: "Getting started",
    title: "Agent check",
    note: "Bezl looks for each coding agent on this computer and checks that it's signed in, with a single line showing progress while it works.",
    view: { kind: "providers", result: "checking" },
  },
  {
    id: "providers",
    chapter: "Getting started",
    title: "Coding agents",
    note: "Each coding agent gets a card showing its version, whether it's signed in, how it did on the safety tests and how much usage it has left.",
    view: { kind: "providers", result: "ready" },
  },
  {
    id: "impostor",
    chapter: "Getting started",
    title: "Not the real one",
    note: "If a program called codex turns out not to be Codex, Bezl shows you where it lives and won't use it as a coding agent.",
    view: { kind: "providers", result: "impostor" },
  },
  {
    id: "no-writer",
    chapter: "Getting started",
    title: "No coding agent can write yet",
    note: "If none of your coding agents can write code yet, Bezl explains why and shows the command that fixes it. You run that command yourself, because Bezl never signs in for you.",
    view: { kind: "providers", result: "noWriter" },
  },
  {
    id: "empty-list",
    chapter: "Getting started",
    title: "Ready for a first task",
    note: "Once a coding agent can write code, your task list opens empty and the only thing left to do is start a new task.",
    view: { kind: "empty" },
  },
  {
    id: "new-task",
    chapter: "Start a task",
    title: "Define the task",
    note: "Describe the change in your own words. As you type, Bezl looks for five things a good goal usually covers, but you can start without them.",
    view: { kind: "newTask", draft: "blank" },
  },
  {
    id: "from-issue",
    chapter: "Start a task",
    title: "Start from a GitHub issue",
    note: "If the work is already written up as an issue, pick it instead of starting from scratch. Bezl reads your open issues through your own GitHub sign-in.",
    view: { kind: "newTask", draft: "blank", issues: "open" },
  },
  {
    id: "issue-filled",
    chapter: "Start a task",
    title: "The issue fills in the goal",
    note: "The issue's title and description become the goal, and its checklist becomes the list of things to be done. Bezl checks it like any goal you wrote yourself, so the gaps still show.",
    view: { kind: "newTask", draft: "blank", issues: "picked" },
  },
  {
    id: "readiness",
    chapter: "Start a task",
    title: "Fill the gaps",
    note: "For each gap, Bezl explains why it matters and suggests something you can add with one click.",
    view: { kind: "newTask", draft: "partial" },
  },
  {
    id: "define-ready",
    chapter: "Start a task",
    title: "It's done when, and who checks",
    note: "Bezl checks each of these after every step, and the ones marked for you wait until Review.",
    view: { kind: "newTask", draft: "ready" },
  },
  {
    id: "crew",
    chapter: "Start a task",
    title: "Choose who works on it",
    note: "You can only pick coding agents that passed the agent check. A reviewer from the same company as the writer is allowed, but Bezl labels it so you know.",
    view: { kind: "newTask", draft: "ready", focus: "crew" },
  },
  {
    id: "setup",
    chapter: "Start a task",
    title: "Setup asks first",
    note: "Bezl never runs anything in your repository without asking, so a setup command waits until you allow it.",
    view: { kind: "setup" },
  },
  {
    id: "preparing",
    chapter: "Start a task",
    title: "Preparing",
    note: "Bezl sets up the task's own copy of your code on its own branch, and then planning begins.",
    view: { kind: "started" },
  },
  {
    id: "tasks",
    chapter: "Your tasks",
    title: "Every task in one list",
    note: "Each task shows its state by colour: amber is waiting on you, teal is working and red has failed. Pick one to open it.",
    view: { kind: "task", taskId: "empty-state", stage: "review" },
  },
  {
    id: "stages",
    chapter: "Your tasks",
    title: "Define to Ship",
    note: "Each stage has a light that shows how it's going, and you can click any stage to open it. Define holds your goal in your own words and the list of things to be done.",
    view: { kind: "task", taskId: "empty-state", stage: "define" },
  },
  {
    id: "context",
    chapter: "Your tasks",
    title: "What it's for, how big, how sure",
    note: "The line under the stages keeps your goal, how much the change touches and how many done-when lines are proven in view. Beside every stage, Intent holds what you decided and what the agents assumed, and changing an assumption asks you about it.",
    view: { kind: "task", taskId: "empty-state", stage: "review" },
  },
  {
    id: "preview",
    chapter: "Your tasks",
    title: "See it before you decide",
    note: "Preview shows the screenshots Bezl took at phone and desktop size, with each finding pinned where it is. Click a spot to leave a note, and pointing at a choice shows an example of it, marked as not built yet.",
    view: { kind: "task", taskId: "empty-state", stage: "check" },
  },
  {
    id: "working",
    chapter: "Your tasks",
    title: "Work in progress",
    note: "Each attempt works in its own copy of your code. A single line tells you what it's doing right now, and you can send it a message while it works.",
    view: { kind: "task", taskId: "debounce", stage: "build" },
  },
  {
    id: "question",
    chapter: "Your tasks",
    title: "A question waits on you",
    note: "When a coding agent stops to ask you something, the task turns amber and the question opens in that stage, with what it holds up, Bezl's recommendation and what each answer leads to. Questions Bezl could answer itself are folded away under Bezl handled.",
    view: { kind: "task", taskId: "deny-scopes", stage: "build" },
  },
  {
    id: "problems",
    chapter: "Your tasks",
    title: "Problems first",
    note: "Failing checks and changed code without a test come first, each with the evidence Bezl saw, and one button sends them all to the writer together. Checks that passed stay folded away.",
    view: { kind: "task", taskId: "snapshot", stage: "check" },
  },
  {
    id: "review-takes",
    chapter: "Your tasks",
    title: "Two attempts, two reviews",
    note: "Each attempt is reviewed by the other coding agent, so you can weigh both reviews and keep the one that should ship.",
    view: { kind: "task", taskId: "empty-state", stage: "review" },
  },
  {
    id: "ship",
    chapter: "Your tasks",
    title: "Ready to ship",
    note: "You see the pull request next to the history of how it got here, and Bezl puts that history in the pull request's description.",
    view: { kind: "task", taskId: "empty-state", stage: "ship", kept: true },
  },
  {
    id: "pr-checks",
    chapter: "Your tasks",
    title: "Checks on the pull request",
    note: "Once the pull request is open, Ship shows GitHub's checks as they finish. A failing check links to its log, but nothing here stops you, because merging is your call.",
    view: { kind: "task", taskId: "empty-state", stage: "ship", shipped: "checking" },
  },
  {
    id: "merged",
    chapter: "Your tasks",
    title: "Checked where it landed",
    note: "After you merge, GitHub runs the checks again on the merged commit. Ship shows that result, so you know the change works on the branch it joined.",
    view: { kind: "task", taskId: "empty-state", stage: "ship", shipped: "merged" },
  },
  {
    id: "approvals",
    chapter: "Needs you",
    title: "One queue for you",
    note: "Questions, requests for more access and disputed issues from every task wait for you here, and each answer tells you what happens next.",
    view: { kind: "approvals" },
  },
  {
    id: "approvals-clear",
    chapter: "Needs you",
    title: "Nothing needs you",
    note: "When nothing is waiting, the page says so plainly. Every answer you gave is kept in its task's history.",
    view: { kind: "approvals", cleared: true },
  },
  {
    id: "history",
    chapter: "Look back",
    title: "How it got here",
    note: "Look back over every event, open the terminal snapshots and see what each attempt changed, with the time you spent shown next to the agents' time.",
    view: { kind: "history" },
  },
  {
    id: "state-idle",
    chapter: "Design states",
    title: "Idle",
    note: "This is the interim Task screen while no task is running.",
    view: { kind: "state", scene: "idle" },
  },
  {
    id: "state-running",
    chapter: "Design states",
    title: "Running",
    note: "While the writer works, its panel lights up and a dot travels along its line in the map.",
    view: { kind: "state", scene: "running" },
  },
  {
    id: "state-blocked",
    chapter: "Design states",
    title: "Blocked",
    note: "When the writer stops to wait for your answer, its panel glows as a warning.",
    view: { kind: "state", scene: "blocked" },
  },
  {
    id: "state-long",
    chapter: "Design states",
    title: "Long content",
    note: "Long output scrolls inside its own panel, so it never spills onto the rest of the screen.",
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
