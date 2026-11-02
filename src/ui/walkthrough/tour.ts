import type { StageId } from "../journey/model";
import type { drafts } from "../newtask/fixtures";
import type { NewTaskStep } from "../newtask/NewTask";
import { oneOf, type Theme, themes } from "./states";

export const chapters = [
  "Getting started",
  "Start a task",
  "Your tasks",
  "Needs you",
  "Look back",
] as const;
export type Chapter = (typeof chapters)[number];

export type Draft = keyof typeof drafts;

export type Preflight = "checking" | "ready" | "noGitHub" | "impostor" | "noWriter";

export type TourView =
  | { kind: "choose"; refused?: boolean }
  | { kind: "providers"; result: Preflight }
  | { kind: "empty" }
  /** `issues`: the GitHub issue list starts open, or with #128 picked. */
  | { kind: "newTask"; draft: Draft; step?: NewTaskStep; issues?: "open" | "picked" }
  | { kind: "started" }
  /** `kept`: the list after the attempt was approved on Review; `shipped`, after its pull request opened. */
  | {
      kind: "task";
      taskId: string;
      stage: StageId;
      kept?: boolean;
      shipped?: "checking" | "merged";
      /** Opens with the map open. */
      full?: boolean;
      /** The list after Bezl closed mid-Build. */
      interrupted?: boolean;
    }
  | { kind: "approvals"; cleared?: boolean }
  | { kind: "history" };

export type Step = { id: string; chapter: Chapter; title: string; note: string; view: TourView };

