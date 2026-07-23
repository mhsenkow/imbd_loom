/**
 * Shared typeface + paper/ink aliases for SVG.
 * Values live in `lib/theme/tokens.ts` — this file is a compatibility re-export.
 */

import { LIGHT, opacity, type } from "./theme/tokens";

export const FONT_SANS = type.sans;
export const FONT_MONO = type.mono;
export const FONT_SERIF = type.serif;

export const PAPER = LIGHT.PAPER;
export const PAPER_WASH = LIGHT.PAPER_WASH;
export const INK = LIGHT.INK;
export const INK_SOFT = LIGHT.INK_SOFT;
export const INK_FAINT = LIGHT.INK_FAINT;
export const RULE = LIGHT.RULE;
export const TRIM = LIGHT.TRIM;
export const ACCENT = LIGHT.ACCENT;
/** Warm paper underpaint for focus (print-safe, not neon). */
export const FOCUS_UNDERPAINT = LIGHT.FOCUS_UNDERPAINT;
/** Ghost dim opacity — warm paper-ink, not pure void. */
export const DIM_GHOST = opacity.markDim;
/** Mode-decade wash (loom cool categorical). */
export const MODE_DECADE = LIGHT.MODE_DECADE;
/** Soft decade grid line. */
export const DECADE_GRID = LIGHT.DECADE_GRID;
/** Film strip label ink. */
export const FILM_LABEL = LIGHT.FILM_LABEL;
