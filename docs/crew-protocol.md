# Crew protocol

How several models work on one task without stepping on each other, wasting tokens or looping. It is built as a test harness in `spikes/05-crew-protocol`. It moves into Bezl in M6, and its automatic parts only if the crew test (M1 in the [roadmap](roadmap.md)) passes.

## The rule that makes it safe

**Agents propose. Bezl decides.**

Agents never share a conversation and never hand each other work. Every step reads from one task record that Bezl owns, and writes back to it. Multi-agent systems most often fail when agents misread each other and do not know when to stop ([MAST](https://arxiv.org/abs/2503.13657)). Bezl's own early sessions hit the same problems: a late cancel opened an unwanted pull request, three agent reports were out of date, and one session moved another's checkout.

## Handoff rules

**Agents never read each other.** Bezl never passes one agent's conversation, reasoning or claims to another. Between agents it passes only what it produced or checked itself:

- the diff, computed from git;
- its own check results;
- findings in a fixed schema whose evidence it has verified.

| Case | Allowed? | Why |
|---|---|---|
| The reviewer reads the writer's diff | Yes | Bezl computes the diff from git. It is the code, not the agent's words |
| The reviewer's findings go to the writer | Yes, once verified | Findings follow a fixed schema and are capped, and Bezl checks their evidence |
| A pre-reviewer's candidates go to the reviewer | Yes | The reviewer must confirm each one with its own evidence |
| A new writer takes over after a failure or exhausted quota | Yes | It gets the task record and the worktree, never the old transcript |
| The writer's "tests pass", summary or reasoning | Never | Bezl runs the checks itself. The summary stays in the record for you |

### When each thing crosses

| From → to | When | What crosses |
|---|---|---|
| Bezl → writer | Task start, or a new round | The brief: goal, done-when commands, allowed paths, constraints and code pointers, plus failing checks and open findings by id |
| Writer → Bezl | The writer replies `done` or `blocked`, with a response to each finding | Status, a one-line summary kept in the record, and per-finding responses |
| Bezl → reviewer | The writer is done, the diff changed, and Bezl's checks pass; or after two failed rounds, so the reviewer can help | The brief, Bezl's check results, the diff within budget, and verified candidates |
| Reviewer → writer | The verdict is `request_changes`, with verified `blocker` or `major` findings | Findings by id |
| Bezl → you | The writer asks a question or disputes a finding, or a stop rule fires | The question, the finding with both sides' reasons, or the stop and its reason |

### Verified evidence

A finding reaches the writer only if Bezl can check it:

- its `file` is in the diff's changed files;
- its `line` exists in that file after the change;
- its `evidence` quotes text found in that file or in a failing check's output.

Anything else is dropped and recorded as "unverified". This blocks invented findings: two of the four findings from spike 4's local model were false.

### Disputes

For each finding, the writer either fixes it or disputes it with a one-sentence reason that cites code. A disputed finding is not sent back again. It becomes a needs-you decision that shows the reviewer's finding and the writer's reason side by side. This replaces looping.

### What is built today

| Rule | In the harness today | When it lands |
|---|---|---|
| Only Bezl-made artifacts cross | Yes. The reviewer gets the goal, Bezl's checks, candidates and the diff. The writer's summary never reaches it | |
| Findings capped in number and length | Yes: 10 per round, 500 characters per field | |
| Review only after checks pass | No. The harness reviews every round, even on a failing build | Before M1 runs |
| Verified evidence | No | Before M1 runs |
| Disputes | No | Before M1 runs |
| Only `blocker` and `major` go back automatically | No. Every finding goes back | Before M1 runs |
| Isolated workers | No. Workers load the operator's global instructions, hooks and MCP servers | Before M1 runs |

## A task, step by step

1. **Task record.** Bezl holds the goal, the commands that prove it is done, the plan, who may write, the open findings and the remaining budget.
2. **Brief.** Each subtask runs in a fresh agent process with a short brief: the subtask, the files it may change, the current commit, the latest check results, its open findings, and pointers to the code. No chat history.
3. **Typed answer.** The agent replies with JSON that matches a schema Bezl defines. Every finding cites a file and line, or a command and its exit code.
4. **Bezl checks.** Bezl computes the diff and runs the checks itself. It never accepts "tests pass" from an agent, and it rejects answers about an old commit.
5. **Review.** An optional pre-reviewer proposes candidate findings. The reviewer, which cannot write, confirms or rejects them and adds its own. Only verified findings go back to the writer.
6. **Done or another round.** The task is green when the checks pass and the reviewer approves. Otherwise the next round starts with the findings.

## When it stops

| Stop | Rule |
|---|---|
| Round cap | `limits.max_rounds`, default 3 |
| Step cap | `limits.max_steps` model calls, default 8 |
| No change | The writer's diff is the same as last round |
| Repeated finding | The same file and finding come back after a fix attempt |
| Blocked | The writer asks you a question |
| Error | A model fails and no fallback is left, or the reviewer fails |

Every stop comes to you with its reason.

## Crew files

A crew file binds roles to models. Bezl never holds a key. Agent CLIs keep their own sign-in. Model endpoints are on this machine, such as Ollama serving local models, or Ollama's cloud models after `ollama signin`.

```toml
[bindings.claude]
runner = "claude-code"
[bindings.codex]
runner = "codex"
[bindings.local]
runner = "ollama"
model = "gpt-oss:120b"
context = 8192

[roles]
writer = "claude"
reviewer = "codex"
pre_reviewer = "local"
fallback = ["codex"]
```

Bezl refuses a crew that cannot work:

- The writer and any fallback must be an agent CLI, because only those have tools.
- A model endpoint must be on this machine (`localhost`, `127.x` or `[::1]`) unless `[policy] allow_remote_endpoints = true`.
- A pre-reviewer needs a reviewer to confirm its findings.
- A model marked `trains_on_data` is refused unless `[policy] allow_training_data = true`.

Bezl loads a weaker crew and says so. Someone with one provider still gets a working crew:

- **Self-review.** The reviewer should come from a different provider than the writer. If it shares one, the crew loads with a degradation. The reviewer is still a fresh, read-only session that sees only the diff, Bezl's checks and the brief, never the writer's transcript.
- **Self-review after a handover.** If a fallback shares the reviewer's provider, the crew still loads, listed as a degradation. If that fallback takes over, Bezl records a `degraded` event and the task carries on.
- **Scored apart.** In M1, planned same-provider review is its own arm. A task in another arm that ends up reviewed by its writer's own provider, for example after a handover, counts as a failure for that arm. The harness's `score` reports such runs separately.

Once M3 proves a second provider read-only, a handover can swap roles instead: the old writer becomes the reviewer.

Before any task, a preflight proves every binding answers: `codex login status`, a one-line Claude canary, and a check that each Ollama model is pulled. Without it, a failing local model shows only a generic stream error (spike 4).

## Ways to combine models

| Pattern | What it does | In the harness |
|---|---|---|
| Pair | A writer and a reviewer, from different providers when you have two | Yes |
| Propose and confirm | A cheap model flags candidates; the reviewer confirms each with its own evidence | Yes |
| Fallback | When a model fails or runs out of quota, the next one takes over | Yes, for the writer |
| Cascade | A cheap model goes first; work moves to a paid model when checks fail | Not yet |
| Prepare | A cheap model summarizes logs before a paid model reads them | Not yet |

Default roles, which you can change per task:

- **Writer:** Claude Code.
- **Reviewer:** Codex, the only provider proven to be blocked from writing (spike 3).
- **Pre-reviewer and summaries:** a local model.

M1 tests both writer directions. The one that passes becomes the default.

## Keeping context small

Most of an agent call's context is the CLI's own prompt and the operator's global config, not Bezl's brief. In spike 4, a review through the Codex CLI took about 26,000 input tokens, and a trivial Codex call about 23,000. The same review prompt sent straight to a model's API was 2,758 tokens. So:

- Workers run isolated, without the operator's global instructions, hooks and MCP servers. This is the largest saving, and it makes runs comparable.
- One step is one subtask driven to green, not one action.
- The same agent resumes while its role and subtask stay the same, and starts fresh when they change.
- Briefs put fixed parts first and changing parts last, so the provider's cache can hit.
- **The diff budget:** the full diff up to 40,000 characters. Above that, the changed files and symbols, with full hunks only for files that have findings or that the reviewer asks for.
- **Check output:** the command, its exit code, and the last 40 lines of each failing command.
- **Findings:** at most 10 per round and 500 characters per field. `minor` findings collect for you instead of going back to the writer.

## Role prompts

These templates are what Bezl sends. Fixed parts come first.

Writer:

```text
You are the writer for task {id} in a git worktree. You may edit only: {allowed_paths}.
Goal: {goal}
Done when these commands pass (Bezl runs them; your own claims are not used):
{checks}
Code pointers: {pointers}
{failing checks: command, exit code, last 40 lines}
{open findings, each with id, file:line, severity, issue, evidence}
Rules:
- Change only what the goal and the findings need. Do not reformat unrelated code. Do not commit.
- For each finding, either fix it or dispute it with a one-sentence reason that cites code.
- If you cannot proceed without the operator, reply blocked with one question.
Reply only with JSON matching the schema: status (done | blocked), summary (one line), responses.
```

Reviewer:

```text
You are a read-only reviewer for task {id}. Do not edit, run or install anything.
Goal: {goal}
Bezl ran these checks on this diff: {command → exit code}
{candidate findings from a pre-reviewer, each with id}
Diff against the base commit:
{diff, or changed files and symbols}
Report only correctness, security and data-loss defects introduced by this diff, or goal requirements it does not meet.
For each finding give: file and line in the changed code; severity (blocker: wrong result, crash, data loss or
security; major: goal not met or an edge case breaks; minor: everything else); the issue in one sentence; and
evidence that quotes the line or names the failing command. No style, naming or refactoring advice. No findings
outside the diff. Confirm a candidate only if you can cite your own evidence for it.
Reply only with JSON: verdict (approve | request_changes), findings, confirmed_candidates (ids).
```

The pre-reviewer gets the reviewer prompt, plus "You propose candidates; a reviewer will verify each one; prefer fewer, concrete candidates", and returns no `confirmed_candidates`.

A writer taking over gets the writer prompt, plus "Another writer started this task. The worktree holds its changes; continue from them. Steps done: {steps from the record}."

## Code facts

Briefs point at code instead of pasting it, and E1 needs the same facts: symbol outlines, callers, and changed symbols against a base. They come from swappable boundary sources:

1. **infigraph** first. Its raw output needs filtering before use: on bezl's own branch, it listed local variables and markdown headings as changed symbols. Bezl keeps exported symbols only, and reindexes each worktree after every step.
2. **SCIP** indexes for TypeScript, from `scip-typescript`.
3. **tree-sitter** as the fallback, for outlines when nothing better resolves.

Each source reports what it could not resolve. That report becomes a degradation in the result, instead of a silent gap. Bezl writes nothing tracked into the worktree: infigraph keeps its index in `.infigraph/`, which Bezl adds to the worktree's `.git/info/exclude`.

## Local models

Spike 4 ran `gpt-oss:120b` on a 96 GB M2 Max:

- Through Codex, it never answered: Codex's own prompt pushed the context past GPU memory.
- Called directly through Ollama's API with 2,758 prompt tokens, it answered in 113.5 seconds. But it missed the real defect and made two false findings.

So local models are used only where their output is checked: summaries, sorting, drafts and candidate findings.

## Testing the crew

M1 in the [roadmap](roadmap.md#m1-crew-test) is the test. It reviews a seeded-defect corpus with blind labels first, then runs the full loop on real tasks with hidden tests, in both writer directions. The harness README's original five-task thresholds are superseded by it.

## Still open

- The third provider (M3).
- Whether to add OpenCode, Aider or Antigravity CLI as runners, for example for free cloud models.
