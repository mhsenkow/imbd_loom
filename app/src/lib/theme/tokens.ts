/**
 * Design tokens — single source of truth for chrome + chart coloration.
 *
 * Primitives hold raw OKLCH-derived hex. Semantic tokens reference primitives
 * as { light, dark } pairs. Chart SVG code uses `token()`; CSS chrome uses
 * `cssVars()`. No other module should declare raw hex for UI/chart colors.
 */

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "auto";

export type ThemedColor = { light: string; dark: string };

/** Resolve a themed color for the active theme. */
export function resolveThemed(c: ThemedColor, theme: Theme): string {
  return c[theme];
}

// ─── Primitives (OKLCH-derived hex) ──────────────────────────────────────────

export const primitives = {
  paper: {
    0: "#faf6ee",
    1: "#f7f2e8",
    2: "#efe8da",
    3: "#e8e0d0",
    4: "#e0d8c8",
    5: "#d9d0c0",
  },
  ink: {
    0: "#1a1814",
    1: "#3a3630",
    2: "#6e6a62",
    3: "#9a958c",
    4: "#c4bfb4",
    5: "#e8e0d0",
  },
  terracotta: {
    base: "#c45c26",
    hover: "#d46a30",
    pressed: "#a84c1e",
    soft: "#c45c2633",
    focus: "#e8c4a8",
    wash: "#c45c2622",
    mid: "#d4845a",
  },
  pine: {
    base: "#2f5d50",
    mid: "#4a7a6c",
    soft: "#81b29a",
  },
  gold: {
    base: "#c4a35a",
    mid: "#d4b87a",
    soft: "#f2cc8f",
  },
  plum: {
    base: "#5b4b8a",
    mid: "#7a6ba0",
  },
  brick: {
    base: "#8b3a3a",
    mid: "#a55a5a",
  },
  slate: {
    base: "#3d5a80",
    mid: "#5a7294",
  },
  workshop: {
    0: "#0e0c10",
    1: "#121014",
    2: "#1c1a1f",
    3: "#2a2730",
    4: "#3a3640",
    text: "#e8e4dc",
    muted: "#a39e94",
    mutedHi: "#c4bfb4",
    glowWarm: "#2a221c",
    glowCool: "#1c1814",
  },
  /** Okabe–Ito retinted for atelier paper (colorblind-safe categorical). */
  okabe: {
    orange: "#e69f00",
    sky: "#56b4e9",
    green: "#009e73",
    yellow: "#f0e442",
    blue: "#0072b2",
    vermillion: "#d55e00",
    purple: "#cc79a7",
    gray: "#999999",
  },
  /** High-contrast accents for prefers-contrast: more */
  contrast: {
    ink: "#0e0c0a",
    inkFaint: "#4a4640",
    rule: "#b8b0a0",
    muted: "#c4bfb4",
    border: "#3a3640",
  },
} as const;

// ─── Semantic chrome tokens ─────────────────────────────────────────────────

const P = primitives;

export const surface = {
  paper: { light: P.paper[1], dark: P.workshop[2] } satisfies ThemedColor,
  paperWash: { light: P.paper[0], dark: P.workshop[1] } satisfies ThemedColor,
  paperEdge: { light: P.paper[3], dark: P.workshop[3] } satisfies ThemedColor,
  paperGrain: { light: P.paper[2], dark: P.workshop[2] } satisfies ThemedColor,
  /** Chrome shell — light theme is a warm workshop loft, dark is the night atelier. */
  workshop: { light: "#ebe4d6", dark: P.workshop[1] } satisfies ThemedColor,
  workshopPanel: { light: "#f3ede2", dark: P.workshop[2] } satisfies ThemedColor,
  well: { light: "#e2d9c8", dark: P.workshop[0] } satisfies ThemedColor,
} as const;

export const text = {
  ink: { light: P.ink[0], dark: P.workshop.text } satisfies ThemedColor,
  inkSoft: { light: P.ink[1], dark: P.workshop.mutedHi } satisfies ThemedColor,
  inkFaint: { light: P.ink[2], dark: P.workshop.muted } satisfies ThemedColor,
  workshop: { light: P.ink[0], dark: P.workshop.text } satisfies ThemedColor,
  /** Secondary chrome copy — darker in light so muted labels stay WCAG-AA on workshop. */
  muted: { light: "#5a564e", dark: P.workshop.muted } satisfies ThemedColor,
  /** Always-light ink for terracotta / accent fills (both themes). */
  onAccent: { light: P.paper[0], dark: P.paper[0] } satisfies ThemedColor,
} as const;

