import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Binding, Crew } from "./crew";
import { type Outcome, runTask, type Task } from "./protocol";
import type { Deps } from "./runners";
import type { Runner } from "./types";
import { openWorkspace } from "./workspace";

const bindingsOf = (crew: Crew): Binding[] => {
  const { writer, reviewer, preReviewer, fallback } = crew.roles;
  const all = [writer, reviewer, preReviewer, ...fallback].filter(Boolean) as Binding[];
  return [...new Map(all.map((b) => [b.name, b])).values()];
};

// Spike 4: local failures hide behind generic stream errors, so prove every binding answers first.
export async function preflight(crew: Crew, deps: Deps): Promise<string[]> {
  const problems: string[] = [];
  for (const b of bindingsOf(crew)) {
    if (b.runner === "ollama") {
      try {
        const tags = (await (await deps.fetch(`${b.endpoint}/api/tags`, {})).json()) as { models?: { name: string }[] };
        const want = b.model?.includes(":") ? [b.model] : [b.model, `${b.model}:latest`];
        if (!tags.models?.some((m) => want.includes(m.name)))
          problems.push(`binding "${b.name}": model "${b.model}" is not pulled at ${b.endpoint}`);
      } catch (e) {
        problems.push(`binding "${b.name}": cannot reach ${b.endpoint}: ${(e as Error).message}`);
      }
      continue;
    }
    if (b.runner === "codex") {
      const r = await deps.exec(deps.bins.codex, ["login", "status"], process.cwd());
      if (r.code !== 0) problems.push(`binding "${b.name}": codex login status exited ${r.code}: ${(r.stderr || r.stdout).trim()}`);
      continue;
    }
    // Claude Code has no login-status command; `--version` passes even with a revoked token.
    const r = await deps.exec(deps.bins.claude, ["-p", "--output-format", "json", "--no-session-persistence", "Reply with OK"], process.cwd());
    let o: { is_error?: boolean; result?: string } = { is_error: true, result: r.stderr || r.stdout };
    try {
      o = JSON.parse(r.stdout);
    } catch {}
    if (o.is_error !== false) problems.push(`binding "${b.name}": claude canary failed: ${String(o.result ?? "").trim()}`);
  }
  return problems;
}

export type RunAllOptions = {
  crew: Crew;
  tasks: Task[];
  runnerFor: (b: Binding) => Runner;
  outDir: string;
  log: (line: string) => void;
};

export async function runAll({ crew, tasks, runnerFor, outDir, log }: RunAllOptions): Promise<Outcome[]> {
  mkdirSync(outDir, { recursive: true });
  const runners = Object.fromEntries(bindingsOf(crew).map((b) => [b.name, runnerFor(b)]));
  const outcomes: Outcome[] = [];
  for (const task of tasks) {
    log(`${task.id}: ${crew.pattern} starting`);
    let outcome: Outcome;
    try {
      const ws = await openWorkspace(task.repo, task.base);
      try {
        outcome = await runTask(task, crew, runners, ws);
      } finally {
        await ws.dispose();
      }
    } catch (e) {
      outcome = {
        taskId: task.id, pattern: crew.pattern, status: "error", reason: (e as Error).message,
        rounds: 0, steps: 0, usage: {}, findings: [], events: [], sameProviderReview: false,
      };
    }
    writeFileSync(join(outDir, `${task.id}.json`), `${JSON.stringify(outcome, null, 2)}\n`);
    const events = join(outDir, `${task.id}.events.jsonl`);
    writeFileSync(events, "");
    for (const e of outcome.events) appendFileSync(events, `${JSON.stringify(e)}\n`);
    log(`${task.id}: ${outcome.status} after ${outcome.rounds} rounds, ${outcome.steps} steps: ${outcome.reason}`);
    outcomes.push(outcome);
  }
  writeFileSync(join(outDir, "outcomes.json"), `${JSON.stringify(outcomes, null, 2)}\n`);
  return outcomes;
}
