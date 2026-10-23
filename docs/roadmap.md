# Roadmap

The milestones that take Bezl from a stack to the [north star](north-star.md): any agent writes the change, Bezl measures it, you decide.

The order follows one bet. Evidence comes first, because it is the part nobody else has. Orchestration stays small until the evidence earns its keep. The crew runs as an experiment beside the main line and never blocks it.

## How to read a milestone

Each milestone has the same parts:

- **Goal:** one sentence on what it proves or delivers.
- **Builds:** what gets made.
- **Demo:** what you can show someone in a few minutes once it is done, on a real repository, not sample data.
- **Pass mark:** the measured threshold, written before the work starts. It also sits in `progress.json` as a `not-run` entry until the milestone is checked.
- **Done when:** the milestone's own checklist, on top of the shared Definition of Done below.
- **Depends on:** the milestones that must pass first.

### Definition of Done, for every milestone

A milestone is done only when all of these are true:

1. **The pass mark is measured, not claimed.** A new `progress.json` entry records the result, the numbers and the evidence at a commit. An agent's report is never evidence.
2. **The demo runs.** Its recording, or the terminal log of a command-line demo, is saved and linked from the entry.
3. **The checks pass locally at that commit.** That means `bun run check`, `cargo test` for Rust work, and `bun test` for harness work. CI is run by hand until v1, the MVP release.
4. **Behaviour was built test-first.** Each behaviour change has a test that failed before the change.
5. **Absorbed spikes are gone.** Each spike the milestone absorbs is deleted, and its `RESULT.md` moves to `docs/spikes/`.
6. **The docs match.** Docs the milestone changes are updated in the same pull request, including this page's status table.
7. **Known limits are written down.** Anything that is degraded, skipped or unmeasured is listed in the entry. Nothing is hidden behind a pass.

## Status

| | Milestone | Status | Depends on |
|---|---|---|---|
| M0 | Stack and UI foundation | Done | |
| E1 | Evidence engine: `bezl verify` | Next | M0 |
| M1 | Crew test | Runs beside E1; blocked on Claude sign-in and the review corpus | M0; Phase 1's evidence arms need E1 |
| M2 | Domain core | Not started | E1 |
| M3 | Providers and preflight | Not started | M0 |
| M4 | Live terminals | Spiked | M0 |
| M5 | First real task, end to end | Not started | M2, M3, M4, E1 |
| M6 | Crew in Bezl | Not started; half of it depends on M1 | M5, E1 passed, M1 |
| M7a | Recorded flows as evidence | Not started | M5, E1 passed |
| M7b | Point and Draw | Not started | M7a |
| M7c | The multi-take canvas | Not started | M6, M7b |
| M8 | Explore with several models | Frozen | M1, M7c |

The MVP, released as v1, is M0, E1, M2, M3, M4 and M5: a real task, written by one agent, reviewed by a read-only second session, checked and measured by Bezl, with every step on the record. M1 runs beside it and does not gate it. M6 to M8 come after it.

## M0. Stack and UI foundation

**Status:** done on 2026-10-23 (entry `2026-10-23-m0-foundation`).

**Goal:** prove the stack and give the app its look.

**Builds:** three stack spikes, and kbui 0.4.0 with the app theme, shown on an interim Task screen with sample data.

**Demo:** `bun tauri dev` opens the Task screen in its idle, running and blocked states, in light and dark.

**Pass mark:** the three spikes have results, and the kbui adoption and app theme in bezl #1 and #3 are merged with their checks passing.

**What it left open:** the Claude reviewer probe moved to M3. Spike 1's burst-memory line moved to M4.

## E1. Evidence engine: `bezl verify`

**Goal:** test the moat. Show that Bezl's evidence catches real problems in agent work that the agent called done.

**Builds:**

