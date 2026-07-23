/** Color helpers for constructs — thin wrappers over theme scales. */

import { mark, PALETTES, token, type PaletteName, type Theme } from "./theme/tokens";
import {
  categoricalScale as catScale,
  degreeColor as degColor,
  paletteMidtones,
} from "./theme/scales";

const GENDER_ORDER = ["female", "male", "nonbinary", "unknown"] as const;

/**
 * Gender → color. Uses the active palette's first 4 hues so Ink/Okabe/Loom
 * always recolor gender-encoded charts. Falls back to semantic mark.gender.* tokens.
 * Ink on dark surfaces uses the reversed ramp so marks stay visible.
 */
export function colorForGender(
  g: string | undefined,
  theme: Theme = "light",
  palette: string = "loom",
): string {
  const key = (g ?? "unknown") as (typeof GENDER_ORDER)[number] | string;
  const idx = GENDER_ORDER.indexOf(key as (typeof GENDER_ORDER)[number]);
  let hues = [...(PALETTES[palette as PaletteName] ?? [])];
  if (palette === "ink" && theme === "dark") {
    hues = hues.slice().reverse();
  }
  if (hues.length && idx >= 0) {
    return hues[Math.min(idx, hues.length - 1)];
  }
  const path =
    key in mark.gender ? `mark.gender.${key}` : "mark.gender.unknown";
  return token(path, theme);
}

/** Legend / swatch map for the active palette. */
export function genderColors(
  palette: string = "loom",
  theme: Theme = "light",
): Record<string, string> {
  return {
    female: colorForGender("female", theme, palette),
    male: colorForGender("male", theme, palette),
    nonbinary: colorForGender("nonbinary", theme, palette),
    unknown: colorForGender("unknown", theme, palette),
  };
}

export function categoricalScale(
  paletteName: string,
  keys: string[],
  theme: Theme = "light",
): (k: string) => string {
  return catScale(paletteName, keys, theme);
}

/** Sequential shade from degree; base hue from active palette. */
export function degreeColor(
  degree: number,
  max: number,
  baseOrPalette: string = "loom",
  theme: Theme = "light",
): string {
  return degColor(degree, max, baseOrPalette, theme);
}

export function paletteAccent(paletteName: string, index = 0): string {
  const palette = PALETTES[paletteName as PaletteName] ?? PALETTES.loom;
  return palette[index % palette.length];
}

export { paletteMidtones };
