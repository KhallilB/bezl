import type { Light, TaskLight } from "./model";

/** Shape differs per light, so meaning never rests on colour alone. */
export function LightIcon({ light }: { light: Light | TaskLight }) {
  switch (light) {
    case "done":
    case "passed":
      return (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5.25 8.25l1.9 1.9 3.6-3.9" />
        </svg>
      );
    case "working":
      return (
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <path d="M5.5 3.75l6.5 4.25-6.5 4.25z" />
        </svg>
      );
    case "needsYou":
      return (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M8 4.75v4" strokeLinecap="round" />
          <circle cx="8" cy="11" r="0.4" fill="currentColor" />
        </svg>
      );
    case "failed":
      return (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="6.25" />
          <path d="M5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5" strokeLinecap="round" />
        </svg>
      );
    case "waiting":
    case "idle":
      return (
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="6.25" strokeDasharray="2 2.4" />
        </svg>
      );
  }
}
