// View models for the task journey; M5 fills them from the task's event log.
import type { NeedsYouChoice, NeedsYouItem } from "../approvals/model";

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
  waiting: "waiting",
  idle: "idle",
};

/** The stage strip's words: a stage that hasn't begun is not started, not waiting. */
export const stageLightLabel: Record<Light, string> = { ...lightLabel, waiting: "not started" };

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
  if (all === 0) return `No checks have reported on ${where} yet.`;
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
  /** The screenshot it can be seen on. */
  shot?: string;
};

/** `via` is the code a finding is about, so tracing it skips the rest of that run. */
export type TraceLink = { from: string; to: string; via?: string };

export type Coverage = { covered: number; uncovered: number; unknown: number; excluded: number };

/** How each done-when line links to the code, what Bezl ran and what needs you. */
export type Trace = { nodes: TraceNode[]; links: TraceLink[]; coverage?: Coverage };

/** A step toward the goal: something that needs you, and the done-when lines it blocks. */
export type Step = { node: TraceNode; blocks: TraceNode[] };

export function pathOf(trace: Trace): Step[] {
  return trace.nodes
    .filter((n) => n.column === "decide")
    .map((node) => {
      const lit = lineage(trace, node.id);
      return { node, blocks: trace.nodes.filter((n) => n.column === "intent" && lit.has(n.id)) };
    });
}

/** A link out of the goal is only the plan's word; Bezl checked every other link. */
export function planClaim({ nodes }: Trace, link: TraceLink): boolean {
  return nodes.find((n) => n.id === link.from)?.column === "intent";
}

/** Everything one node leads from and to. */
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

/** Counts every changed line once; a count of zero goes unsaid. */
export function coverageText(c: Coverage): string {
  const total = c.covered + c.uncovered + c.unknown + c.excluded;
  const parts: [number, string][] = [
    [c.covered, "ran in a test"],
    [c.uncovered, "never ran"],
    [c.unknown, "Bezl can't measure"],
    [c.excluded, "excluded"],
  ];
  const said = parts.filter(([n]) => n > 0).map(([n, what]) => `${n} ${what}`);
  return `${total} lines changed: ${said.join(", ")}`;
}

export type ShotSize = "phone" | "desktop";

export const shotWidth: Record<ShotSize, number> = { phone: 375, desktop: 1280 };

/** A finding Bezl placed on a screenshot; x and y are percentages of it. */
export type ShotPin = {
  size: ShotSize;
  x: number;
  y: number;
  text: string;
  /** The trace node it is about, so the map can show where it comes from. */
  node?: string;
};

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
  /** Review's lines before and after the attempt. */
  compare?: Comparison;
  /** How the stage's problems can go back; the first fixer is the writer. */
  sendBack?: SendBackOptions;
  /** Bezl closed mid-step; the step waits for you, never restarting on its own. */
  interrupted?: boolean;
};

export type Fixer = { id: string; name: string; minutes: number; usage: string };
export type AfterCheck = { id: string; label: string; note: string; minutes: number };
export type SendBackOptions = { fixers: Fixer[]; checks: AfterCheck[]; paths: string[] };
export type SendBackPlan = { fixer: string; checks: string[] };

/** The fixer's own time plus each check that runs after; usage is the fixer's. */
export function estimate(
  { fixers, checks }: SendBackOptions,
  plan: SendBackPlan,
): { minutes: number; usage: string } {
  const fixer = fixers.find((f) => f.id === plan.fixer) ?? fixers[0];
  const after = checks.filter((c) => plan.checks.includes(c.id));
  return {
    minutes: after.reduce((n, c) => n + c.minutes, fixer?.minutes ?? 0),
    usage: fixer?.usage ?? "",
  };
}

export type CompareCell = { light: Light; text: string };

/** Where a line's proof is: its screenshot, its trace node, the code. */
export type Proof = { shot?: string; node?: string; where?: string };

/** One line of a comparison: a cell per column, keyed by the column's id. */
export type CompareRow = {
  group: string;
  label: string;
  cells: Record<string, CompareCell>;
  proof?: Proof;
};

