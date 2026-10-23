import type { Parsed, Usage } from "../types";

export const NO_USAGE: Usage = { input: 0, output: 0, cached: 0 };

export function answer(text: string | undefined, usage: Usage): Parsed {
  if (text === undefined) return { ok: false, error: "no answer", usage };
  try {
    return { ok: true, json: JSON.parse(text), usage };
  } catch {
    return { ok: false, error: `answer is not JSON: ${text.slice(0, 200)}`, usage };
  }
}
