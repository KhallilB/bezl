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
    prompt:
      "src/policy.rs has edits you haven't committed. Should I overwrite them, or work around them?",
    context: "src/policy.rs · 3 uncommitted lines",
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
        next: "Codex writes over them in its own copy of your code, so your files stay exactly as they are.",
      },
      {
        id: "stop",
        label: "Stop the task",
        next: "The task stops here, and Bezl records your answer as the reason.",
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
    prompt: "Codex is asking for internet access so it can download one new crate.",
    context: "cargo add thiserror",
    waited: "4 min",
    choices: [
      {
        id: "once",
        label: "Allow once",
        next: "Codex runs it this once and will ask again next time.",
      },
      { id: "deny", label: "Deny", next: "Codex carries on without internet access." },
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
      "Claude Code disagrees with an issue Codex raised. It says the brief asks for one clear action, so the import link isn't part of this task.",
    context: "Codex: The Import from GitHub link does nothing yet · Projects.tsx:41",
    waited: "12 min",
    choices: [
      {
        id: "reviewer",
        label: "Side with Codex",
        next: "The issue goes back to Claude Code to fix.",
      },
      { id: "writer", label: "Side with Claude Code", next: "Bezl closes the issue." },
    ],
  },
];
