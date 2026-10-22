import { type CSSProperties, createContext, type ReactNode, useContext, useState } from "react";
import { facetedOperations } from "./faceted-operations";

const PortalRoot = createContext<HTMLElement | null>(null);

/** Where overlays portal so the skin's custom properties reach them; null before mount. */
export function usePortalRoot(): HTMLElement | null {
  return useContext(PortalRoot);
}

export type FacetedOperationsSkinProps = {
  /** Off keeps the same wrapper with no overrides, so layout and behavior never depend on the skin. */
  enabled?: boolean;
  children: ReactNode;
};

export function FacetedOperationsSkin({ enabled = true, children }: FacetedOperationsSkinProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <div
      ref={setRoot}
      data-skin={enabled ? "faceted-operations" : undefined}
      style={enabled ? (facetedOperations as CSSProperties) : undefined}
    >
      <PortalRoot value={root}>{children}</PortalRoot>
    </div>
  );
}