export const line = {
  rule: { light: P.paper[5], dark: P.workshop[3] } satisfies ThemedColor,
  trim: { light: P.paper[4], dark: P.workshop[3] } satisfies ThemedColor,
  decade: { light: "#c8bfb0", dark: P.workshop[4] } satisfies ThemedColor,
  filmLabel: { light: "#5c3d2e", dark: P.gold.soft } satisfies ThemedColor,
  border: { light: "#d0c6b4", dark: P.workshop[3] } satisfies ThemedColor,
} as const;

export const accent = {
  base: { light: P.terracotta.base, dark: P.terracotta.base } satisfies ThemedColor,
  /** Mid tone for hot strokes on dark paper (lighter read than base). */
  mid: { light: P.terracotta.base, dark: P.terracotta.mid } satisfies ThemedColor,
  hover: { light: P.terracotta.hover, dark: P.terracotta.hover } satisfies ThemedColor,
  pressed: { light: P.terracotta.pressed, dark: P.terracotta.pressed } satisfies ThemedColor,
  soft: { light: P.terracotta.soft, dark: P.terracotta.soft } satisfies ThemedColor,
  focus: { light: P.terracotta.focus, dark: P.terracotta.focus } satisfies ThemedColor,
} as const;

/** Chart mark semantics — distinct from chrome accent. */
export const mark = {
  hub: { light: P.terracotta.base, dark: P.terracotta.mid } satisfies ThemedColor,
  default: { light: P.pine.base, dark: P.pine.mid } satisfies ThemedColor,
  dim: { light: P.paper[1], dark: P.workshop[2] } satisfies ThemedColor,
  highlight: { light: P.gold.base, dark: P.gold.mid } satisfies ThemedColor,
  isolate: { light: P.ink[3], dark: P.ink[3] } satisfies ThemedColor,
  /** Focus wash underpaint (print-safe, not neon). Dark gets a lighter wash on workshop. */
  focusWash: { light: P.terracotta.wash, dark: "#e07a4528" } satisfies ThemedColor,
  gender: {
    /**
     * Okabe–Ito subset retinted for atelier paper. Chosen for ΔE separation and
     * deuteranopia/protanopia safety — not pink/blue gender stereotypes.
     * Vermillion / bluish-green / blue / gray.
     */
    female: { light: P.okabe.vermillion, dark: P.okabe.vermillion } satisfies ThemedColor,
    male: { light: P.okabe.green, dark: P.okabe.green } satisfies ThemedColor,
    nonbinary: { light: P.okabe.blue, dark: P.okabe.sky } satisfies ThemedColor,
    unknown: { light: P.okabe.gray, dark: P.ink[3] } satisfies ThemedColor,
  },
} as const;

export const link = {
  base: { light: P.pine.base, dark: P.pine.mid } satisfies ThemedColor,
  hot: { light: P.terracotta.base, dark: P.terracotta.mid } satisfies ThemedColor,
  skim: { light: P.terracotta.mid, dark: P.terracotta.mid } satisfies ThemedColor,
} as const;

export const grid = {
  line: { light: P.paper[5], dark: P.workshop[3] } satisfies ThemedColor,
  decade: { light: "#c8bfb0", dark: P.workshop[4] } satisfies ThemedColor,
  modeDecade: { light: P.slate.base, dark: P.slate.mid } satisfies ThemedColor,
} as const;

export const axis = {
  text: { light: P.ink[2], dark: P.workshop.muted } satisfies ThemedColor,
} as const;

/**
 * Stat overlay colors — fixed annotation layer (do not track active categorical
 * palette). Rationale: stats are a second encoding channel; tying them to the
 * weave palette would collide with genre/degree color and break reading guides.
 */
