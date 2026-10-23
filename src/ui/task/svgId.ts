import { useId } from "react";

/** Per-instance SVG id prefix; React's id characters are not safe inside url(#…). */
export function useSvgId(): string {
  return `svg${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
