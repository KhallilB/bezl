import type {
  Assumption,
  CiCheck,
  CiStatus,
  Comparison,
  DoneWhen,
  JourneyTask,
  Light,
  ProviderUsage,
  Shot,
  StageView,
  Take,
  Trace,
  TraceNode,
} from "./model";
import checklistDesktop from "./samples/projects-checklist-desktop.jpg";
import checklistPhone from "./samples/projects-checklist-phone.jpg";
import emptyDesktop from "./samples/projects-empty-desktop.jpg";
import emptyPhone from "./samples/projects-empty-phone.jpg";
import loadingDesktop from "./samples/projects-loading-desktop.jpg";
import loadingPhone from "./samples/projects-loading-phone.jpg";
import tableDesktop from "./samples/projects-table-desktop.jpg";
import tablePhone from "./samples/projects-table-phone.jpg";
import warmDesktop from "./samples/projects-warm-desktop.jpg";
import warmPhone from "./samples/projects-warm-phone.jpg";

// Sample data only; shapes match what M5 projects from the task log.

const define = (quote: string, done: DoneWhen[]): StageView => ({
  lead: "Ready to start.",
  by: "You, from the issue",
  rest: "The goal covers everything a coding agent needs.",
  quote,
  sections: [
    {
      title: "It's done when",
      rows: done.map(({ text, checker }) => ({ text, meta: checker, light: "done" })),
    },
  ],
});

const line = (text: string, checker: string, light: DoneWhen["light"], status: string) => ({
  text,
  checker,
  light,
  status,
});
const unchecked = (text: string, checker: string) => line(text, checker, "waiting", "after Build");

const emptyDone: DoneWhen[] = [
  line("The empty state shows when there are no projects", "Tests check", "done", "proven"),
  line(
    "There's one clear way to create the first project",
    "You check",
    "needsYou",
    "You check in Review",
  ),
  line("The page passes accessibility checks", "Bezl checks", "done", "0 issues"),
  line("Existing tests still pass", "Bezl checks", "done", "48 passed"),
];

// Screenshots of studio-web's Projects page, as Bezl's checks capture them.
const projects = (
  id: string,
  name: string,
  from: string,
  commit: string,
  phone: string,
  desktop: string,
  more: Partial<Shot> = {},
): Shot => ({ id, name, screen: "Projects", from, commit, images: { phone, desktop }, ...more });

const today = projects("today", "Today", "main", "9b0f3d1", tablePhone, tableDesktop);
const shotA = projects("a", "Attempt A", "Claude Code", "4e1c2b9", emptyPhone, emptyDesktop);
const shotB = projects("b", "Attempt B", "Codex", "7d2a610", checklistPhone, checklistDesktop);
const loadingA = projects(
  "a-loading",
  "A, loading",
  "Claude Code",
  "4e1c2b9",
  loadingPhone,
  loadingDesktop,
);
const importLink = "The Import from GitHub link does nothing yet";
const reviewedA: Shot = {
  ...shotA,
  findings: [
    { size: "phone", x: 50, y: 62.8, text: importLink },
    { size: "desktop", x: 50, y: 59.2, text: importLink },
  ],
};
const warm = projects(
  "warm",
  "Example: warm copy",
  "Claude Code",
  "not built",
  warmPhone,
  warmDesktop,
  {
    example: true,
  },
);

const node = (
  id: string,
  column: TraceNode["column"],
  title: string,
  meta: string,
  light: TraceNode["light"] = "done",
): TraceNode => ({ id, column, title, meta, light });

