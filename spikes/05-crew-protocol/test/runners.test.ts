import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { Binding } from "../src/crew";
import { claudeArgs, parseClaude } from "../src/runners/claude";
import { codexArgs, parseCodex } from "../src/runners/codex";
import { ollamaBody, parseOllama } from "../src/runners/ollama";
import type { RunRequest } from "../src/types";

const binding = (over: Partial<Binding>): Binding => ({
  name: "b",
  runner: "codex",
  provider: "openai",
  endpoint: "http://127.0.0.1:11434",
  trainsOnData: false,
  ...over,
});
const req = (over: Partial<RunRequest> = {}): RunRequest => ({
  role: "reviewer",
  prompt: "review this",
  cwd: "/tmp/wt",
  writable: false,
  schema: { type: "object" },
  ...over,
});

describe("codex", () => {
  test("read-only reviewer runs in the read-only sandbox with a schema", () => {
    const args = codexArgs(req(), binding({}), "/tmp/schema.json");
    expect(args).toEqual([
      "exec", "--json", "--ephemeral", "--skip-git-repo-check",
      "-s", "read-only", "-C", "/tmp/wt", "--output-schema", "/tmp/schema.json", "review this",
    ]);
  });

  test("writer gets workspace-write and the bound model", () => {
    const args = codexArgs(req({ writable: true }), binding({ model: "gpt-5.5" }), "/tmp/s.json");
    expect(args.slice(4, 6)).toEqual(["-s", "workspace-write"]);
    expect(args).toContain("-m");
    expect(args[args.indexOf("-m") + 1]).toBe("gpt-5.5");
  });

  test("parses usage and the final JSON answer from a real transcript", () => {
    const out = parseCodex(readFileSync(new URL("./fixtures/codex-review.jsonl", import.meta.url), "utf8"));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.usage).toEqual({ input: 26015, output: 2491, cached: 0 });
    expect((out.json as { verdict: string }).verdict).toBe("request_changes");
  });

  test("reports the last error when no answer arrives", () => {
    const out = parseCodex('{"type":"error","message":"stream closed"}\n');
    expect(out).toEqual({ ok: false, error: "stream closed", usage: { input: 0, output: 0, cached: 0 } });
  });
});

describe("claude", () => {
  test("reviewer runs in plan mode; writer may edit", () => {
    const r = claudeArgs(req(), binding({ runner: "claude-code" }));
    expect(r).toContain("--permission-mode");
    expect(r[r.indexOf("--permission-mode") + 1]).toBe("plan");
    const w = claudeArgs(req({ writable: true }), binding({ runner: "claude-code" }));
    expect(w[w.indexOf("--permission-mode") + 1]).toBe("acceptEdits");
    expect(w).toContain("--no-session-persistence");
    expect(w[w.indexOf("--json-schema") + 1]).toBe('{"type":"object"}');
    expect(w.at(-1)).toBe("review this");
  });

  // Hand-written sample: the Claude CLI login had expired, so no real transcript exists yet.
  test("reads structured output and counts cached input", () => {
    const out = parseClaude(
      JSON.stringify({
        type: "result",
        is_error: false,
        structured_output: { verdict: "approve", findings: [] },
        usage: { input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 5, output_tokens: 7 },
      }),
    );
    expect(out).toEqual({ ok: true, json: { verdict: "approve", findings: [] }, usage: { input: 105, output: 7, cached: 90 } });
  });

  test("falls back to JSON in the result text and reports CLI errors", () => {
    const out = parseClaude(JSON.stringify({ type: "result", result: '{"status":"done"}', usage: {} }));
    expect(out.ok && out.json).toEqual({ status: "done" });
    const err = parseClaude(JSON.stringify({ type: "result", is_error: true, result: "OAuth expired", usage: {} }));
    expect(err).toEqual({ ok: false, error: "OAuth expired", usage: { input: 0, output: 0, cached: 0 } });
  });
});

describe("ollama", () => {
  const local = binding({ runner: "ollama", provider: "ollama:gpt-oss:120b", model: "gpt-oss:120b", context: 8192 });

  test("builds a tool-free chat request with the schema and context", () => {
    expect(ollamaBody(req(), local)).toEqual({
      model: "gpt-oss:120b",
      stream: false,
      format: { type: "object" },
      options: { num_ctx: 8192 },
      messages: [{ role: "user", content: "review this" }],
    });
  });

  test("refuses to act as a writer", () => {
    expect(() => ollamaBody(req({ writable: true }), local)).toThrow("ollama has no tools and cannot write");
  });

  test("parses the answer and token counts", () => {
    const out = parseOllama({ message: { content: '{"verdict":"approve","findings":[]}' }, prompt_eval_count: 2758, eval_count: 3404 });
    expect(out).toEqual({ ok: true, json: { verdict: "approve", findings: [] }, usage: { input: 2758, output: 3404, cached: 0 } });
  });

  test("reports non-JSON content as an error", () => {
    const out = parseOllama({ message: { content: "sure!" }, prompt_eval_count: 1, eval_count: 1 });
    expect(out.ok).toBe(false);
  });
});

import { existsSync } from "node:fs";
import { makeRunner } from "../src/runners";

describe("makeRunner", () => {
  test("codex runner passes the schema as a file and parses stdout", async () => {
    const calls: { cmd: string; args: string[]; cwd: string }[] = [];
    let schemaSeen = "";
    const runner = makeRunner(binding({}), {
      bins: { codex: "/bin/codex", claude: "/bin/claude" },
      exec: async (cmd, args, cwd) => {
        calls.push({ cmd, args, cwd });
        const p = args[args.indexOf("--output-schema") + 1];
        schemaSeen = await Bun.file(p).text();
        return { code: 0, stdout: readFileSync(new URL("./fixtures/codex-review.jsonl", import.meta.url), "utf8"), stderr: "" };
      },
      fetch: async () => {
        throw new Error("unused");
      },
    });
    const out = await runner.run(req());
    expect(calls[0].cmd).toBe("/bin/codex");
    expect(calls[0].cwd).toBe("/tmp/wt");
    expect(schemaSeen).toBe('{"type":"object"}');
    expect(existsSync(calls[0].args[calls[0].args.indexOf("--output-schema") + 1])).toBe(false);
    expect(out.ok).toBe(true);
    expect(out.wallMs).toBeGreaterThanOrEqual(0);
  });

  test("a non-zero exit without an answer is an error carrying stderr", async () => {
    const runner = makeRunner(binding({ runner: "claude-code" }), {
      bins: { codex: "c", claude: "/bin/claude" },
      exec: async () => ({ code: 1, stdout: "", stderr: "OAuth expired" }),
      fetch: async () => {
        throw new Error("unused");
      },
    });
    const out = await runner.run(req());
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toContain("OAuth expired");
  });

  test("ollama runner posts to the binding endpoint", async () => {
    let url = "";
    const runner = makeRunner(binding({ runner: "ollama", model: "m", endpoint: "http://127.0.0.1:11434" }), {
      bins: { codex: "c", claude: "d" },
      exec: async () => {
        throw new Error("unused");
      },
      fetch: async (u) => {
        url = String(u);
        return new Response(JSON.stringify({ message: { content: '{"verdict":"approve","findings":[]}' }, prompt_eval_count: 3, eval_count: 4 }));
      },
    });
    const out = await runner.run(req());
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(out.ok && out.usage).toEqual({ input: 3, output: 4, cached: 0 });
  });
});
