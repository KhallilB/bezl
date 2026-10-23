import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCrew } from "../src/crew";
import type { Task } from "../src/protocol";
import { preflight, runAll } from "../src/run";
import type { Runner } from "../src/types";

let root: string;
let repo: string;
const sh = (cwd: string, ...cmd: string[]) => Bun.spawnSync(cmd, { cwd });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "crew-run-"));
  repo = join(root, "repo");
  sh(root, "git", "init", "-q", "-b", "main", repo);
  for (const [k, v] of [["user.email", "t@t"], ["user.name", "t"], ["commit.gpgSign", "false"]]) sh(repo, "git", "config", k, v);
  writeFileSync(join(repo, "a.txt"), "one\n");
  sh(repo, "git", "add", ".");
  sh(repo, "git", "commit", "-q", "-m", "init");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const tasks = (): Task[] =>
  ["t1", "t2"].map((id) => ({ id, repo, base: "main", goal: "say two", allowedPaths: ["a.txt"], checks: ["grep -q two a.txt"] }));
const usage = { input: 5, output: 1, cached: 0 };
const writer: Runner = {
  run: async (req) => {
    writeFileSync(join(req.cwd, "a.txt"), "two\n");
    return { ok: true, json: { status: "done", summary: "ok" }, usage, wallMs: 1 };
  },
};

describe("runAll", () => {
  test("runs every task in its own worktree and writes outcomes and events", async () => {
    const r = loadCrew('[bindings.w]\nrunner = "codex"\n[roles]\nwriter = "w"\n');
    if (!r.ok) throw new Error("bad crew");
    const out = join(root, "out");
    const outcomes = await runAll({ crew: r.crew, tasks: tasks(), runnerFor: () => writer, outDir: out, log: () => {} });
    expect(outcomes.map((o) => o.status)).toEqual(["green", "green"]);
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("one\n");
    const saved = JSON.parse(readFileSync(join(out, "t1.json"), "utf8"));
    expect(saved.status).toBe("green");
    expect(readFileSync(join(out, "t1.events.jsonl"), "utf8").trim().split("\n").length).toBe(saved.events.length);
    expect(existsSync(join(out, "outcomes.json"))).toBe(true);
    expect(sh(repo, "git", "worktree", "list").stdout.toString().trim().split("\n").length).toBe(1);
  });
});

describe("preflight", () => {
  const crew = () => {
    const r = loadCrew(
      '[bindings.w]\nrunner = "codex"\n[bindings.r]\nrunner = "claude-code"\n[bindings.l]\nrunner = "ollama"\nmodel = "gpt-oss:120b"\n[roles]\nwriter = "w"\nreviewer = "r"\npre_reviewer = "l"\n',
    );
    if (!r.ok) throw new Error("bad crew");
    return r.crew;
  };
  const calls: string[][] = [];
  // Claude has no login-status command, so preflight sends one tiny prompt and reads is_error.
  const deps = (claudeOk: boolean, models: string[]) => ({
    bins: { codex: "codex", claude: "claude" },
    exec: async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      if (cmd === "codex") return { code: 0, stdout: "Logged in using ChatGPT", stderr: "" };
      const body = claudeOk ? { is_error: false, result: "OK" } : { is_error: true, result: "OAuth access token has been revoked." };
      return { code: claudeOk ? 0 : 1, stdout: JSON.stringify(body), stderr: "" };
    },
    fetch: async () => new Response(JSON.stringify({ models: models.map((name) => ({ name })) })),
  });

  test("passes when both CLIs are signed in and every local model is pulled", async () => {
    calls.length = 0;
    expect(await preflight(crew(), deps(true, ["gpt-oss:120b"]))).toEqual([]);
    expect(calls[0]).toEqual(["codex", "login", "status"]);
    expect(calls[1].slice(0, 4)).toEqual(["claude", "-p", "--output-format", "json"]);
  });

  test("names a signed-out CLI and a missing local model", async () => {
    expect(await preflight(crew(), deps(false, ["qwen3.5:35b"]))).toEqual([
      'binding "r": claude canary failed: OAuth access token has been revoked.',
      'binding "l": model "gpt-oss:120b" is not pulled at http://127.0.0.1:11434',
    ]);
  });

  test("a model without a tag matches its latest tag", async () => {
    const r = loadCrew('[bindings.w]\nrunner = "codex"\n[bindings.l]\nrunner = "ollama"\nmodel = "mine"\n[roles]\nwriter = "w"\nreviewer = "l"\n');
    if (!r.ok) throw new Error("bad crew");
    expect(await preflight(r.crew, deps(true, ["mine:latest"]))).toEqual([]);
  });

  test("an unreachable endpoint is reported", async () => {
    const d = { ...deps(true, []), fetch: async () => Promise.reject(new Error("ECONNREFUSED")) };
    expect(await preflight(crew(), d)).toContain('binding "l": cannot reach http://127.0.0.1:11434: ECONNREFUSED');
  });
});
