import type { WorkerState } from "./model";

/** Caller-provided status icons; kbui ships none. Shape differs per state, not just color. */
export function StateIcon({ state }: { state: WorkerState }) {
  switch (state) {
    case "idle":
      return (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="5" />
        </svg>
      );
    case "running":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <path d="M4 3l9 5-9 5z" />
        </svg>
      );
    case "blocked":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <path d="M5 2h6l3 3v6l-3 3H5l-3-3V5z" />
        </svg>
      );
    case "finished":
      return (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 8.5l3.5 3.5L13 5" />
        </svg>
      );
  }
}
