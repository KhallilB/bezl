# Product vision: the task journey

How the app is shaped around one task, from brief to pull request. The [north star](north-star.md) says what Bezl is for; this page says what using it looks like. The [roadmap](roadmap.md) says when each part arrives.

The interactive sketch is in [`sketches/journey`](sketches/journey/README.md). It runs on sample data and is not wired to the domain.

## Why use Bezl instead of Claude Code or Codex alone

1. **Bezl checks the work itself.** An agent says "tests pass". Bezl runs the checks in the worktree and believes only the result.
2. **Bezl shows what nothing tests.** It joins the diff, the code's symbols and coverage, and lists the changed functions no test runs. It says plainly when it cannot tell (E1).
3. **A second opinion, from another company's model when you have two.** Every agent's built-in review comes from the vendor that wrote the code ([research](research/agent-ui-baseline.md)). Bezl pairs a writer with a reviewer that cannot write. With one provider, a fresh read-only session from the same provider reviews, labelled as self-review. Whether a second reviewer really helps is measured in M1, not assumed.
4. **The task is not tied to one model.** You choose who writes and who reviews. When a model fails or runs out of quota, the next one takes over from the same task record. A chat ends with its session; a Bezl task does not.
5. **One place, one record.** Questions from several tools land in one list. What was asked, who did what, what passed and what you decided are kept in `.git/bezl/`, on your machine.

Reasons 4 and 5 come from building Bezl itself: work stalled when one tool hit its usage limit, and context was lost when a long session was compacted.

## The one job

Get a change you can trust, spending your attention only where it is needed. Every task screen answers five questions:

- What did I ask for?
- Where does it stand?
- What needs me?
- What changed, and what does nothing test?
- Who is working on it, on which model?

## The journey

A task moves through seven stages: **Brief, Explore, Plan, Build, Check, Review, Ship**. The stage strip at the top of the task is the app's spine. Each stage shows a status light, and you click a stage to see it. Explore is a later bet (M8, frozen), so until then a task goes straight from Brief to Plan.

| Stage | What it shows | What you can do |
|---|---|---|
| Brief | Your words, the "done when" list (each item says who checks it), and what the code map found | Edit the brief; answer what Bezl asks |
| Explore (later) | Sketches of a few design directions, built from the project's own components | Keep parts of a sketch, drop directions, build one as a take |
| Plan | One plan per take, with steps lighting up as they finish | Edit a plan; the writer adjusts from its next step |
| Build | The take running live: its terminal line, and later its preview | Steer the writer, stop it, and later point, draw and record on the preview |
| Check | Problems first: failing checks, and the changed code no test runs | Send a problem to the writer |
| Review | The reviewer's verdict and findings | Keep the take, send findings back, or decide a disputed finding |
| Ship | The pull request beside the result, with how it got here | Open it |

Questions from a worker, and requests for more access, are **needs you** items. They wait on the task list and inside the stage where they came up.

![Brief](sketches/journey/screens/01-brief.jpg)

### Setting the task up to succeed

Most agent tools start writing code from the first sentence. Bezl puts a cheap step first, because the expensive mistake is building the wrong thing well.

- **A brief that is ready.** A new task's brief is checked as you type against five things: what you want, who it is for, how you will know it is done, what to avoid or reuse, and a reference. Each missing item says why it matters and offers a one-click addition. Constraints come from the code, as in "Bezl found EmptyState in the code". You can always start anyway.
- **Explore, later.** Before code, a few models sketch directions as wireframes that Bezl draws itself, and you keep the parts you like. This is frozen until the crew test shows a design step helps (M8).

![Explore](sketches/journey/screens/02-explore.jpg)

### The preview canvas

The canvas turns Build into a place where you show what you mean on the running app. It arrives in three steps.

**M7a, recorded flows as evidence.** Each take runs from its own worktree.

- **Record (R):** use the app while Bezl captures each click and entry as steps.
- Annotate any step ("The name field should be focused"), and each note becomes an expectation.
- "Save as a test" adds the flow to Bezl's checks, so it runs after every step.
- Accessibility and contrast checks run at wide and narrow sizes and show on Check.

**M7b, steering by showing.**

- **Point (P):** click an element and say what to change. The writer gets the element's source file and line.
- **Draw (D):** drag a box around an area and describe it.
- Marks stay on their element when the preview is resized.

**M7c, the board.**

- Every take is an artboard on one board you can pan and zoom.
- **Compare** puts a before/after slider against `main` on each one.
- "Replay on all takes" runs a recorded flow on every artboard and marks each step per take. In the sketch, take A fails step 1 and take B passes, and the failure goes to take A's writer with the recording attached.
- **Use (U)** is always on: click and type in the running app.

![Pointing on the canvas](sketches/journey/screens/03-canvas-point.jpg)
![A recorded flow replayed on two takes](sketches/journey/screens/04-canvas-record-replay.jpg)

### Check, Review and Ship

![Check](sketches/journey/screens/05-check.jpg)
![Review](sketches/journey/screens/06-review.jpg)
![Ship](sketches/journey/screens/07-ship.jpg)

## Calm by default

Earlier drafts crowded every screen with side panels and footnotes. These rules keep the journey readable:

