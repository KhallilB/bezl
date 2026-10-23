# Product outline

The app's areas, and where each one lives in the task journey. What Bezl is for is in the [north star](north-star.md); what using it looks like is in the [product vision](vision.md).

Bezl runs the official agent CLIs as separate workers: Claude Code and Codex for now, with the third provider open (M3 in the [roadmap](roadmap.md)). One writes to the task's worktree. Others review and cannot write. Bezl runs the checks and measures the change itself, and records every step in `.git/bezl/`. Most of this is planned; the [roadmap](roadmap.md) says what exists. It never holds a key, and it passes between agents only what it produced or checked itself (the handoff rules in the [Crew protocol](crew-protocol.md#handoff-rules)).

The unit of work is the **task**: its takes, each with a worktree, one writer and its reviewers, their permissions, and the record. Screens are named after what they hold.

## Areas

The owner confirmed these six areas and their navigation labels on 2026-10-22, and renamed Evidence to History on 2026-10-23. The journey, added on 2026-10-23, regroups them as the last column shows.

| Area | Holds | Status | In the journey |
|---|---|---|---|
| Tasks | Create a task from a repository and branch, choose the writer and reviewers, list and archive tasks | Not built | The task list, with a brief checked for readiness when a task starts |
| Task | One task, live | Interim screen built with sample data (`src/ui/task/`) | The journey itself, from M5 |
| Approvals | Everything that waits on you: worker questions and requests for more access | Not built | "Needs you": amber items on the task list, and inline in the stage where they came up |
| History | The task's record: event timeline, terminal snapshots, what each worker changed | Not built | The task's history, and Ship's "how it got here" |
| Providers | Installed CLIs and versions from preflight, sign-in state, how each capability is enforced ("blocked by launch flag" or "instruction only"), and what each reports about usage | Not built | The writer and reviewer menus, offering only what passed preflight |
| Settings | Record retention and export, theme, keyboard shortcuts | Not built | Unchanged |

What Bezl measures about a change (failing checks, and the changed code no test runs) shows on Check, inside the task. That is evidence; the History area holds the record of what happened.

## Decisions

- **One Approvals queue.** A worker's question ("overwrite src/policy.rs?") and a request for more access (for example `workspace.edit`) are both decisions for you. They share one queue, and also show inside the stage where they came up. In the journey they are the "needs you" items.
- **Names on the interim screen.** The screen formerly called Control Room is **Task**. Its banner is the **task header**, its orbit diagram the **worker map**, and the worker it centres on (the first running, else the first blocked) the **focused worker**. The journey replaces the worker map and the focused-worker layout in M5.
- **Domain stays in bezl.** Parts that name bezl's domain live here: the task header, worker map, worker panel, terminal view, approval item, snapshot view, provider card and theme values. Domain-neutral parts, such as progress, stats, badges, menus and tables, come from kbui; see [UI styling](ui-styling.md).

Still open in the domain, so not mapped to the UI yet: the writer lease's visible state, redaction, and the event schema (M2).