/** Review's lines as they are on main and after the attempt; summary says why it's ready. */
export type Comparison = {
  summary: string;
  columns: { id: string; name: string }[];
  rows: CompareRow[];
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

/** How far the change reaches; `from` names what the risk is based on. */
export type Impact = { risk: Risk; reach: string; from: string };

export type DoneWhen = {
  text: string;
  checker: string;
  light: Light;
  status: string;
  /** Its node in the task's trace. */
  node?: string;
};

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

/** One set of changes: its files, then lines added and removed. */
function sizeLabel(set: FileChange[]): string {
  const [added, removed] = set.reduce(([a, r], f) => [a + f.added, r + f.removed], [0, 0]);
  return `${files(new Set(set.map((f) => f.path)).size)} · ${diffLabel({ path: "", added, removed })}`;
}

/** Ship's kept attempt wins; otherwise the latest stage with attempts. */
function fileSets(task: JourneyTask): FileChange[][] {
  const kept = task.views.ship.ship?.files;
  const { review, build } = task.views;
  const takes = [review.takes, build.takes].find((t) => t?.length) ?? [];
  return kept ? [kept] : takes.map((t) => t.files ?? []).filter((f) => f.length > 0);
}

function changed(task: JourneyTask): { label: string; any: boolean } {
  const sets = fileSets(task);
  if (sets.length === 0) return { label: "Nothing changed yet", any: false };
  const paths = new Set(sets.flat().map((f) => f.path));
  if (sets.length > 1)
    return { label: `${files(paths.size)} across ${sets.length} attempts`, any: true };
  return { label: sizeLabel(sets[0] ?? []), any: true };
}

/** The summary under the stages: what it's for, how big, how sure. */
export function contextOf(task: JourneyTask): TaskContext {
  const lines = task.doneWhen ?? [];
  const proven = lines.filter((l) => l.light === "done").length;
  const checked = lines.some((l) => l.light !== "waiting");
  const shown = new Set(stageIds.flatMap((id) => task.views[id].shots ?? []).map((s) => s.screen));
  const touches = changed(task);
  return {
    goal: task.views.define.quote ?? task.title,
    touches: touches.label,
    screens: touches.any ? shown.size : 0,
    evidence: checked ? `${proven} of ${lines.length} proven` : "Not checked yet",
    proven,
    lines: lines.length,
  };
}

export type ProviderUsage = { name: string; used: string };

/** A line's state as one word; reuses the lights. */
export const lineWord: Record<Light, string> = {
  done: "Works",
  failed: "Fails",
  needsYou: "Needs you",
  waiting: "Not checked yet",
  working: "Checking",
};

export type Asked = { item: NeedsYouItem; choice: NeedsYouChoice };

/** A done-when line, or the loose entry, with everything tied to it at this stage. */
/** A Review check that is no done-when line: main's cell, then now's. */
export type OtherCheck = { label: string; was?: CompareCell; now?: CompareCell };

export type LineEntry = {
  /** `line-<index>`; `other` for Review's other checks; `loose` for what ties to no line. */
  key: string;
  title: string;
  light?: Light;
  /** One short reason; on Review, `was` (main's light) stands in for it. */
  reason?: string;
  was?: Light;
  checker?: string;
  node?: string;
  questions: NeedsYouItem[];
  answered: Asked[];
  problems: Problem[];
  shots: string[];
  /** Changed code and what ran, from the trace. */
  code: TraceNode[];
  ran: TraceNode[];
  /** Only the plan links this code to the line. */
  claimed: boolean;
  /** Changed files tied to no line; loose entry only. */
  files: FileChange[];
  /** Other entry only. */
  checks: OtherCheck[];
};

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

// A file is tied when a changed node's meta names it, e.g. "Projects.tsx:41".
const fileOf = (meta: string) => meta.split(/[:\s]/)[0] ?? "";

/** Lines, then the loose entry if anything ties to none; questions and problems by their trace node. */
export function entriesOf(
  task: JourneyTask,
  stage: StageId,
  open: NeedsYouItem[],
  answered: Asked[],
): LineEntry[] {
  const view = task.views[stage];
  const trace = task.trace;
  const lines = task.doneWhen ?? [];
  // Which lines a node holds up: the done-when nodes upstream of it.
  const linesOf = (node?: string): number[] => {
    if (!trace || !node) return [];
    const lit = lineage(trace, node);
    return lines.flatMap((l, i) => (l.node && lit.has(l.node) ? [i] : []));
  };
  const checked = stageIds.indexOf(stage) >= stageIds.indexOf("check");
  const built = stageIds.indexOf(stage) >= stageIds.indexOf("build");
  const stageShots = new Set((view.shots ?? []).map((s) => s.id));
  const entries: LineEntry[] = lines.map((line, i) => {
    const lit = trace && line.node ? lineage(trace, line.node) : new Set<string>();
    const nodes = trace?.nodes.filter((n) => lit.has(n.id)) ?? [];
    const row = view.compare?.rows.find((r) => r.label === line.text);
    const proofNode = trace?.nodes.find((n) => n.id === row?.proof?.node);
    const ran = nodes.filter((n) => n.column === "measured");
    if (proofNode && !lit.has(proofNode.id)) ran.push(proofNode);
    const shots = [row?.proof?.shot, ...nodes.map((n) => n.shot)].filter(
      (s): s is string => Boolean(s) && stageShots.has(s as string),
    );
    return {
      key: `line-${i}`,
      title: line.text,
      checker: line.checker,
      ...(line.node ? { node: line.node } : {}),
      questions: open.filter((q) => linesOf(q.why).includes(i)),
      answered: answered.filter((a) => linesOf(a.item.why).includes(i)),
      problems: (view.problems ?? []).filter((p) => linesOf(p.why).includes(i)),
      shots: [...new Set(shots)],
      code: nodes.filter((n) => n.column === "change"),
      ran,
      claimed: Boolean(trace?.links.some((l) => l.from === line.node && planClaim(trace, l))),
      files: [],
      checks: [],
    };
  });
  for (const [i, e] of entries.entries()) {
    const line = lines[i] as DoneWhen;
    const after = view.compare?.rows.find((r) => r.label === line.text);
    const [before, now] = (view.compare?.columns ?? []).map((c) => after?.cells[c.id]);
    if (e.questions.length) {
      e.light = "needsYou";
      e.reason = count(e.questions.length, "question for you", "questions for you");
    } else if (e.problems.length) {
      e.light = "failed";
      e.reason =
        e.problems.length === 1
          ? (e.problems[0] as Problem).title
          : `${e.problems.length} problems`;
    } else if (before && now) {
      e.light = now.light;
      e.was = before.light;
    } else if (!checked) {
      e.light = "waiting";
      e.reason = line.checker;
    } else {
      e.light = line.light;
      e.reason = line.status;
    }
  }
  const tied = new Set(entries.flatMap((e) => e.code.map((n) => fileOf(n.meta))));
  const files = built
    ? [
        ...new Map(
          fileSets(task)
            .flat()
            .map((f) => [f.path, f]),
        ).values(),
      ].filter((f) => !tied.has(f.path.split("/").at(-1) ?? ""))
    : [];
  const loose: LineEntry = {
    key: "loose",
    title: "Not tied to a line",
    questions: open.filter((q) => linesOf(q.why).length === 0),
    answered: answered.filter((a) => linesOf(a.item.why).length === 0),
    problems: (view.problems ?? []).filter((p) => linesOf(p.why).length === 0),
    shots: [],
    code: [],
    ran: [],
    claimed: false,
    files,
    checks: [],
  };
  if (loose.questions.length) loose.light = "needsYou";
  else if (loose.problems.length) loose.light = "failed";
  const parts = [
    loose.questions.length ? count(loose.questions.length, "question", "questions") : "",
    loose.problems.length ? count(loose.problems.length, "problem", "problems") : "",
    files.length ? count(files.length, "changed file", "changed files") : "",
  ].filter(Boolean);
  if (parts.length) loose.reason = parts.join(", ");
  const empty = !loose.questions.length && !loose.answered.length && !loose.problems.length;
  const other = otherOf(view.compare, lines);
  return [...entries, ...(other ? [other] : []), ...(empty && !files.length ? [] : [loose])];
}

/** Review's rows that match no line, as one entry; its light is the worst of now. */
function otherOf(compare: Comparison | undefined, lines: DoneWhen[]): LineEntry | null {
  const [before, now] = compare?.columns ?? [];
  const checks = (compare?.rows ?? [])
    .filter((r) => !lines.some((l) => l.text === r.label))
    .map((r) => ({
      label: r.label,
      ...(before && r.cells[before.id] ? { was: r.cells[before.id] } : {}),
      ...(now && r.cells[now.id] ? { now: r.cells[now.id] } : {}),
    }));
  if (!checks.length) return null;
  const lights = checks.map((c) => c.now?.light);
  const light: Light = lights.includes("failed")
    ? "failed"
    : lights.includes("needsYou")
      ? "needsYou"
      : "done";
  return {
    key: "other",
    title: "Other checks",
    light,
    reason: count(checks.length, "check", "checks"),
    questions: [],
    answered: [],
    problems: [],
    shots: [],
    code: [],
    ran: [],
    claimed: false,
    files: [],
    checks,
  };
}

/** The first entry that needs you, else the first that fails, else the first. */
export function firstPick(entries: LineEntry[]): string {
  const by = (light: Light) => entries.find((e) => e.light === light);
  return (by("needsYou") ?? by("failed") ?? entries[0])?.key ?? "";
}