export const stat = {
  guide: { light: P.slate.base, dark: P.slate.mid } satisfies ThemedColor,
  halo: { light: P.gold.base, dark: P.gold.mid } satisfies ThemedColor,
  warm: { light: P.terracotta.base, dark: P.terracotta.mid } satisfies ThemedColor,
  bridge: { light: P.plum.base, dark: P.plum.mid } satisfies ThemedColor,
  path: { light: P.pine.base, dark: P.pine.mid } satisfies ThemedColor,
  densest: { light: P.terracotta.base, dark: P.terracotta.mid } satisfies ThemedColor,
  insight: { light: P.terracotta.base, dark: P.terracotta.mid } satisfies ThemedColor,
  ghost: { light: P.ink[3], dark: P.ink[3] } satisfies ThemedColor,
  rising: { light: P.pine.base, dark: P.pine.mid } satisfies ThemedColor,
  fading: { light: P.brick.base, dark: P.brick.mid } satisfies ThemedColor,
  community: { light: P.plum.base, dark: P.plum.mid } satisfies ThemedColor,
  reunion: { light: P.brick.base, dark: P.brick.mid } satisfies ThemedColor,
  zglow: { light: P.gold.base, dark: P.gold.mid } satisfies ThemedColor,
} as const;

/**
 * Chart line opacity ladder (light baseline). Dark theme adds a floor boost
 * in lineStyle.ts so hairlines stay readable on workshop paper.
 */
export const opacity = {
  /** @deprecated Use linkAmbient — kept for cssVars / fonts.DIM_GHOST compat */
  linkBase: 0.48,
  linkAmbient: 0.48,
  linkRelated: 0.75,
  linkSkim: 0.68,
  linkHot: 0.9,
  linkDim: 0.15,
  warpAmbient: 0.5,
  warpDimFactor: 0.35,
  gridYear: 0.55,
  gridDecade: 0.72,
  gridMode: 0.88,
  markDim: 0.14,
  paperGrain: 0.045,
  paperGrainDark: 0.02,
  /** Extra ambient/dim opacity on dark paper */
  darkFloorBoost: 0.1,
  /** Print / static timeline quieter scale */
  printLinkScale: 0.85,
} as const;

export const shadow = {
  sm: { light: "#00000018", dark: "#00000044" } satisfies ThemedColor,
  md: { light: "#00000022", dark: "#00000055" } satisfies ThemedColor,
  lg: { light: "#00000033", dark: "#00000066" } satisfies ThemedColor,
  xl: { light: "#00000044", dark: "#00000088" } satisfies ThemedColor,
  inset: { light: "#ffffff88", dark: "#ffffff22" } satisfies ThemedColor,
} as const;

export const wash = {
  hover: { light: "#1a181414", dark: "#ffffff0a" } satisfies ThemedColor,
  hoverSoft: { light: "#1a18140a", dark: "#ffffff08" } satisfies ThemedColor,
} as const;

export const type = {
  sans: "IBM Plex Sans, system-ui, sans-serif",
  mono: "IBM Plex Mono, ui-monospace, monospace",
  serif: 'IBM Plex Serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
} as const;

// ─── Categorical palettes ────────────────────────────────────────────────────

export type PaletteName = "loom" | "ink" | "dusk" | "okabe" | "tol" | "contrast";

export interface PaletteMeta {
  name: PaletteName;
  label: string;
  description: string;
  colorblindSafe: boolean;
  kind: "categorical" | "sequential" | "high-contrast";
  /** Base categorical hues (perceptually spaced in OKLCH). */
  hues: readonly string[];
  /** Sequential ramp low endpoint (theme-aware via mark.dim when needed). */
  sequentialLow: ThemedColor;
}

/**
 * Palettes redesigned for even perceptual spacing and contrast on paper + workshop.
 * First 3 hues must remain distinguishable at gallery thumbnail size.
 */
