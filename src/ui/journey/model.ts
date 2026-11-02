// View models for the task journey; M5 fills them from the task's event log.
import type { NeedsYouItem } from "../approvals/model";

export const stageIds = ["define", "plan", "build", "check", "review", "ship"] as const;
export type StageId = (typeof stageIds)[number];

export const stageLabel: Record<StageId, string> = {
  define: "Define",
  plan: "Plan",
  build: "Build",
  check: "Check",
  review: "Review",
  ship: "Ship",
};

/** One hue per meaning: teal working, amber needs you, red failed, green done. */
export type Light = "done" | "working" | "needsYou" | "failed" | "waiting";
export type StageLights = Record<StageId, Light>;
export type TaskLight = "working" | "needsYou" | "failed" | "passed" | "idle";

export const lightLabel: Record<Light | TaskLight, string> = {
  done: "done",
  passed: "passed",
  working: "working",
  needsYou: "needs you",
  failed: "failed",
  waiting: "not started",
  idle: "idle",
};

/** What needs you comes first, then failures, then live work. */
export function taskLight(stages: StageLights): TaskLight {
  const lights = stageIds.map((id) => stages[id]);
  if (lights.includes("needsYou")) return "needsYou";
  if (lights.includes("failed")) return "failed";
  if (lights.includes("working")) return "working";
  return lights.every((l) => l === "done") ? "passed" : "idle";
}

/** A waiting stage shows its number; any other light shows its word. */
export function stageMarker(light: Light, index: number): string {
  return light === "waiting" ? String(index + 1) : lightLabel[light];
}

export type Row = {
  text: string;
  /** Short trailing fact, such as who checks it or a count. */
  meta?: string;
  light?: Light;
  /** Code, paths and commands keep a mono face. */
  mono?: boolean;
};

export type Section = { title: string; rows: Row[] };

export type FileChange = { path: string; added: number; removed: number };

export function diffLabel({ added, removed }: FileChange): string {
  return removed > 0 ? `+${added} −${removed}` : `+${added}`;
}

export type Finding = { text: string; where?: string; light: Light };

export type Take = {
  /** A, B: the take's letter in its task. */
  id: string;
  model: string;
  state: string;
  light: Light;
  /** One line under the header: what the take is doing now. */
  activity?: string;
  files?: FileChange[];
  /** Set on Review: the other provider's one-line verdict. */
  verdict?: { by: string; text: string };
  findings?: Finding[];
};

export type Problem = {
  title: string;
  kind: "failing" | "untested";
  where: string;
  /** Plain sentence of what is wrong. */
  detail: string;
  /** Output or facts, one per line, as Bezl saw them. */
  evidence: string[];
  /** Who the problem goes to: the writer of its take. */
  writer: string;
  /** Its node in the task's trace. */
  why?: string;
};

export type ShipSummary = {
  title: string;
  summary: string;
  facts: string[];
  files: FileChange[];
  /** Each stage in a sentence; this goes into the pull request's description. */
  history: { stage: StageId; text: string }[];
  /** Where Open lands the pull request. */
  pullRequest: { number: number; url: string };
  /** Shown once the pull request is open. */
  ci?: CiStatus;
};

export type CiCheck = { name: string; state: "passed" | "failed" | "running"; url: string };

/** The pull request's checks, then the merged commit's; shown, never a gate. */
export type CiStatus = { checks: CiCheck[] } & (
  | { on: "pullRequest" }
  | { on: "merge"; commit: string }
);

const checks = (n: number) => (n === 1 ? "1 check" : `${n} checks`);

/** Failures first, then what is still running, then where everything passed. */
export function ciText(ci: CiStatus): string {
  const count = (state: CiCheck["state"]) => ci.checks.filter((c) => c.state === state).length;
  const [all, passed, failed, running] = [
    ci.checks.length,
    count("passed"),
    count("failed"),
    count("running"),
  ];
  if (failed > 0)
    return `${failed} of ${checks(all)} failed. Open ${failed === 1 ? "its log" : "their logs"} to see why.`;
  if (running > 0)
    return `${passed} of ${checks(all)} ${passed === 1 ? "has" : "have"} passed, and ${running} ${running === 1 ? "is" : "are"} still running.`;
  const where = ci.on === "merge" ? `the merged commit ${ci.commit}` : "the pull request";
  return `${all === 1 ? "The check" : `All ${checks(all)}`} passed on ${where}.`;
}

export type TraceColumn = "intent" | "change" | "measured" | "decide";

export const traceColumns: { id: TraceColumn; name: string }[] = [
  { id: "intent", name: "From the goal" },
  { id: "change", name: "What changed" },
  { id: "measured", name: "What Bezl ran" },
  { id: "decide", name: "What needs you" },
];

export type TraceNode = {
  id: string;
  column: TraceColumn;
  title: string;
  meta: string;
  light: Light;
};

/** `via` is the code a finding is about, so tracing it skips the rest of that run. */
export type TraceLink = { from: string; to: string; via?: string };

export type Coverage = { covered: number; uncovered: number; unknown: number; excluded: number };

/** How each done-when line reaches what Bezl measured and what needs you. */
export type Trace = { nodes: TraceNode[]; links: TraceLink[]; coverage?: Coverage };

