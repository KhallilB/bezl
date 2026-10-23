import type { Binding } from "../crew";
import type { Parsed, RunRequest } from "../types";
import { answer } from "./parse";

export function ollamaBody(req: RunRequest, b: Binding): object {
  if (req.writable) throw new Error("ollama has no tools and cannot write");
  return {
    model: b.model,
    stream: false,
    format: req.schema,
    options: { num_ctx: b.context ?? 8192 },
    messages: [{ role: "user", content: req.prompt }],
  };
}

export function parseOllama(r: any): Parsed {
  const usage = { input: r?.prompt_eval_count ?? 0, output: r?.eval_count ?? 0, cached: 0 };
  if (r?.error) return { ok: false, error: String(r.error), usage };
  return answer(r?.message?.content, usage);
}
