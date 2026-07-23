/**
 * In-app styleguide — tokens, palettes, primitives, theme × encoding matrix.
 * Open via `?view=styleguide`.
 */

import { Swatch } from "./ui/Swatch";
import { Chip } from "./ui/Chip";
import { useTheme } from "../lib/theme/ThemeContext";
import {
  PALETTE_META,
  PALETTE_NAMES,
  cssVars,
  mark,
  stat,
  surface,
  text,
  accent,
  type Theme,
  type ThemePreference,
} from "../lib/theme/tokens";
import { sequentialScale, categoricalScale, degreeColor } from "../lib/theme/scales";
import { contrastRatio, deltaE } from "../lib/theme/contrast";
import { GENDER_COLORS } from "../lib/types";

interface Props {
  onBack?: () => void;
}

function TokenRow({
  name,
  light,
  dark,
}: {
  name: string;
  light: string;
  dark: string;
}) {
  return (
    <div className="sg-token-row">
      <Swatch color={light} size={18} />
      <Swatch color={dark} size={18} />
      <code className="mono">{name}</code>
      <span className="mono sg-hex">{light}</span>
    </div>
  );
}

function PaletteCard({ name }: { name: (typeof PALETTE_NAMES)[number] }) {
  const meta = PALETTE_META[name];
  const pairs = meta.hues.slice(0, -1).map((h, i) => deltaE(h, meta.hues[i + 1]));
  const minDE = pairs.length ? Math.min(...pairs) : 0;
  return (
    <div className="sg-palette-card">
      <div className="sg-palette-head">
        <strong>{meta.label}</strong>
        <span className="mono">{meta.kind}</span>
        {meta.colorblindSafe ? <span className="palette-badge mono">CB-safe</span> : null}
      </div>
      <p className="sg-desc">{meta.description}</p>
      <div className="sg-swatch-row">
        {meta.hues.map((h, i) => (
          <Swatch key={i} color={h} size={22} title={h} />
        ))}
      </div>
      <div className="mono sg-meta">min adjacent ΔE ≈ {minDE.toFixed(1)}</div>
      <div className="sg-seq">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <Swatch key={t} color={degreeColor(t * 10, 10, name, "light")} size={14} />
        ))}
        <span className="mono">sequential</span>
      </div>
    </div>
  );
}

function MatrixTile({
  palette,
  colorMode,
  theme,
}: {
  palette: string;
  colorMode: string;
  theme: Theme;
}) {
  const keys = ["Drama", "Comedy", "Horror", "Action", "Romance", "Sci-Fi", "Other"];
  const cat = categoricalScale(palette, keys, theme);
  const seq = sequentialScale(palette, [0, 10], theme);
  return (
    <div className="sg-matrix-tile" data-theme={theme}>
      <div className="mono sg-matrix-label">
        {palette} · {colorMode} · {theme}
      </div>
      <svg viewBox="0 0 120 48" width="100%" height="48" aria-hidden>
        <rect width="120" height="48" fill={theme === "light" ? surface.paper.light : surface.workshop.dark} />
        {colorMode === "genre"
          ? keys.slice(0, 6).map((k, i) => (
              <circle key={k} cx={12 + i * 18} cy={24} r={7} fill={cat(k)} />
            ))
          : colorMode === "gender"
            ? (["female", "male", "nonbinary", "unknown"] as const).map((g, i) => (
                <circle key={g} cx={18 + i * 28} cy={24} r={8} fill={GENDER_COLORS[g]} />
              ))
            : [2, 4, 6, 8, 10].map((d, i) => (
                <circle key={d} cx={14 + i * 22} cy={24} r={6 + i} fill={seq(d)} />
              ))}
      </svg>
    </div>
  );
}

