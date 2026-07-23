# IMDb Loom — Chart Coloration & Theming Action Plan

A 100-step checklist for finishing a holistic coloration + theming pass. Steps are
ordered so each phase builds on the previous one; work top to bottom. Check items off
as you go.

## Context: what's wrong today (read first)

The app has **four disjoint color-definition sites** with duplicated literals, and a
perceptually poor sequential ramp. The same terracotta `#c45c26` is independently
declared in all of these:

| Site | File | What it holds |
|---|---|---|
| CSS chrome tokens | `app/src/styles/atelier.css` `:root` | `--accent`, `--paper`, `--ink`, `--rule`, `--trim`, glows |
| JS categorical palettes | `app/src/lib/types.ts` | `PALETTES` (loom/ink/dusk), `PALETTE_MIDTONES`, `GENDER_COLORS` |
| SVG render constants | `app/src/lib/fonts.ts` | `PAPER`, `INK`, `ACCENT`, `RULE`, `TRIM`, `MODE_DECADE`, `FOCUS_UNDERPAINT` |
| Stat-mark colors | `app/src/lib/statsMarks.ts` | `STAT_COLORS` (13 literals duplicating the loom palette) |

Plus scattered inline hex in `TimelineHero.tsx`, `TimelineStatic.tsx`, `Poster.tsx`,
`ConstructBridges.tsx` (`#c8bfb0`, `#5c3d2e`, `#c45c2644`, `#F7F2E8`, etc.).

Core problems: (1) no single source of truth; (2) `degreeColor()` in `lib/colors.ts`
does a naive **linear-RGB mix** toward a hardcoded `#F7F2E8`, producing muddy midtones
and ignoring the active palette/theme; (3) `categoricalScale()` is index-modulo with no
perceptual spacing and collides once genres exceed 6; (4) gender colors reuse the loom
categorical hues, so "color = gender" and "color = genre" look identical; (5) charts only
ever render on paper — no theme awareness. `d3` v7 (full) is already a dependency, so
`d3-color` / `d3-interpolate` / `d3-scale-chromatic` are available.

**Three confirmed correctness bugs** (not just cleanup — the palette picker silently
lies today):

- **Palette-independent literals.** The genre-drift thread halves (`#C45C26`/`#2F5D50`
  in `TimelineHero.tsx:597,607,720,730` and `TimelineStatic.tsx:407,416,463,472`), the
  rank-ladder `#N` text (`#C4A35A`), the entire `STAT_COLORS` set, and the Poster legend
  gradient are hardcoded copies of the **loom** hues. Switch the palette to `ink` or
  `dusk` and these do **not** change — the poster is half-recolored.
- **`PALETTE_MIDTONES` (`types.ts:235-239`) is dead code** — defined but never imported.
  Ribbons instead build two-stop gradients from the two node fills at render time. Decide:
  wire it in or delete it (Phase 3 derives midtones programmatically, so likely delete).
- **`fill="#1a1814"` inline** in `TimelineHero.tsx:672,792` re-hardcodes INK instead of
  importing the constant — a duplication of a duplication.

Also confirmed by the viz-layer audit: **zero `var(--…)` CSS variables reach any chart** —
every SVG fill/stroke is a JS-computed attribute. So the chrome (CSS tokens) and the marks
(JS constants) genuinely share nothing today. The token module in Phase 1 is what unifies them.

---

## Phase 0 — Audit & baseline (steps 1–8)

- [ ] 1. Run `npm run dev` in `app/` and capture baseline screenshots of each hero form (timeline, chord, bundle) and the home gallery for before/after comparison.
- [ ] 2. Grep the whole `app/src` tree for hardcoded hex: `rg -n "#[0-9A-Fa-f]{3,8}\b" app/src` and paste the results into a scratch file as the "to-migrate" inventory.
- [ ] 3. List every color-consuming file: `lib/colors.ts`, `lib/encode.ts`, `lib/types.ts`, `lib/fonts.ts`, `lib/statsMarks.ts`, `viz/*.ts`, and every `components/*.tsx` that renders SVG.
- [ ] 4. Document the current palette-selection flow: `Sidebar.tsx` palette `<select>` → `spec.palette` → `layoutTimeline({ palette })` → `encode.ts` → `colors.ts`.
- [ ] 5. Document the current colorMode flow: `resolveColorBy()` in `lib/filter.ts` → `nodeColor()` in `lib/encode.ts` (gender / degree / prominence / genre branches).
- [ ] 6. Note every place the paper white `#F7F2E8`/`#f7f2e8` is hardcoded — it is the sequential ramp's "empty" endpoint and must become a token.
- [ ] 7. Confirm the print/PDF export path (`export/export-pdf.ts`, `body.print-mode` CSS) so theming changes don't break RGB PDF output.
- [ ] 8. Create a git branch `feat/theming-tokens` so the migration is reviewable in isolation.

