import type { tokens } from "@kbui/tokens";

type Group = "facet" | "status" | "button" | "dialog";
type ComponentVar = { [G in Group]: (typeof tokens)[G][keyof (typeof tokens)[G]] }[Group];
type SemanticRef = `var(--kb-${"color" | "space" | "radius"}-${string})`;
type Mix = `color-mix(in oklab, var(--kb-color-${string}) ${number}%, transparent)`;
type SkinValue = SemanticRef | Mix | `blur(${string}`;

/**
 * Lit Room: translucent rounded planes over a grainy floor; running and blocked workers cast
 * their tone as light. Values mix kbui semantic colors so light and dark both hold.
 */
export const facetedOperations = {
  "--kb-facet-background": "color-mix(in oklab, var(--kb-color-surface) 62%, transparent)",
  "--kb-facet-backdrop": "blur(28px) saturate(150%)",
  "--kb-facet-sheen": "color-mix(in oklab, var(--kb-color-fg) 5%, transparent)",
  "--kb-facet-rim-top": "color-mix(in oklab, var(--kb-color-fg) 22%, transparent)",
  "--kb-facet-border": "var(--kb-color-border)",
  "--kb-facet-border-active": "var(--kb-color-info)",
  "--kb-facet-divider": "var(--kb-color-border)",
  "--kb-facet-radius": "var(--kb-space-6)",
  "--kb-facet-padding": "var(--kb-space-5)",
  "--kb-facet-glow-active": "color-mix(in oklab, var(--kb-color-info) 70%, transparent)",
  "--kb-facet-glow-critical": "color-mix(in oklab, var(--kb-color-danger) 65%, transparent)",
  "--kb-facet-well-radius": "var(--kb-radius-lg)",
  "--kb-facet-rail": "var(--kb-color-border)",
  "--kb-facet-rail-active": "var(--kb-color-info)",
  "--kb-status-running": "var(--kb-color-info)",
  "--kb-status-radius": "var(--kb-radius-full)",
  "--kb-status-glow": "var(--kb-space-1)",
  "--kb-button-radius": "var(--kb-radius-full)",
  "--kb-dialog-radius": "var(--kb-radius-lg)",
} satisfies Partial<Record<ComponentVar, SkinValue>>;
