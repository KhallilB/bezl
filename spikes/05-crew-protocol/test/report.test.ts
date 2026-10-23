import { describe, expect, test } from "bun:test";
import type { Outcome, RecordedFinding } from "../src/protocol";
import { labelKey, labelTemplate, score } from "../src/report";
import { loadTasks } from "../src/tasks";

const u = (input: number, output = 0) => ({ input, output, cached: 0 });
const outcome = (taskId: string, over: Partial<Outcome> = {}): Outcome => ({
  taskId,
  pattern: "pair",
  status: "green",
  reason: "",
  rounds: 1,
  steps: 2,
  usage: { w: u(100) },
  findings: [],
  events: [],
  ...over,
});
const f = (fp: string, by = "r", confirmed?: boolean): RecordedFinding => ({
  file: "a",
  line: 1,
  severity: "major",
  issue: fp,
  evidence: "",
  round: 1,
  by,
  fingerprint: fp,
  confirmed,
});
const five = (over: (i: number) => Partial<Outcome> = () => ({})) => [1, 2, 3, 4, 5].map((i) => outcome(`t${i}`, over(i)));

describe("score", () => {
  const baseline = five(() => ({ pattern: "single", usage: { w: u(100) } }));
  const withDefect = five((i) => (i === 1 ? { findings: [f("real bug")] } : {}));
  const labels = { [labelKey("t1", "real bug")]: "real" as const };

  test("passes when every threshold holds", () => {
    const s = score(withDefect, baseline, labels);
    expect(s.pass).toBe(true);
    expect(s.green).toBe(5);
    expect(s.tokenRatio).toBe(1);
    expect(s.realDefects).toBe(1);
  });

  test("fails when fewer than 4 of 5 tasks are green", () => {
    const crew = withDefect.map((o, i) => (i < 2 ? { ...o, status: "failed" as const } : o));
    const s = score(crew, baseline, labels);
    expect(s.pass).toBe(false);
    expect(s.checks.find((c) => c.name === "green")?.pass).toBe(false);
  });

  test("any cap or loop stop fails the run", () => {
    const crew = withDefect.map((o, i) => (i === 4 ? { ...o, status: "loop" as const } : o));
    expect(score(crew, baseline, labels).checks.find((c) => c.name === "no caps or loops")?.pass).toBe(false);
  });

  test("fails when the crew spends more than twice the baseline tokens", () => {
    const crew = withDefect.map((o) => ({ ...o, usage: { w: u(150), r: u(40, 20) } }));
    const s = score(crew, baseline, labels);
    expect(s.tokenRatio).toBe(2.1);
    expect(s.checks.find((c) => c.name === "tokens")?.pass).toBe(false);
  });

  test("needs at least one finding labelled real that reached the writer", () => {
    const s = score(withDefect, baseline, {});
    expect(s.realDefects).toBe(0);
    expect(s.unlabelled).toBe(1);
    expect(s.pass).toBe(false);
  });

  test("an unconfirmed pre-reviewer candidate never counts as a caught defect", () => {
    const crew = five((i) => (i === 1 ? { findings: [f("local guess", "l", false)] } : {}));
    const s = score(crew, baseline, { [labelKey("t1", "local guess")]: "real" });
    expect(s.realDefects).toBe(0);
    expect(s.preReview).toEqual({ candidates: 1, confirmed: 0, labelledReal: 1, labelledFalse: 0 });
  });

  test("label template lists every finding once", () => {
    const crew = five((i) => (i === 1 ? { findings: [f("a"), f("a"), f("b", "l", true)] } : {}));
    expect(labelTemplate(crew)).toEqual({ [labelKey("t1", "a")]: "unlabelled", [labelKey("t1", "b")]: "unlabelled" });
  });
});

describe("loadTasks", () => {
  test("reads tasks and rejects missing fields", () => {
    const ok = loadTasks('[[tasks]]\nid = "x"\nrepo = "/r"\nbase = "main"\ngoal = "g"\nallowed_paths = ["src/"]\nchecks = ["true"]\n');
    expect(ok).toEqual({ ok: true, tasks: [{ id: "x", repo: "/r", base: "main", goal: "g", allowedPaths: ["src/"], checks: ["true"] }] });
    const bad = loadTasks('[[tasks]]\nid = "x"\n');
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.errors).toContain('task "x": missing repo');
  });

  test("task ids must be unique", () => {
    const t = '[[tasks]]\nid = "x"\nrepo = "/r"\nbase = "m"\ngoal = "g"\nallowed_paths = []\nchecks = ["true"]\n';
    const r = loadTasks(t + t);
    expect(!r.ok && r.errors).toContain('duplicate task id "x"');
  });
});
