import type { tokens } from "@kbui/tokens";

type FacetVar = (typeof tokens.facet)[keyof typeof tokens.facet];
type StatusVar = (typeof tokens.status)[keyof typeof tokens.status];
type SemanticRef = `var(--kb-${"color" | "space"}-${string})`;

/**
 * Faceted Operations: matte planes on the page background, quiet seams,
 * one deeper cut, the running worker lifts to the surface color with an info seam.
 * Only kbui's documented facet and status properties, only semantic tokens, so both themes hold.
 */
export const facetedOperations = {
  "--kb-facet-background": "var(--kb-color-bg)",
  "--kb-facet-background-active": "var(--kb-color-surface)",
  "--kb-facet-border": "var(--kb-color-border)",
  "--kb-facet-border-active": "var(--kb-color-info)",
  "--kb-facet-cut": "var(--kb-space-5)",
  "--kb-facet-padding": "var(--kb-space-5)",
  "--kb-facet-rail": "var(--kb-color-muted)",
  "--kb-facet-rail-active": "var(--kb-color-info)",
  "--kb-status-running": "var(--kb-color-info)",
} satisfies Partial<Record<FacetVar | StatusVar, SemanticRef>>;
