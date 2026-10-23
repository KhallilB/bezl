# North star

**Any agent writes the change. Bezl measures it. You decide.**

Every other doc answers to this page. A feature that does not move the metric below, or that crosses a non-goal, waits.

## Who it is for

One developer who already runs Claude Code or Codex on real repositories, often both, and merges what they produce. Today that is the person building Bezl.

## The problem

An agent says "done, tests pass", and you either believe it or re-read the whole diff. Neither scales. What you need to know is narrower: what did this change touch that nothing tests, did the checks really run on this commit, and did a second model find anything real? None of the agent tools answer that from evidence. Each one reviews its own work, in its own vendor's model, and reports in prose.

## The metric

**Your minutes per merged change whose checks pass on the merged commit, with Bezl's evidence on the record.**

- Minutes are yours: writing the brief, answering questions, reading findings, deciding. The agent's time and tokens are a cost, recorded separately.
- A change counts only once it is merged and Bezl's own checks pass on the merged commit. An agent's report never counts.
- M5 measures it for the first time, against a comparable change made with Claude Code or Codex alone.
- The metric goes down only if Bezl removes reading you would otherwise do. Adding a screen that you also have to read makes it worse.

## What makes it hard to copy

Orchestrating several agent CLIs is not a moat: as of October 2026, GitHub Agent HQ, Conductor and vibe-kanban already do it. What Bezl combines is:

1. **Intent.** Bezl owns the task, so it knows the goal, the "done when" checks and the allowed paths. A verifier with no task cannot tell a deliberate omission from a gap.
2. **Evidence.** Bezl joins the diff, symbol boundaries and coverage to say which changed symbols no test runs. Every changed line lands in exactly one bucket (covered, uncovered, unknown or excluded), and every run lists what it could not measure. The evidence is never a model's opinion.
3. **The loop.** Evidence goes back to a writer as typed findings, and a second provider can write the missing test. This is the crew, and it is still an experiment ([M1](roadmap.md)).

This is a hypothesis until E1 passes: on 10 real agent branches, at least 3 branches have a real problem the agent called done, no branch has more than 1 false alarm, and the labels are blind. Below that, evidence is dropped as the moat: Bezl ships M5 as a personal orchestrator, and M6 to M8 pause until the roadmap is revisited.

## Non-goals

- **A better single-agent console.** Claude Code and Codex already have one. Bezl does not compete on chat, terminals or agent management.
- **Hosted execution.** Bezl hosts nothing. Workers, worktrees and records stay on your machine; the agent CLIs call their vendors' models.
- **Holding keys.** Agent CLIs keep their own sign-in, and Bezl talks to GitHub through your `gh` session. Model endpoints are on this machine by default; a remote one needs `[policy] allow_remote_endpoints = true`.
- **Gating other people's CI.** The evidence is a result, not a failing exit code. Whether it blocks a merge is your policy, set per task.
- **Writing tracked files.** Bezl writes only the agent's change. Its own records live in `.git/bezl/`, per clone, with an explicit export.

## How the work is ordered

1. **E1, the evidence engine (`bezl verify`)** comes next, ahead of the domain core. It is a command-line tool, usable on any branch, time-boxed to two weeks as the test of the moat.
2. **The crew experiment (M1)** runs alongside it, on the same artifacts. Its result decides M6. It never blocks M2 to M5.
3. **Orchestration stays minimal** until E1 passes: one task, one take, the calm journey.
4. **The design canvas** splits three ways. Recorded flows and accessibility checks are behavioural evidence and come right after M5 (M7a). Point and Draw come later (M7b). The multi-take board comes after that (M7c), and its add-ons follow, each as its own small milestone. Explore (M8) is frozen until a separate test shows a design step helps.

The [roadmap](roadmap.md) gives each milestone its demo, pass mark and Definition of Done. The [glossary](glossary.md) fixes the words.
