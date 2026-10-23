import type { FacetCut, FacetRail, FacetTone, StatusTone } from "@kbui/react";

/** UI projection of a worker; the Rust domain owns the real state machine. */
export type WorkerState = "idle" | "running" | "blocked" | "finished";

export type WorkerView = {
  id: string;
  name: string;
  state: WorkerState;
  /** One line under the header: current step, question, or result. */
  summary: string;
  /** Latest output; may be long. */
  transcript?: string;
};

export type WorkerPresentation = {
  tone: FacetTone;
  cut: FacetCut;
  rail: FacetRail;
  status: { tone: StatusTone; label: string; live: boolean };
  stoppable: boolean;
};

/** One facet per worker; the running one alone lifts, cuts the other way, and announces. */
export const presentation: Record<WorkerState, WorkerPresentation> = {
  idle: {
    tone: "quiet",
    cut: "end",
    rail: "none",
    status: { tone: "neutral", label: "Idle", live: false },
    stoppable: false,
  },
  running: {
    tone: "active",
    cut: "start",
    rail: "status",
    status: { tone: "running", label: "Running", live: true },
    stoppable: true,
  },
  blocked: {
    tone: "critical",
    cut: "end",
    rail: "status",
    status: { tone: "blocked", label: "Blocked", live: false },
    stoppable: true,
  },
  finished: {
    tone: "default",
    cut: "end",
    rail: "status",
    status: { tone: "success", label: "Finished", live: false },
    stoppable: false,
  },
};