// Attempt A, as Bezl measured it in Check and Codex reviewed it.
const emptyTrace: Trace = {
  nodes: [
    node("i1", "intent", "Shows when there are no projects", "Tests check"),
    node("i2", "intent", "One clear way to create the first project", "You check", "needsYou"),
    node("i3", "intent", "Passes accessibility checks", "Bezl checks"),
    node("projects", "change", "Projects()", "Projects.tsx"),
    node("empty", "change", "EmptyState", "EmptyState.tsx"),
    node("link", "change", "ImportLink", "Projects.tsx:41", "needsYou"),
    node("tests", "measured", "bun run test", "48 passed"),
    node("axe", "measured", "Accessibility", "0 issues"),
    node("shots", "measured", "Screenshots", "375 and 1280 px"),
    node("review", "measured", "Codex review", "1 issue", "needsYou"),
    node(
      "import",
      "decide",
      "Import from GitHub does nothing yet",
      "Codex vs Claude Code",
      "needsYou",
    ),
    node("look", "decide", "Does it look right?", "your call", "needsYou"),
  ],
  links: [
    { from: "i1", to: "projects" },
    { from: "i1", to: "empty" },
    { from: "i2", to: "empty" },
    { from: "i2", to: "link" },
    { from: "i3", to: "empty" },
    { from: "projects", to: "tests" },
    { from: "empty", to: "tests" },
    { from: "empty", to: "axe" },
    { from: "empty", to: "shots" },
    { from: "link", to: "review" },
    { from: "review", to: "import", via: "link" },
    { from: "shots", to: "look" },
  ],
  coverage: { covered: 41, uncovered: 0, unknown: 4, excluded: 6 },
};

const emptyAssumed: Assumption[] = [
  {
    id: "tone",
    text: "The copy follows the app's existing tone",
    question: {
      prompt: "What should the empty state say?",
      blocks: "the empty state's copy",
      recommended: "plain",
      choices: [
        {
          id: "plain",
          label: "No projects yet",
          next: "Matches the other empty states in the app.",
          example: "a",
        },
        {
          id: "warm",
          label: "Let's start your first project",
          next: "Stands out, since the other empty states read plainly.",
          example: "warm",
        },
      ],
    },
  },
  {
    id: "route",
    text: "It stays on the existing Projects page",
    question: {
      prompt: "Where should someone with no projects land?",
      blocks: "the plan",
      recommended: "projects",
      choices: [
        { id: "projects", label: "On Projects", next: "No routing change." },
        {
          id: "home",
          label: "On a new welcome page",
          next: "Adds a route and a redirect, so both attempts grow.",
        },
      ],
    },
  },
];

const takeA: Take = {
  id: "A",
  model: "Claude Code",
  state: "Ready",
  light: "done",
  files: [
    { path: "src/pages/Projects.tsx", added: 31, removed: 4 },
    { path: "src/components/EmptyState.tsx", added: 12, removed: 0 },
    { path: "src/pages/Projects.test.tsx", added: 43, removed: 0 },
  ],
};

const takeB: Take = {
  id: "B",
  model: "Codex",
  state: "Ready",
  light: "done",
  files: [
    { path: "src/pages/Projects.tsx", added: 58, removed: 4 },
    { path: "src/pages/ProjectsChecklist.tsx", added: 74, removed: 0 },
  ],
};

// Each attempt is reviewed by the other coding agent.
const reviewed = (a: string, b: string): Take[] => [
  {
    ...takeA,
    state: a,
    verdict: {
      by: "Codex",
      text: "Clear, and it reuses EmptyState. The import link does nothing yet.",
    },
    findings: [
      {
        text: "The Import from GitHub link does nothing yet",
        where: "Projects.tsx:41",
        light: "needsYou",
      },
    ],
  },
  {
    ...takeB,
    state: b,
    verdict: { by: "Claude Code", text: "Helpful, but the checklist text is too faint to read." },
    findings: [
      {
        text: "Checklist text is too faint, with 2.6:1 contrast where 4.5:1 is needed",
        where: "ProjectsChecklist.tsx:18",
        light: "needsYou",
      },
      { text: "Adds a new card instead of reusing EmptyState", where: "fixed", light: "done" },
    ],
  },
];

const both = (light: Light, text: string) => ({ A: { light, text }, B: { light, text } });

