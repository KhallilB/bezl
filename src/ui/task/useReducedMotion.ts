import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const list = window.matchMedia?.(query);
  list?.addEventListener("change", onChange);
  return () => list?.removeEventListener("change", onChange);
}

/** True when the user asks for less motion, or the environment cannot tell us. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? true);
}