- `bezl verify <branch>`, a command-line tool that works on any branch, with or without the app.
- The join of three things: changed lines from the diff, symbol boundaries, and coverage blocks. The diff and coverage parsers are already ported (#15) from loupe, the earlier coverage prototype.
- Swappable boundary sources: infigraph first, SCIP for TypeScript, tree-sitter as the fallback. Each one reports what it could not resolve.
- Four buckets: every changed line is covered, uncovered, unknown or excluded, exactly one of them, and the report groups the lines by symbol. Each run lists its degradations, such as "no coverage for Rust" or "symbol not resolved".
- A result bound to the commit and a hash of uncommitted changes, so it never answers about an old state.
- Output as a structured result, never a failing exit code. Whether the result blocks a merge is your policy.

**Demo:** run `bezl verify` on a real agent branch in a Go repository and in kbui (TypeScript). It prints the changed symbols that no test runs, and what it could not measure.

**Pass mark:**

- On 10 real agent branches, at least 3 branches have a real problem the agent called done, and no branch has more than 1 false alarm.
- A real problem is a reported symbol that the labeller judges needs a test or hides a defect. A false alarm is a reported symbol that a test does run, or that needs no test.
- Reported symbols are labelled blind: the labeller does not know which branch or tool produced them.
- The four buckets add up to the changed lines on a Go repository and a TypeScript repository.
- Every run lists its degradations.

**Done when:** the labelling rule is committed before the first label. The 10 branches and their labels are saved with the evidence. The work is time-boxed to two weeks.

**If it fails:** evidence is dropped as the moat. M5 still ships, as a personal orchestrator, and M6 to M8 pause until the roadmap is revisited (owner decision, 2026-10-23).

**Depends on:** M0. It is built in TypeScript in the harness (`spikes/05-crew-protocol/src/evidence`), the one exception to the spike rule below (owner decision, 2026-10-23). Its code moves into Rust in M2.

## M1. Crew test

**Goal:** find out whether a second reviewer helps, and which direction to use (Claude Code writing and Codex reviewing, or the reverse).

**Builds:** the test, on the harness in `spikes/05-crew-protocol`. The protocol is fixed in place first:

- the handoff rules in the [Crew protocol](crew-protocol.md#handoff-rules);
- isolated workers and pinned model versions;
- self-review scored apart (#14);
- harness support for review-only runs, hidden tests, several arms per run, and paired 95% intervals in `score`.

**Phase 1, review only.**

- 30 diffs from bezl, kbui and one outside repository. 20 carry a seeded defect, such as an off-by-one, an inverted condition, a dropped null check or a missing `await`. 10 are clean, to count false alarms. A few reverted real bug fixes are added, because seeded bugs flatter recall.
- Reviewer arms, each in a fresh session, 3 repeats each: Claude Code, Codex and the local model. Each runs twice: with and without E1's evidence in its brief.
- Labels are blind.

**Phase 2, the full loop.**

- 10 to 12 real tasks, each with hidden tests the writer never sees.
- Both writer directions. Four arms for each direction:
  - the writer alone;
  - the writer alone, given the same token budget for retries;
  - the writer plus a same-provider reviewer;
  - the writer plus the other provider's reviewer.
- 3 repeats to start. The final count comes from Phase 1's variance.

**Demo:** `bun src/cli.ts score` on the Phase 2 runs prints each arm's hidden-test pass rate with its confidence interval, its tokens, and the self-review runs reported apart.

**Pass mark:**

- In at least one writer direction, the cross-provider reviewer arm beats both the matched-budget writer and the same-provider reviewer on hidden-test pass rate.
- The paired 95% interval for each difference sits above zero.
- That arm uses no more than twice the single writer's tokens.
- In Phase 1, verified findings have a precision of at least 0.5 against the blind labels.

The direction that passes becomes the default crew.

**Done when:** the corpus, the hidden tests and the pre-registered thresholds are committed before the first run. Spike 5 gets its `RESULT.md`.

**If it fails:** the crew stays out of Bezl. Review findings go to you, and you decide what reaches the writer. M6 keeps only its "always" half.

**Depends on:** M0. Phase 1's evidence arms need E1.

**Blocked on:** `claude login`, and building the Phase 1 corpus.

## M2. Domain core

**Goal:** the rules of a task, in Rust, with no UI or terminals attached.

**Builds:**

- A task owns its takes. Each take owns a worktree and one writer, with any number of reviewers and their capabilities. M5 uses one take.
- One writer per worktree, enforced by a lease.
- Every state change is an event, appended to a JSONL log with a schema version. The task's state is rebuilt by replaying the log.
- Records live in `.git/bezl/`, per clone and never tracked. Bezl writes nothing to tracked files except the agent's change. Export is an explicit command.
- E1's contracts as domain types: the four buckets, degradations, and results bound to a commit.

**Demo:** on a clone of bezl, a test run that:

1. creates a task;
2. tries a second writer on the same worktree, which is refused;
3. kills the process;
4. rebuilds the task from its log in `.git/bezl/`;
5. shows `git status` on that clone is still clean.

**Pass mark:**

- Tests cover the writer lease, every state transition, and rebuilding a task from its log.
- A second writer on the same worktree is refused.
- A property test shows the four buckets always add up to the changed lines.
- No test run writes a tracked file.

**Depends on:** E1, whose contracts it adopts.

## M3. Providers and preflight

**Goal:** Bezl knows which agent CLIs it can use and how far it can trust each one.

**Builds:**

- Each CLI is found and identified from its version output, not its file name. The `codex` on this machine's path turned out to be an unrelated static-site generator.
- Sign-in is checked: `codex login status`, plus a one-line canary for Claude Code, which has no status command.
- How each capability is enforced is recorded: blocked by a launch flag, or instruction only.
- The read-only probe runs for every provider Bezl offers, Claude Code included.
- Contract tests per CLI version, so a CLI update that changes its output fails a test instead of a task.
- What each CLI reports about usage limits. Where a CLI reports nothing, Bezl says "unknown".
- A decision on the third provider. Google stopped serving Gemini CLI on personal accounts on 18 June 2026. A 120B local model could not run as an agent on a 96 GB Mac (spike 4).

**Demo:** the Providers screen lists every installed CLI, with its version, sign-in state, read-only result and usage reporting. A fake `codex` on the path is rejected, and the screen shows what its version output says it is.

**Pass mark:**

- The Providers screen shows real preflight results for every installed CLI.
- The read-only probe has a result for every provider offered.
- The contract tests pass against the pinned CLI versions.
- `spikes/03-reviewer-readonly` is deleted.

**Done when:** the third-provider decision is recorded here and in the crew protocol.

**Depends on:** M0.

**Unlocks:** once Claude Code is proven read-only, a handover can swap roles, so the old writer becomes the reviewer instead of the run degrading to self-review.

## M4. Live terminals

**Goal:** real agent sessions stream into the app without losing bytes or memory.

**Builds:**

- A terminal port with backpressure, replacing the spike's PTY code.
- Input written into the worker's terminal, which M5's message box uses.
- Terminal snapshots in the task's record, through Ghostty's engine.

**Demo:** three agent sessions stream side by side for a minute of heavy output. Typing in one echoes without a visible lag. Its snapshot opens in the task's history.

**Pass mark:**

- Three panes stream 20 MB each with no lost bytes.
- The app's memory stays under 150 MB at rest and under 600 MB during bursts, with at most 1 MiB buffered per pane before the port pauses the agent.
- Typed input echoes within 100 ms, spike 1's line.
- Each pane's snapshot opens in the task's history and matches the screen.

**Done when:** spikes 1 and 2 are deleted. That means `spikes/01-pty-throughput`, `spikes/02-libghostty-vt`, `src-tauri/src/spike_pty.rs` with its commands in `src-tauri/src/lib.rs`, `src/spike/`, and the `src/spike/PtySpike` import in `src/App.tsx`.

**Depends on:** M0.

## M5. First real task, end to end

**Goal:** the whole loop in the app, on a real repository, with one take.

**Builds:** the task journey from the [product vision](vision.md), with one take:

- **Tasks:** create a task from a repository and branch. Its brief is checked for readiness. Choose the writer and reviewer from what passed preflight. Each task shows its state; amber means it needs you. The task list's header shows each provider's usage, or "unknown".
- **Brief and Plan:** the brief, its "done when" list, and one editable plan.
- **Build:** the take, driven by the domain, with its live terminal line, Stop, and the message box.
- **Check:** problems first. They come from Bezl's own build, tests and lint, and from E1's evidence: the changed symbols that no test runs.
- **Review:** the read-only reviewer's verdict. A same-provider review is labelled "Reviewed by the same provider that wrote it".
- **Needs you:** worker questions and capability requests wait on the task list and inside the stage where they came up.
- **Ship and history:** the pull request with how the task got here. The history shows the event timeline, terminal snapshots and each worker's changes.

**Demo:** take a small real change, such as a bug fix in bezl itself, from the brief to an open pull request. Answer one question along the way. Show Check pointing at an untested changed function.

**Pass mark:**

- A real task finishes with a writer and a read-only reviewer.
- You answer one question in the app.
- Check shows E1's evidence for the change.
- The task's history shows every event and snapshot.
- Your minutes on the task (writing the brief, answering questions, reading findings, deciding) are recorded, beside your minutes on a comparable change made with Claude Code or Codex alone. This is the north star's metric, measured for the first time.

**Depends on:** M2, M3, M4 and E1, plus a kbui release with the `attention` tone and button colour tokens ([UI styling](ui-styling.md#state-colours)).

## M6. Crew in Bezl

**Goal:** more than one model per task, in the app.

**Builds, always:**

- Several takes per task.
- A model menu on each take.
- Handover to the next model after a failure or an exhausted quota.
- The local model lane through Ollama, for summaries, sorting and candidate findings that a reviewer confirms with its own evidence.
- Briefs that point at code through the boundary sources instead of pasting it.

**Builds, only if M1 passes:**

- Verified findings go to the writer automatically.
- Propose-and-confirm with a pre-reviewer.

**Demo:** two takes of one task on different models. One hits its quota and hands over, and the history shows the handover. If M1 passed, a reviewer's verified finding reaches the writer and gets fixed without you relaying it.

**Pass mark:**

- If M1 passed: the M1 Phase 2 tasks, run inside Bezl, match or beat the harness results on every threshold.
- If it failed: three real tasks complete with a handover and a model switch, and every review finding reaches you.

**Done when:** spike 5 is deleted. Spike 4 is deleted when the local lane lands or is dropped, whichever comes first.

**Depends on:** M5, E1 passing, and M1 for the automatic half.

## M7a. Recorded flows as evidence

**Goal:** prove behaviour, not only coverage. A recorded flow with expectations becomes a check that runs on every step.

**Builds:**

- A preview runner per worktree. It starts from a run command you confirm, reloads after every step, and stops when the task ends.
- Record: Bezl captures each click and entry as steps. You add expectations at any step.
- Replay, then "Save as a test": the flow joins Bezl's checks. The saved test lives in `.git/bezl/`, and becomes a tracked file only if the writer adds it as part of the change.
- Accessibility and contrast checks at wide and narrow sizes, shown on Check.
- When the preview cannot start, Bezl says "could not run" instead of retrying silently.

**Demo:** record a four-step flow on a take, add "the name field should be focused", and save it as a test. A later step breaks focus, and Check shows the failing step with its recording.

**Pass mark:**

- A recorded four-step flow catches a seeded focus bug and runs as a saved test.
- A seeded contrast failure shows on Check with its evidence.
- A project with no working run command reports "could not run".

**Depends on:** M5, and E1 passing.

## M7b. Point and Draw

**Goal:** say exactly what to change by showing it on the running app.

**Builds:**

- A decision on how a rendered element maps to its source file and line (see [Still open](vision.md#still-open)).
- Point: click an element and say what to change. The writer gets the element's source file and line.
- Draw: drag a box around an area and describe it.
- Marks are anchored to elements, not pixels, so they survive a resize.

**Demo:** point at a button and ask for a new label. Then draw around a card and ask for more spacing. Each change lands in the right file.

**Pass mark:**

- A pointed change and a drawn change each land in the right file on a real project.
- A mark stays on its element when the preview switches from wide to narrow.

**Depends on:** M7a.

## M7c. The multi-take canvas

**Goal:** compare takes side by side on one board.

**Builds:**

- Every take as an artboard on one board you can pan and zoom.
- Compare against `main` with a before/after slider.
- Replay a recorded flow on every take.
- Ship shows the kept take's preview.

**Demo:** two takes of one UI task side by side. One recorded flow replays on both and marks which take fails which step.

**Pass mark:**

- A UI task's takes appear as artboards within 30 seconds of a step finishing.
- A recorded flow replays on two takes and catches a seeded bug in one of them.

**Later, each as its own small milestone once M7c holds:**

- app states (empty, many, loading, error) side by side;
- live design-token tweaks;
- device and theme presets;
- shared annotations;
- recordings as video.

**Depends on:** M6 for several takes, and M7b.

## M8. Explore with several models

**Status:** frozen. It stays frozen until a separate test shows that a design step before coding helps. M1 does not test this.

**Goal, if it thaws:** several models sketch design directions before any code is written, and building from a chosen direction needs fewer review rounds.

**Demo, if it thaws:** three models sketch directions for one real UI task in bezl. You keep parts of two, and a take builds from them.

**Pass mark, if it thaws:** on five UI tasks, building from a chosen direction needs fewer review rounds than building straight from the brief.

**Depends on:** M1 and M7c.

## Spikes

A spike answers one question, then goes away. Each one is absorbed by a milestone, and that milestone is not done until the spike is deleted.

| Spike | Lives in | Absorbed by | Deleted in |
|---|---|---|---|
| 1. Terminal output | `spikes/01-pty-throughput`, `src-tauri/src/spike_pty.rs`, `src/spike/` | The terminal port | M4 |
| 2. Terminal snapshots | `spikes/02-libghostty-vt` | Snapshots in the task's record | M4 |
| 3. Read-only reviewers | `spikes/03-reviewer-readonly` | Preflight's read-only probe | M3 |
| 4. Local 120B worker | `spikes/04-local-worker-gpt-oss` | The local model lane | M6, or sooner if the lane is dropped |
| 5. Crew harness | `spikes/05-crew-protocol` | The crew in Bezl | M6, or after M1 if the crew test fails; E1's code moves to Rust first |

Rules:

- A spike lands on `main` as a `RESULT.md` plus the least code needed to rerun it. Spike 5 is still running, so it has a README instead, and gets its `RESULT.md` when M1 runs.
- When a spike is deleted, its `RESULT.md` moves to `docs/spikes/`, and links to it are updated in the same change.
- E1 is built inside spike 5 until M2 moves it to Rust. That is the one exception to "the least code needed to rerun it".
- No app code may import from a spike. The two exceptions, the spike 1 commands in `src-tauri/src/lib.rs` and the `PtySpike` import in `src/App.tsx`, go in M4.

## Recording progress

`progress.json` is append-only. Entries on `main` are never edited. When a milestone is checked, or its pass mark changes, add a new entry with the same `subject`, today's date, the result (`pass`, `partial`, `fail` or `not-run`), what was measured, and the evidence path at a commit. The newest entry for a subject is the current one. The portfolio site builds Bezl's project page from this file.