const emptyCompare: Comparison = {
  lean: {
    take: "A",
    why: "it meets the goal once the import link goes, and more of its lines run in a test.",
  },
  rows: [
    { group: "Done when", label: emptyDone[0]?.text ?? "", cells: both("done", "Proven") },
    {
      group: "Done when",
      label: emptyDone[1]?.text ?? "",
      cells: {
        A: { light: "needsYou", text: "The import link does nothing yet" },
        B: { light: "needsYou", text: "A checklist adds a second way in" },
      },
    },
    {
      group: "Done when",
      label: emptyDone[2]?.text ?? "",
      cells: {
        A: { light: "done", text: "0 issues" },
        B: { light: "failed", text: "Contrast 2.6:1, needs 4.5:1" },
      },
    },
    { group: "Done when", label: emptyDone[3]?.text ?? "", cells: both("done", "48 passed") },
    {
      group: "Checks",
      label: "Changed lines run in a test",
      cells: { A: { light: "done", text: "29 of 31" }, B: { light: "needsYou", text: "12 of 20" } },
    },
    { group: "Checks", label: "New dependencies", cells: both("done", "None") },
    {
      group: "Cost",
      label: "Time",
      cells: { A: { light: "done", text: "6 min" }, B: { light: "done", text: "9 min" } },
    },
    {
      group: "Cost",
      label: "Usage",
      cells: {
        A: { light: "done", text: "3% of Claude Code" },
        B: { light: "done", text: "5% of Codex" },
      },
    },
  ],
};

const emptyState: JourneyTask = {
  id: "empty-state",
  title: "Empty state for Projects",
  repo: "studio-web",
  impact: { risk: "low", reach: "Projects page only" },
  current: "review",
  doneWhen: emptyDone,
  decisions: [
    { stage: "define", text: "A filtered list with no matches says so and offers Clear filter." },
    { stage: "plan", text: "Build both approaches and choose in Review." },
  ],
  assumptions: emptyAssumed,
  examples: [warm],
  trace: emptyTrace,
  stages: {
    define: "done",
    plan: "done",
    build: "done",
    check: "done",
    review: "needsYou",
    ship: "waiting",
  },
  views: {
    define: {
      ...define(
        "When someone has no projects yet, the Projects page should help them start one instead of showing an empty table.",
        emptyDone,
      ),
      shots: [today],
    },
    plan: {
      lead: "The plan is done.",
      by: "Claude Code and Codex",
      rest: "All 4 steps are finished.",
      shots: [today],
      sections: [
        {
          title: "Attempt A · Claude Code",
          rows: [
            { text: "Find where Projects renders its table", light: "done" },
            { text: "Reuse EmptyState with one primary action", light: "done" },
            { text: "Add a test for zero projects", light: "done" },
            { text: "Run the accessibility check", light: "done" },
          ],
        },
        {
          title: "Attempt B · Codex",
          rows: [
            { text: "Add a first-project checklist to Projects", light: "done" },
            { text: "Add a test for zero projects", light: "done" },
            { text: "Run the accessibility check", light: "done" },
          ],
        },
      ],
    },
    build: {
      lead: "Build is done.",
      by: "Claude Code and Codex, one attempt each",
      rest: "Both attempts have finished.",
      shots: [shotA, shotB],
      sections: [],
      takes: [
        { ...takeA, state: "Finished", light: "done", activity: "Finished in 6 minutes" },
        { ...takeB, state: "Finished", light: "done", activity: "Finished in 9 minutes" },
      ],
    },
    check: {
      lead: "Everything passed.",
      by: "Bezl ran 3 checks",
      shots: [shotA, loadingA, shotB],
      rest: "Attempt B had two problems at first, but Codex fixed them once they were sent back.",
      sections: [],
      passed: [
        { text: "bun run test", meta: "48 passed", mono: true, light: "done" },
        { text: "Accessibility at 1440 px and 390 px wide", meta: "0 issues", light: "done" },
        { text: "Changed code with no test", meta: "none", light: "done" },
      ],
    },
    review: {
      lead: "Which attempt should ship?",
      by: "Each coding agent reviewed the other's attempt",
      rest: "Each one has been reviewed by the other coding agent, so you can compare them before you choose.",
      sections: [],
      takes: reviewed("Ready", "Ready"),
      compare: emptyCompare,
      shots: [reviewedA, shotB],
      handled: [
        {
          text: "Claude Code on attempt B: two naming nits",
          outcome: "Dropped, because nothing in the changed lines backs them up.",
          by: "dropped",
        },
      ],
    },
    ship: {
      lead: "Nothing to ship yet.",
      by: "Waits on your pick",
      rest: "Ship opens once you choose which attempt to keep.",
      sections: [],
    },
  },
};

const denyDone = [
  unchecked("An empty scope list is refused with a reason", "Tests check"),
  unchecked("Existing grants keep working", "Bezl checks"),
];

