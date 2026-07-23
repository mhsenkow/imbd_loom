# Loom visual QA checklist

Use at desktop (≥1100px), tablet (~768), phone (360–414), and landscape phone.

## Brand & first viewport
- [ ] Home brand wordmark reads as the hero (not a mono eyebrow)
- [ ] One headline + one lede + one primary CTA in the first viewport
- [ ] Gallery sheets look like paper plates, not dark product cards
- [ ] No rounded-full pill clusters on home or HUD

## Paper & atelier
- [ ] Stage lighting is warm workshop (not purple radials)
- [ ] Poster / timeline sit like sheets under a lamp (soft shadow, not floating UI card)
- [ ] Safe-area padding OK on notched phones
- [ ] Scrim is warm dark; drawers/sheet dismiss on tap / Escape / back

## Chart craft
- [ ] Year grid: decade rules inkier; minors dotted; mode decade wash visible when enabled
- [ ] Career spans read as thread; peaks have paper halo + pin
- [ ] Chord ribbons show source→target weave when colors differ
- [ ] Bundle leaves read as stitched dots; alluvial warps stay thin
- [ ] Legend shows mark icons for bridge / gap / halo / median
- [ ] Stat tags are stamps (not pills); bridge diamond is embossed

## Theming
- [ ] Sidebar theme chips (auto / light / dark) flip chrome; poster stays paper via ThemeScope
- [ ] Palette swatches preview hues; switching loom→ink→dusk→okabe→contrast recolors charts + drift threads
- [ ] Gender encoding uses Okabe marks (not loom[0]/loom[1])
- [ ] `?print` / PDF export forces light paper theme
- [ ] `?view=styleguide` shows token matrix + CVD simulation
- [ ] `rg -n "#[0-9A-Fa-f]{3,8}" app/src/components app/src/viz` returns empty
- [ ] `npm test` in `app/` passes contrast + ΔE + scale tests

## Motion & a11y
- [ ] Home: brand fade, sheet settle, CTA ink-in
- [ ] Atelier: poster settle; drawers slide; no neon glow
- [ ] `prefers-reduced-motion`: animations off
- [ ] Focus rings visible on keyboard Tab
- [ ] Inputs ≥16px (no iOS focus zoom)

## Trust the data (`?view=methodology`)
- [ ] Header brand + TOC + construct picker readable on desktop and phone
- [ ] Source cards link out with visible underline; light/dark token parity
- [ ] Quality tiles + funnel + overview table render from `quality.json`
- [ ] Spot-check widget opens IMDb name/title links; integrity badge updates
- [ ] Deep link `?view=methodology&c=voice_cartoons#metric-edge` scrolls to math
- [ ] Gallery + sidebar + Inspect “how edges are defined” reach the page

## Data integrity
- [ ] Same counts, filters, and stat mark IDs as before
- [ ] Pin / inspect / URL share still work
- [ ] Print/`?print` poster still renders METHOD + crop marks
- [ ] `quality.json` / `sources.json` present under `app/public/data` after sync
