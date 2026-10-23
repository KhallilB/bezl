import type { Binding, Crew, Limits } from "./crew";
import type { Parsed, Role, Runner, Usage } from "./types";
import type { CheckResult, Workspace } from "./workspace";

export type Task = { id: string; repo: string; base: string; goal: string; allowedPaths: string[]; checks: string[] };
export type Finding = { file: string; line: number; severity: "blocker" | "major" | "minor"; issue: string; evidence: string };
export type RecordedFinding = Finding & { round: number; by: string; fingerprint: string; confirmed?: boolean };
export type Status = "green" | "failed" | "capped" | "loop" | "blocked" | "error";
export type Event = { kind: string; round: number; binding?: string; detail: string; usage?: Usage; wallMs?: number };
export type Outcome = {
  taskId: string;
  pattern: Crew["pattern"];
  status: Status;
  reason: string;
  rounds: number;
  steps: number;
  usage: Record<string, Usage>;
  findings: RecordedFinding[];
  events: Event[];
};

const MAX_DIFF_CHARS = 60_000;
const SEVERITIES = ["blocker", "major", "minor"];

export const WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary"],
  properties: { status: { type: "string", enum: ["done", "blocked"] }, summary: { type: "string" } },
};
const FINDINGS = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["file", "line", "severity", "issue", "evidence"],
    properties: {
      file: { type: "string" },
      line: { type: "integer" },
      severity: { type: "string", enum: SEVERITIES },
      issue: { type: "string" },
      evidence: { type: "string" },
    },
  },
};
export const PRE_REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "findings"],
  properties: { verdict: { type: "string", enum: ["approve", "request_changes"] }, findings: FINDINGS },
};
export const REVIEW_SCHEMA = {
  ...PRE_REVIEW_SCHEMA,
  required: ["verdict", "findings", "confirmed_candidates"],
  properties: { ...PRE_REVIEW_SCHEMA.properties, confirmed_candidates: { type: "array", items: { type: "string" } } },
};

// Wording drifts between rounds; case, punctuation and spacing must not hide a repeat.
export const fingerprint = (f: Finding) =>
  `${f.file}:${f.issue.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function cleanFindings(raw: unknown, limits: Limits): Finding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f) => f && typeof f.file === "string" && typeof f.issue === "string")
    .slice(0, limits.maxFindings)
    .map((f) => ({
      file: f.file,
      line: Number.isInteger(f.line) ? f.line : 0,
      severity: SEVERITIES.includes(f.severity) ? f.severity : "minor",
      issue: clip(f.issue, limits.maxFindingChars),
      evidence: clip(String(f.evidence ?? ""), limits.maxFindingChars),
    }));
}

const checkLines = (checks: CheckResult[]) => checks.map((c) => `- \`${c.cmd}\` exit ${c.exit}`).join("\n");
const findingLine = (f: Finding) => `${f.file}:${f.line} [${f.severity}] ${f.issue} (${f.evidence})`;