const denyScopes: JourneyTask = {
  id: "deny-scopes",
  title: "Refuse tokens with no scopes",
  repo: "bezl",
  impact: { risk: "medium", reach: "Token checks on every request" },
  current: "build",
  doneWhen: denyDone,
  stages: {
    define: "done",
    plan: "done",
    build: "needsYou",
    check: "waiting",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    define: define(
      "A token request with no scopes should be refused, not granted everything.",
      denyDone,
    ),
    plan: {
      lead: "The plan is ready.",
      by: "Codex",
      rest: "Step 2 of 3 is waiting on you.",
      sections: [
        {
          title: "Attempt A · Codex",
          rows: [
            { text: "Add a failing test for an empty scope list", light: "done" },
            { text: "Refuse empty scopes in the policy engine", light: "needsYou" },
            { text: "Update the error message table", light: "waiting" },
          ],
        },
      ],
    },
    build: {
      lead: "Codex has a question.",
      by: "Codex, waiting on you",
      rest: "It stopped before overwriting a file and is waiting for your answer.",
      sections: [],
      takes: [
        {
          id: "A",
          model: "Codex",
          state: "Waiting on you",
          light: "needsYou",
          activity: "Stopped before changing src/policy.rs and has been waiting 6 minutes",
          files: [{ path: "crates/bezl-domain/tests/policy.rs", added: 22, removed: 0 }],
        },
      ],
      handled: [
        {
          text: "Codex asked which error type to use",
          outcome:
            "Sent back to Codex: it's a code choice, and policy.rs already has a pattern for it.",
          by: "returned",
        },
      ],
    },
    check: {
      lead: "Checks haven't run yet.",
      by: "Bezl runs them after Build",
      rest: "They start once Build finishes.",
      sections: [],
    },
    review: {
      lead: "Review hasn't started.",
      by: "Claude Code reviews after Check",
      rest: "It starts once Check is done.",
      sections: [],
    },
    ship: {
      lead: "Nothing to ship yet.",
      by: "Waits on Review",
      rest: "Ship opens once you choose which attempt to keep.",
      sections: [],
    },
  },
};

const debounceDone = [
  unchecked("Each pane resizes at most once every 100 ms", "Tests check"),
  unchecked("The final size is always applied", "Tests check"),
];

const debounce: JourneyTask = {
  id: "debounce",
  title: "Debounce terminal resize",
  repo: "bezl",
  impact: { risk: "low", reach: "Terminal resize only" },
  current: "build",
  doneWhen: debounceDone,
  stages: {
    define: "done",
    plan: "done",
    build: "working",
    check: "waiting",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    define: define(
      "Dragging the window should not resize every terminal on every frame.",
      debounceDone,
    ),
    plan: {
      lead: "Working through the plan.",
      by: "Claude Code",
      rest: "It's on step 2 of 3.",
      sections: [
        {
          title: "Attempt A · Claude Code",
          rows: [
            { text: "Measure resize calls during a drag", light: "done" },
            { text: "Debounce the code that resizes the terminal", light: "working" },
            { text: "Check that the last resize still happens", light: "waiting" },
          ],
        },
      ],
    },
    build: {
      lead: "Claude Code is writing.",
      by: "Claude Code",
      rest: "It started 4 minutes ago.",
      sections: [],
      takes: [
        {
          id: "A",
          model: "Claude Code",
          state: "Writing",
          light: "working",
          activity: "Editing src/ui/terminals/xterm.ts",
          files: [{ path: "src/ui/terminals/xterm.ts", added: 14, removed: 3 }],
        },
      ],
    },
    check: {
      lead: "Checks haven't run yet.",
      by: "Bezl runs them after Build",
      rest: "They start once Build finishes.",
      sections: [],
    },
    review: {
      lead: "Review hasn't started.",
      by: "Codex reviews after Check",
      rest: "It starts once Check is done.",
      sections: [],
    },
    ship: {
      lead: "Nothing to ship yet.",
      by: "Waits on Review",
      rest: "Ship opens once you choose which attempt to keep.",
      sections: [],
    },
  },
};

const snapshotDone = [
  line(
    "A snapshot restores the colours and the cursor position",
    "Tests check",
    "failed",
    "1 failing",
  ),
  line("Snapshots stay in .git/bezl", "Bezl checks", "done", "proven"),
];

