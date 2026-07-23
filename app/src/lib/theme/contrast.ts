/** Contrast ratio and perceptual distance helpers (WCAG / CIE Lab ΔE). */

import { color, lab, type RGBColor } from "d3-color";
import { interpolateLab } from "d3-interpolate";

export function parseRgb(hexOrCss: string): { r: number; g: number; b: number; opacity: number } {
  const c = color(hexOrCss);
  if (!c) return { r: 0, g: 0, b: 0, opacity: 1 };
  const rgb = c.rgb() as RGBColor;
  return { r: rgb.r, g: rgb.g, b: rgb.b, opacity: rgb.opacity };
}

/** Relative luminance (WCAG 2.1). */
export function relativeLuminance(hexOrCss: string): number {
  const { r, g, b } = parseRgb(hexOrCss);
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = relativeLuminance(fg);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** CIE Lab ΔE76 — cheap perceptual distance. */
export function deltaE(a: string, b: string): number {
  const la = lab(a);
  const lb = lab(b);
  if (!la || !lb) return 0;
  const dl = la.l - lb.l;
  const da = la.a - lb.a;
  const db = la.b - lb.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** Lighten/darken in Lab toward white/black. */
export function hoverColor(base: string, amount = 0.12): string {
  return interpolateLab(base, "#ffffff")(amount);
}

export function activeColor(base: string, amount = 0.14): string {
  return interpolateLab(base, "#000000")(amount);
}

/** Lighten a hue in Lab for midtone gradients. */
export function lightenLab(base: string, amount = 0.22): string {
  return interpolateLab(base, "#ffffff")(amount);
}

/**
 * Ensure `fg` meets at least `minRatio` against `bg` by darkening/lightening in Lab.
 * Returns the adjusted color (or original if already ok).
 */
export function ensureContrast(
  fg: string,
  bg: string,
  minRatio = 3,
  toward: "darker" | "lighter" | "auto" = "auto",
): string {
  if (contrastRatio(fg, bg) >= minRatio) return fg;
  const bgL = relativeLuminance(bg);
  const dir =
    toward === "auto" ? (bgL > 0.5 ? "darker" : "lighter") : toward;
  const target = dir === "darker" ? "#000000" : "#ffffff";
  let best = fg;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = interpolateLab(fg, target)(t);
    if (contrastRatio(candidate, bg) >= minRatio) {
      best = candidate;
      break;
    }
    best = candidate;
  }
  return best;
}