function writerBrief(task: Task, open: Finding[], lastChecks: CheckResult[]): string {
  const failing = lastChecks.filter((c) => c.exit !== 0);
  return [
    `You are the writer for task ${task.id}.`,
    `Goal: ${task.goal}`,
    `Change only: ${task.allowedPaths.join(", ")}`,
    `The harness will run these checks:\n${task.checks.map((c) => `- \`${c}\``).join("\n")}`,
    failing.length ? `Failing checks from your last attempt:\n${failing.map((c) => `- \`${c.cmd}\` exit ${c.exit}\n${c.tail}`).join("\n")}` : "",
    open.length ? `Review findings to address:\n${open.map((f) => `- ${findingLine(f)}`).join("\n")}` : "",
    "Edit the working directory. Do not commit. Reply only with JSON: status done or blocked, and a one-line summary.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function reviewBrief(task: Task, diff: string, checks: CheckResult[], candidates: Finding[]): string {
  return [
    `You are the reviewer for task ${task.id}. Read only: do not edit anything.`,
    `Goal: ${task.goal}`,
    `Check results, run by the harness:\n${checkLines(checks)}`,
    candidates.length
      ? `Candidate findings from a pre-reviewer. List in confirmed_candidates only the ids you verify in the diff:\n${candidates
          .map((f, i) => `- c${i + 1}: ${f.file}:${f.line} ${f.issue}`)
          .join("\n")}`
      : "",
    `Diff against the base commit:\n\`\`\`diff\n${clip(diff, MAX_DIFF_CHARS)}\n\`\`\``,
    "Reply only with JSON: verdict approve or request_changes, findings for correctness problems only, and confirmed_candidates.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function runTask(task: Task, crew: Crew, runners: Record<string, Runner>, ws: Workspace): Promise<Outcome> {
  const { limits, roles } = crew;
  const out: Outcome = { taskId: task.id, pattern: crew.pattern, status: "error", reason: "", rounds: 0, steps: 0, usage: {}, findings: [], events: [] };
  const finish = (status: Status, reason: string) => {
    out.status = status;
    out.reason = reason;
    out.events.push({ kind: "done", round: out.rounds, detail: `${status}: ${reason}` });
    return out;
  };
  // Every model call is a step; the step cap bounds total spend whatever the pattern.
  const call = async (kind: Role, b: Binding, prompt: string, writable: boolean, schema: object): Promise<Parsed | "capped"> => {
    if (out.steps >= limits.maxSteps) return "capped";
    out.steps++;
    const res = await runners[b.name].run({ role: kind, prompt, cwd: ws.dir, writable, schema });
    const u = (out.usage[b.name] ??= { input: 0, output: 0, cached: 0 });
    u.input += res.usage.input;
    u.output += res.usage.output;
    u.cached += res.usage.cached;
    out.events.push({ kind, round: out.rounds, binding: b.name, detail: res.ok ? "ok" : res.error, usage: res.usage, wallMs: res.wallMs });
    return res;
  };

  let writer = roles.writer;
  const fallbacks = [...roles.fallback];
  let open: Finding[] = [];
  let lastChecks: CheckResult[] = [];
  let prevDiff: string | undefined;
  let prevPrints = new Set<string>();

  while (true) {
    if (out.rounds >= limits.maxRounds) return finish("capped", "round cap reached");
    out.rounds++;

    let answer: { status: string; summary: string } | undefined;
    while (!answer) {
      const w = await call("writer", writer, writerBrief(task, open, lastChecks), true, WRITER_SCHEMA);
      if (w === "capped") return finish("capped", "step cap reached");
      if (w.ok && ["done", "blocked"].includes((w.json as any)?.status)) {
        answer = w.json as { status: string; summary: string };
        break;
      }
      const why = w.ok ? "writer answer has no valid status" : w.error;
      const next = fallbacks.shift();
      if (!next) return finish("error", why);
      out.events.push({ kind: "fallback", round: out.rounds, binding: next.name, detail: `${writer.name} failed: ${why}` });
      writer = next;
    }
    if (answer.status === "blocked") return finish("blocked", answer.summary);

    const diff = await ws.diff();
    if (diff === prevDiff) return finish("loop", "writer made no change");
    prevDiff = diff;
    const checks = await ws.check(task.checks);
    const green = checks.every((c) => c.exit === 0);
    out.events.push({ kind: "checks", round: out.rounds, detail: checkLines(checks) });

    if (!roles.reviewer) {
      if (green) return finish("green", "checks pass");
      open = [];
      lastChecks = checks;
      continue;
    }

    let candidates: Finding[] = [];
    if (roles.preReviewer) {
      const p = await call("pre_reviewer", roles.preReviewer, reviewBrief(task, diff, checks, []), false, PRE_REVIEW_SCHEMA);
      if (p === "capped") return finish("capped", "step cap reached");
      if (p.ok) candidates = cleanFindings((p.json as any)?.findings, limits);
    }

    const r = await call("reviewer", roles.reviewer, reviewBrief(task, diff, checks, candidates), false, REVIEW_SCHEMA);
    if (r === "capped") return finish("capped", "step cap reached");
    if (!r.ok) return finish("error", `reviewer failed: ${r.error}`);
    const review = r.json as { verdict?: string; findings?: unknown; confirmed_candidates?: unknown };
    const confirmedIds = new Set(Array.isArray(review.confirmed_candidates) ? review.confirmed_candidates.map(String) : []);
    const confirmed = candidates.filter((_, i) => confirmedIds.has(`c${i + 1}`));
    const own = cleanFindings(review.findings, limits);

    const record = (fs: Finding[], by: string, isConfirmed?: (i: number) => boolean) =>
      fs.forEach((f, i) => out.findings.push({ ...f, round: out.rounds, by, fingerprint: fingerprint(f), confirmed: isConfirmed?.(i) }));
    if (roles.preReviewer) record(candidates, roles.preReviewer.name, (i) => confirmedIds.has(`c${i + 1}`));
    record(own, roles.reviewer.name);

    if (green && review.verdict === "approve") return finish("green", "checks pass and reviewer approves");

    open = [...own, ...confirmed].slice(0, limits.maxFindings);
    const prints = new Set(open.map(fingerprint));
    if ([...prints].some((p) => prevPrints.has(p))) return finish("loop", "same finding raised again");
    prevPrints = prints;
    lastChecks = checks;
  }
}
