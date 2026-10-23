import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Crew, loadCrew } from "../src/crew";
import { runTask, type Task } from "../src/protocol";
import type { Parsed, RunRequest, Runner } from "../src/types";
import { openWorkspace } from "../src/workspace";

const sh = (cwd: string, ...cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { cwd });
  if (r.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${r.stderr.toString()}`);
};

let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "crew-repo-"));
  sh(repo, "git", "init", "-q", "-b", "main");
  sh(repo, "git", "config", "user.email", "t@t");
  sh(repo, "git", "config", "user.name", "t");
  sh(repo, "git", "config", "commit.gpgSign", "false");
  writeFileSync(join(repo, "a.txt"), "one\n");
  sh(repo, "git", "add", ".");
  sh(repo, "git", "commit", "-q", "-m", "init");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const task = (): Task => ({
  id: "t1",
  repo,
  base: "main",
  goal: "Make a.txt say two",
  allowedPaths: ["a.txt"],
  checks: ["grep -q two a.txt"],
});

const crewOf = (toml: string): Crew => {
  const r = loadCrew(toml);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.crew;
};
const PAIR = '[bindings.w]\nrunner = "claude-code"\n[bindings.r]\nrunner = "codex"\n[roles]\nwriter = "w"\nreviewer = "r"\n';
const SINGLE = '[bindings.w]\nrunner = "codex"\n[roles]\nwriter = "w"\n';
const PROPOSE =
  '[bindings.w]\nrunner = "claude-code"\n[bindings.r]\nrunner = "codex"\n[bindings.l]\nrunner = "ollama"\nmodel = "m"\n[roles]\nwriter = "w"\nreviewer = "r"\npre_reviewer = "l"\n';

const usage = { input: 10, output: 2, cached: 0 };
type Step = (req: RunRequest, call: number) => Parsed;
const scripted = (steps: Step[], prompts: string[] = []): Runner => {
  let call = 0;
  return {
    run: async (req) => {
      prompts.push(req.prompt);
      const step = steps[Math.min(call, steps.length - 1)];
      return { ...step(req, call++), wallMs: 1 };
    },
  };
};
const write = (text: string): Step => (req) => {
  writeFileSync(join(req.cwd, "a.txt"), text);
  return { ok: true, json: { status: "done", summary: "edited" }, usage };
};
const approve: Step = () => ({ ok: true, json: { verdict: "approve", findings: [], confirmed_candidates: [] }, usage });
const finding = (issue: string, confirmed: string[] = []): Step => () => ({
  ok: true,
  json: {
    verdict: "request_changes",
    findings: [{ file: "a.txt", line: 1, severity: "major", issue, evidence: "line 1" }],
    confirmed_candidates: confirmed,
  },
  usage,
});

const run = async (crew: Crew, runners: Record<string, Runner>) => {
  const ws = await openWorkspace(task().repo, task().base);
  try {
    return await runTask(task(), crew, runners, ws);
  } finally {
    await ws.dispose();
  }
};

describe("runTask", () => {
  test("pair: writer passes checks and reviewer approves in one round", async () => {
    const out = await run(crewOf(PAIR), { w: scripted([write("two\n")]), r: scripted([approve]) });
    expect(out.status).toBe("green");
    expect(out.rounds).toBe(1);
    expect(out.steps).toBe(2);
    expect(out.usage).toEqual({ w: usage, r: usage });
  });

  test("pair: a reviewer finding reaches the writer, who fixes it", async () => {
    const writerPrompts: string[] = [];
    const out = await run(crewOf(PAIR), {
      w: scripted([write("two\n"), write("two\nfixed\n")], writerPrompts),
      r: scripted([finding("missing trailing line"), approve]),
    });
    expect(out.status).toBe("green");
    expect(out.rounds).toBe(2);
    expect(writerPrompts[1]).toContain("missing trailing line");
    expect(out.findings.map((f) => f.issue)).toEqual(["missing trailing line"]);
  });

  test("stops as a loop when the writer makes no change", async () => {
    const out = await run(crewOf(PAIR), {
      w: scripted([write("two\n"), write("two\n")]),
      r: scripted([finding("still wrong")]),
    });
    expect(out.status).toBe("loop");
    expect(out.reason).toBe("writer made no change");
  });

  test("stops as a loop when the reviewer repeats the same finding", async () => {
    const out = await run(crewOf(PAIR), {
      w: scripted([write("two\n"), write("two\nv2\n")]),
      r: scripted([finding("Bad   thing!"), finding("bad thing")]),
    });
    expect(out.status).toBe("loop");
    expect(out.reason).toBe("same finding raised again");
  });

  test("stops at the round cap", async () => {
    const crew = crewOf(`[limits]\nmax_rounds = 2\n${PAIR}`);
    const out = await run(crew, {
      w: scripted([write("two\n"), write("two\n2\n"), write("two\n3\n")]),
      r: scripted([finding("first"), finding("second"), finding("third")]),
    });
    expect(out.status).toBe("capped");
    expect(out.rounds).toBe(2);
  });

  test("stops at the step cap", async () => {
    const out = await run(crewOf(`[limits]\nmax_steps = 1\n${PAIR}`), { w: scripted([write("two\n")]), r: scripted([approve]) });
    expect(out.status).toBe("capped");
    expect(out.reason).toBe("step cap reached");
  });

  test("single agent retries with the failing checks until green", async () => {
    const prompts: string[] = [];
    const out = await run(crewOf(SINGLE), { w: scripted([write("nope\n"), write("two\n")], prompts) });
    expect(out.status).toBe("green");
    expect(out.rounds).toBe(2);
    expect(prompts[1]).toContain("grep -q two a.txt");
    expect(prompts[1]).toContain("exit 1");
  });

  test("propose-confirm: only candidates the reviewer confirms reach the writer", async () => {
    const writerPrompts: string[] = [];
    const reviewerPrompts: string[] = [];
    const pre: Step = () => ({
      ok: true,
      json: {
        verdict: "request_changes",
        findings: [
          { file: "a.txt", line: 1, severity: "major", issue: "real candidate", evidence: "e" },
          { file: "a.txt", line: 1, severity: "major", issue: "false candidate", evidence: "e" },
        ],
      },
      usage,
    });
    const out = await run(crewOf(PROPOSE), {
      w: scripted([write("two\n"), write("two\nok\n")], writerPrompts),
      l: scripted([pre, () => ({ ok: true, json: { verdict: "approve", findings: [] }, usage })]),
      r: scripted([finding("own finding", ["c1"]), approve], reviewerPrompts),
    });
    expect(out.status).toBe("green");
    expect(reviewerPrompts[0]).toContain("c1: a.txt:1 real candidate");
    expect(writerPrompts[1]).toContain("real candidate");
    expect(writerPrompts[1]).not.toContain("false candidate");
    expect(out.findings.filter((f) => f.by === "l").map((f) => [f.issue, f.confirmed])).toEqual([
      ["real candidate", true],
      ["false candidate", false],
    ]);
  });

  test("a blocked writer ends the task for a human", async () => {
    const out = await run(crewOf(PAIR), {
      w: scripted([() => ({ ok: true, json: { status: "blocked", summary: "needs a decision" }, usage })]),
      r: scripted([approve]),
    });
    expect(out.status).toBe("blocked");
    expect(out.reason).toBe("needs a decision");
  });

  test("a failing writer hands over to the fallback binding", async () => {
    const crew = crewOf(
      '[bindings.w]\nrunner = "claude-code"\n[bindings.f]\nrunner = "codex"\n[bindings.r]\nrunner = "codex"\n[roles]\nwriter = "w"\nreviewer = "r"\nfallback = ["f"]\n',
    );
    const out = await run(crew, {
      w: scripted([() => ({ ok: false, error: "usage limit reached", usage: { input: 0, output: 0, cached: 0 } })]),
      f: scripted([write("two\n")]),
      r: scripted([approve]),
    });
    expect(out.status).toBe("green");
    expect(out.events.some((e) => e.kind === "fallback" && e.detail.includes("usage limit reached"))).toBe(true);
  });

  test("records an event for every step", async () => {
    const out = await run(crewOf(PAIR), { w: scripted([write("two\n")]), r: scripted([approve]) });
    expect(out.events.map((e) => e.kind)).toEqual(["writer", "checks", "reviewer", "done"]);
  });
});
