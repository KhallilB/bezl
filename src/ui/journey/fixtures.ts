import type { CiCheck, CiStatus, JourneyTask, ProviderUsage, StageView, Take } from "./model";

// Sample data only; shapes match what M5 projects from the task log.

const define = (quote: string, done: [string, string][]): StageView => ({
  lead: "Ready to start.",
  rest: "The goal covers everything a coding agent needs.",
  quote,
  sections: [
    {
      title: "It's done when",
      rows: done.map(([text, meta]) => ({ text, meta, light: "done" })),
    },
  ],
});

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

const emptyState: JourneyTask = {
  id: "empty-state",
  title: "Empty state for Projects",
  repo: "studio-web",
  current: "review",
  stages: {
    define: "done",
    plan: "done",
    build: "done",
    check: "done",
    review: "needsYou",
    ship: "waiting",
  },
  views: {
    define: define(
      "When someone has no projects yet, the Projects page should help them start one instead of showing an empty table.",
      [
        ["The empty state shows when there are no projects", "Tests check"],
        ["There's one clear way to create the first project", "You check"],
        ["The page passes accessibility checks", "Bezl checks"],
        ["Existing tests still pass", "Bezl checks"],
      ],
    ),
    plan: {
      lead: "The plan is done.",
      rest: "All 4 steps are finished.",
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
      rest: "Both attempts have finished.",
      sections: [],
      takes: [
        { ...takeA, state: "Finished", light: "done", activity: "Finished in 6 minutes" },
        { ...takeB, state: "Finished", light: "done", activity: "Finished in 9 minutes" },
      ],
    },
    check: {
      lead: "Everything passed.",
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
      rest: "Each one has been reviewed by the other coding agent, so you can compare them before you choose.",
      sections: [],
      takes: reviewed("Ready", "Ready"),
    },
    ship: {
      lead: "Nothing to ship yet.",
      rest: "Ship opens once you choose which attempt to keep.",
      sections: [],
    },
  },
};

const denyScopes: JourneyTask = {
  id: "deny-scopes",
  title: "Refuse tokens with no scopes",
  repo: "bezl",
  current: "build",
  stages: {
    define: "done",
    plan: "done",
    build: "needsYou",
    check: "waiting",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    define: define("A token request with no scopes should be refused, not granted everything.", [
      ["An empty scope list is refused with a reason", "Tests check"],
      ["Existing grants keep working", "Bezl checks"],
    ]),
    plan: {
      lead: "The plan is ready.",
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
    },
    check: {
      lead: "Checks haven't run yet.",
      rest: "They start once Build finishes.",
      sections: [],
    },
    review: {
      lead: "Review hasn't started.",
      rest: "It starts once Check is done.",
      sections: [],
    },
    ship: {
      lead: "Nothing to ship yet.",
      rest: "Ship opens once you choose which attempt to keep.",
      sections: [],
    },
  },
};

const debounce: JourneyTask = {
  id: "debounce",
  title: "Debounce terminal resize",
  repo: "bezl",
  current: "build",
  stages: {
    define: "done",
    plan: "done",
    build: "working",
    check: "waiting",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    define: define("Dragging the window should not resize every terminal on every frame.", [
      ["Each pane resizes at most once every 100 ms", "Tests check"],
      ["The final size is always applied", "Tests check"],
    ]),
    plan: {
      lead: "Working through the plan.",
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
      rest: "They start once Build finishes.",
      sections: [],
    },
    review: {
      lead: "Review hasn't started.",
      rest: "It starts once Check is done.",
      sections: [],
    },
    ship: {
      lead: "Nothing to ship yet.",
      rest: "Ship opens once you choose which attempt to keep.",
      sections: [],
    },
  },
};

const snapshot: JourneyTask = {
  id: "snapshot",
  title: "Terminal snapshot",
  repo: "bezl",
  current: "check",
  stages: {
    define: "done",
    plan: "done",
    build: "done",
    check: "failed",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    define: define("Save a terminal's screen so it opens again after the pane closes.", [
      ["A snapshot restores the colours and the cursor position", "Tests check"],
      ["Snapshots stay in .git/bezl", "Bezl checks"],
    ]),
    plan: {
      lead: "The plan is done.",
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
      rest: "It starts once Check is done.",
      sections: [],
    },
    ship: {
      lead: "Nothing to ship yet.",
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
  stages: { ...emptyState.stages, review: "done", ship: "needsYou" },
  views: {
    ...emptyState.views,
    review: {
      lead: "You kept attempt A.",
      rest: "Attempt B is set aside rather than deleted, in case you want it later.",
      sections: [],
      takes: reviewed("Kept", "Set aside"),
    },
    ship: {
      lead: "Ready to ship.",
      rest: "Open the pull request when you are.",
      sections: [],
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