/** Simple deuteranopia simulation via channel remix (approx). */
function simulateCVD(hex: string, mode: "deut" | "prot" | "trit"): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  let nr = r;
  let ng = g;
  let nb = b;
  if (mode === "deut") {
    nr = 0.625 * r + 0.375 * g;
    ng = 0.7 * r + 0.3 * g;
    nb = b;
  } else if (mode === "prot") {
    nr = 0.567 * r + 0.433 * g;
    ng = 0.558 * r + 0.442 * g;
    nb = b;
  } else {
    nr = r;
    ng = 0.967 * g + 0.033 * b;
    nb = 0.183 * g + 0.817 * b;
  }
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(nr)}${to(ng)}${to(nb)}`;
}

export function StyleGuide({ onBack }: Props) {
  const { theme, themePreference, setTheme, palette, setPalette } = useTheme();
  const paper = surface.paper.light;
  const ink = text.ink.light;
  const aa = contrastRatio(ink, paper);

  const themedPairs: [string, { light: string; dark: string }][] = [
    ["surface.paper", surface.paper],
    ["text.ink", text.ink],
    ["accent.base", accent.base],
    ["mark.hub", mark.hub],
    ["mark.gender.female", mark.gender.female],
    ["mark.gender.male", mark.gender.male],
    ["stat.guide", stat.guide],
    ["stat.halo", stat.halo],
  ];

  return (
    <div className="styleguide">
      <header className="sg-header">
        <div>
          <h1>Loom styleguide</h1>
          <p className="sg-desc">Tokens · palettes · primitives · accessibility</p>
        </div>
        <div className="sg-header-actions">
          <div className="chip-row">
            {(["auto", "light", "dark"] as ThemePreference[]).map((t) => (
              <Chip key={t} active={themePreference === t} onClick={() => setTheme(t)}>
                {t}
              </Chip>
            ))}
          </div>
          {onBack ? (
            <button type="button" className="ghost" onClick={onBack}>
              ← Back
            </button>
          ) : null}
        </div>
      </header>

      <section className="sg-section">
        <h2>Semantic tokens</h2>
        <p className="sg-desc">
          Ink on paper contrast: <strong className="mono">{aa.toFixed(2)}:1</strong>{" "}
          {aa >= 4.5 ? "(AA pass)" : "(AA fail)"} · active theme{" "}
          <code className="mono">{theme}</code>
        </p>
        <div className="sg-token-list">
          {themedPairs.map(([name, c]) => (
            <TokenRow key={name} name={name} light={c.light} dark={c.dark} />
          ))}
        </div>
        <details className="sg-details">
          <summary>CSS vars ({Object.keys(cssVars(theme)).length})</summary>
          <pre className="mono sg-pre">
            {Object.entries(cssVars(theme))
              .map(([k, v]) => `${k}: ${v};`)
              .join("\n")}
          </pre>
        </details>
      </section>

      <section className="sg-section">
        <h2>Palettes</h2>
        <div className="sg-palette-grid">
          {PALETTE_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              className={`sg-palette-btn${palette === n ? " active" : ""}`}
              onClick={() => setPalette(n)}
            >
              <PaletteCard name={n} />
            </button>
          ))}
        </div>
      </section>

      <section className="sg-section">
        <h2>Colorblind simulation (active palette)</h2>
        <div className="sg-cvd">
          {(["deut", "prot", "trit"] as const).map((mode) => (
            <div key={mode} className="sg-cvd-col">
              <div className="mono">{mode}</div>
              <div className="sg-swatch-row">
                {PALETTE_META[palette].hues.map((h, i) => (
                  <Swatch key={i} color={simulateCVD(h, mode)} size={20} title={h} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sg-section">
        <h2>Token matrix</h2>
        <p className="sg-desc">Each palette × colorMode × light/dark</p>
        <div className="sg-matrix">
          {PALETTE_NAMES.flatMap((p) =>
            (["degree", "genre", "gender"] as const).flatMap((mode) =>
              (["light", "dark"] as Theme[]).map((th) => (
                <MatrixTile key={`${p}-${mode}-${th}`} palette={p} colorMode={mode} theme={th} />
              )),
            ),
          )}
        </div>
      </section>

      <section className="sg-section">
        <h2>Primitives</h2>
        <div className="chip-row">
          <Chip active>Active chip</Chip>
          <Chip>Idle chip</Chip>
          <Swatch color={accent.base.light} size={14} label="Swatch" />
        </div>
      </section>
    </div>
  );
}
