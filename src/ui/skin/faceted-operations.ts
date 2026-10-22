import type { tokens } from "@kbui/tokens";

type Group = "facet" | "status" | "button" | "dialog";
type ComponentVar = { [G in Group]: (typeof tokens)[G][keyof (typeof tokens)[G]] }[Group];
type SemanticRef = `var(--kb-${"color" | "space" | "radius"}-${string})`;

/**
 * Faceted Operations: surface planes lifted off the page, both corners cut with lit chamfers,
 * info for the running worker, tight radii so buttons and dialogs share the geometry.
 * Leaf tokens only: wrapper overrides do not flow through kbui aliases such as --kb-facet-cut.
 */
export const facetedOperations = {
  "--kb-facet-background": "var(--kb-color-surface)",
  "--kb-facet-border": "var(--kb-color-border)",
  "--kb-facet-border-active": "var(--kb-color-info)",
  "--kb-facet-cut-start": "var(--kb-space-5)",
  "--kb-facet-cut-end": "var(--kb-space-3)",
  "--kb-facet-cut-edge": "var(--kb-color-info)",
  "--kb-facet-highlight": "var(--kb-color-border)",
  "--kb-facet-divider": "var(--kb-color-border)",
  "--kb-facet-padding": "var(--kb-space-4)",
  "--kb-facet-rail": "var(--kb-color-border)",
  "--kb-facet-rail-active": "var(--kb-color-info)",
  "--kb-status-running": "var(--kb-color-info)",
  "--kb-button-radius": "var(--kb-radius-sm)",
  "--kb-dialog-radius": "var(--kb-radius-sm)",
} satisfies Partial<Record<ComponentVar, SemanticRef>>;
