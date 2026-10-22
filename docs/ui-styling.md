# UI styling: skins are token overrides

Bezl's look, Faceted Operations, lives in `src/ui/skin/`. It is a set of kbui component custom properties (`--kb-facet-*`, `--kb-status-*`) applied inline on one wrapper by `FacetedOperationsSkin`. Every value points at a kbui semantic token (`var(--kb-color-*)`, `var(--kb-space-*)`), so light and dark both stay valid and contrast stays kbui's problem. `src/ui/skin/faceted-operations.test.ts` enforces this: documented properties only, semantic references only, no `.kb-*` selectors, no `!important`.

Removing the skin (`enabled={false}`) must change values, never structure or behavior. `ControlRoom.browser.test.tsx` renders every Control Room state in light and dark, skinned and unskinned, runs axe, and compares the markup of both.

## When a style cannot be reached

If a look needs something kbui's tokens and parts do not expose, that is a kbui primitive gap. File it against kbui (a new token, part, or prop) rather than adding a `.kb-*` selector, an `!important`, or a raw color here. Bezl never patches kbui's structure.

kbui decisions behind this split: 0009 (icons are caller-provided; see `src/ui/control-room/icons.tsx`) and 0010 (product skin is consumer-owned overrides, designed dark first, light validated). `index.html` sets `data-theme="dark"`.

## Path install

kbui is installed by path (`../kbui/packages/*`). Its `@base-ui/react` resolves React from kbui's own `node_modules`, so `vite.config.ts` dedupes `react` and `react-dom`, and the jsdom tests inline those packages so the dedupe applies there too. After changing kbui, run `bun run build` there; after adding a component, also `bun install` here.
