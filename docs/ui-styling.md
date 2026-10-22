# UI styling: skins are token overrides

Bezl's look, Faceted Operations, lives in `src/ui/skin/`. It is a set of kbui component custom properties applied inline on one wrapper by `FacetedOperationsSkin`: the `--kb-facet-*` and `--kb-status-*` groups, plus `--kb-button-radius` and `--kb-dialog-radius` so controls share the rounded geometry. Every value points at a kbui semantic token (`var(--kb-color-*)`, `var(--kb-space-*)`, `var(--kb-radius-*)`), so light and dark both stay valid and contrast stays kbui's problem. `src/ui/skin/faceted-operations.test.tsx` enforces this.

Set the component token you mean. kbui resolves an alias at `:root`, so a wrapper override of the token it points at (for example `--kb-color-surface` behind `--kb-facet-background`) does not reach the alias.

Overlays portal into the skin wrapper (`usePortalRoot`), so the stop dialog gets the skin too.

Bezl's own elements (`.cr-*` in `src/ui/control-room/control-room.css`) are styled with kbui semantic tokens only. `src/ui/styles.test.ts` fails on a `.kb-*` selector, `!important`, a raw color, or a `--kb-*` override in any bezl stylesheet.

Removing the skin (`enabled={false}`) must change values, never structure or behavior. `ControlRoom.browser.test.tsx` renders every Control Room state in light and dark, skinned and unskinned, runs axe, compares the markup of both, and checks that the banner fits 800 and 1200 px windows.

## Design language: Lit Room

Owner decision (2026-10-22): the room is lit by the work. No cut corners or bevels; rounded planes.

- **Banner**: a floating glass capsule with the mark, the screen title and per-state summary chips.
- **Orbit**: a map of the task worktree. The primary connects by a solid lit "writes" edge, reviewers by dashed "reads" edges, and each node shows its state. A packet travels the write edge only while the primary runs and reduced motion is off. The diagram's accessible name lists every worker, access and state.
- **Bento**: the first running worker, else the first blocked one, is the hero panel. It carries large elapsed numerals, labelled step progress, a decorative output-rate trace and its output well. Other workers sit beside it.
- **Light**: running workers cast an info-colored pool onto the floor and blocked workers a danger-colored one. These are bezl-owned elements behind each panel. Idle and finished cast none.
- **Type**: Geist and Geist Mono, bundled through `@fontsource-variable` because the app runs offline. Meta (role, provider, access, branch, elapsed) is small uppercase mono.
- Static grain, no ambient motion; status is always text plus a shape icon.

Preview a state with `?sample=idle|running|blocked|longContent`.

## When a style cannot be reached

If a look needs something kbui's tokens and parts do not expose, that is a kbui primitive gap. File it against kbui (a new token, part, or prop) rather than adding a `.kb-*` selector, an `!important`, or a raw color here. Bezl never patches kbui's structure. Pending in kbui: rounded glass planes, rim light and emission for `Facet` (the panels are still square and opaque until then), and a radius token for `Status` chips.

kbui decisions behind this split: 0009 (icons are caller-provided; see `src/ui/control-room/icons.tsx`) and 0010 (product skin is consumer-owned overrides, designed dark first, light validated). `index.html` sets `data-theme="dark"`.

## Installing kbui

`@kbui/react`, `@kbui/css` and `@kbui/tokens` are installed from kbui GitHub release tarballs. All three must name the same version; to upgrade, change the three URLs in `package.json` together.

The Control Room needs kbui's lit facet edges, `tone="sunken"` and `Status appearance="chip"`, which arrive after v0.1.0. Until a release carries them, `package.json` still names v0.1.0 and typecheck fails against it; bump the three URLs to that release.

To work on kbui and bezl at once, install kbui by path instead (see kbui's `docs/guides/using-kbui.md`). Then kbui's `@base-ui/react` resolves React from kbui's own `node_modules`, so `vite.config.ts` dedupes `react` and `react-dom` and the jsdom tests inline `@kbui/*` so the dedupe applies there too.
