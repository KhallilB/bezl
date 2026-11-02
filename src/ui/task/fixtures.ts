import type { TaskView, WorkerView } from "./model";

export const task: TaskView = { branch: "feat/policy-engine" };

// Output bytes per 10 s bucket, oldest first; shape only, not real telemetry.
const activity = [3, 4, 6, 5, 9, 8, 12, 10, 14, 11, 16, 13, 15, 12, 17, 14, 18, 15, 20, 16, 19, 22];

const transcript = Array.from(
  { length: 8 },
  (_, i) =>
    `[${String(i + 1).padStart(2, "0")}] cargo test -p bezl-domain ... Compiling bezl-domain v0.1.0; ` +
    "warning: unused variable `ctx` in src/policy.rs:41; this output scrolls inside its panel, so " +
    "long output never spills past the panel's edge.",
).join("\n");

const a: WorkerView = {
  id: "a",
  name: "Worker A",
  role: "reviewer",
  provider: "Claude Code",
  state: "idle",
  summary: "Nothing assigned yet.",
};
const c: WorkerView = {
  id: "c",
  name: "Worker C",
  role: "reviewer",
  provider: "Gemini CLI",
  state: "finished",
  summary: "Finished its review and found no issues.",
  branch: "feat/policy-engine",
  elapsed: "00:42",
};
const b: WorkerView = {
  id: "b",
  name: "Worker B",
  role: "primary",
  provider: "Codex",
  state: "idle",
  summary: "Waiting for the task's copy of your code to be ready.",
};

export const idle: WorkerView[] = [a, b, c];

export const running: WorkerView[] = [
  a,
  {
    ...b,
    state: "running",
    summary: "On step 3 of 5, running cargo check.",
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
    summary: "Wants to know whether to overwrite src/policy.rs, and is waiting for your answer.",
    branch: "feat/policy-engine",
    elapsed: "06:30",
  },
  c,
];

export const longContent: WorkerView[] = [
  {
    ...b,
    state: "running",
    summary: "On step 4 of 5, running the tests.",
    step: { index: 4, total: 5, label: "tests" },
    activity,
    transcript,
    branch: "feat/policy-engine",
    elapsed: "11:05",
  },
  c,
];