export const steps: Step[] = [
  {
    id: "open-repo",
    chapter: "Getting started",
    title: "Open a repository",
    note: "Bezl works inside a git repository. It keeps each task's history in that repository, on this computer.",
    view: { kind: "choose" },
  },
  {
    id: "not-git",
    chapter: "Getting started",
    title: "It has to be a git repository",
    note: "Pick a folder that isn't a git repository and Bezl says why it can't use it. Choose the folder you cloned instead.",
    view: { kind: "choose", refused: true },
  },
  {
    id: "preflight",
    chapter: "Getting started",
    title: "Agent check",
    note: "Bezl looks for each coding agent on this computer and checks that it's signed in. It checks your GitHub sign-in too. One line shows progress while it works.",
    view: { kind: "providers", result: "checking" },
  },
  {
    id: "providers",
    chapter: "Getting started",
    title: "Coding agents",
    note: "One row per coding agent, plus GitHub: whether Bezl can use it, and why. Anything to fix stays in view. Details holds the path, the safety tests and usage.",
    view: { kind: "providers", result: "ready" },
  },
  {
    id: "github",
    chapter: "Getting started",
    title: "No GitHub sign-in",
    note: "Without a GitHub sign-in there's no issue picker, and Ship can't open a pull request, so the task ends on a local branch. Nothing else needs GitHub, so you can still start.",
    view: { kind: "providers", result: "noGitHub" },
  },
  {
    id: "impostor",
    chapter: "Getting started",
    title: "Not the real one",
    note: "If a program called codex isn't really Codex, Bezl shows where it lives and won't use it as a coding agent.",
    view: { kind: "providers", result: "impostor" },
  },
  {
    id: "no-writer",
    chapter: "Getting started",
    title: "No coding agent can write yet",
    note: "If no coding agent can write code yet, Bezl says why and shows the command that fixes it. You run it yourself, because Bezl never signs in for you.",
    view: { kind: "providers", result: "noWriter" },
  },
  {
    id: "empty-list",
    chapter: "Getting started",
    title: "Ready for a first task",
    note: "Once a coding agent can write code, your task list opens empty. The only thing left is to start a new task.",
    view: { kind: "empty" },
  },
  {
    id: "new-task",
    chapter: "Start a task",
    title: "Write the goal",
    note: "A new task takes two steps: your goal, then Bezl's read of the task. First, describe the change in your own words. That's all you have to write.",
    view: { kind: "newTask", draft: "blank" },
  },
  {
    id: "from-issue",
    chapter: "Start a task",
    title: "Or start from a GitHub issue",
    note: "If the work is already a GitHub issue, pick it instead. Its title and description become the goal, and its checklist becomes the done-when list. Bezl reads your open issues with your own GitHub sign-in.",
    view: { kind: "newTask", draft: "blank", issues: "picked" },
  },
  {
    id: "task-read",
    chapter: "Start a task",
    title: "Review and start",
    note: "From your goal and the code, Bezl fills in the rest: who it's for, what to avoid or reuse, an example, when it's done, who writes and who reviews, and Limits on the files it may change. Each part says where it came from. Start as it is, or Change any part to tighten it. Start names the setup command it runs, only in the task's copy of your code.",
    view: { kind: "newTask", draft: "partial", step: "review" },
  },
  {
    id: "preparing",
    chapter: "Start a task",
    title: "Preparing",
    note: "Bezl gives the task its own copy of your code, on its own branch. Then planning starts.",
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
    note: "Each stage has a light that shows how it's going. Click any stage to open it. Define holds your goal in your own words and the done-when list.",
    view: { kind: "task", taskId: "empty-state", stage: "define" },
  },
  {
    id: "context",
    chapter: "Your tasks",
    title: "What it's for, how big, how sure",
    note: "Under the stages: your goal in your own words, where it stands, and one quiet line with how big the change is, how risky and how much of it ran in a test. Point at the risk to see what it's based on. Below that, You asked for lists each done-when line with how it's going. Pick a line to see everything behind it beside the list: its questions, problems, screenshots, code and test. Point at a stage to see what happened there and who acted.",
    view: { kind: "task", taskId: "empty-state", stage: "review" },
  },
  {
    id: "preview",
    chapter: "Your tasks",
    title: "See it before you decide",
    note: "Screenshots show in a line's detail, and only when Bezl took screenshots of your app. A phone screenshot shows at its real width, with each finding pinned where it is. Click a spot to leave a note. Open the map gives the screenshots the whole window, with a second one beside it to compare.",
    view: { kind: "task", taskId: "empty-state", stage: "check" },
  },
  {
    id: "working",
    chapter: "Your tasks",
    title: "Work in progress",
    note: "The attempt works in its own copy of your code. Its row says what it's doing right now. Open it to see the whole attempt and send it a message while it works.",
    view: { kind: "task", taskId: "debounce", stage: "build" },
  },
  {
    id: "question",
    chapter: "Your tasks",
    title: "A question waits on you",
    note: "When a coding agent stops to ask you something, the task turns amber and the question waits on the line it holds up, picked for you. It shows what Bezl recommends, and what each answer leads to, costs and unblocks. A question that isn't about one line sits under Not tied to a line. Questions Bezl could answer itself are folded under Bezl handled.",
    view: { kind: "task", taskId: "deny-scopes", stage: "build" },
  },
  {
    id: "problems",
    chapter: "Your tasks",
    title: "Problems first",
    note: "A line that fails comes before the rest, with what Bezl saw in its detail. Changed code with no line of its own sits under Not tied to a line. The bar at the bottom sends every problem at once, and it sits in the same place on every stage. Options picks who fixes, what goes with the problems and which checks run after, with the time, usage and files it may change. Nothing goes until you press send. Checks that passed stay folded.",
    view: { kind: "task", taskId: "snapshot", stage: "check" },
  },
  {
    id: "trace",
    chapter: "Your tasks",
    title: "Follow a line into the code",
    note: "A line's detail lists where it is in the code and what ran to check it. Where only the plan says some code serves the line, it tells you: the plan says so, but no test has shown it yet. Open the map draws the whole path from a problem back to the line it puts at risk, and Why Bezl asks, on a question, opens it there. A pin on a screenshot leads to the map, and See the screen goes the other way.",
    view: { kind: "task", taskId: "snapshot", stage: "check" },
  },
  {
    id: "review",
    chapter: "Your tasks",
    title: "Reviewed, before and after",
    note: "Another coding agent reviews the attempt. Each line shows main next to the change: main fails, now works. Pick a line to see its screenshot, where it is in the code and the test that ran. Other checks, after the lines, holds the rest, main against now. Once you've answered the review's question, the bar at the bottom says why it's ready and ships it.",
    view: { kind: "task", taskId: "empty-state", stage: "review" },
  },
  {
    id: "full-screen",
    chapter: "Your tasks",
    title: "Open the map",
    note: "Open the map gives the review the whole window. Your path on the left lists each step that needs you and what it holds up. The middle shows the map, or the screenshots: dotted links are only the plan's word, solid ones Bezl checked. The question and what you picked sit on the right. The bar comes along, so what you decide stays when you close it.",
    view: { kind: "task", taskId: "empty-state", stage: "review", full: true },
  },
  {
    id: "ship",
    chapter: "Your tasks",
    title: "Ready to ship",
    note: "You see the pull request next to how it got here. Bezl puts that history in the pull request's description.",
    view: { kind: "task", taskId: "empty-state", stage: "ship", kept: true },
  },
  {
    id: "pr-checks",
    chapter: "Your tasks",
    title: "Checks on the pull request",
    note: "Once the pull request is open, Ship shows GitHub's checks as they finish. A failing check links to its log, but nothing here stops you. Merging is your call.",
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
    id: "come-back",
    chapter: "Your tasks",
    title: "Coming back after a restart",
    note: "If Bezl closes mid-step, after a crash or a restart, the task comes back amber as Interrupted. Its copy of your code is as it was left, with the last terminal snapshot. Bezl never restarts the step on its own: you run it again with a fresh coding agent, or stop.",
    view: { kind: "task", taskId: "debounce", stage: "build", interrupted: true },
  },
  {
    id: "approvals",
    chapter: "Needs you",
    title: "One queue for you",
    note: "Questions, requests for more access and disputed issues from every task wait for you here. Each answer tells you what happens next.",
    view: { kind: "approvals" },
  },
  {
    id: "approvals-clear",
    chapter: "Needs you",
    title: "Nothing needs you",
    note: "When nothing is waiting, the page says so. Every answer you gave is kept in its task's history.",
    view: { kind: "approvals", cleared: true },
  },
  {
    id: "history",
    chapter: "Look back",
    title: "How it got here",
    note: "Look back over every event, open the terminal snapshots and see what changed, with your time shown next to the agents' time.",
    view: { kind: "history" },
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
