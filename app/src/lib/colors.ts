/** Color helpers for constructs — thin wrappers over theme scales. */

import { mark, PALETTES, token, type PaletteName, type Theme } from "./theme/tokens";
import {
  categoricalScale as catScale,
  degreeColor as degColor,
  paletteMidtones,
} from "./theme/scales";

export function colorForGender(g: string | undefined, theme: Theme = "light"): string {
  const key = (g ?? "unknown") as keyof typeof mark.gender;
  const path = mark.gender[key] ? `mark.gender.${key}` : "mark.gender.unknown";
  return token(path, theme);
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