/** Everything upstream and downstream of one node. */
export function lineage({ links }: Trace, start: string): Set<string> {
  const lit = new Set([start]);
  const up = (cur: string) => {
    for (const l of links)
      if (l.to === cur && !lit.has(l.from)) {
        lit.add(l.from);
        if (l.via) lit.add(l.via);
        up(l.via ?? l.from);
      }
  };
  const down = (cur: string) => {
    // Starting from a run shows all its findings; otherwise only those on lit code.
    for (const l of links)
      if (l.from === cur && !lit.has(l.to) && (!l.via || cur === start || lit.has(l.via))) {
        lit.add(l.to);
        down(l.to);
      }
  };
  up(start);
  down(start);
  return lit;
}

/** Every changed line lands in one bucket; empty buckets go unsaid. */
export function coverageText(c: Coverage): string {
  const total = c.covered + c.uncovered + c.unknown + c.excluded;
  const parts: [number, string][] = [
    [c.covered, "run in a test"],
    [c.uncovered, "never run"],
    [c.unknown, "Bezl can't measure"],
    [c.excluded, "excluded"],
  ];
  const said = parts.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`);
  return `${total} changed lines: ${said.join(", ")}`;
}

export type ShotSize = "phone" | "desktop";

export const shotWidth: Record<ShotSize, number> = { phone: 375, desktop: 1280 };

/** A finding Bezl placed on a screenshot; x and y are percentages of it. */
export type ShotPin = { size: ShotSize; x: number; y: number; text: string };

/** One state of a screen Bezl captured at both sizes; an example is a choice not built yet. */
export type Shot = {
  id: string;
  name: string;
  screen: string;
  from: string;
  commit: string;
  images: Record<ShotSize, string>;
  example?: boolean;
  findings?: ShotPin[];
};

export type StageView = {
  /** Screens as Bezl captured them at this stage. */
  shots?: Shot[];
  /** Questions Bezl answered, sent back or merged, so they never reached you. */
  handled?: Handled[];
  /** The status sentence: a bold lead, then the rest. */
  lead: string;
  /** Who acted at this stage, or who acts next; the flow shows it. */
  by?: string;
  rest?: string;
  /** The operator's own words, shown as a quote. */
  quote?: string;
  sections: Section[];
  takes?: Take[];
  problems?: Problem[];
  /** Checks that passed; folded away, since Check shows problems first. */
  passed?: Row[];
  ship?: ShipSummary;
};

export type JourneyTask = {
  id: string;
  title: string;
  repo: string;
  stages: StageLights;
  /** Where the task stands now; opens first. */
  current: StageId;
  views: Record<StageId, StageView>;
  /** Define's done-when lines, lit by what Bezl has proven so far. */
  doneWhen?: DoneWhen[];
  /** Answers you gave earlier, kept with the stage that asked. */
  decisions?: Decision[];
  assumptions?: Assumption[];
  /** Examples of choices not built yet, shown while you point at one. */
  examples?: Shot[];
  trace?: Trace;
  impact?: Impact;
};

export type Risk = "low" | "medium" | "high";

/** How far the change reaches, as Bezl judged it from what changed. */
export type Impact = { risk: Risk; reach: string };

export type DoneWhen = { text: string; checker: string; light: Light; status: string };

export type Decision = { stage: StageId; text: string };

/** A guess the agents made instead of asking; changing it asks you. */
export type Assumption = {
  id: string;
  text: string;
  question: Pick<NeedsYouItem, "prompt" | "blocks" | "choices" | "recommended">;
};

/** A question Bezl kept from you, and why. */
export type Handled = {
  text: string;
  outcome: string;
  by: "answered" | "returned" | "merged" | "dropped";
};

export type TaskContext = {
  goal: string;
  touches: string;
  screens: number;
  evidence: string;
  /** Done-when lines proven, of all lines. */
  proven: number;
  lines: number;
};

const files = (n: number) => (n === 1 ? "1 file" : `${n} files`);
export const screenCount = (n: number) => (n === 1 ? "1 screen" : `${n} screens`);

/** Ship's kept attempt wins; otherwise the latest stage with attempts. */
function changed(task: JourneyTask): string {
  const kept = task.views.ship.ship?.files;
  const takes = task.views.review.takes ?? task.views.build.takes ?? [];
  const sets = kept ? [kept] : takes.map((t) => t.files ?? []).filter((f) => f.length > 0);
  if (sets.length === 0) return "Nothing changed yet";
  const paths = new Set(sets.flat().map((f) => f.path));
  if (sets.length > 1) return `${files(paths.size)} across ${sets.length} attempts`;
  const [added, removed] = (sets[0] ?? []).reduce(
    ([a, r], f) => [a + f.added, r + f.removed],
    [0, 0],
  );
  return `${files(paths.size)} · ${diffLabel({ path: "", added, removed })}`;
}

/** The tiles under the stages: what it's for, how big, how sure. */
export function contextOf(task: JourneyTask): TaskContext {
  const lines = task.doneWhen ?? [];
  const proven = lines.filter((l) => l.light === "done").length;
  const checked = lines.some((l) => l.light !== "waiting");
  const shown = new Set(stageIds.flatMap((id) => task.views[id].shots ?? []).map((s) => s.screen));
  const touches = changed(task);
  return {
    goal: task.views.define.quote ?? task.title,
    touches,
    screens: touches === "Nothing changed yet" ? 0 : shown.size,
    evidence: checked ? `${proven} of ${lines.length} proven` : "Not checked yet",
    proven,
    lines: lines.length,
  };
}

export type ProviderUsage = { name: string; used: string };
