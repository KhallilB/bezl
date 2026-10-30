import type { Light, StageId, Take } from "../journey/model";

// A task's record, read back (J6). Nothing here waits on you.

export type HistoryEvent = {
  at: string;
  stage: StageId;
  who: string;
  text: string;
  light?: Light;
  /** A terminal snapshot taken at this event. */
  snapshot?: string;
};

export type Snapshot = { id: string; take: string; model: string; at: string; lines: string[] };

export type TaskHistory = {
  taskId: string;
  title: string;
  repo: string;
  /** Focused minutes on Bezl, beside what the agents spent. */
  spent: { label: string; value: string }[];
  events: HistoryEvent[];
  snapshots: Snapshot[];
  /** Each take with the files it changed. */
  changes: Take[];
};
