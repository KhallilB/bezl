import type { TaskView, WorkerView } from "./model";

export const task: TaskView = { branch: "feat/policy-engine" };

// Output bytes per 10 s bucket, oldest first; shape only, not real telemetry.
const activity = [3, 4, 6, 5, 9, 8, 12, 10, 14, 11, 16, 13, 15, 12, 17, 14, 18, 15, 20, 16, 19, 22];

const transcript = Array.from(
  { length: 8 },
  (_, i) =>
    `[${String(i + 1).padStart(2, "0")}] cargo test -p bezl-domain ... Compiling bezl-domain v0.1.0; ` +
    "warning: unused variable `ctx` in src/policy.rs:41; the well scrolls inside its plane, so a " +
    "long transcript never spills past the seam or hides behind the cut.",
).join("\n");

const a: WorkerView = {
  id: "a",
  name: "Worker A",
  role: "reviewer",
  provider: "Claude Code",
  state: "idle",
  summary: "No task assigned.",
};
const c: WorkerView = {
  id: "c",
  name: "Worker C",
  role: "reviewer",
  provider: "Gemini CLI",
  state: "finished",
  summary: "Review finished with no findings.",
  branch: "feat/policy-engine",
  elapsed: "00:42",
};
const b: WorkerView = {
  id: "b",
  name: "Worker B",
  role: "primary",
  provider: "Codex",
  state: "idle",
  summary: "Waiting for a task worktree.",
};

export const idle: WorkerView[] = [a, b, c];

export const running: WorkerView[] = [
  a,
  {
    ...b,
    state: "running",
    summary: "Step 3 of 5: cargo check.",
    step: { index: 3, total: 5, label: "cargo check" },
    activity,
    transcript: "Compiling bezl-domain v0.1.0\nChecking bezl-app v0.1.0",
    branch: "feat/policy-engine",
    elapsed: "04:12",
  },
  c,
];

export const blocked: WorkerView[] = [
  a,
  {
    ...b,
    state: "blocked",
    summary: "Needs an answer before it can continue: overwrite src/policy.rs?",
    branch: "feat/policy-engine",
    elapsed: "06:30",
  },
  c,
];

export const longContent: WorkerView[] = [
  {
    ...b,
    state: "running",
    summary: "Step 4 of 5: tests.",
    step: { index: 4, total: 5, label: "tests" },
    activity,
    transcript,
    branch: "feat/policy-engine",
    elapsed: "11:05",
  },
  c,
];
