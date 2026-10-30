import type { NeedsYouItem } from "./model";

// Sample data; M5 builds the queue from each task's log.

export const needsYou: NeedsYouItem[] = [
  {
    id: "deny-scopes-overwrite",
    taskId: "deny-scopes",
    taskTitle: "Deny empty scopes",
    stage: "build",
    kind: "question",
    from: "Codex",
    prompt: "src/policy.rs has your uncommitted edits. Overwrite them, or work around them?",
    context: "src/policy.rs · 3 lines you have not committed",
    waited: "6 min",
    choices: [
      {
        id: "around",
        label: "Work around them",
        next: "Codex keeps your edits and changes the code around them.",
      },
      {
        id: "overwrite",
        label: "Overwrite them",
        next: "Codex writes over them in its worktree; your checkout keeps your copy.",
      },
      {
        id: "stop",
        label: "Stop the task",
        next: "The task stops here, with your answer as the reason.",
      },
    ],
  },
  {
    id: "deny-scopes-network",
    taskId: "deny-scopes",
    taskTitle: "Deny empty scopes",
    stage: "build",
    kind: "access",
    from: "Codex",
    prompt: "Codex asks for network access to fetch one new crate.",
    context: "cargo add thiserror",
    waited: "4 min",
    choices: [
      { id: "once", label: "Grant once", next: "Codex runs it once; the next request asks again." },
      { id: "deny", label: "Deny", next: "Codex continues without it." },
    ],
  },
  {
    id: "empty-state-dispute",
    taskId: "empty-state",
    taskTitle: "Empty state for Projects",
    stage: "review",
    kind: "dispute",
    from: "Claude Code",
    prompt:
      "Claude Code disputes a finding: the import link is out of scope, since the brief asks for one clear action.",
    context: "Codex: Import from GitHub has no handler · Projects.tsx:41",
    waited: "12 min",
    choices: [
      { id: "reviewer", label: "Side with Codex", next: "The finding goes back to Claude Code." },
      { id: "writer", label: "Side with Claude Code", next: "The finding closes." },
    ],
  },
];
