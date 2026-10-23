import type { Binding } from "../crew";
import type { Parsed, RunRequest } from "../types";
import { answer, NO_USAGE } from "./parse";

export function codexArgs(req: RunRequest, b: Binding, schemaPath: string): string[] {
  return [
    "exec", "--json", "--ephemeral", "--skip-git-repo-check",
    "-s", req.writable ? "workspace-write" : "read-only",
    "-C", req.cwd,
    ...(b.model ? ["-m", b.model] : []),
    "--output-schema", schemaPath,
    req.prompt,
  ];
}

// Codex `exec --json` emits JSONL; the answer is the last agent_message.
export function parseCodex(stdout: string): Parsed {
  let usage = NO_USAGE;
  let text: string | undefined;
  let error: string | undefined;
  for (const line of stdout.split("\n")) {
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type === "turn.completed" && o.usage)
      usage = { input: o.usage.input_tokens ?? 0, output: o.usage.output_tokens ?? 0, cached: o.usage.cached_input_tokens ?? 0 };
    if (o.type === "item.completed" && o.item?.type === "agent_message") text = o.item.text;
    if (o.type === "error") error = o.message;
  }
  if (text === undefined && error) return { ok: false, error, usage };
  return answer(text, usage);
}
