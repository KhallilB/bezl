import type { tokens } from "@kbui/tokens";

type Group = "facet" | "status" | "button" | "dialog";
type ComponentVar = { [G in Group]: (typeof tokens)[G][keyof (typeof tokens)[G]] }[Group];
type SemanticRef = `var(--kb-${"color" | "space" | "radius"}-${string})`;

/**
 * Lit Room: surface planes lifted off the page with a lit top edge, info for the running
 * worker, pill controls and a soft dialog. No cut corners: the owner chose rounded planes.
 */
export const facetedOperations = {
  "--kb-facet-background": "var(--kb-color-surface)",
  "--kb-facet-border": "var(--kb-color-border)",
  "--kb-facet-border-active": "var(--kb-color-info)",
  "--kb-facet-highlight": "var(--kb-color-border)",
  "--kb-facet-divider": "var(--kb-color-border)",
  "--kb-facet-padding": "var(--kb-space-4)",
  "--kb-facet-rail": "var(--kb-color-border)",
  "--kb-facet-rail-active": "var(--kb-color-info)",
  "--kb-status-running": "var(--kb-color-info)",
  "--kb-button-radius": "var(--kb-radius-full)",
  "--kb-dialog-radius": "var(--kb-radius-lg)",
} satisfies Partial<Record<ComponentVar, SemanticRef>>;