const snapshotTrace: Trace = {
  nodes: [
    node("s1", "intent", "Restores the colours and the cursor", "Tests check", "failed"),
    node("s2", "intent", "Snapshots stay in .git/bezl", "Bezl checks"),
    node("viewer", "change", "SnapshotViewer", "Snapshots.tsx · new"),
    node("restore", "change", "restoreSnapshot()", "snapshot.ts:23", "needsYou"),
    node("save", "change", "saveSnapshot()", "snapshot.ts:8"),
    node("browser", "measured", "Browser tests", "1 failed", "failed"),
    node("coverage", "measured", "Coverage", "1 function never runs", "needsYou"),
    node("paths", "measured", "Where files are written", "all in .git/bezl"),
    node("cursor", "decide", "Cursor lands one row low", "Snapshots.browser.test.tsx:58", "failed"),
    node("untested", "decide", "No test covers restoreSnapshot", "snapshot.ts:23", "needsYou"),
  ],
  links: [
    { from: "s1", to: "viewer" },
    { from: "s1", to: "restore" },
    { from: "s2", to: "save" },
    { from: "viewer", to: "browser" },
    { from: "restore", to: "coverage" },
    { from: "save", to: "browser" },
    { from: "save", to: "paths" },
    { from: "browser", to: "cursor", via: "viewer" },
    { from: "coverage", to: "untested", via: "restore" },
  ],
  coverage: { covered: 162, uncovered: 14, unknown: 0, excluded: 8 },
};

const snapshot: JourneyTask = {
  id: "snapshot",
  title: "Terminal snapshot",
  repo: "bezl",
  impact: { risk: "medium", reach: "Terminal snapshots and restore" },
  current: "check",
  doneWhen: snapshotDone,
  trace: snapshotTrace,
  stages: {
    define: "done",
    plan: "done",
    build: "done",
    check: "failed",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    define: define(
      "Save a terminal's screen so it opens again after the pane closes.",
      snapshotDone,
    ),
    plan: {
      lead: "The plan is done.",
      by: "Codex",
      rest: "All 3 steps are finished.",
      sections: [
        {
          title: "Attempt A · Codex",
          rows: [
            { text: "Save the terminal's screen as text", light: "done" },
            { text: "Store snapshots in .git/bezl", light: "done" },
            { text: "Open them in the viewer", light: "done" },
          ],
        },
      ],
    },
    build: {
      lead: "Build is done.",
      by: "Codex",
      rest: "Attempt A finished in 11 minutes.",
      sections: [],
      takes: [
        {
          id: "A",
          model: "Codex",
          state: "Finished",
          light: "done",
          activity: "Finished in 11 minutes",
          files: [
            { path: "src/ui/terminals/Snapshots.tsx", added: 120, removed: 0 },
            { path: "src/ui/terminals/snapshot.ts", added: 64, removed: 0 },
          ],
        },
      ],
    },
    check: {
      lead: "2 things need a look.",
      by: "Bezl ran 6 checks",
      rest: "Everything else passed, so these are all that's left.",
      sections: [],
      problems: [
        {
          title: "Cursor lands one row low",
          kind: "failing",
          where: "src/ui/terminals/Snapshots.browser.test.tsx:58",
          detail: "A restored snapshot puts the cursor one row below where it was saved.",
          evidence: [
            "restores colours and cursor",
            "  expected cursor at row 12",
            "  received row 13",
          ],
          writer: "Codex",
          why: "cursor",
        },
        {
          title: "No test covers restoreSnapshot",
          kind: "untested",
          where: "src/ui/terminals/snapshot.ts:23",
          detail: "This changed code never runs in a test, so nothing shows it works.",
          evidence: [
            "Called by SnapshotViewer.open (SnapshotViewer.tsx:17)",
            "No test reaches it in bun run test coverage",
          ],
          writer: "Codex",
          why: "untested",
        },
      ],
      passed: [
        { text: "cargo test -p bezl-domain", meta: "31 passed", mono: true, light: "done" },
        { text: "bun run typecheck", meta: "0 errors", mono: true, light: "done" },
        { text: "bunx biome check", meta: "clean", mono: true, light: "done" },
        { text: "Accessibility at 1440 px and 390 px wide", meta: "0 issues", light: "done" },
      ],
    },
    review: {
      lead: "Review hasn't started.",
      by: "Claude Code reviews after Check",
      rest: "It starts once Check is done.",
      sections: [],
    },
    ship: {
      lead: "Nothing to ship yet.",
      by: "Waits on Review",
      rest: "Ship opens once you choose which attempt to keep.",
      sections: [],
    },
  },
};