1. One focal thing per stage: the work on Build, Review and Ship, the problems on Check, your words on Brief.
2. One sentence of status under the stage strip. Help lives in tooltips, not footnotes.
3. No side panels. A take's model sits in its header, and its activity is one line under it.
4. Controls appear where you use them, on hover or focus, and stay reachable from the keyboard.
5. Show problems, not passes.
6. The message box appears only on Build, where you steer.
7. Freed space goes to the work at full size, never to new panels.
8. Colour stays scarce: teal on what is working, amber on what waits for you, red on a failure. The product being built keeps its own colours.

A stage that needs more than a short paragraph or three boxes to explain itself should move something one level down.

## Look and feel

A near-black canvas with grain and a faint light from above, rounded surfaces with a lit top edge, and one accent: teal.

State colours follow one rule: one hue per meaning, the same hue in light and dark. Working is teal and needs-you is amber. Failed is red and is shown, never glowing. Passed is green and quiet. Colour always comes with a word and an icon. The values, and the two kbui tokens they wait on, are in [UI styling](ui-styling.md#state-colours).

The sketch hand-copies part of the app theme and points the accent at teal itself. The app theme cannot do that, by design, so the real app waits on kbui's button colour tokens.

## Models and roles

You bind each role to a model. Bezl refuses a crew that cannot work and labels one that is weaker; the rules are in the [Crew protocol](crew-protocol.md#crew-files).

| Role | Default | Rule |
|---|---|---|
| Writes | Claude Code | Must be an agent CLI, because only those have tools |
| Reviews | Codex | Should come from a different provider than the writer; one provider still works, labelled self-review. Must be proven read-only (Codex is today; Claude Code is checked in M3) |
| Sorts first | A local model through Ollama | Its candidate findings count only once the reviewer confirms them with its own evidence |
| Takes over | Codex | Used when a model fails or runs out of quota |

The defaults are a starting point. M1 tests both directions, and the one that wins becomes the default.

A take's model is a menu in its header. A choice that breaks a rule is greyed out with the reason. Gemini CLI is not offered: Google stopped serving it on personal accounts on 18 June 2026. The third provider is open (M3).

## Context you can read

The code map turns a change into a few sentences: what changed, who else calls it, and which tests run it. It is built from swappable boundary sources: infigraph first, SCIP for TypeScript, and tree-sitter as the fallback. Each source reports what it could not resolve. E1 uses the same sources, so the evidence on Check and the pointers in every brief agree.

## In your control

What Claude Code and Codex already let you do, extended across models:

| You can | How | Arrives in |
|---|---|---|
| Steer while a model works, and stop it | The message box on Build, and Stop | M5 |
| Choose who writes and reviews | The writer and reviewer menus on a new task | M5 |
| Answer a question or grant access | The needs-you items on the task list and in the stage | M5 |
| Switch a take's model, or hand over | The model menu on each take | M6 |
| Check a flow after every step | Record, add an expectation, save as a test | M7a |
| Say exactly what to change | Point at an element, or draw around an area | M7b |
| Watch usage limits | Each provider's usage in the task list's header, "unknown" where a CLI reports nothing | M3 data, shown from M5 |
| Choose when to be asked | One "Ask me before" setting, translated into each CLI's flags | Not scheduled |
| Go back to any step | Rewind to the snapshot Bezl takes after every step | Not scheduled |

## How the journey maps onto the milestones

| Stage | First real in | What you get then | Grows in |
|---|---|---|---|
| Task list | M5 (data from M2) | Tasks with a status light; amber means it needs you | M6: usage per provider |
| Brief | M5 | Your words, the done-when list, the readiness check | M6: "Found in the code" from the code map |
| Plan | M5 | One editable plan | M6: one plan per take |
| Build | M5 | One take: live terminal line, Stop, the message box | M6: more takes and handover. M7a to M7c: the canvas |
| Check | M5 | Problems first, from Bezl's own checks and E1's evidence | M7a: recorded flows and accessibility checks |
| Review | M5 | The reviewer's verdict; keep or send back | M6: findings to the writer automatically, if M1 passes |
| Ship | M5 | The pull request with how it got here | M7c: the kept take's preview |
| Explore | M8, frozen | Sketches before code | |

What each milestone means for the UI:

- **M0.** kbui 0.4.0 and the app theme carry into the journey. The interim Task screen is replaced in M5.
- **E1.** No screen yet. Its result appears on Check in M5.
- **M1.** Decides how much is automatic. If the crew test passes, Review sends verified findings to the writer. If it fails, findings come to you and you decide what reaches the writer.
- **M2.** Every stage is a reading of the task's event log. Each take is a worktree with its own writer lease.
- **M3.** Fills the writer and reviewer menus with what passed preflight, and proves which reviewers are read-only.
- **M4.** The live line under each take, its full terminal, and the input the message box writes into.
- **M5.** The journey with one take, end to end.
- **M6.** Several takes, model switching, handover, the local model lane, and the code map in every brief.
- **M7a to M7c.** The preview canvas, in the three steps above.

After those, only if there is demand: suggested crews from your own recorded results, cheap-first cascades with cost per task, tasks across several repositories, and project memory offered to the next task that touches the same code.

## Still open

- **The third provider** (M3).
- **Usage limits.** Preflight has to establish what each CLI reports (M3).
- **Element-to-source mapping** for Point and Draw (M7b). In the sketch, marks are pinned to pixels and stay put when a take is switched to Narrow.

Settled, and recorded in the [Crew protocol](crew-protocol.md):

- What may pass between agents: the handoff rules.
- Isolated worker configs: workers run isolated.
- Where code facts come from: the swappable boundary sources.
