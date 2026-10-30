import type { StatusTone } from "@kb.ui/react";
import type { WorkerState } from "../task/model";

export type PaneState =
  | { kind: "starting" }
  | { kind: "running" }
  | { kind: "exited"; code: number | null }
  | { kind: "failed"; says: string };

export type PaneStatus = { tone: StatusTone; label: string; icon: WorkerState; live: boolean };

export function paneStatus(state: PaneState): PaneStatus {
  switch (state.kind) {
    case "starting":
      return { tone: "neutral", label: "Starting", icon: "idle", live: false };
    case "running":
      return { tone: "running", label: "Running", icon: "running", live: true };
    case "exited":
      if (state.code === 0)
        return { tone: "success", label: "Exited 0", icon: "finished", live: false };
      return {
        tone: "blocked",
        label: state.code === null ? "Exited, status unknown" : `Exited ${state.code}`,
        icon: "blocked",
        live: false,
      };
    case "failed":
      return { tone: "blocked", label: "Could not start", icon: "blocked", live: false };
  }
}
