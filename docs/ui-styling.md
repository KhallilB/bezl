# UI styling: skins are token overrides

Bezl's look, Faceted Operations, lives in `src/ui/skin/`. It is a set of kbui component custom properties applied inline on one wrapper by `FacetedOperationsSkin`: the `--kb-facet-*` and `--kb-status-*` groups, plus `--kb-button-radius` and `--kb-dialog-radius` so controls share the facets' tight geometry. Every value points at a kbui semantic token (`var(--kb-color-*)`, `var(--kb-space-*)`, `var(--kb-radius-*)`), so light and dark both stay valid and contrast stays kbui's problem. `src/ui/skin/faceted-operations.test.tsx` enforces this.

Set leaf tokens, never aliases. kbui resolves an alias such as `--kb-facet-cut-start: var(--kb-facet-cut)` at `:root`, so overriding `--kb-facet-cut` on the wrapper changes nothing. Set `--kb-facet-cut-start` and `--kb-facet-cut-end` instead.

Overlays portal into the skin wrapper (`usePortalRoot`), so the stop dialog gets the skin too.

Bezl's own elements (`.cr-*` in `src/ui/control-room/control-room.css`) are styled with kbui semantic tokens only. `src/ui/styles.test.ts` fails on a `.kb-*` selector, `!important`, a raw color, or a `--kb-*` override in any bezl stylesheet.

Removing the skin (`enabled={false}`) must change values, never structure or behavior. `ControlRoom.browser.test.tsx` renders every Control Room state in light and dark, skinned and unskinned, runs axe, compares the markup of both, and checks that the banner fits 800 and 1200 px windows.

## Design language

Dark first, light validated. The page is a static dot grid on the background color; every worker is a surface plane cut on both corners, with lit chamfers, a top highlight and a divider under the header. Running lifts to the active plane with an info seam and rail; blocked takes the critical seam. Output sits in a sunken well that scrolls on its own. Status is always a chip with text and a shape icon, never color alone. Meta (role, provider, branch, elapsed) is small uppercase or mono text. Nothing moves on its own.

Preview a state with `?sample=idle|running|blocked|longContent`.

## When a style cannot be reached

If a look needs something kbui's tokens and parts do not expose, that is a kbui primitive gap. File it against kbui (a new token, part, or prop) rather than adding a `.kb-*` selector, an `!important`, or a raw color here. Bezl never patches kbui's structure. Known gap: `Dialog` has no facet geometry yet, so the stop dialog is a plain plane with the shared radius.

kbui decisions behind this split: 0009 (icons are caller-provided; see `src/ui/control-room/icons.tsx`) and 0010 (product skin is consumer-owned overrides, designed dark first, light validated). `index.html` sets `data-theme="dark"`.

## Installing kbui

`@kbui/react`, `@kbui/css` and `@kbui/tokens` are installed from kbui GitHub release tarballs. All three must name the same version; to upgrade, change the three URLs in `package.json` together.

The Control Room needs kbui's lit facet edges, `tone="sunken"` and `Status appearance="chip"`, which arrive after v0.1.0. Until a release carries them, `package.json` still names v0.1.0 and typecheck fails against it; bump the three URLs to that release.

To work on kbui and bezl at once, install kbui by path instead (see kbui's `docs/guides/using-kbui.md`). Then kbui's `@base-ui/react` resolves React from kbui's own `node_modules`, so `vite.config.ts` dedupes `react` and `react-dom` and the jsdom tests inline `@kbui/*` so the dedupe applies there too.
