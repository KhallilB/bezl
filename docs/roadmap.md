# MVP roadmap

The MVP is done when Bezl can take a real task in a real repository and see it through: one agent writes in its own worktree, another reviews without being able to write, Bezl checks the work itself, and every step is on the record. If the crew test passes, the agents also coordinate through the [Crew protocol](crew-protocol.md); if it fails, the MVP ships with one writer and the operator passing review findings along.

The app's shape for M5 onward is the task journey in the [product vision](vision.md). M7 and M8 come after the MVP.

Each milestone has a pass mark. The same pass mark sits in `progress.json` as a `not-run` entry until the milestone is checked, then it records the result and the evidence. Nothing is marked done on the strength of an agent's report.

## Milestones

| | Milestone | Status |
|---|---|---|
| M0 | Stack and UI foundation | Done |
| M1 | Crew test | Ready to run, blocked |
| M2 | Domain core | Not started |
| M3 | Providers and preflight | Not started |
| M4 | Live terminals | Spiked |
| M5 | First real task, end to end | Not started |
| M6 | Crew protocol in Bezl | Depends on M1 |
| M7 | Preview canvas | After the MVP |
| M8 | Explore with several models | After M6 and M7 |

M1 comes early because its answer changes the shape of M6 and how much the MVP promises. M2 to M5 are needed either way.

### M0. Stack and UI foundation

What: the three stack spikes, and kbui with the app theme, shown on a Task screen with sample data.

- Spike 1: terminal output reaches the window with no lost bytes. Memory during bursts is over the original line; the accepted trip-wires are idle under 150 MB and bursts under 600 MB at a 1 MiB high-water mark.
- Spike 2: Ghostty's engine builds and captures terminal snapshots.
- Spike 3: a Codex reviewer is blocked from writing by the operating system. The Claude probe has not run because the Claude login is revoked.
- The Task screen runs on kbui 0.4.0 with sample data in bezl #3, which builds on #1. Its worker map is replaced by the task journey in M5; the theme, the kbui adoption and their tests carry over.

Pass mark: the three spikes have results, and the kbui adoption and app theme in bezl #1 and #3 are merged with their checks passing.

Done: bezl #1 and #3 merged on 2026-10-23, with checks passing on `main`. The Claude reviewer probe moves with spike 3 into M3.

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

What: the whole loop in the app, on a real repository, as the task journey in the [product vision](vision.md) with one take.

- Tasks: create a task from a repository and branch with a brief checked for readiness, and choose the writer and reviewer. The task list shows each task's state; amber means it needs you.
- Brief and Plan: the brief, its "done when" list, and one editable plan.
- Build: the take driven by the domain, with its live terminal line, Stop and the message box.
- Check: problems first, from Bezl's own build, tests and lint in the worktree.
- Review: the read-only reviewer's verdict. Worker questions and capability requests are the approvals; they wait on you in this stage and on the task list.
- Ship and history: the pull request with how the task got here, and the evidence: the event timeline, terminal snapshots and each worker's changes.

Pass mark: a real task finishes with a writer and a read-only reviewer, the operator answers one approval in the app, and the evidence screen shows every event and snapshot for the task.

### M6. Crew protocol in Bezl

Only if M1 passes. What: the [Crew protocol](crew-protocol.md) moves from the harness into Bezl's core.

- Crew files: roles bound to agent CLIs and localhost model endpoints.
- Small briefs, typed answers, checks run by Bezl, and loop stops.
- Code Facts: file outlines, references and symbol diffs, so briefs point at code instead of pasting it. Whether they come from the home-grown module in the Crew protocol or from infigraph is an open decision there.
- A local model lane through Ollama for summaries, sorting and candidate findings that a reviewer or a test confirms. The same lane drafts Explore's sketches as structured wireframes that Bezl draws itself.
- In the journey: several takes per task, a model menu on each take, and handover to the next model before a usage limit stops a task.

Pass mark: the five M1 tasks, run inside Bezl, match or beat the harness results on every threshold, and `spikes/04-local-worker-gpt-oss` and `spikes/05-crew-protocol` are deleted with their findings moved to `docs/spikes/`.

### M7. Preview canvas

After the MVP. What: the baseline for interactive previews, described in the [product vision](vision.md#the-preview-canvas).

- A preview runner per worktree, started from a run command the operator confirms, reloaded after every step and stopped when the task ends.
- The canvas: every take as an artboard on one board you can pan and zoom, at wide and narrow sizes.
- Five ways to work: Use, Point (an element and an instruction, sent with its source file and line), Draw (a region and an instruction), Record, and Compare against `main`.
- Recordings stored as events, annotated with expectations at any step, replayed on every take, and saved as tests that Bezl's check runner runs after each step.
- Accessibility and visual checks at both sizes, shown as evidence on Check. Annotations anchored to elements, not pixels.

Pass mark: a UI task's takes appear as artboards within 30 seconds of a step finishing; a pointed change and a drawn change each land in the right file; a recorded four-step flow replays on two takes and catches a seeded focus bug in one of them, then runs as a saved test; and a seeded contrast failure shows on Check with its evidence.

Later, each as its own small milestone once the baseline holds: app states (empty, many, loading, error) side by side, live design-token tweaks, device and theme presets, shared annotations, and recordings as video.

### M8. Explore with several models

After M6 and M7. What: Explore with sketches from several providers.

- Sketches from more than one provider, blending keepers into new directions, and the direction board in every brief.
- Two new checks: "Matches its direction", and "Design system", which flags a take that adds a component instead of reusing one.

Pass mark: on five UI tasks, building from a chosen direction needs fewer review rounds than building straight from the brief.

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

When a milestone is checked, add a new entry to `progress.json` with the same `subject`: the date, the result (`pass`, `partial` or `fail`), what was measured and the evidence path at the commit. Entries already on `main` are never edited; the latest entry for a subject is its current state. Spikes add their own `experiment` entries the same way. The portfolio site builds its project page from this file.
