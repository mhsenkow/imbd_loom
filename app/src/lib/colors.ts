/** Color helpers for constructs. */

import { GENDER_COLORS, PALETTES } from "./types";

export function colorForGender(g: string | undefined): string {
  return GENDER_COLORS[g ?? "unknown"] ?? GENDER_COLORS.unknown;
}

export function categoricalScale(paletteName: string, keys: string[]): (k: string) => string {
  const palette = PALETTES[paletteName] ?? PALETTES.loom;
  const map = new Map<string, string>();
  keys.forEach((k, i) => map.set(k, palette[i % palette.length]));
  return (k) => map.get(k) ?? palette[0];
}

/** Sequential shade from degree; base hue from active palette. */
export function degreeColor(
  degree: number,
  max: number,
  baseOrPalette: string = "#C45C26",
): string {
  const base =
    PALETTES[baseOrPalette]?.[0] ??
    (baseOrPalette.startsWith("#") ? baseOrPalette : "#C45C26");
  const t = max > 0 ? Math.min(1, degree / max) : 0;
  return mix(base, "#F7F2E8", 1 - (0.25 + t * 0.75));
}

export function paletteAccent(paletteName: string, index = 0): string {
  const palette = PALETTES[paletteName] ?? PALETTES.loom;
  return palette[index % palette.length];
}

function mix(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
