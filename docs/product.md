# Product outline

Bezl supervises AI coding agents on a task. It runs the official agent CLIs as separate workers, Claude Code and Codex today, with the third provider open (M3 in the [roadmap](roadmap.md)): one writes to the task's worktree, the others review read-only, and every action is recorded locally as evidence. Bezl never holds a key and never passes one provider's output to another. Besides the CLIs, it may call model endpoints on localhost such as Ollama; see the [Crew protocol](crew-protocol.md).

From M5 the app is shaped as the task journey in the [product vision](vision.md): Brief, Explore, Plan, Build, Check, Review, Ship. This outline records the areas and how they map onto that journey.

The unit of work is the **task**: a worktree, one writing worker, its reviewers, their permissions and the evidence. Screens are named after what they hold.

## Areas

The owner confirmed these six areas and their navigation labels on 2026-10-22. The journey, added on 2026-10-23, regroups them as the last column shows.

| Area | Holds | Status | In the journey |
|---|---|---|---|
| Tasks | Create a task from a repository and branch, assign one writer and any reviewers, list and archive tasks. | Not built | The task list, with a brief checked for readiness when a task starts |
| Task | The live view of one task: task header, worker map, one panel per worker with state, step, elapsed time and output; stop a worker; answer a blocked worker. | Built with sample data (`src/ui/task/`); interim | The journey itself; the current screen is replaced in M5 |
| Approvals | Everything that waits on the operator. | Not built | "Needs you": waiting items are amber on the task list and decided in Review |
| Evidence | The append-only record per task: event timeline, terminal snapshots, what each worker changed. | Not built | The task's history, and Ship's "how it got here" |
| Providers | Installed CLIs and versions from preflight, sign-in state, and how each capability is enforced ("blocked by launch flag" or "instruction only"). | Not built | The model menu on each take and the usage line, offering only what passed preflight |
| Settings | Storage location (`.ai/`), evidence retention, theme, keyboard shortcuts. | Not built | Unchanged |

## Decisions

- **One Approvals queue.** A worker's question ("overwrite src/policy.rs?") and a capability request (for example `workspace.edit`) are both decisions for the operator. They share one queue in Approvals and also show inline on the worker's panel. In the journey, they are the "needs you" items.
- **Names.** The screen formerly called Control Room is **Task**; its banner is the **Task header**, its orbit diagram the **Worker map**, and the worker it centres on (first running, else first blocked) the **Focused worker**. These name the interim screen; the journey replaces the worker map and focused-worker layout in M5.
- **Domain stays in bezl.** The task header, worker map, worker panel, terminal view, approval item, snapshot view, provider card and theme values name bezl's domain and live here. Domain-neutral parts (progress, stats, badges, menus, tables and similar) come from kbui; see [UI styling](ui-styling.md).

Still open in the domain, so not mapped to UI yet: writer-lock state, redaction, the event schema.