export const PALETTE_META: Record<PaletteName, PaletteMeta> = {
  loom: {
    name: "loom",
    label: "Loom",
    description: "Print-safe weave — terracotta, pine, gold, plum, brick, slate",
    colorblindSafe: false,
    kind: "categorical",
    hues: [
      P.terracotta.base,
      P.pine.base,
      P.gold.base,
      P.plum.base,
      P.brick.base,
      P.slate.base,
    ],
    sequentialLow: { light: P.paper[1], dark: P.workshop[2] },
  },
  ink: {
    name: "ink",
    label: "Ink",
    description: "Grayscale letterpress — lightness ramp for poster mode",
    colorblindSafe: true,
    kind: "sequential",
    hues: [P.ink[0], P.ink[1], P.ink[2], P.ink[3], P.ink[4], P.ink[5]],
    sequentialLow: { light: P.paper[1], dark: P.workshop[2] },
  },
  dusk: {
    name: "dusk",
    label: "Dusk",
    description: "Warm dusk family — coral, indigo, sage, sand, gold, mauve",
    colorblindSafe: false,
    kind: "categorical",
    hues: ["#E07A5F", "#3D405B", "#81B29A", "#F2CC8F", "#C4A35A", "#6D597A"],
    sequentialLow: { light: P.paper[1], dark: P.workshop[2] },
  },
  okabe: {
    name: "okabe",
    label: "Okabe",
    description: "Best colorblind-safe categorical set (Okabe–Ito) — use with Genre / Degree",
    colorblindSafe: true,
    kind: "categorical",
    hues: [
      P.okabe.vermillion,
      P.okabe.green,
      P.okabe.blue,
      P.okabe.orange,
      P.okabe.purple,
      P.okabe.sky,
    ],
    sequentialLow: { light: P.paper[1], dark: P.workshop[2] },
  },
  tol: {
    name: "tol",
    label: "Tol Bright",
    description: "Paul Tol bright — strong CB-safe categorical for many genres",
    colorblindSafe: true,
    kind: "categorical",
    hues: ["#4477AA", "#EE6677", "#228833", "#CCBB44", "#66CCEE", "#AA3377"],
    sequentialLow: { light: P.paper[1], dark: P.workshop[2] },
  },
  contrast: {
    name: "contrast",
    label: "Contrast",
    description: "High-contrast hues for prefers-contrast / accessibility",
    colorblindSafe: true,
    kind: "high-contrast",
    hues: ["#000000", "#D55E00", "#0072B2", "#009E73", "#CC79A7", "#F0E442"],
    sequentialLow: { light: "#ffffff", dark: "#000000" },
  },
};

/** Categorical hue arrays — the ONLY place these live. */
export const PALETTES: Record<PaletteName, readonly string[]> = {
  loom: PALETTE_META.loom.hues,
  ink: PALETTE_META.ink.hues,
  dusk: PALETTE_META.dusk.hues,
  okabe: PALETTE_META.okabe.hues,
  tol: PALETTE_META.tol.hues,
  contrast: PALETTE_META.contrast.hues,
};

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];

// ─── Token accessor ──────────────────────────────────────────────────────────

type DeepStringLeaves<T> = T extends ThemedColor
  ? never
  : T extends string
    ? never
    : T extends number
      ? never
      : T extends readonly unknown[]
        ? never
        : {
            [K in keyof T & string]: T[K] extends ThemedColor
              ? K
              : T[K] extends object
                ? `${K}.${DeepStringLeaves<T[K]>}`
                : never;
          }[keyof T & string];

const TOKEN_TREE = {
  surface,
  text,
  line,
  accent,
  mark,
  link,
  grid,
  axis,
  stat,
  shadow,
  wash,
} as const;

export type TokenName =
  | DeepStringLeaves<typeof TOKEN_TREE>
  | `mark.gender.${keyof typeof mark.gender}`;

function lookupThemed(path: string): ThemedColor | undefined {
  const parts = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = TOKEN_TREE;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  if (cur && typeof cur === "object" && "light" in cur && "dark" in cur) {
    return cur as ThemedColor;
  }
  return undefined;
}

/** JS/SVG accessor — D3 layouts that compute fills before render. */
export function token(name: TokenName | string, theme: Theme = "light"): string {
  const t = lookupThemed(name);
  if (!t) {
    console.warn(`[theme] unknown token: ${name}`);
    return P.ink[0];
  }
  return resolveThemed(t, theme);
}

/** High-contrast overrides applied when prefers-contrast: more. */
export function contrastOverrides(theme: Theme): Record<string, string> {
  if (theme === "light") {
    return {
      "--ink": P.contrast.ink,
      "--ink-soft": "#2a2620",
      "--ink-faint": P.contrast.inkFaint,
      "--atelier-text": P.contrast.ink,
      "--atelier-muted": P.contrast.inkFaint,
      "--atelier-border": "#8a8070",
      "--rule": P.contrast.rule,
      "--on-accent": P.paper[0],
    };
  }
  return {
    "--ink": P.workshop.text,
    "--ink-soft": P.workshop.mutedHi,
    "--ink-faint": P.contrast.muted,
    "--atelier-text": P.workshop.text,
    "--atelier-muted": P.contrast.muted,
    "--atelier-border": P.contrast.border,
    "--rule": P.contrast.border,
    "--on-accent": P.paper[0],
  };
}

