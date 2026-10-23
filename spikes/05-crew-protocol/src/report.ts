import type { Outcome, RecordedFinding } from "./protocol";

export type Label = "real" | "false";
export type Labels = Record<string, Label | "unlabelled">;
export type Check = { name: string; pass: boolean; detail: string };
export type Score = {
  tasks: number;
  green: number;
  capOrLoop: number;
  crewTokens: number;
  baselineTokens: number;
  tokenRatio: number;
  realDefects: number;
  unlabelled: number;
  preReview: { candidates: number; confirmed: number; labelledReal: number; labelledFalse: number };
  selfReview: { tasks: number; green: number; taskIds: string[] };
  checks: Check[];
  pass: boolean;
};

export const labelKey = (taskId: string, fingerprint: string) => `${taskId}::${fingerprint}`;

const tokens = (os: Outcome[]) =>
  os.reduce((n, o) => n + Object.values(o.usage).reduce((m, u) => m + u.input + u.output, 0), 0);

// Pre-reviewer candidates carry `confirmed`; only confirmed ones were sent to the writer.
const isCandidate = (f: RecordedFinding) => f.confirmed !== undefined;
const reachedWriter = (f: RecordedFinding) => !isCandidate(f) || f.confirmed === true;

const keysOf = (os: Outcome[], keep: (f: RecordedFinding) => boolean) =>
  new Set(os.flatMap((o) => o.findings.filter(keep).map((f) => labelKey(o.taskId, f.fingerprint))));

export function labelTemplate(os: Outcome[]): Labels {
  return Object.fromEntries([...keysOf(os, () => true)].map((k) => [k, "unlabelled"]));
}

// Self-review runs are reported apart: they cannot help the pass mark, and a
// task lost to one still counts against the green threshold.
export function score(crew: Outcome[], baseline: Outcome[], labels: Labels): Score {
  const cross = crew.filter((o) => !o.sameProviderReview);
  const self = crew.filter((o) => o.sameProviderReview);
  const crossIds = new Set(cross.map((o) => o.taskId));
  const green = cross.filter((o) => o.status === "green").length;
  const capOrLoop = crew.filter((o) => o.status === "capped" || o.status === "loop").length;
  const crewTokens = tokens(cross);
  const baselineTokens = tokens(baseline.filter((o) => crossIds.has(o.taskId)));
  const tokenRatio = baselineTokens ? Math.round((crewTokens / baselineTokens) * 100) / 100 : Infinity;
  const reached = [...keysOf(cross, reachedWriter)];
  const realDefects = reached.filter((k) => labels[k] === "real").length;
  const unlabelled = reached.filter((k) => labels[k] !== "real" && labels[k] !== "false").length;
  const candidates = crew.flatMap((o) => o.findings.filter(isCandidate).map((f) => ({ f, k: labelKey(o.taskId, f.fingerprint) })));
  const needGreen = Math.ceil(crew.length * 0.8);

  const checks: Check[] = [
    {
      name: "green",
      pass: green >= needGreen,
      detail: `${green} of ${crew.length} green with cross-provider review, need ${needGreen}${
        self.length ? `; ${self.length} self-review run${self.length === 1 ? "" : "s"} scored apart` : ""
      }`,
    },
    { name: "no caps or loops", pass: capOrLoop === 0, detail: `${capOrLoop} stopped by a cap or loop` },
    { name: "tokens", pass: tokenRatio <= 2, detail: `${crewTokens} vs baseline ${baselineTokens}, ratio ${tokenRatio}` },
    { name: "real defect", pass: realDefects >= 1, detail: `${realDefects} real, ${unlabelled} unlabelled` },
  ];
  return {
    tasks: crew.length,
    green,
    capOrLoop,
    crewTokens,
    baselineTokens,
    tokenRatio,
    realDefects,
    unlabelled,
    preReview: {
      candidates: candidates.length,
      confirmed: candidates.filter((c) => c.f.confirmed).length,
      labelledReal: candidates.filter((c) => labels[c.k] === "real").length,
      labelledFalse: candidates.filter((c) => labels[c.k] === "false").length,
    },
    selfReview: {
      tasks: self.length,
      green: self.filter((o) => o.status === "green").length,
      taskIds: self.map((o) => o.taskId),
    },
    checks,
    pass: checks.every((c) => c.pass),
  };
}
