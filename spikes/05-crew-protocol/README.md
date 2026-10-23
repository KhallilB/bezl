# Spike 5: crew protocol test harness

Status: harness built and tested with fake runners. Not yet run against real models. The crew test it serves is M1 in the [roadmap](../../docs/roadmap.md#m1-crew-test), whose design supersedes the five-task thresholds below.

Question this harness answers: do several models coordinated by Bezl's rules finish real coding tasks better than one agent alone? A crew file says which model plays which role; the harness runs every task under that crew and under a one-agent baseline, then scores both.

## How a task runs

1. The harness checks out the task's base commit in a throwaway worktree. The user's checkout is never touched.
2. The **writer** (Codex or Claude Code, with tools) edits the worktree from a short brief: goal, allowed paths, the checks, and any open findings.
3. The harness computes the diff and runs the task's checks itself. It never trusts an agent's "tests pass".
4. An optional **pre-reviewer** (any binding, including a local Ollama model) proposes candidate findings.
5. The **reviewer** (read-only) sees the diff, the check results and the candidates. Only candidates it confirms reach the writer.
6. The task is green when checks pass and the reviewer approves. Otherwise the findings go back to the writer for the next round.

It stops early when:

| Stop | Rule |
|---|---|
| Round cap | `limits.max_rounds`, default 3 |
| Step cap | `limits.max_steps` model calls, default 8 |
| No change | the writer's diff is identical to the previous round's |
| Repeated finding | a finding with the same file and normalised wording comes back after a fix attempt |
| Blocked | the writer answers `blocked` |
| Error | a runner fails and no fallback binding is left |

Findings sent to a writer are typed and capped: at most `max_findings`, each clipped to `max_finding_chars`.

## Crew files

```toml
[bindings.claude]
runner = "claude-code"          # codex | claude-code | ollama
[bindings.codex]
runner = "codex"
[bindings.local]
runner = "ollama"               # loopback endpoint, no key
model = "gpt-oss:120b"
context = 8192

[roles]
writer = "claude"               # must be an agent CLI
reviewer = "codex"              # best from a different provider; same one loads as self-review
pre_reviewer = "local"          # needs a reviewer to confirm it
```

`trains_on_data = true` on a binding is refused unless `[policy] allow_training_data = true`. An endpoint off this machine is refused unless `[policy] allow_remote_endpoints = true`. `fallback = [...]` lists writer replacements, each an agent CLI. A reviewer from the writer's provider, or a fallback from the reviewer's provider, still loads, listed as a degradation; a handover that leaves one provider writing and reviewing records a `degraded` event. The pattern is derived: `single` (writer only), `pair`, or `propose-confirm`. See `crew.example.toml` and `crew.baseline.toml`.

## Running

```bash
bun install
bun test
bun src/cli.ts run --crew crew.baseline.toml --tasks tasks.toml --out runs/baseline
bun src/cli.ts run --crew crew.example.toml  --tasks tasks.toml --out runs/crew
bun src/cli.ts labels --run runs/crew          # mark each finding "real" or "false"
bun src/cli.ts score --crew-run runs/crew --baseline-run runs/baseline --labels runs/crew/labels.json
```

`run` refuses an invalid crew (exit 2), then preflights every binding before any task (exit 3): `codex login status`, a one-line Claude canary, and that each Ollama model is pulled. Each task writes `<id>.json` and `<id>.events.jsonl`; the run writes `outcomes.json`.

## Original pass thresholds (superseded)

Set on 2026-10-22, before any real run. M1's two-phase design replaces them; `score` still computes them.

| Check | Pass |
|---|---|
| green | at least 80% of tasks green, so 4 of 5 |
| no caps or loops | no task stopped by a cap or a loop |
| tokens | crew input plus output tokens at most twice the baseline |
| real defect | at least one finding that reached a writer is labelled real |

`score` also reports the pre-reviewer's candidates, how many the reviewer confirmed, and how many were labelled real or false. Tasks reviewed by the writer's own provider are listed apart: they never count toward the green, token or real-defect thresholds, and a task lost to one counts against the green threshold.

## Verified

- `bun test` passes. It covers crew validation, the three runners' argument builders and parsers, the protocol loop against a real temporary git repo with fake runners, scoring, task loading, run-all and preflight.
- The Codex parser is tested against a real `codex exec --json` transcript from spike 4.
- `bun run typecheck`: clean.
- Real preflight on this machine with `crew.example.toml`: Codex and the local Ollama model passed. Claude failed with `OAuth access token has been revoked`, so `run` stopped before any task.
- A dry run of `labels` and `score` on five fake tasks wrote one label per finding and scored every threshold.

## Not done before the real run

- **Build the M1 corpus and tasks.** Phase 1 needs 30 diffs with seeded defects and clean controls; Phase 2 needs real tasks with hidden tests. `tasks.example.toml` shows the task format.
- **`claude login`.** The Claude runner's parser is tested against a hand-written sample only; capture a real `claude -p --output-format json --json-schema` transcript once signed in.
- **Worker isolation.** Decided: workers run isolated. Not built yet: today they load the user's global `CLAUDE.md`, `AGENTS.md`, hooks and MCP servers, which inflates every context and can block tools.
- **The handoff rules.** Review only after checks pass, verified evidence, disputes, and sending only `blocker` and `major` findings back. See the [Crew protocol](../../docs/crew-protocol.md#what-is-built-today).
- **More runners.** OpenCode, Aider and Antigravity CLI are not supported yet; the crew loader rejects them.
