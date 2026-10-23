# Product outline

Bezl supervises AI coding agents on a task. It runs the official Codex, Claude Code and Gemini CLIs as separate workers: one writes to the task's worktree, the others review read-only, and every action is recorded locally as evidence. Bezl never calls a provider API, never holds a credential, and never passes one provider's output to another.

The unit of work is the **task**: a worktree, one writing worker, its reviewers, their permissions and the evidence. Screens are named after what they hold.

## Areas

The owner confirmed these six areas and their navigation labels on 2026-10-22.

| Area | Holds | Status |
|---|---|---|
| Tasks | Create a task from a repository and branch, assign one writer and any reviewers, list and archive tasks. | Not built |
| Task | The live view of one task: task header, worker map, one panel per worker with state, step, elapsed time and output; stop a worker; answer a blocked worker. | Built with sample data (`src/ui/task/`) |
| Approvals | Everything that waits on the operator. | Not built |
| Evidence | The append-only record per task: event timeline, terminal snapshots, what each worker changed. | Not built |
| Providers | Installed CLIs and versions from preflight, sign-in state, and how each capability is enforced ("blocked by launch flag" or "instruction only"). | Not built |
| Settings | Storage location (`.ai/`), evidence retention, theme, keyboard shortcuts. | Not built |

## Decisions

- **One Approvals queue.** A worker's question ("overwrite src/policy.rs?") and a capability request (for example `workspace.edit`) are both decisions for the operator. They share one queue in Approvals and also show inline on the worker's panel.
- **Names.** The screen formerly called Control Room is **Task**; its banner is the **Task header**, its orbit diagram the **Worker map**, and the worker it centres on (first running, else first blocked) the **Focused worker**.
- **Domain stays in bezl.** The task header, worker map, worker panel, terminal view, approval item, snapshot view, provider card and theme values name bezl's domain and live here. Domain-neutral parts (progress, stats, badges, menus, tables and similar) come from kbui; see [UI styling](ui-styling.md).

Still open in the domain, so not mapped to UI yet: writer-lock state, redaction, the event schema.
