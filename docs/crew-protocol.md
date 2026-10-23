# Crew protocol

How several models work on one task without stepping on each other, wasting tokens or looping. Status: designed and built as a test harness in `spikes/05-crew-protocol`. It moves into Bezl only if the crew test (milestone M1 in the [roadmap](roadmap.md)) passes.

## The rule that makes it safe

Agents propose. Bezl decides.

Agents never share a conversation and never hand each other work. Every step reads from one task record that Bezl owns and writes back to it. Multi-agent systems most often fail by agents misreading each other and not knowing when to stop ([MAST](https://arxiv.org/abs/2503.13657)), and Bezl's own early sessions hit the same problems: a late cancel opened an unwanted PR, three agent reports were out of date, and one session moved another's checkout.

## A task, step by step

1. **Task record.** Bezl holds the goal, the commands that prove it is done, the plan, who may write, the open findings and the remaining budget.
2. **Brief.** Each subtask runs in a fresh agent process with a short brief: the subtask, the files it may change, the current commit, the latest check results, open findings for it, and pointers to the code. No chat history.
3. **Typed answer.** The agent replies with JSON that matches a schema Bezl defines. Every finding cites a file and line, or a command and its exit code.
4. **Bezl checks.** Bezl computes the diff and runs the checks itself. It never accepts "tests pass" from an agent, and it rejects answers about an old commit.
5. **Review.** An optional pre-reviewer proposes candidate findings. The reviewer, which cannot write, confirms or rejects them and adds its own. Only confirmed findings go back to the writer, capped in number and length.
6. **Done or loop.** The task is green when checks pass and the reviewer approves. Otherwise the next round starts with the findings.

## When it stops

| Stop | Rule |
|---|---|
| Round cap | `max_rounds`, default 3 |
| Step cap | `max_steps` model calls, default 8 |
| No change | the writer's diff is the same as last round |
| Repeated finding | the same file and finding come back after a fix attempt |
| Blocked | the writer asks the operator a question |
| Error | a model fails and no fallback is left |

Every stop goes to the operator with the reason.

## Crew files

A crew file binds roles to models. Bezl never holds a key: agent CLIs keep their own sign-in, and model endpoints are on localhost, such as Ollama for local models or Ollama's cloud models after `ollama signin`.

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
```

Bezl refuses a crew that breaks these rules:

- The writer and any fallback must be an agent CLI, because only those have tools.
- The reviewer must come from a different provider than the writer and every fallback, since a fallback becomes the writer.
- A model endpoint must be on this machine (localhost, 127.x or [::1]) unless `[policy] allow_remote_endpoints = true`.
- A pre-reviewer needs a reviewer to confirm its findings.
- A model marked `trains_on_data` is refused unless `[policy] allow_training_data = true`.

Before any task, a preflight proves every binding answers: `codex login status`, a one-line Claude canary, and that each Ollama model is pulled. Without it, a failing local model shows only a generic stream error (spike 4).

## Ways to combine models

| Pattern | What it does | In the harness |
|---|---|---|
| Pair | A writer and a reviewer from different providers | Yes |
| Propose and confirm | A cheap model flags issues; a reviewer or a test confirms them | Yes |
| Fallback | When a model fails or runs out of quota, the next one takes over | Yes, for the writer |
| Cascade | A cheap model goes first; work moves to a paid model when checks fail | Not yet |
| Prepare | A cheap model summarizes logs before a paid model reads them | Not yet |

Default roles, which the operator can change per task:

- **Writer:** Claude Code.
- **Reviewer:** Codex, the only provider proven to be blocked from writing (spike 3).
- **Pre-reviewer and summaries:** a local model.

After about 30 real tasks, Bezl should suggest roles from its own recorded results instead.

## Keeping context small

A fresh Codex call costs about 23,000 input tokens before it does anything, about half of it cached. So:

- One step is one subtask driven to green, not one action.
- The same agent resumes while its role and subtask stay the same, and starts fresh when they change.
- Workers run with a minimal config instead of the operator's global instructions and tools.
- Briefs put fixed parts first and changing parts last, so the provider's cache hits.
- Briefs carry file, line and symbol pointers; reviewers get the diff, not the repository.

## Code Facts

Pointers need accurate code lookups. Bezl builds its own small module rather than bundling a code-search tool:

| Job | Part |
|---|---|
| Outlines and symbol diffs | `tree-sitter` |
| References, callers, impact | SCIP indexes from `scip-typescript`, `rust-analyzer`, `scip-go` and `scip-python`, read into SQLite |
| Lookups during a step | Language servers |
| Text search | `grep-searcher` |

All are MIT or Apache-2.0. On LiveLeague, Go indexed in 9.6 seconds and TypeScript in 3.4 seconds once dependencies were installed. Indexes run per package config, since a single root config misses monorepo packages, and nothing is written into the worktree.

Proposed in the [product vision](vision.md#context-you-can-read): use infigraph for these jobs instead of building the module. It already covers outlines (`skeleton`), callers and impact, changed symbols against a base (`detect-changes`), SCIP import and text search. On bezl's own branch, its raw output still listed local variables and markdown headings as changed symbols, and a TypeScript caller lookup came back empty, so Bezl would need to filter its output, reindex each worktree after every step, and import SCIP indexes. This is an open decision below, not a change of plan.

## Local models

Spike 4 ran `gpt-oss:120b` on a 96 GB M2 Max. Through Codex it never answered: Codex's own prompt pushed the context past GPU memory. Called directly through Ollama's API with 2,758 prompt tokens it answered in 113.5 seconds, but missed the real defect and made two false findings. Local models are therefore used where their output is checked: summaries, sorting, drafts and candidate findings.

## Open decisions

- Whether Bezl may relay typed, logged findings between providers. The test needs it; the README rule forbids it today.
- Whether workers run with an isolated config.
- The third provider.
- Whether to add OpenCode or Aider as runners for free cloud models.
- Whether Code Facts uses infigraph instead of the module above, after a licence and packaging check.