## Phase 1 — Single source of truth: design tokens (steps 9–24)

- [ ] 9. Create `app/src/lib/theme/tokens.ts` as the ONE authoritative token module (primitives + semantic tokens exported as typed objects).
- [ ] 10. Define **primitive** tokens first: raw scales (`paper.0–paper.5`, `ink.0–ink.5`, `terracotta.*`, `pine.*`, `gold.*`, `plum.*`, `brick.*`, `slate.*`) using OKLCH-derived hex.
- [ ] 11. Define **semantic** tokens that reference primitives: `surface.paper`, `surface.workshop`, `text.ink`, `text.muted`, `line.rule`, `line.trim`, `accent.base/hover/pressed/soft/focus`.
- [ ] 12. Add **chart-semantic** tokens distinct from chrome: `mark.hub`, `mark.default`, `mark.dim`, `mark.highlight`, `mark.isolate`, `link.base`, `link.hot`, `grid.line`, `grid.decade`, `axis.text`.
- [ ] 13. Model the token type as `{ light: string; dark: string }` pairs (or a nested `Record<Theme, string>`) so every semantic token carries both theme values.
- [ ] 14. Export a `cssVars(theme)` helper from `tokens.ts` that flattens semantic tokens into `{ "--surface-paper": "#…", … }` for injection into `:root`.
- [ ] 15. Export a plain `token(name, theme)` accessor for JS/SVG consumers that can't read CSS vars (D3 layout code computing fills before render).
- [ ] 16. Rewrite `app/src/styles/atelier.css` `:root` to be **generated from / mirror** the semantic tokens — keep the `--*` names but make their values the canonical token values (no independent literals).
- [ ] 17. Add a build-time or dev-time assertion that CSS var names in `atelier.css` and keys in `tokens.ts` stay in sync (a small unit test that diffs the two sets).
- [ ] 18. Delete the duplicated literals in `lib/fonts.ts` — re-export `PAPER`, `INK`, `ACCENT`, `RULE`, `TRIM`, `MODE_DECADE`, `FOCUS_UNDERPAINT` as thin aliases that read from `tokens.ts`.
- [ ] 19. Move the font stacks (`FONT_SANS/MONO/SERIF`) out of `lib/fonts.ts` into a `tokens.type` group so typography is a token too; keep `fonts.ts` as a compatibility re-export.
- [ ] 20. Migrate `GENDER_COLORS` in `types.ts` to reference **semantic gender tokens** (`mark.gender.female/male/nonbinary/unknown`) that are intentionally distinct from the categorical palette.
- [ ] 21. Migrate `STAT_COLORS` (`statsMarks.ts:252-265`) to reference semantic **stat tokens** (`stat.guide/halo/warm/bridge/path/densest/insight/ghost/rising/fading/community/reunion`) — no raw hex. Decide whether stat overlays should track the active palette or stay a fixed annotation layer; document the choice (today they are silently fixed to loom).
- [ ] 22. Ensure `PALETTES` in `types.ts` is the ONLY place categorical arrays live; **delete the dead `PALETTE_MIDTONES`** (never imported) and derive midtones programmatically in Phase 3 instead.
- [ ] 23. Add a TypeScript `Theme = "light" | "dark"` type and `PaletteName` union derived from `keyof typeof PALETTES` so palette/theme are type-safe everywhere.
- [ ] 24. Run `rg -n "#[0-9A-Fa-f]{3,8}" app/src/lib` and confirm the only remaining raw hex live inside `tokens.ts` (the primitive scale) — everything else references tokens.

## Phase 2 — Theming engine & ThemeProvider (steps 25–40)

