import type { NeedsYouItem } from "./model";

// Sample data; M5 builds the queue from each task's log.

export const needsYou: NeedsYouItem[] = [
  {
    id: "deny-scopes-overwrite",
    taskId: "deny-scopes",
    taskTitle: "Refuse tokens with no scopes",
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
        next: "Codex writes over them in its own copy of your code. Your files stay as they are.",
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
    taskTitle: "Refuse tokens with no scopes",
    stage: "build",
    kind: "access",
    from: "Codex",
    prompt: "Codex asks for internet access to download one new crate.",
    context: "cargo add thiserror",
    waited: "4 min",
    choices: [
      { id: "once", label: "Allow once", next: "Codex runs it once. It asks again next time." },
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
      "Claude Code disagrees with an issue Codex raised: the brief asks for one clear action, so the import link isn't part of this task.",
    context: "Codex: The Import from GitHub link does nothing yet · Projects.tsx:41",
    waited: "12 min",
    choices: [
      {
        id: "reviewer",
        label: "Side with Codex",
        next: "The issue goes back to Claude Code to fix.",
      },
      { id: "writer", label: "Side with Claude Code", next: "The issue is closed." },
    ],
  },
];
