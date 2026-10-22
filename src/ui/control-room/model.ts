import type { FacetRail, FacetTone, StatusTone } from "@kbui/react";

/** UI projection of a worker; the Rust domain owns the real state machine. */
export type WorkerState = "idle" | "running" | "blocked" | "finished";

/** One primary holds write authority per task worktree; reviewers are read-only. */
export type WorkerRole = "primary" | "reviewer";

export type WorkerView = {
  id: string;
  name: string;
  role: WorkerRole;
  /** CLI the worker runs, as shown to the operator. */
  provider: string;
  state: WorkerState;
  /** One line under the header: current step, question, or result. */
  summary: string;
  /** Latest output; may be long. */
  transcript?: string;
  branch?: string;
  /** Preformatted by the domain projection, e.g. "04:12". */
  elapsed?: string;
};

export type WorkerPresentation = {
  tone: FacetTone;
  rail: FacetRail;
  status: { tone: StatusTone; label: string; live: boolean };
  stoppable: boolean;
};

export const states: WorkerState[] = ["running", "blocked", "idle", "finished"];

export const roleLabel: Record<WorkerRole, string> = { primary: "Primary", reviewer: "Reviewer" };

/** Every worker is a visible plane; running lifts and announces, blocked warns. */
export const presentation: Record<WorkerState, WorkerPresentation> = {
  idle: {
    tone: "default",
    rail: "none",
    status: { tone: "neutral", label: "Idle", live: false },
    stoppable: false,
  },
  running: {
    tone: "active",
    rail: "status",
    status: { tone: "running", label: "Running", live: true },
    stoppable: true,
  },
  blocked: {
    tone: "critical",
    rail: "status",
    status: { tone: "blocked", label: "Blocked", live: false },
    stoppable: true,
  },
  finished: {
    tone: "default",
    rail: "none",
    status: { tone: "success", label: "Finished", live: false },
    stoppable: false,
  },
};
