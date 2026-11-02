import type { JourneyTask, ProviderUsage, StageView, Take } from "./model";

// Sample data only; shapes match what M5 projects from the task log.

const brief = (quote: string, done: [string, string][]): StageView => ({
  lead: "Ready to start.",
  rest: "Everything a coding agent needs is here.",
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
      text: "Clear, reuses EmptyState. The import link does nothing yet.",
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
        text: "Checklist text is too faint: contrast is 2.6:1, needs 4.5:1",
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
    brief: "done",
    plan: "done",
    build: "done",
    check: "done",
    review: "needsYou",
    ship: "waiting",
  },
  views: {
    brief: brief(
      "When someone has no projects yet, the Projects page should help them start one instead of showing an empty table.",
      [
        ["The empty state shows when there are no projects", "Tests check"],
        ["One clear way to create the first project", "You check"],
        ["Passes accessibility checks", "Bezl checks"],
        ["Existing tests still pass", "Bezl checks"],
      ],
    ),
    plan: {
      lead: "Plan done.",
      rest: "4 of 4 steps finished.",
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
      lead: "Built.",
      rest: "Both attempts finished.",
      sections: [],
      takes: [
        { ...takeA, state: "Finished", light: "done", activity: "Finished in 6 minutes" },
        { ...takeB, state: "Finished", light: "done", activity: "Finished in 9 minutes" },
      ],
    },
    check: {
      lead: "Everything passed.",
      rest: "Attempt B's two problems went back to Codex and are fixed.",
      sections: [],
      passed: [
        { text: "bun run test", meta: "48 passed", mono: true, light: "done" },
        { text: "Accessibility at 1440 px and 390 px wide", meta: "0 issues", light: "done" },
        { text: "Changed code with no test", meta: "none", light: "done" },
      ],
    },
    review: {
      lead: "Which attempt should ship?",
      rest: "Each one was reviewed by the other coding agent.",
      sections: [],
      takes: reviewed("Ready", "Ready"),
    },
    ship: {
      lead: "Not yet.",
      rest: "Ship opens once you keep an attempt.",
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
    brief: "done",
    plan: "done",
    build: "needsYou",
    check: "waiting",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    brief: brief("A token request with no scopes should be refused, not granted everything.", [
      ["An empty scope list is refused with a reason", "Tests check"],
      ["Existing grants keep working", "Bezl checks"],
    ]),
    plan: {
      lead: "Plan ready.",
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
      rest: "It stopped before overwriting a file.",
      sections: [],
      takes: [
        {
          id: "A",
          model: "Codex",
          state: "Waiting on you",
          light: "needsYou",
          activity: "Stopped before changing src/policy.rs · waiting 6 min",
          files: [{ path: "crates/bezl-domain/tests/policy.rs", added: 22, removed: 0 }],
        },
      ],
    },
    check: { lead: "Not yet.", rest: "Checks run after Build.", sections: [] },
    review: { lead: "Not yet.", rest: "Review follows Check.", sections: [] },
    ship: { lead: "Not yet.", rest: "Ship opens once you keep an attempt.", sections: [] },
  },
};

const debounce: JourneyTask = {
  id: "debounce",
  title: "Debounce terminal resize",
  repo: "bezl",
  current: "build",
  stages: {
    brief: "done",
    plan: "done",
    build: "working",
    check: "waiting",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    brief: brief("Dragging the window should not resize every terminal on every frame.", [
      ["At most one resize per pane every 100 ms", "Tests check"],
      ["The final size is always applied", "Tests check"],
    ]),
    plan: {
      lead: "Working through the plan.",
      rest: "On step 2 of 3.",
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
      rest: "4 minutes in.",
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
    check: { lead: "Not yet.", rest: "Checks run after Build.", sections: [] },
    review: { lead: "Not yet.", rest: "Review follows Check.", sections: [] },
    ship: { lead: "Not yet.", rest: "Ship opens once you keep an attempt.", sections: [] },
  },
};

const snapshot: JourneyTask = {
  id: "snapshot",
  title: "Terminal snapshot",
  repo: "bezl",
  current: "check",
  stages: {
    brief: "done",
    plan: "done",
    build: "done",
    check: "failed",
    review: "waiting",
    ship: "waiting",
  },
  views: {
    brief: brief("Save a terminal's screen so it opens again after the pane closes.", [
      ["A snapshot restores colours and cursor", "Tests check"],
      ["Snapshots stay in .git/bezl", "Bezl checks"],
    ]),
    plan: {
      lead: "Plan done.",
      rest: "3 of 3 steps finished.",
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
      lead: "Built.",
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
      rest: "Everything else passed.",
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
    review: { lead: "Not yet.", rest: "Review follows Check.", sections: [] },
    ship: { lead: "Not yet.", rest: "Ship opens once you keep an attempt.", sections: [] },
  },
};

export const tasks: JourneyTask[] = [emptyState, denyScopes, debounce, snapshot];

export const usage: ProviderUsage[] = [
  { name: "Claude Code", used: "64%" },
  { name: "Codex", used: "22%" },
];

/** Same list after you keep attempt A: Review done, Ship waits on you. */
const kept: JourneyTask = {
  ...emptyState,
  current: "ship",
  stages: { ...emptyState.stages, review: "done", ship: "needsYou" },
  views: {
    ...emptyState.views,
    review: {
      lead: "Attempt A kept.",
      rest: "Attempt B is set aside, not deleted.",
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
          "Claude Code wrote attempt A and Codex reviewed it. It reuses EmptyState with one action, “Create your first project”.",
        facts: ["12 of 12 checks passed", "Reviewed by Codex", "Attempt A of 2"],
        files: takeA.files ?? [],
        history: [
          { stage: "brief", text: "For new users; reuse EmptyState; one clear action" },
          { stage: "plan", text: "4 steps by Claude Code, 3 by Codex" },
          { stage: "build", text: "Two attempts, one by Claude Code and one by Codex" },
          {
            stage: "check",
            text: "Attempt B had 2 problems, now fixed; attempt A passed all 12 checks",
          },
          { stage: "review", text: "Codex: “Clear, reuses EmptyState”" },
        ],
        pullRequest: { number: 42, url: "https://github.com/acme/studio-web/pull/42" },
      },
    },
  },
};

export const keptTasks: JourneyTask[] = tasks.map((t) => (t.id === kept.id ? kept : t));