export const tasks: JourneyTask[] = [emptyState, denyScopes, debounce, snapshot];

export const usage: ProviderUsage[] = [
  { name: "Claude Code", used: "64%" },
  { name: "Codex", used: "22%" },
];

const ciNames = ["Lint", "Unit tests", "Browser tests"];
const ci = (states: CiCheck["state"][]): CiCheck[] =>
  ciNames.map((name, i) => ({
    name,
    state: states[i] ?? "running",
    url: `https://github.com/acme/studio-web/actions/runs/${9120 + i}`,
  }));

const prChecks: CiStatus = { on: "pullRequest", checks: ci(["passed", "passed", "running"]) };

/** Same list after you keep attempt A: Review done, Ship waits on you. */
const kept: JourneyTask = {
  ...emptyState,
  current: "ship",
  doneWhen: emptyDone.map((l) =>
    l.light === "needsYou" ? { ...l, light: "done", status: "You kept attempt A" } : l,
  ),
  decisions: [
    ...(emptyState.decisions ?? []),
    { stage: "review", text: "Keep attempt A, with one clear create button." },
  ],
  stages: { ...emptyState.stages, review: "done", ship: "needsYou" },
  views: {
    ...emptyState.views,
    review: {
      lead: "You kept attempt A.",
      by: "You kept it",
      rest: "Attempt B is set aside rather than deleted, in case you want it later.",
      sections: [],
      shots: [reviewedA, shotB],
      takes: reviewed("Kept", "Set aside"),
    },
    ship: {
      lead: "Ready to ship.",
      by: "Bezl opens the pull request",
      rest: "Open the pull request when you are.",
      sections: [],
      shots: [
        { ...today, name: "Before" },
        { ...shotA, name: "After" },
      ],
      ship: {
        title: "Add an empty state to the Projects page",
        summary:
          "Claude Code wrote attempt A and Codex reviewed it. It reuses EmptyState with a single action, “Create your first project”.",
        facts: ["12 of 12 checks passed", "Reviewed by Codex", "Attempt A of 2"],
        files: takeA.files ?? [],
        history: [
          {
            stage: "define",
            text: "Help new users start a project by reusing EmptyState with one clear action",
          },
          { stage: "plan", text: "Claude Code planned 4 steps and Codex planned 3" },
          { stage: "build", text: "Claude Code and Codex each built one attempt" },
          {
            stage: "check",
            text: "Attempt A passed all 12 checks, and attempt B's 2 problems are now fixed",
          },
          { stage: "review", text: "Codex said “Clear, and it reuses EmptyState”" },
        ],
        pullRequest: { number: 42, url: "https://github.com/acme/studio-web/pull/42" },
        ci: prChecks,
      },
    },
  },
};

export const keptTasks: JourneyTask[] = tasks.map((t) => (t.id === kept.id ? kept : t));

/** Kept task after Open: GitHub runs the pull request's checks, then the merged commit's. */
function shipped(
  light: "working" | "done",
  lead: string,
  rest: string,
  status: CiStatus,
): JourneyTask[] {
  const ship = kept.views.ship;
  const task: JourneyTask = {
    ...kept,
    stages: { ...kept.stages, ship: light },
    views: {
      ...kept.views,
      ship: { ...ship, lead, rest, ...(ship.ship ? { ship: { ...ship.ship, ci: status } } : {}) },
    },
  };
  return keptTasks.map((t) => (t.id === task.id ? task : t));
}

export const shippedTasks = {
  checking: shipped(
    "working",
    "Pull request #42 is open.",
    "GitHub is running its checks, and Bezl shows them here as they finish.",
    prChecks,
  ),
  merged: shipped(
    "done",
    "Merged.",
    "GitHub ran every check again on the merged commit, so you know the change works where it landed.",
    { on: "merge", commit: "3f9c2ab", checks: ci(["passed", "passed", "passed"]) },
  ),
};
