import type { WorkerView } from "./model";

const transcript = Array.from(
  { length: 8 },
  (_, i) =>
    `[${String(i + 1).padStart(2, "0")}] cargo check -p bezl ... Compiling bezl-domain v0.1.0; ` +
    "warning: unused variable `ctx` in src/policy.rs:41; the body grows with the output and the " +
    "plane grows with it, so a long transcript never spills past the seam or hides behind the cut.",
).join("\n");

const a: WorkerView = { id: "a", name: "Worker A", state: "idle", summary: "No task assigned." };
const c: WorkerView = {
  id: "c",
  name: "Worker C",
  state: "finished",
  summary: "Review finished in 42 s with no findings.",
};

export const idle: WorkerView[] = [
  a,
  { id: "b", name: "Worker B", state: "idle", summary: "Waiting for a task worktree." },
  c,
];

export const running: WorkerView[] = [
  a,
  {
    id: "b",
    name: "Worker B",
    state: "running",
    summary: "Step 3 of 5: cargo check.",
    transcript: "Compiling bezl-domain v0.1.0\nChecking bezl-app v0.1.0",
  },
  c,
];

export const blocked: WorkerView[] = [
  a,
  {
    id: "b",
    name: "Worker B",
    state: "blocked",
    summary: "Needs an answer before it can continue: overwrite src/policy.rs?",
  },
  c,
];

export const longContent: WorkerView[] = [
  {
    id: "b",
    name: "Worker B",
    state: "running",
    summary: "Step 4 of 5: tests.",
    transcript,
  },
  c,
];
