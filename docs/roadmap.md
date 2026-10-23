# MVP roadmap

The MVP is done when Bezl can take a real task in a real repository and see it through: one agent writes in its own worktree, another reviews without being able to write, Bezl checks the work itself, and every step is on the record. If the crew test passes, the agents also coordinate through the [Crew protocol](crew-protocol.md); if it fails, the MVP ships with one writer and the operator passing review findings along.

Each milestone has a pass mark. The same pass mark sits in `progress.json` as a `not-run` entry until the milestone is checked, then it records the result and the evidence. Nothing is marked done on the strength of an agent's report.

## Milestones

| | Milestone | Status |
|---|---|---|
| M0 | Stack and UI foundation | Mostly done |
| M1 | Crew test | Ready to run, blocked |
| M2 | Domain core | Not started |
| M3 | Providers and preflight | Not started |
| M4 | Live terminals | Spiked |
| M5 | First real task, end to end | Not started |
| M6 | Crew protocol in Bezl | Depends on M1 |

M1 comes early because its answer changes the shape of M6 and how much the MVP promises. M2 to M5 are needed either way.

### M0. Stack and UI foundation

What: the three stack spikes and a Task screen built on kbui with sample data.

- Spike 1: terminal output reaches the window with no lost bytes. Memory during bursts is over the original line; the accepted trip-wires are idle under 150 MB and bursts under 600 MB at a 1 MiB high-water mark.
- Spike 2: Ghostty's engine builds and captures terminal snapshots.
- Spike 3: a Codex reviewer is blocked from writing by the operating system. The Claude probe has not run because the Claude login is revoked.
- The Task screen runs on kbui 0.4.0 with sample data in bezl #3, which builds on #1.

Pass mark: the three spikes have results, and the Task screen is merged with its checks passing.

Left to do: merge bezl #1 and #3, and run the Claude reviewer probe.

### M1. Crew test

What: decide whether several agents coordinated by Bezl beat one agent working alone. The harness is built and tested in `spikes/05-crew-protocol`.

Five small real tasks, each with checks that fail before the change. One crew run (a writer and a reviewer from different providers) and one baseline run (one agent alone), scored on thresholds set before any run.

Pass mark: at least 4 of 5 tasks green with only a merge from the operator, no task stopped by a cap or a loop, crew tokens at most twice the baseline, and at least one finding that reached the writer labelled a real defect.

Blocked on:

- `claude login`.
- Choosing the five tasks.
- Deciding whether workers run with an isolated config. Today they load the operator's global instructions, hooks and MCP servers, which inflates every context and skews the token score.
- Deciding whether Bezl may pass typed, logged findings between providers. The README rule says it never relays one provider's output into another.

If the test fails, delete `spikes/05-crew-protocol` once its result is recorded; the findings move to `docs/spikes/`.

### M2. Domain core

What: the rules of a task in Rust, with no UI or terminals attached.

- A task owns a worktree, one writer, any number of reviewers and their capabilities.
- One writer per worktree, enforced by a lease.
- Every state change is an event, appended to a JSONL log with a schema version.
- The task's state is rebuilt by replaying the log.

Pass mark: tests cover the writer lease, every state transition, and rebuilding a task from its log; a second writer on the same worktree is refused.

### M3. Providers and preflight

What: Bezl knows which agent CLIs it can use and how far it can trust each one.

- Find each CLI and confirm what it is from its version output, not its file name. The `codex` on this machine's path turned out to be an unrelated static-site generator.
- Check sign-in: `codex login status`, and a one-line canary for Claude Code, which has no status command.
- Record how each capability is enforced: blocked by a launch flag, or instruction only.
- Choose the third provider. Google stopped serving Gemini CLI on personal accounts on 18 June 2026. A 120B local model could not run as an agent on a 96 GB Mac (spike 4).

Pass mark: the Providers screen shows real preflight results for every installed CLI, the read-only probe has a result for every provider Bezl offers, and `spikes/03-reviewer-readonly` is deleted with its findings moved to `docs/spikes/`.

### M4. Live terminals

What: real agent sessions streaming into Task panels.

- Replace the spike's PTY code with a terminal port that applies backpressure.
- Terminal snapshots into the evidence record through Ghostty's engine.

Pass mark: three panes stream 20 MB each with no lost bytes, idle memory stays under 150 MB, and bursts stay under 600 MB. Spikes 1 and 2 are deleted: `spikes/01-pty-throughput`, `spikes/02-libghostty-vt`, `src-tauri/src/spike_pty.rs` with its commands in `lib.rs`, and `src/spike/`. Their findings move to `docs/spikes/`.

### M5. First real task, end to end

What: the whole loop in the app, on a real repository.

- Tasks: create a task from a repository and branch, choose the writer and reviewers.
- Task: live panels driven by the domain, stop a worker.
- Approvals: one queue for worker questions and capability requests, also shown on the worker's panel.
- Evidence: the event timeline, terminal snapshots and each worker's changes.

Pass mark: a real task finishes with a writer and a read-only reviewer, the operator answers one approval in the app, and the evidence screen shows every event and snapshot for the task.

### M6. Crew protocol in Bezl

Only if M1 passes. What: the [Crew protocol](crew-protocol.md) moves from the harness into Bezl's core.

- Crew files: roles bound to agent CLIs and localhost model endpoints.
- Small briefs, typed answers, checks run by Bezl, and loop stops.
- Code Facts: file outlines, references and symbol diffs from tree-sitter, SCIP indexes and language servers, so briefs point at code instead of pasting it.
- A local model lane through Ollama for summaries, sorting and candidate findings that a reviewer or a test confirms.

Pass mark: the five M1 tasks, run inside Bezl, match or beat the harness results on every threshold, and `spikes/04-local-worker-gpt-oss` and `spikes/05-crew-protocol` are deleted with their findings moved to `docs/spikes/`.

## Spikes

A spike answers one question and then goes away. Each one is absorbed by a milestone, and that milestone is not done until the spike is deleted.

| Spike | Where it lives today | Absorbed by | Deleted in |
|---|---|---|---|
| 1. Terminal output | `spikes/01-pty-throughput`, `src-tauri/src/spike_pty.rs`, `src/spike/` | The terminal port with backpressure | M4 |
| 2. Terminal snapshots | `spikes/02-libghostty-vt` | Snapshots in the evidence record | M4 |
| 3. Read-only reviewers | `spikes/03-reviewer-readonly` | Preflight's read-only probe | M3 |
| 4. Local 120B worker | `spikes/04-local-worker-gpt-oss`, in PR #4 | The local model lane | M6 |
| 5. Crew harness | `spikes/05-crew-protocol`, in PR #6 | The Crew protocol in Bezl's core | M6, or after M1 if the crew test fails |

Rules:

- A spike lands on main as `RESULT.md` plus the least code needed to rerun it. Build output and `node_modules` are deleted once the result is recorded.
- When a spike is deleted, its `RESULT.md` moves to `docs/spikes/` so the findings and decisions stay readable. Links to it are updated in the same change.
- `progress.json` evidence stays valid after a deletion, because each entry points at a file at a fixed commit.
- No app code may import from a spike. The spike 1 commands registered in `src-tauri/src/lib.rs` are the one exception, and M4 removes them.

## Recording progress

When a milestone is checked, update its entry in `progress.json`: set the date, the result (`pass`, `partial` or `fail`), what was measured and the evidence path at the commit. Spikes add their own `experiment` entries the same way. The portfolio site builds its project page from this file.
