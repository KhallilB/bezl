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
    { at: "10:02", stage: "brief", who: "You", text: "Started the task with 4 done-when items" },
    { at: "10:03", stage: "plan", who: "Bezl", text: "Prepared worktrees for take A and take B" },
    { at: "10:04", stage: "plan", who: "You", text: "Allowed bun install" },
    { at: "10:05", stage: "plan", who: "Claude Code", text: "Planned 4 steps for take A" },
    { at: "10:05", stage: "plan", who: "Codex", text: "Planned 3 steps for take B" },
    {
      at: "10:11",
      stage: "build",
      who: "Claude Code",
      text: "Finished take A in 6 minutes",
      snapshot: "a",
    },
    {
      at: "10:14",
      stage: "build",
      who: "Codex",
      text: "Finished take B in 9 minutes",
      snapshot: "b",
    },
    {
      at: "10:15",
      stage: "check",
      who: "Bezl",
      text: "Take B had 2 problems; take A passed 12 of 12",
      light: "failed",
    },
    { at: "10:17", stage: "check", who: "You", text: "Sent take B's 2 problems to Codex" },
    { at: "10:22", stage: "check", who: "Codex", text: "Fixed both; take B passed 12 of 12" },
    { at: "10:24", stage: "review", who: "Codex", text: "Reviewed take A: 1 finding" },
    { at: "10:24", stage: "review", who: "Claude Code", text: "Reviewed take B: 2 findings" },
    { at: "10:31", stage: "review", who: "You", text: "Kept take A" },
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
    {
      id: "b",
      take: "B",
      model: "Codex",
      at: "10:14",
      lines: [
        "$ bun run test src/pages",
        " ✓ ProjectsChecklist renders three steps",
        " Test Files  6 passed (6)",
        "      Tests  47 passed (47)",
      ],
    },
  ],
  changes: kept?.views.build.takes ?? [],
};