/**
 * Flatten semantic tokens into CSS custom properties for :root injection.
 * Keeps legacy --* names used throughout atelier.css.
 */
export function cssVars(theme: Theme): Record<string, string> {
  const t = (c: ThemedColor) => resolveThemed(c, theme);
  return {
    // Paper / print
    "--ink": t(text.ink),
    "--ink-soft": t(text.inkSoft),
    "--ink-faint": t(text.inkFaint),
    "--paper": t(surface.paper),
    "--paper-wash": t(surface.paperWash),
    "--paper-edge": t(surface.paperEdge),
    "--paper-grain": t(surface.paperGrain),
    "--trim": t(line.trim),
    "--rule": t(line.rule),

    // Workshop chrome
    "--atelier": t(surface.workshop),
    "--atelier-panel": t(surface.workshopPanel),
    "--atelier-border": t(line.border),
    "--atelier-text": t(text.workshop),
    "--atelier-muted": t(text.muted),
    "--atelier-bg": t(surface.workshop),
    "--on-accent": t(text.onAccent),
    "--atelier-glow-warm": theme === "light" ? "#f0e8d8" : P.workshop.glowWarm,
    "--atelier-glow-cool": theme === "light" ? "#e8e0d0" : P.workshop.glowCool,

    // Accent
    "--accent": t(accent.base),
    "--accent-soft": t(accent.soft),
    "--accent-hover": t(accent.hover),
    "--accent-pressed": t(accent.pressed),
    "--accent-focus": t(accent.focus),

    // Extended tokens
    "--surface-well": t(surface.well),
    "--hover-wash": t(wash.hover),
    "--hover-wash-soft": t(wash.hoverSoft),
    "--shadow-sm": t(shadow.sm),
    "--shadow-md": t(shadow.md),
    "--shadow-lg": t(shadow.lg),
    "--shadow-xl": t(shadow.xl),
    "--shadow-inset": t(shadow.inset),
    "--link-opacity-base": String(opacity.linkAmbient),
    "--link-opacity-ambient": String(opacity.linkAmbient),
    "--link-opacity-related": String(opacity.linkRelated),
    "--link-opacity-skim": String(opacity.linkSkim),
    "--link-opacity-hot": String(opacity.linkHot),
    "--link-opacity-dim": String(opacity.linkDim),
    "--warp-opacity-ambient": String(opacity.warpAmbient),
    "--mark-dim-opacity": String(opacity.markDim),
    "--mark-focus-wash": t(mark.focusWash),
    "--paper-grain-opacity": String(
      theme === "dark" ? opacity.paperGrainDark : opacity.paperGrain,
    ),
    "--grid-decade": t(grid.decade),
    "--grid-mode-decade": t(grid.modeDecade),
    "--film-label": t(line.filmLabel),

    // Type
    "--sans": type.sans,
    "--mono": type.mono,
    "--serif": type.serif,
  };
}

/** CSS var names that must stay in sync with atelier.css @layer tokens. */
export const CSS_VAR_NAMES = Object.keys(cssVars("light"));

/** Light-theme defaults for static SVG aliases (fonts.ts re-exports). */
export const LIGHT = {
  PAPER: token("surface.paper", "light"),
  PAPER_WASH: token("surface.paperWash", "light"),
  INK: token("text.ink", "light"),
  INK_SOFT: token("text.inkSoft", "light"),
  INK_FAINT: token("text.inkFaint", "light"),
  RULE: token("line.rule", "light"),
  TRIM: token("line.trim", "light"),
  ACCENT: token("accent.base", "light"),
  FOCUS_UNDERPAINT: token("mark.focusWash", "light"),
  MODE_DECADE: token("grid.modeDecade", "light"),
  DECADE_GRID: token("grid.decade", "light"),
  FILM_LABEL: token("line.filmLabel", "light"),
  LEGEND_STROKE: P.paper[4],
} as const;
