# UI styling: the app theme is token overrides

Bezl's look lives in `src/ui/theme/`. It is a set of kbui component custom properties applied inline on one wrapper by `AppTheme`: the `--kb-panel-*`, `--kb-status-*`, `--kb-progress-*` and `--kb-stat-*` groups, plus `--kb-button-radius` and `--kb-dialog-radius` so controls share the rounded geometry. Every value points at a kbui semantic token (`var(--kb-color-*)`, `var(--kb-space-*)`, `var(--kb-radius-*)`), so light and dark both stay valid and contrast stays kbui's problem. `src/ui/theme/AppTheme.test.tsx` enforces this.

Set the component token you mean. kbui resolves an alias at `:root`, so a wrapper override of the token it points at (for example `--kb-color-surface` behind `--kb-panel-background`) does not reach the alias.

Overlays portal into the theme wrapper (`usePortalRoot`), so the stop dialog gets the theme too.

Bezl's own elements (`.task-*` in `src/ui/task/task.css`) are styled with kbui semantic tokens only. `src/ui/styles.test.ts` fails on a `.kb-*` selector, `!important`, a raw color, or a `--kb-*` override in any bezl stylesheet.

Turning the theme off (`enabled={false}`) must change values, never structure or behavior. `Task.browser.test.tsx` renders every Task screen state in light and dark, with and without the theme, runs axe, compares the markup of both, and checks that the task header fits 800 and 1200 px windows.

## Design language

Owner decision (2026-10-22): the room is lit by the work, on rounded glass panels.

This section describes the interim Task screen. The task journey in the [product vision](vision.md) replaces the worker map and the focused-worker layout in M5; the theme rules above and the light and type rules below carry over.

- **Task header**: a floating glass capsule with the mark, the title ("Task" and the task's branch) and per-state summary chips.
- **Worker map**: a map of the task worktree. The primary connects by a solid lit "writes" edge, reviewers by dashed "reads" edges, and each node shows its state. A lit comet travels the write edge, beneath the hub, only while the primary runs and reduced motion is off. The diagram's accessible name lists every worker, access and state.
- **Geometry**: `src/ui/task/geometry.ts` is pure and deterministic: the same task and workers give the same layout whatever their order (workers are placed by id). Writers sit right of the hub and readers left, each side a column spaced so two-line labels never overlap; the drawing grows with the count. Each edge is a `d3-shape` natural curve through the hub, a lifted midpoint and its node, so even a level edge reads as an arc; the activity trace uses `d3-scale` with a monotone curve, which never overshoots its samples. D3 only computes paths; React renders them.
- **SVG ids**: gradients and edge paths take per-instance ids from React's `useId`, so two maps or traces on one page never reference each other's definitions.
- **Focused worker**: the first running worker, else the first blocked one, gets the large panel. It carries large elapsed numerals, labelled step progress, a decorative output-rate trace and its output well. Other workers sit beside it.
- **Light**: running planes cast info light through kbui's panel glow (`--kb-panel-glow-active`), seen through a translucent, blurred plane (`--kb-panel-background`, `--kb-panel-backdrop`). Blocked planes cast danger light (`--kb-panel-glow-critical`) for now; they move to amber once kbui has an `attention` tone (see [State colours](#state-colours)). Idle and finished cast none.
- **Type**: Geist and Geist Mono, bundled through `@fontsource-variable` because the app runs offline. Meta is small mono: role, provider and access in uppercase; branch and elapsed time keep their case. The uppercase meta is for the interim screen only; the journey uses sentence case.
- **Motion**: state-driven and on kbui's easing tokens. Once on entry, the header and worker map fade in, panels rise in staggered by index, the write edge draws itself, nodes scale in and the trace sweeps in left to right. The only loop is the comet while a writer runs. Panels lift 2px on hover or focus. Under `prefers-reduced-motion: reduce` nothing moves. `Task.browser.test.tsx` checks the panel rise, the edge draw, the trace sweep, the comet and that only the comet loops, in a default and a reduced-motion Chromium. The header fade, the node scale-in and the hover lift are not tested yet.
- Static grain; status is always text plus a shape icon.

Preview a state with `?sample=idle|running|blocked|longContent`.

## State colours

One hue per meaning, the same hue in both themes, one lightness per theme, and teal as the only accent. Values are fitted to the sRGB gamut. Contrast is measured against the page background.

| Meaning | kbui token | Dark | Light |
|---|---|---|---|
| Working, and the accent | `info` | `#37d8c9`, 11.2:1 | `#087970`, 5.3:1 |
| Needs you | `attention` (new) | `#eeb154`, 10.5:1 | `#8d5e05`, 5.6:1 |
| Failed | `danger` | `#fea199`, 10.2:1 | `#a84440`, 5.9:1 |
| Passed | `success` | `#7cd591`, 11.2:1 | `#287c42`, 5.2:1 |
| Idle | `muted` | kbui gray-400 | kbui gray-500 |

Rules:

- Only Working and Needs you glow. Failed is shown, never glowing. Passed and Idle are quiet.
- Colour always comes with a word and an icon.

These are kbui semantic tokens, and the app theme cannot override semantic colours by design (`src/ui/theme/tokens.ts` and its tests). So they arrive in two steps:

1. **kbui:** an `attention` colour with a Panel and Status tone; button colour tokens, so the primary button can be teal without overriding `--kb-color-accent`; and this palette as kbui's semantic values or as an opt-in palette.
2. **bezl:** "blocked, waiting for you" maps to `attention`, and `danger` stays for failed and stopped. This changes `src/ui/task/model.ts` and its tests, test-first.

Until then, the interim screen paints a waiting worker with `danger`, the same as a failure.

## When a style cannot be reached

If a look needs something kbui's tokens and parts do not expose, that is a kbui primitive gap. File it against kbui (a new token, part, or prop) rather than adding a `.kb-*` selector, an `!important`, or a raw color here. Bezl never patches kbui's structure. Output sits in `Panel.Well`. Theme values are kbui semantic tokens, `color-mix` of a semantic color toward transparent, a blur and saturate filter (backdrop only), or a font weight (`*-weight` only); `src/ui/theme/AppTheme.test.tsx` enforces those forms.

The Task screen uses kbui's `Progress` (step), `Stat` (elapsed time), plain mono `Badge` (role, provider, access; and, with `preserveCase`, the footer's branch and elapsed time, since branch names are case-sensitive) and `ScrollArea` (output, inside `Panel.Well`). The worker map and activity trace are bezl's own.

kbui decisions behind this split: 0009 (icons are caller-provided; see `src/ui/task/icons.tsx`) and 0010 (the product look is consumer-owned token overrides, designed dark first, light validated). `index.html` sets `data-theme="dark"`.

## Installing kbui

`@kbui/react`, `@kbui/css` and `@kbui/tokens` are installed from kbui GitHub release tarballs. All three must name the same version; to upgrade, change the three URLs in `package.json` together.

The Task screen needs kbui's rounded `Panel`, `Panel.Well` and `Status appearance="chip"`; `package.json` installs them from v0.4.0.

To work on kbui and bezl at once, install kbui by path instead (see kbui's `docs/guides/using-kbui.md`). Then kbui's `@base-ui/react` resolves React from kbui's own `node_modules`, so `vite.config.ts` dedupes `react` and `react-dom` and the jsdom tests inline `@kbui/*` so the dedupe applies there too.
