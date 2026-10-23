# UI styling: the app theme is token overrides

Bezl's look lives in `src/ui/theme/`. It is a set of kbui component custom properties applied inline on one wrapper by `AppTheme`: the `--kb-panel-*`, `--kb-status-*`, `--kb-progress-*` and `--kb-stat-*` groups, plus `--kb-button-radius` and `--kb-dialog-radius` so controls share the rounded geometry. Every value points at a kbui semantic token (`var(--kb-color-*)`, `var(--kb-space-*)`, `var(--kb-radius-*)`), so light and dark both stay valid and contrast stays kbui's problem. `src/ui/theme/AppTheme.test.tsx` enforces this.

Set the component token you mean. kbui resolves an alias at `:root`, so a wrapper override of the token it points at (for example `--kb-color-surface` behind `--kb-panel-background`) does not reach the alias.

Overlays portal into the theme wrapper (`usePortalRoot`), so the stop dialog gets the theme too.

Bezl's own elements (`.task-*` in `src/ui/task/task.css`) are styled with kbui semantic tokens only. `src/ui/styles.test.ts` fails on a `.kb-*` selector, `!important`, a raw color, or a `--kb-*` override in any bezl stylesheet.

Turning the theme off (`enabled={false}`) must change values, never structure or behavior. `Task.browser.test.tsx` renders every Task screen state in light and dark, with and without the theme, runs axe, compares the markup of both, and checks that the task header fits 800 and 1200 px windows.

## Design language

Owner decision (2026-10-22): the room is lit by the work, on rounded glass panels.

- **Task header**: a floating glass capsule with the mark, the title ("Task" and the task's branch) and per-state summary chips.
- **Worker map**: a map of the task worktree. The primary connects by a solid lit "writes" edge, reviewers by dashed "reads" edges, and each node shows its state. A packet travels the write edge only while the primary runs and reduced motion is off. The diagram's accessible name lists every worker, access and state.
- **Focused worker**: the first running worker, else the first blocked one, gets the large panel. It carries large elapsed numerals, labelled step progress, a decorative output-rate trace and its output well. Other workers sit beside it.
- **Light**: running planes cast info light and blocked planes danger light through kbui's panel glow (`--kb-panel-glow-active`, `--kb-panel-glow-critical`), seen through a translucent, blurred plane (`--kb-panel-background`, `--kb-panel-backdrop`). Idle and finished cast none.
- **Type**: Geist and Geist Mono, bundled through `@fontsource-variable` because the app runs offline. Meta (role, provider, access, branch, elapsed) is small uppercase mono.
- Static grain, no ambient motion; status is always text plus a shape icon.

Preview a state with `?sample=idle|running|blocked|longContent`.

## When a style cannot be reached

If a look needs something kbui's tokens and parts do not expose, that is a kbui primitive gap. File it against kbui (a new token, part, or prop) rather than adding a `.kb-*` selector, an `!important`, or a raw color here. Bezl never patches kbui's structure. Output sits in `Panel.Well`. Theme values are kbui semantic tokens, `color-mix` of a semantic color toward transparent, a blur and saturate filter (backdrop only), or a font weight (`*-weight` only); `src/ui/theme/AppTheme.test.tsx` enforces those forms.

The Task screen uses kbui's `Progress` (step), `Stat` (elapsed time), plain mono `Badge` (role, provider, access) and `ScrollArea` (output, inside `Panel.Well`). Branch names in footers stay plain mono text: mono `Badge` uppercases, and branch names are case-sensitive. The worker map and activity trace are bezl's own.

kbui decisions behind this split: 0009 (icons are caller-provided; see `src/ui/task/icons.tsx`) and 0010 (the product look is consumer-owned token overrides, designed dark first, light validated). `index.html` sets `data-theme="dark"`.

## Installing kbui

`@kbui/react`, `@kbui/css` and `@kbui/tokens` are installed from kbui GitHub release tarballs. All three must name the same version; to upgrade, change the three URLs in `package.json` together.

The Task screen needs kbui's rounded `Panel`, `Panel.Well` and `Status appearance="chip"`, which arrive after v0.1.0. Until a release carries them, `package.json` still names v0.1.0 and typecheck fails against it; bump the three URLs to that release.

To work on kbui and bezl at once, install kbui by path instead (see kbui's `docs/guides/using-kbui.md`). Then kbui's `@base-ui/react` resolves React from kbui's own `node_modules`, so `vite.config.ts` dedupes `react` and `react-dom` and the jsdom tests inline `@kbui/*` so the dedupe applies there too.
