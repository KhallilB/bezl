import { keptTasks } from "../journey/fixtures";
import type { TaskHistory } from "./model";

// Sample data; M5 replays it from .git/bezl/.

const kept = keptTasks.find((t) => t.id === "empty-state");

export const history: TaskHistory = {
  taskId: "empty-state",
  title: "Empty state for Projects",
  repo: "studio-web",
  spent: [
    { label: "Your time", value: "9 min" },
    { label: "Agents", value: "41 min" },
    { label: "Tokens", value: "1.2M" },
  ],
  events: [
    { at: "10:02", stage: "define", who: "You", text: "Started the task with 4 things to be done" },
    { at: "10:03", stage: "plan", who: "Bezl", text: "Set up a copy of your code for the attempt" },
    { at: "10:04", stage: "plan", who: "You", text: "Allowed bun install to run" },
    { at: "10:05", stage: "plan", who: "Claude Code", text: "Planned 4 steps" },
    {
      at: "10:11",
      stage: "build",
      who: "Claude Code",
      text: "Finished the attempt in 6 minutes",
      snapshot: "a",
    },
    {
      at: "10:12",
      stage: "check",
      who: "Bezl",
      text: "Found 2 problems, while 10 of 12 checks passed",
      light: "failed",
    },
    { at: "10:13", stage: "check", who: "You", text: "Sent the 2 problems to Claude Code" },
    {
      at: "10:18",
      stage: "check",
      who: "Claude Code",
      text: "Fixed both problems, and all 12 checks then passed",
    },
    { at: "10:24", stage: "review", who: "Codex", text: "Reviewed the attempt and found 1 issue" },
    { at: "10:31", stage: "review", who: "You", text: "Approved it to ship" },
  ],
  snapshots: [
    {
      id: "a",
      take: "A",
      model: "Claude Code",
      at: "10:11",
      lines: [
        "$ bun run test src/pages",
        " ✓ Projects shows the empty state with no projects",
        " ✓ Projects lists projects when there are some",
        " Test Files  6 passed (6)",
        "      Tests  48 passed (48)",
      ],
    },
  ],
  changes: kept?.views.build.takes ?? [],
};
