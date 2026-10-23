import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadCrew } from "./crew";
import type { Outcome } from "./protocol";
import { type Labels, labelTemplate, score } from "./report";
import { preflight, runAll } from "./run";
import { makeRunner, realDeps } from "./runners";
import { loadTasks } from "./tasks";

const USAGE = `usage:
  bun src/cli.ts run --crew <crew.toml> --tasks <tasks.toml> --out <dir> [--codex <bin>] [--claude <bin>] [--timeout-min 20] [--skip-preflight]
  bun src/cli.ts labels --run <dir>
  bun src/cli.ts score --crew-run <dir> --baseline-run <dir> [--labels <labels.json>]`;

const fail = (code: number, lines: string[]): never => {
  for (const l of lines) console.error(l);
  process.exit(code);
};
const readOutcomes = (dir: string): Outcome[] => JSON.parse(readFileSync(join(dir, "outcomes.json"), "utf8"));

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    crew: { type: "string" },
    tasks: { type: "string" },
    out: { type: "string" },
    codex: { type: "string", default: resolve(import.meta.dir, "../node_modules/.bin/codex") },
    claude: { type: "string", default: "claude" },
    "timeout-min": { type: "string", default: "20" },
    "skip-preflight": { type: "boolean", default: false },
    run: { type: "string" },
    "crew-run": { type: "string" },
    "baseline-run": { type: "string" },
    labels: { type: "string" },
  },
});

const command = positionals[0];

if (command === "run") {
  if (!values.crew || !values.tasks || !values.out) fail(2, [USAGE]);
  const crew = loadCrew(readFileSync(values.crew!, "utf8"));
  const tasks = loadTasks(readFileSync(values.tasks!, "utf8"));
  const errors = [...(crew.ok ? [] : crew.errors), ...(tasks.ok ? [] : tasks.errors)];
  if (!crew.ok || !tasks.ok) fail(2, errors.map((e) => `invalid: ${e}`));
  const deps = realDeps({ codex: values.codex!, claude: values.claude! }, Number(values["timeout-min"]) * 60_000);
  if (crew.ok && tasks.ok) {
    if (!values["skip-preflight"]) {
      const problems = await preflight(crew.crew, deps);
      if (problems.length) fail(3, problems.map((p) => `preflight: ${p}`));
      console.log("preflight: every binding answered");
    }
    const outcomes = await runAll({
      crew: crew.crew,
      tasks: tasks.tasks,
      runnerFor: (b) => makeRunner(b, deps),
      outDir: values.out!,
      log: (l) => console.log(l),
    });
    console.log(`${outcomes.filter((o) => o.status === "green").length} of ${outcomes.length} green`);
  }
} else if (command === "labels") {
  if (!values.run) fail(2, [USAGE]);
  const path = join(values.run!, "labels.json");
  const existing: Labels = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const merged = { ...labelTemplate(readOutcomes(values.run!)), ...existing };
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`${path}: mark each finding "real" or "false"`);
} else if (command === "score") {
  if (!values["crew-run"] || !values["baseline-run"]) fail(2, [USAGE]);
  const labels: Labels = values.labels ? JSON.parse(readFileSync(values.labels, "utf8")) : {};
  const s = score(readOutcomes(values["crew-run"]!), readOutcomes(values["baseline-run"]!), labels);
  writeFileSync(join(values["crew-run"]!, "score.json"), `${JSON.stringify(s, null, 2)}\n`);
  for (const c of s.checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
  console.log(`pre-review: ${JSON.stringify(s.preReview)}`);
  console.log(s.pass ? "RESULT: PASS" : "RESULT: FAIL");
  process.exit(s.pass ? 0 : 1);
} else {
  fail(2, [USAGE]);
}