- [ ] 25. Create `app/src/lib/theme/ThemeContext.tsx` exposing `{ theme, palette, setTheme, setPalette, tokens }` via React context.
- [ ] 26. Implement a `ThemeProvider` that writes the active theme's CSS vars onto `document.documentElement` (`:root`) via the `cssVars()` helper on mount and on change.
- [ ] 27. Stamp `data-theme="light|dark"` on `<html>` so CSS can branch with `:root[data-theme="dark"]` selectors in addition to the injected vars.
- [ ] 28. Wire the provider at the top of `app/src/main.tsx` (or `App.tsx`) so the whole tree — chrome and charts — reads one theme.
- [ ] 29. Add a `usePalette()` / `useToken(name)` hook so components stop importing raw constants and instead subscribe to the active theme.
- [ ] 30. Persist the user's theme + palette choice to `localStorage` and rehydrate on load (guard for SSR/no-window).
- [ ] 31. Default `theme` from `window.matchMedia("(prefers-color-scheme: …)")` when no stored preference exists; keep the existing `color-scheme: dark` as the fallback.
- [ ] 32. Add a `prefers-contrast: more` branch that swaps in higher-contrast token values (the CSS already has a partial one at `atelier.css` — drive it from tokens).
- [ ] 33. Respect `prefers-reduced-motion` for any theme-transition animation (fade CSS vars, don't animate hue).
- [ ] 34. Move the palette `<select>` in `Sidebar.tsx` (around line 640) to dispatch through `setPalette` from context instead of `onChange({ palette })` mutating spec directly — OR keep spec as the store but have the provider observe `spec.palette`.
- [ ] 35. Add a **theme toggle** control (light / dark / auto) in the sidebar chrome next to the palette picker.
- [ ] 36. Ensure `spec.palette` stays the serialized source of truth for share URLs (`lib/specUrl.ts`, `lib/encode.ts` encode/decode) so themed posters are shareable.
- [ ] 37. Verify the print route: `body.print-mode` must force `theme="light"` (paper) regardless of UI theme so PDFs always export on paper.
- [ ] 38. Verify `GalleryThumb.tsx` (which calls `resolveColorBy`) reads the same theme/palette as the live chart so thumbnails match.
- [ ] 39. Add an escape hatch: a `<ThemeScope theme="light">` wrapper component that pins a subtree (e.g. the poster frame) to paper even when chrome is dark.
- [ ] 40. Confirm no component imports color literals directly anymore (`rg -n "from \"../lib/fonts\"" app/src` should show only token-alias imports).

## Phase 3 — Perceptual color scales (steps 41–56)

- [ ] 41. Replace the naive `mix()` in `lib/colors.ts` with a perceptual interpolator — use `d3.interpolateLab` or `d3.interpolateHcl` (both ship with the `d3` dependency) instead of linear RGB.
- [ ] 42. Rewrite `degreeColor(degree, max, palette)` to build a `d3.scaleSequential` per palette, interpolating from a palette-specific "low" token to the palette's primary hue — NOT a hardcoded `#F7F2E8`.
- [ ] 43. Make the sequential ramp's low endpoint a **token** (`mark.dim` / palette background) that flips with theme, so degree shading reads on dark surfaces too.
- [ ] 44. Add a `sequentialScale(palette, domain)` factory in a new `lib/theme/scales.ts` and have `encode.ts` `nodeColor()` call it for degree/prominence modes.
- [ ] 45. Clamp the sequential ramp so the lowest-degree nodes never fall below a minimum contrast ratio against the surface (compute with a `contrastRatio()` util).
- [ ] 46. Rewrite `categoricalScale()` to guarantee perceptual spacing: either curate palettes by hand in OKLCH, or generate evenly-spaced hues with `d3.quantize(d3.interpolateRainbow, n)` mapped into the palette's lightness/chroma band.
- [ ] 47. Handle the >N-categories overflow: when genre count exceeds palette length, generate additional perceptually-distinct hues instead of wrapping with `i % length`.
- [ ] 48. Add a `divergingScale()` for any signed metric (e.g. genre drift rising/fading, z-scores) using `d3.interpolateRdBu`-style but recolored to the loom palette family.
- [ ] 49. Derive `PALETTE_MIDTONES` programmatically by lightening each base hue in Lab/OKLCH space (drop the hand-maintained duplicate arrays in `types.ts`).
- [ ] 50. Create a single `weaveGradient(sourceFill, targetFill, id)` helper so timeline/bundle ribbons stop inlining `<linearGradient>` per-component; centralize the two-stop weave.
- [ ] 51. Tokenize link/ribbon **opacity** (`--link-opacity-base`, `--link-opacity-hot`, `--link-opacity-dim`) instead of the ad-hoc values in `encode.ts` `linkStrokeWidth` and the components.
- [ ] 52. Tokenize the focus/dim states: `DIM_GHOST` (0.12) and `FOCUS_UNDERPAINT` become `mark.dim.opacity` and `mark.focus.wash` tokens.
- [ ] 53. Add a `hoverColor(base)` / `activeColor(base)` derived-state helper (lighten/darken in Lab) so hover states are computed, not hardcoded per component.
- [ ] 54. Verify the sequential + categorical scales produce identical output at the same inputs across light/dark by unit-testing `token()` resolution.
- [ ] 55. Add memoization: build each `d3` scale once per (palette, theme, domain) rather than per node in the `people.map()` loop in `viz/timeline.ts`.
- [ ] 56. Benchmark render with `topN=300` before/after to confirm the perceptual scales don't regress layout perf.

## Phase 4 — Palette redesign & semantic separation (steps 57–68)

- [ ] 57. Redesign the `loom` palette in OKLCH for even perceptual spacing and guaranteed contrast against both `paper` and `workshop` surfaces.
- [ ] 58. Redesign `ink` (grayscale letterpress) as a proper lightness ramp and verify it stays legible as a categorical scale (not just sequential).
- [ ] 59. Redesign `dusk` as a cohesive warm-dusk family with the same spacing discipline.
- [ ] 60. Add at least one **colorblind-safe** palette (e.g. an Okabe–Ito-derived set retinted to the atelier aesthetic) and expose it in the picker.
- [ ] 61. Add a **high-contrast** palette variant for the `prefers-contrast: more` path.
- [ ] 62. Give gender its own semantic 4-color set that is visually distinct from every categorical palette (resolve the current `#C45C26`/`#2F5D50` collision with loom[0]/loom[1]).
- [ ] 63. Choose gender colors that are colorblind-distinguishable AND carry no unintended cultural coding; document the rationale in a comment.
- [ ] 64. Ensure every palette defines a matching sequential "low" endpoint so degree shading works per-palette (feeds step 42).
- [ ] 65. Add palette metadata (`{ name, label, description, colorblindSafe, kind }`) so the Sidebar picker can show swatches + a one-line description instead of a bare `<select>`.
- [ ] 66. Upgrade the Sidebar palette picker to render live swatch previews of each palette (small SVG row) driven by the metadata.
- [ ] 67. Add a legend/key that names the encoding + palette in use (extend `ChartLegend.tsx` and `colorLegendLabel()` in `encode.ts`).
- [ ] 68. Verify each palette's first 3 hues are distinguishable at thumbnail size (gallery cards) since most genres cluster in the first few slots.

## Phase 5 — Refactor chart rendering onto tokens (steps 69–82)

- [ ] 69. `viz/timeline.ts`: confirm it already delegates color to `encode.ts` (it does — 0 hardcoded hex); just thread the new `theme` through `layoutTimeline` opts.
- [ ] 70. `components/TimelineHero.tsx`: replace inline `#c8bfb0` (grid, :301/:349), `#5c3d2e` (film label, :492), the drift-thread `#C45C26`/`#2F5D50` (:597/:607/:720/:730 — must become palette-aware, not fixed loom), `#C4A35A` rank text (:658/:778), and the re-hardcoded `#1a1814` INK (:672/:792) with token references.
- [ ] 71. `components/TimelineStatic.tsx`: replace the same set of inline hex (`#c8bfb0`, `#C45C26`, `#2F5D50`) with tokens — keep it in sync with TimelineHero.
- [ ] 72. `components/Poster.tsx`: replace the degree-gradient stops `#F7F2E8`→`#C45C26` (lines ~564–565) with the tokenized sequential ramp, and `#c45c2644` / `#cfc6b4` with tokens.
- [ ] 73. `components/ConstructBridges.tsx`: replace the `#2F5D50` fallback stroke/dot (lines ~159–163) with a `link.base` token.
- [ ] 74. `components/GalleryThumb.tsx`: replace its lone hardcoded hex with a token so thumbnails follow theme.
- [ ] 75. `components/StatMarkDecor.tsx` + `TimelineStatGuides.tsx`: confirm they read `STAT_COLORS` (now tokenized in step 21) and pass `theme` where needed.
- [ ] 76. `viz/chord.ts`, `viz/bundle.ts`, `viz/alluvial.ts`: audit for any color decisions made outside `encode.ts`; route all through the encode/scales layer.
- [ ] 77. Centralize all SVG `<defs>` (gradients, filters, paper-grain) into one `<ChartDefs theme={…}/>` component instead of per-hero duplication.
- [ ] 78. Make the paper-grain texture opacity a token so it can soften/disable on dark theme where multiply-blend behaves differently.
- [ ] 79. Replace the `#0e0c10` "input well" background literal used across `atelier.css` (`.chip`, `.field select`, `.search-input`, etc.) with a `--surface-well` token.
- [ ] 80. Replace the many `#ffffff08` / `#ffffff0a` hover washes in `atelier.css` with a `--hover-wash` token using `color-mix`.
- [ ] 81. Replace the `#00000033` … `#00000088` shadow literals with `--shadow-*` tokens so elevation is themeable.
- [ ] 82. Final grep: `rg -n "#[0-9A-Fa-f]{3,8}" app/src/components app/src/viz` should return **zero** results (all hex now lives in `tokens.ts`).

## Phase 6 — Themed component primitives (steps 83–90)

- [ ] 83. Introduce CSS `@layer` architecture in `atelier.css` (`@layer reset, tokens, chrome, chart, overrides`) so token layer always wins predictably.
- [ ] 84. Create a `<Swatch color=… size=…/>` primitive and replace the ad-hoc `.swatch` / `.swatch-dot` / `.legend-mark-icon` markup.
- [ ] 85. Create a `<Chip>` primitive backed by tokens and migrate the sidebar `.chip` usages so active/hover/focus states come from one place.
- [ ] 86. Create a `<Legend>` component that composes `ChartLegend` + swatches from the active palette/encoding automatically.
- [ ] 87. Extract a `<SurfaceCard>` primitive for the gallery cards / poster frame that accepts a `theme` scope prop (uses step 39's `ThemeScope`).
- [ ] 88. Document the component ↔ token contract in a short `app/src/lib/theme/README.md` (which tokens each primitive consumes).
- [ ] 89. Add Storybook OR a lightweight in-app `/styleguide` route rendering every token swatch, palette, and primitive in both themes.
- [ ] 90. Add a visual "token matrix" to the styleguide: each palette × each colorMode × light/dark, rendered as small chart tiles for at-a-glance QA.

## Phase 7 — Accessibility, QA & docs (steps 91–100)

- [ ] 91. Add a `contrastRatio(fg, bg)` util and a unit test asserting all text/line tokens meet WCAG AA against their surface in both themes.
- [ ] 92. Add a test asserting adjacent categorical palette entries differ by a minimum ΔE (perceptual distance) so no two series look alike.
- [ ] 93. Run each palette through a colorblind simulator (deuteranopia/protanopia/tritanopia) and record pass/fail in the styleguide.
- [ ] 94. Verify degree/prominence sequential ramps remain monotonic in perceived lightness (no dark→light→dark humps) via a test on sampled stops.
- [ ] 95. Verify the print PDF export still renders on paper with correct RGB values (run `npm run export -- --size a1 --construct voice_cartoons --hero timeline`).
- [ ] 96. Re-screenshot all hero forms + gallery in light and dark and diff against the Phase 0 baseline; confirm intended-only changes.
- [ ] 97. Test on mobile breakpoints (`max-width: 560px`) — token-driven chrome must still fit the bottom-tab layout in `atelier.css`.
- [ ] 98. Update `VISUAL_QA.md` with the new theming checklist and `README.md` "Explorer tips" with the theme/palette controls.
- [ ] 99. Remove all now-dead code: old `mix()`/`hexToRgb()` in `colors.ts` if fully replaced, orphaned constants, and stale palette arrays.
- [ ] 100. Open the PR from `feat/theming-tokens` with before/after screenshots, the "zero raw hex outside tokens.ts" grep proof, and a summary of the single-source-of-truth migration.

---

### Suggested new file layout

```
app/src/lib/theme/
  tokens.ts          # primitives + semantic + chart tokens (ONE source of truth)
  scales.ts          # sequential / categorical / diverging d3 factories
  ThemeContext.tsx   # ThemeProvider, useTheme, usePalette, useToken
  contrast.ts        # contrastRatio, ΔE helpers
  README.md          # component ↔ token contract
```

`lib/fonts.ts`, `lib/colors.ts`, `types.ts` (`PALETTES`/`GENDER_COLORS`), and
`statsMarks.ts` (`STAT_COLORS`) become **thin re-exports / references** into `theme/tokens.ts`
rather than independent literal declarations. `atelier.css` `:root` mirrors the same tokens.
