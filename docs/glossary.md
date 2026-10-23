# Glossary

One word for each idea, used the same way in every doc. Older names are listed so old pull requests still read clearly.

| Term | Means | Not to be confused with |
|---|---|---|
| **Task** | One piece of work: a brief, its takes, its record | |
| **Take** | One attempt at a task, in its own worktree, with one writer | |
| **Writer** | The one agent allowed to change a take's worktree. Older docs say "primary" | |
| **Reviewer** | An agent that reads the diff and cannot write | |
| **Pre-reviewer** | A cheap model, usually local, that proposes candidate findings for the reviewer to confirm. The sketch calls it "Sorts first" | |
| **Handover** | A fallback model taking over as writer after a failure or an exhausted quota. The crew file calls the model a `fallback`; the sketch says "Takes over" | |
| **Self-review** | A review by the writer's own provider, in a fresh read-only session. Allowed, labelled, and scored apart in M1 | |
| **Degradation** | Something Bezl could not do, or did in a weaker way, stated in the result instead of hidden | An error, which stops the task |
| **Check** | A command Bezl runs itself in the worktree, such as tests or lint. Also the journey stage that shows the problems | An agent's claim that tests pass |
| **Evidence** | What Bezl measures about a change: check results, and which changed symbols no test runs | The record |
| **Record** | Everything that happened on a task, as an append-only event log in `.git/bezl/`. Shown in the History area, first called Evidence | Evidence |
| **Needs you** | A question or access request waiting on you. The area that holds them is Approvals. Older docs say "waiting" | A failure; and `blocked`, the writer's reply status and the interim screen's state name |
| **Finding** | A defect a reviewer reports, with a file, line, severity and evidence. "Verified" once Bezl has checked its evidence | |
| **Boundary source** | A tool that maps code to symbols, such as infigraph, SCIP or tree-sitter | |
| **Four buckets** | Every changed line is covered, uncovered, unknown or excluded, and the four always add up to the change | |
| **Preflight** | Bezl's check that each agent CLI is real, signed in, and enforces what it claims | |
| **Crew** | The roles of a task bound to models, written in a crew file | |
| **Pass mark** | A milestone's measured threshold, written before the work starts | Definition of Done, which also needs the demo, the checks and the docs |
| **Operator** | You, the person running Bezl | |
| **Step** | One subtask driven to green by one agent run. Recorded clicks are "flow steps"; `max_steps` counts model calls | |
| **v1** | The MVP release: M0, E1, M2, M3, M4 and M5 | |
| **Spike** | A time-boxed experiment that answers one question, then is deleted | |
