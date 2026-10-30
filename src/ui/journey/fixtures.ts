import type { JourneyTask, ProviderUsage, StageView, Take } from "./model";

// Sample data only; shapes match what M5 projects from the task log.

const brief = (quote: string, done: [string, string][]): StageView => ({
  lead: "Ready to start.",
  rest: "Everything a model needs is here.",
  quote,
  sections: [
    { title: "Done when", rows: done.map(([text, meta]) => ({ text, meta, light: "done" })) },
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

// Each take is reviewed by the other provider.
const reviewed = (a: string, b: string): Take[] => [
  {
    ...takeA,
    state: a,
    verdict: { by: "Codex", text: "Clear, reuses EmptyState. The import link has no handler yet." },
    findings: [
      {
        text: "Import from GitHub has no handler",
        where: "Projects.tsx:41",
        light: "needsYou",
      },
    ],
  },
  {
    ...takeB,
    state: b,
    verdict: { by: "Claude Code", text: "Good guidance, but the checklist fails contrast." },
    findings: [
      {
        text: "Checklist text is too faint: 2.6:1, needs 4.5:1",
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
        ["The empty state shows when there are no projects", "tests"],
        ["One clear way to create the first project", "you"],
        ["Passes accessibility checks", "Bezl"],
        ["Existing tests still pass", "Bezl"],
      ],
    ),
    plan: {
      lead: "Plan done.",
      rest: "4 of 4 steps finished.",
      sections: [
        {
          title: "Take A · Claude Code",
          rows: [
            { text: "Find where Projects renders its table", light: "done" },
            { text: "Reuse EmptyState with one primary action", light: "done" },
            { text: "Add a test for zero projects", light: "done" },
            { text: "Run the accessibility check", light: "done" },
          ],
        },
        {
          title: "Take B · Codex",
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
      rest: "Both takes finished.",
      sections: [],
      takes: [
        { ...takeA, state: "Finished", light: "done", activity: "Finished in 6 minutes" },
        { ...takeB, state: "Finished", light: "done", activity: "Finished in 9 minutes" },
      ],
    },
    check: {
      lead: "Everything passed.",
      rest: "Take B's two problems went back to Codex and are fixed.",
      sections: [],
      passed: [
        { text: "bun run test", meta: "48 passed", mono: true, light: "done" },
        { text: "Accessibility at 1440 and 390 px", meta: "0 issues", light: "done" },
        { text: "Changed code no test runs", meta: "none", light: "done" },
      ],
    },
    review: {
      lead: "Which take should ship?",
      rest: "Each was reviewed by the other provider.",
      sections: [],
      takes: reviewed("Ready", "Ready"),
    },
    ship: {
      lead: "Not yet.",
      rest: "Ship opens once you keep a take.",
      sections: [],
    },
  },
};

const denyScopes: JourneyTask = {
  id: "deny-scopes",
  title: "Deny empty scopes",
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
      ["An empty scope list is refused with a reason", "tests"],
      ["Existing grants keep working", "Bezl"],
    ]),
    plan: {
      lead: "Plan ready.",
      rest: "Step 2 of 3 is waiting on you.",
      sections: [
        {
          title: "Take A · Codex",
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
          activity: "Stopped before writing src/policy.rs · 6 min",
          files: [{ path: "crates/bezl-domain/tests/policy.rs", added: 22, removed: 0 }],
        },
      ],
    },
    check: { lead: "Not yet.", rest: "Checks run after Build.", sections: [] },
    review: { lead: "Not yet.", rest: "Review follows Check.", sections: [] },
    ship: { lead: "Not yet.", rest: "Ship opens once you keep a take.", sections: [] },
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
      ["One resize per pane per 100 ms at most", "tests"],
      ["The last size always lands", "tests"],
    ]),
    plan: {
      lead: "Plan running.",
      rest: "Step 2 of 3.",
      sections: [
        {
          title: "Take A · Claude Code",
          rows: [
            { text: "Measure resize calls during a drag", light: "done" },
            { text: "Debounce in the fit addon wrapper", light: "working" },
            { text: "Prove the trailing resize lands", light: "waiting" },
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
    ship: { lead: "Not yet.", rest: "Ship opens once you keep a take.", sections: [] },
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
      ["A snapshot restores colours and cursor", "tests"],
      ["Snapshots stay in .git/bezl", "Bezl"],
    ]),
    plan: {
      lead: "Plan done.",
      rest: "3 of 3 steps finished.",
      sections: [
        {
          title: "Take A · Codex",
          rows: [
            { text: "Serialize with the xterm addon", light: "done" },
            { text: "Write snapshots under .git/bezl", light: "done" },
            { text: "Open them in the viewer", light: "done" },
          ],
        },
      ],
    },
    build: {
      lead: "Built.",
      rest: "Take A finished in 11 minutes.",
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
          title: "restoreSnapshot runs in no test",
          kind: "untested",
          where: "src/ui/terminals/snapshot.ts:23",
          detail: "Changed code that no test runs, so nothing proves it works.",
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
        { text: "Accessibility at 1440 and 390 px", meta: "0 issues", light: "done" },
      ],
    },
    review: { lead: "Not yet.", rest: "Review follows Check.", sections: [] },
    ship: { lead: "Not yet.", rest: "Ship opens once you keep a take.", sections: [] },
  },
};

export const tasks: JourneyTask[] = [emptyState, denyScopes, debounce, snapshot];

export const usage: ProviderUsage[] = [
  { name: "Claude Code", used: "64%" },
  { name: "Codex", used: "22%" },
];

/** The same list after you keep take A: Review is done and Ship waits on you. */
const kept: JourneyTask = {
  ...emptyState,
  current: "ship",
  stages: { ...emptyState.stages, review: "done", ship: "needsYou" },
  views: {
    ...emptyState.views,
    review: {
      lead: "Take A kept.",
      rest: "Take B is set aside, not deleted.",
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
          "Take A by Claude Code, reviewed by Codex. Reuses EmptyState with one action, “Create your first project”.",
        facts: ["Checks 12 of 12", "Reviewed by Codex", "Take A of 2"],
        files: takeA.files ?? [],
        history: [
          { stage: "brief", text: "For new users; reuse EmptyState; one clear action" },
          { stage: "plan", text: "4 steps by Claude Code, 3 by Codex" },
          { stage: "build", text: "Two takes, by Claude Code and Codex" },
          { stage: "check", text: "Take B had 2 problems, fixed; take A passed all 12" },
          { stage: "review", text: "Codex: “Clear, reuses EmptyState”" },
        ],
      },
    },
  },
};

export const keptTasks: JourneyTask[] = tasks.map((t) => (t.id === kept.id ? kept : t));
