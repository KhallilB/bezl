import type { JourneyTask, ProviderUsage, StageView } from "./model";

// Sample data only; shapes match what M5 projects from the task log.

const brief = (quote: string, done: [string, string][]): StageView => ({
  lead: "Ready to start.",
  rest: "Everything a model needs is here.",
  quote,
  sections: [
    { title: "Done when", rows: done.map(([text, meta]) => ({ text, meta, light: "done" })) },
  ],
});

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
      ],
    },
    build: {
      lead: "Built.",
      rest: "Take A finished in 6 minutes.",
      sections: [
        {
          title: "Take A · Claude Code",
          rows: [
            { text: "src/pages/Projects.tsx", meta: "+38 −4", mono: true, light: "done" },
            { text: "src/pages/Projects.test.tsx", meta: "+52", mono: true, light: "done" },
          ],
        },
      ],
    },
    check: {
      lead: "Everything passed.",
      rest: "12 checks ran in the worktree.",
      sections: [
        {
          title: "Checks",
          rows: [
            { text: "bun run test", meta: "48 passed", mono: true, light: "done" },
            { text: "Accessibility at 1440 and 390 px", meta: "0 issues", light: "done" },
            { text: "Changed code no test runs", meta: "none", light: "done" },
          ],
        },
      ],
    },
    review: {
      lead: "Codex has a verdict.",
      rest: "Keep the take, or send a finding back.",
      sections: [
        {
          title: "Findings · Codex, read-only",
          rows: [
            {
              text: "Checklist text is too faint: 2.6:1, needs 4.5:1",
              meta: "keep?",
              light: "needsYou",
            },
            { text: "Adds a new card instead of reusing EmptyState", meta: "fixed", light: "done" },
          ],
        },
      ],
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
      quote: "src/policy.rs has your uncommitted edits. Overwrite them, or work around them?",
      sections: [
        {
          title: "Take A · Codex",
          rows: [
            {
              text: "cargo test -p bezl-domain policy",
              meta: "1 failing",
              mono: true,
              light: "done",
            },
            { text: "Waiting for your answer", meta: "6 min", light: "needsYou" },
          ],
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
      sections: [
        {
          title: "Take A · Claude Code",
          rows: [
            {
              text: "Editing src/ui/terminals/xterm.ts",
              meta: "now",
              mono: true,
              light: "working",
            },
          ],
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
      sections: [
        {
          title: "Take A · Codex",
          rows: [
            { text: "src/ui/terminals/Snapshots.tsx", meta: "+120", mono: true, light: "done" },
          ],
        },
      ],
    },
    check: {
      lead: "2 things need a look.",
      rest: "Everything else passed.",
      sections: [
        {
          title: "Problems",
          rows: [
            {
              text: "Snapshots.browser.test.tsx: cursor lands one row low",
              meta: "failing",
              light: "failed",
            },
            {
              text: "restoreSnapshot runs in no test",
              meta: "untested",
              mono: true,
              light: "failed",
            },
          ],
        },
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
