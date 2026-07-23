# Theme tokens — component ↔ token contract

Single source of truth: `tokens.ts`. Chart SVG uses `token(name, theme)`;
chrome CSS uses `cssVars(theme)` injected by `ThemeProvider`.

## Layers

| Layer | Owns |
|---|---|
| `primitives` | Raw OKLCH-derived hex scales (`paper`, `ink`, `terracotta`, …) |
| `surface` / `text` / `line` / `accent` | Chrome semantic tokens |
| `mark` / `link` / `grid` / `axis` | Chart mark semantics |
| `stat.*` | Fixed annotation layer (does **not** track active palette) |
| `PALETTES` / `PALETTE_META` | Categorical weave palettes only |

## Primitive consumers

| Component | Tokens |
|---|---|
| `Swatch` | Passes resolved color (any token) |
| `Chip` | `--surface-well`, `--hover-wash`, `--accent`, `--atelier-*` |
| `SurfaceCard` / `ThemeScope` | Pins subtree via `cssVars(theme)` |
| `Legend` / `ChartLegend` | `mark.gender.*`, palette hues, sequential low/high |
| `ChartDefs` | Weave stops, `--paper-grain-opacity`, `mark.dim` / `mark.hub` |
| Timeline / Poster / HeroViz | `fonts.ts` aliases → `LIGHT.*` / `token()` |

## Rules

1. **No raw hex** outside `tokens.ts` (primitives + curated palette hues).
2. Stat overlays stay on `stat.*` — second encoding channel.
3. Gender uses `mark.gender.*` (Okabe–Ito), never categorical loom slots.
4. Print / PDF forces `theme="light"` via `ThemeProvider printMode`.
5. Poster frame uses `<ThemeScope theme="light">` / `<SurfaceCard theme="light">`.

## Hooks

```ts
const { theme, palette, setTheme, setPalette, token } = useTheme();
const accent = useToken("accent.base");
```
