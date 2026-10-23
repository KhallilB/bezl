import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Binding } from "../crew";
import type { Parsed, RunRequest, Runner } from "../types";
import { claudeArgs, parseClaude } from "./claude";
import { codexArgs, parseCodex } from "./codex";
import { ollamaBody, parseOllama } from "./ollama";
import { NO_USAGE } from "./parse";

export type ExecResult = { code: number; stdout: string; stderr: string };
export type Deps = {
  bins: { codex: string; claude: string };
  exec: (cmd: string, args: string[], cwd: string) => Promise<ExecResult>;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
};

// A failed exit keeps the parsed usage but surfaces stderr, where CLIs report auth and setup errors.
const withExit = (p: Parsed, r: ExecResult): Parsed =>
  p.ok || r.code === 0 ? p : { ok: false, error: `exit ${r.code}: ${p.error} ${r.stderr.slice(-400)}`.trim(), usage: p.usage };

export function makeRunner(b: Binding, deps: Deps): Runner {
  const timed = async (f: () => Promise<Parsed>) => {
    const t = performance.now();
    const p = await f();
    return { ...p, wallMs: Math.round(performance.now() - t) };
  };

  if (b.runner === "codex")
    return {
      run: (req: RunRequest) =>
        timed(async () => {
          const dir = mkdtempSync(join(tmpdir(), "crew-schema-"));
          const schemaPath = join(dir, "schema.json");
          writeFileSync(schemaPath, JSON.stringify(req.schema));
          try {
            const r = await deps.exec(deps.bins.codex, codexArgs(req, b, schemaPath), req.cwd);
            return withExit(parseCodex(r.stdout), r);
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }),
    };

  if (b.runner === "claude-code")
    return {
      run: (req: RunRequest) =>
        timed(async () => {
          const r = await deps.exec(deps.bins.claude, claudeArgs(req, b), req.cwd);
          return withExit(parseClaude(r.stdout), r);
        }),
    };

  return {
    run: (req: RunRequest) =>
      timed(async () => {
        try {
          const res = await deps.fetch(`${b.endpoint}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ollamaBody(req, b)),
          });
          return parseOllama(await res.json());
        } catch (e) {
          return { ok: false, error: `ollama: ${(e as Error).message}`, usage: NO_USAGE };
        }
      }),
  };
}

export const realDeps = (bins: Deps["bins"], timeoutMs: number): Deps => ({
  bins,
  exec: async (cmd, args, cwd) => {
    const p = Bun.spawn([cmd, ...args], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
    const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code: await p.exited, stdout, stderr };
  },
  fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
});
