/**
 * Perceptual color scales — sequential / categorical / diverging factories.
 * Built once per (palette, theme, domain) and reused across node loops.
 */

import { interpolateLab, interpolateHcl, quantize } from "d3-interpolate";
import { scaleSequential, scaleLinear } from "d3-scale";
import { color } from "d3-color";
import {
  PALETTES,
  PALETTE_META,
  type PaletteName,
  type Theme,
  token,
} from "./tokens";
import { ensureContrast, lightenLab } from "./contrast";

const scaleCache = new Map<string, (t: number) => string>();
const catCache = new Map<string, Map<string, string>>();

function cacheKey(...parts: unknown[]): string {
  return parts.join("|");
}

/** Derive midtones by lightening each base hue in Lab. */
export function paletteMidtones(palette: string): string[] {
  const hues = PALETTES[palette as PaletteName] ?? PALETTES.loom;
  return hues.map((h) => lightenLab(h, 0.22));
}

/** Sequential ramp low endpoint for a palette + theme. */
export function sequentialLow(palette: string, theme: Theme = "light"): string {
  const meta = PALETTE_META[palette as PaletteName] ?? PALETTE_META.loom;
  return meta.sequentialLow[theme] ?? token("mark.dim", theme);
}

/**
 * Build (and memoize) a sequential interpolator from low → palette primary.
 * Clamps the low end so nodes stay above min contrast vs surface.
 */
export function sequentialScale(
  palette: string,
  domain: [number, number],
  theme: Theme = "light",
  surface?: string,
): (value: number) => string {
  const key = cacheKey("seq", palette, theme, domain[0], domain[1], surface ?? "");
  let scale = scaleCache.get(key);
  if (!scale) {
    const hues = PALETTES[palette as PaletteName] ?? PALETTES.loom;
    const high = hues[0];
    let low = sequentialLow(palette, theme);
    const bg = surface ?? token("surface.paper", theme);
    // Keep the darkest end of the ramp readable on paper (low degree = closer to paper)
    low = ensureContrast(low, bg, 1.15, theme === "light" ? "darker" : "lighter");
    const highSafe = ensureContrast(high, bg, 3, "auto");
    const seq = scaleSequential(interpolateLab(low, highSafe)).domain(domain);
    scale = (v: number) => seq(v);
    scaleCache.set(key, scale);
  }
  return scale;
}

/** Degree/prominence color via sequential scale. */
export function degreeColor(
  degree: number,
  max: number,
  palette: string = "loom",
  theme: Theme = "light",
): string {
  const scale = sequentialScale(palette, [0, Math.max(1, max)], theme);
  return scale(degree);
}

/**
 * Generate n perceptually spaced hues within the palette's lightness/chroma band.
 * Used when category count exceeds curated palette length.
 */
function expandHues(base: readonly string[], n: number): string[] {
  if (n <= base.length) return base.slice(0, n);
  // Sample a continuous HCL arc anchored on the palette's first hue.
  const anchor = color(base[0]);
  if (!anchor) {
    return Array.from({ length: n }, (_, i) => base[i % base.length]);
  }
  const start = base[0];
  const end = base[base.length - 1];
  const samples = quantize(interpolateHcl(start, end), Math.max(n, base.length));
  // Mix curated + generated for stability of the first slots
  const out: string[] = [...base];
  for (let i = 0; out.length < n; i++) {
    const c = samples[i % samples.length];
    if (c && !out.includes(c)) out.push(c);
    else out.push(lightenLab(base[i % base.length], 0.1 + (i % 5) * 0.05));
  }
  return out.slice(0, n);
}

/**
 * Categorical scale with perceptual overflow — no silent wrap when keys > palette.
 */
export function categoricalScale(
  paletteName: string,
  keys: string[],
  theme: Theme = "light",
): (k: string) => string {
  const key = cacheKey("cat", paletteName, theme, keys.join(","));
  let map = catCache.get(key);
  if (!map) {
    const base = PALETTES[paletteName as PaletteName] ?? PALETTES.loom;
    const hues = expandHues(base, keys.length);
    map = new Map<string, string>();
    keys.forEach((k, i) => map!.set(k, hues[i]));
    catCache.set(key, map);
  }
  const fallback = (PALETTES[paletteName as PaletteName] ?? PALETTES.loom)[0];
  return (k: string) => map!.get(k) ?? fallback;
}

/**
 * Diverging scale for signed metrics (genre drift, z-scores).
 * Recolored to loom family: fading (brick) ← neutral (paper) → rising (pine).
 */
export function divergingScale(
  domain: [number, number] = [-1, 1],
  theme: Theme = "light",
): (value: number) => string {
  const key = cacheKey("div", theme, domain[0], domain[1]);
  let scale = scaleCache.get(key);
  if (!scale) {
    const neg = token("stat.fading", theme);
    const mid = token("mark.dim", theme);
    const pos = token("stat.rising", theme);
    const [d0, d1] = domain;
    const midPoint = (d0 + d1) / 2;
    const left = scaleLinear<string>()
      .domain([d0, midPoint])
      .range([neg, mid])
      .interpolate(interpolateLab);
    const right = scaleLinear<string>()
      .domain([midPoint, d1])
      .range([mid, pos])
      .interpolate(interpolateLab);
    scale = (v: number) => (v <= midPoint ? left(v) : right(v));
    scaleCache.set(key, scale);
  }
  return scale;
}

/** Drift-thread halves: rising / fading from palette (or diverging tokens). */
export function driftThreadColors(
  palette: string,
  theme: Theme = "light",
): { rising: string; fading: string } {
  const hues = PALETTES[palette as PaletteName] ?? PALETTES.loom;
  // Prefer palette[0]/palette[1] when available so drift tracks the active weave.
  if (hues.length >= 2) {
    return { fading: hues[0], rising: hues[1] };
  }
  return {
    fading: token("stat.fading", theme),
    rising: token("stat.rising", theme),
  };
}

/** Two-stop weave gradient definition props (for SVG <linearGradient>). */
export function weaveGradientStops(
  sourceFill: string,
  targetFill: string,
): { offset: string; stopColor: string }[] {
  return [
    { offset: "0%", stopColor: sourceFill },
    { offset: "100%", stopColor: targetFill },
  ];
}

/** Build a weave gradient descriptor for `<ChartDefs weaves={…} />`. */
export function weaveGradient(
  sourceFill: string,
  targetFill: string,
  id: string,
  orientation: "vertical" | "horizontal" = "vertical",
): {
  id: string;
  sourceFill: string;
  targetFill: string;
  orientation: "vertical" | "horizontal";
} {
  return { id, sourceFill, targetFill, orientation };
}

/** Clear memoization (tests / HMR). */
export function clearScaleCache(): void {
  scaleCache.clear();
  catCache.clear();
}
