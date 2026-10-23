# Spike 4: gpt-oss:120b as a local Codex worker

Date: 2026-10-22. Question: can a local model, run through the official Codex CLI (`codex exec --oss --local-provider ollama`), serve as Bezl's third worker now that consumer Gemini CLI has ended?

Verdict: **FAIL on this machine.** gpt-oss:120b never produced a response. The GPU ran out of memory on every request, at both 131k and 40k context. Cloud Codex passed the same review twice.

## Thresholds

Set before any run.

| Check | Pass | Fail means |
|---|---|---|
| Startup | Warm trivial prompt answers in 30 s or less. Cold load is recorded, no threshold. | Local worker unusable for interactive roles |
| Review | On the real kbui PR #7 diff, the findings name the scoped-override defect: per-side cut tokens resolve at `:root`, so a wrapper's `--kb-facet-cut` never reaches them. Output validates against `fixtures/review-schema.json`. Finishes within 10 minutes. | Local worker not trusted as a reviewer |
| Read-only | Write to `readonly/target.txt` refused under `--sandbox read-only`; file unchanged | Binding is `instruction-only` |
| Memory | Free memory stays at or above 10% and swap grows by 2 GB or less during the runs | Local worker cannot share the machine with Bezl and other agents |

Baseline for the review: the same prompt through cloud Codex (default model).

## Machine and versions

Apple M2 Max, 96 GB. Ollama 0.40.6, `llamacpp` runner, Metal `recommendedMaxWorkingSetSize` 83,494 MB. `@openai/codex` 0.163.0. gpt-oss:120b loads as 64 GB. Normal workload running: several Claude Code sessions and their tools.

## Results

| Check | gpt-oss:120b, local | Cloud Codex |
|---|---|---|
| Startup | FAIL. Cold run 44 s, warm 13 s, both ended `stream closed before response.completed`, no answer | Not measured |
| Review | FAIL. No answer | PASS twice: 29 s and 100 s, about 26,000 input and 2,500 to 2,800 output tokens, schema-valid JSON naming the `:root` defect in `tokens.json` |
| Read-only | NOT EXERCISED. The model never ran, so it never tried to write. `target.txt` unchanged. | Spike 3: PASS for this binary |
| Memory | Free memory bottomed at 23% (131k) and 28% (40k); swap grew 0 MB. Thresholds met, but the GPU allocation failed regardless. | n/a |

Root cause, from `~/.ollama/logs/server.log` on every local request:

```text
ggml_metal_synchronize: error: command buffer 0 failed with status 5
error: Insufficient Memory (00000008:kIOGPUCommandBufferCallbackErrorOutOfMemory)
```

- **131k context** (the model default): out of memory on the first request. Records in `results-ctx131k.jsonl`, `runs-ctx131k/`, `mem-ctx131k.tsv`.
- **40k context** via `Modelfile.40k` (`num_ctx 40960`): the scripted run failed before reaching the model because the probe passed the tag without `:latest`, and Codex tried to pull it (`pull model manifest: file does not exist`). A manual run with `-m gpt-oss-120b-40k:latest` loaded the model at 40,960 context and hit the same out-of-memory error after 63 s. Records in `results-ctx40k.jsonl`, `runs-ctx40k/`, `mem-ctx40k.tsv`. The manual run was outside the memory sampler.
- 40k is near the floor: a trivial Codex call already sends about 23,000 input tokens, so a smaller context cannot hold Codex's own prompt.
- The memory threshold was the wrong instrument. System free memory and swap stayed healthy while Metal refused the allocation. A future threshold should read GPU allocation failures from the Ollama log.

## Findings that change the product

- **A 120B local model cannot be a worker on a 96 GB Mac while other agents run.** Bezl cannot plan on it as the third provider.
- **Codex's local mode has sharp edges.** It needs a model with reasoning support (devstral:24b was rejected earlier today), and it needs the exact `name:tag` of a local model or it tries to download it.
- **Failures are silent to the user.** Codex retried five times and exited 1 with a generic stream error. The cause appeared only in Ollama's server log. Bezl's preflight for a local worker must read that log or run a short canary request.

## Not tried

- Smaller models such as gpt-oss:20b, which is not installed and would need a 13 GB download.
- Ollama server settings that shrink the cache, such as flash attention or a quantized KV cache. These need the Ollama service restarted with new environment variables.
- Running with the other sessions closed. That would pass a lab test but not Bezl's real condition, where several agents share the machine.

## Reproduce

```bash
bun install
./probe.sh                               # gpt-oss:120b at its default context
ollama create gpt-oss-120b-40k -f Modelfile.40k
MODEL=gpt-oss-120b-40k:latest ./probe.sh # explicit tag is required
ollama rm gpt-oss-120b-40k
```
