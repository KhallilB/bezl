import type { Binding } from "../crew";
import type { Parsed, RunRequest } from "../types";
import { answer, NO_USAGE } from "./parse";

export function claudeArgs(req: RunRequest, b: Binding): string[] {
  return [
    "-p", "--output-format", "json", "--no-session-persistence",
    "--permission-mode", req.writable ? "acceptEdits" : "plan",
    "--json-schema", JSON.stringify(req.schema),
    ...(b.model ? ["--model", b.model] : []),
    req.prompt,
  ];
}

export function parseClaude(stdout: string): Parsed {
  let o: any;
  try {
    o = JSON.parse(stdout);
  } catch {
    return { ok: false, error: `not JSON: ${stdout.slice(0, 200)}`, usage: NO_USAGE };
  }
  const u = o.usage ?? {};
  const cached = u.cache_read_input_tokens ?? 0;
  const usage = {
    input: (u.input_tokens ?? 0) + cached + (u.cache_creation_input_tokens ?? 0),
    output: u.output_tokens ?? 0,
    cached,
  };
  if (o.is_error) return { ok: false, error: String(o.result ?? "claude error"), usage };
  if (o.structured_output !== undefined) return { ok: true, json: o.structured_output, usage };
  return answer(o.result, usage);
}
