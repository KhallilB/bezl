import type { CSSProperties, ReactNode } from "react";
import { facetedOperations } from "./faceted-operations";

export type FacetedOperationsSkinProps = {
  /** Off keeps the same wrapper with no overrides, so layout and behavior never depend on the skin. */
  enabled?: boolean;
  children: ReactNode;
};

export function FacetedOperationsSkin({ enabled = true, children }: FacetedOperationsSkinProps) {
  return (
    <div
      data-skin={enabled ? "faceted-operations" : undefined}
      style={enabled ? (facetedOperations as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
