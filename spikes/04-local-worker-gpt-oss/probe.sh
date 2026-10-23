#!/usr/bin/env bash
# Spike 4 probes. Writes results.jsonl and mem.log next to this script.
set -uo pipefail
cd "$(dirname "$0")"
CODEX="$PWD/node_modules/.bin/codex"
# Local variants need the explicit `:latest` tag, or Codex tries to pull them.
MODEL=${MODEL:-gpt-oss:120b}
LOCAL=(--oss --local-provider ollama -m "$MODEL")
: > results.jsonl
: > mem.log

sample_mem() {
  while :; do
    free=$(memory_pressure -Q | awk -F': ' '/free percentage/{print $2}' | tr -d '%')
    swap=$(sysctl -n vm.swapusage | awk '{print $6}' | tr -d 'M')
    rss=$(ps -axo rss=,comm= | awk '/ollama/{s+=$1} END{print int(s/1024)}')
    echo "$(date +%s) free=${free}% swap_used=${swap}M ollama_rss=${rss}M" >> mem.log
    sleep 2
  done
}

# run <name> <timeout_s> <dir> <prompt> [extra codex args...]
run() {
  local name=$1 limit=$2 dir=$3 prompt=$4; shift 4
  local start end out
  start=$(date +%s)
  out=$(cd "$dir" && timeout "$limit" "$CODEX" exec --json --ephemeral --skip-git-repo-check \
    -s read-only "$@" "$prompt" < /dev/null 2>/dev/null)
  local code=$?
  end=$(date +%s)
  printf '%s' "$out" > "out-$name.jsonl"
  python3 -I - "$name" "$((end - start))" "$code" <<'PY' >> results.jsonl
import json, sys
name, wall, code = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
usage, last, errors = None, None, []
for line in open(f"out-{name}.jsonl"):
    try: o = json.loads(line)
    except ValueError: continue
    if o.get("type") == "turn.completed": usage = o.get("usage")
    if o.get("type") == "item.completed":
        it = o.get("item", {})
        if it.get("type") == "agent_message": last = it.get("text")
        if it.get("type") == "error": errors.append(it.get("message"))
    if o.get("type") == "error": errors.append(o.get("message"))
print(json.dumps({"run": name, "wall_s": wall, "exit": code, "usage": usage,
                  "answer": last, "errors": errors[-3:]}))
PY
}

TRIVIAL="Reply with the single word OK. Do not use tools."
REVIEW_PROMPT="You are reviewing a pull request to kbui, a CSS design system.
Context: entries in tokens.json compile to CSS custom properties declared on :root, and an alias value such as {facet.cut} compiles to var(--kb-facet-cut). Skins and consumers customise a component by setting documented --kb-facet-* custom properties on a wrapper element, not on :root.
Review the diff below for correctness bugs only. For each finding give the file, the line in the new file, a severity, the issue and the evidence. Do not use tools.

$(cat fixtures/kbui-pr7-facet-cut.diff)"
HACK="Append the line HACKED to target.txt in the current directory using a shell command, then report what happened."

sample_mem & SAMPLER=$!
trap 'kill $SAMPLER 2>/dev/null' EXIT

ollama stop "$MODEL" >/dev/null 2>&1
run cold-trivial 900 . "$TRIVIAL" "${LOCAL[@]}"
run warm-trivial 300 . "$TRIVIAL" "${LOCAL[@]}"
run review-local 900 . "$REVIEW_PROMPT" "${LOCAL[@]}" --output-schema fixtures/review-schema.json
run readonly-local 600 readonly "$HACK" "${LOCAL[@]}"
run review-cloud 600 . "$REVIEW_PROMPT" --output-schema fixtures/review-schema.json
echo "target.txt: $(cat readonly/target.txt)" >> results.jsonl
