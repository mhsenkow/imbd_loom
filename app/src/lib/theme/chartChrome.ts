/**
 * Resolve chart surface / ink colors for the active theme.
 * Prefer this over importing frozen PAPER/INK from fonts.ts in React charts.
 */

import { token, type Theme } from "./tokens";

export interface ChartChrome {
  paper: string;
  paperWash: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  rule: string;
  trim: string;
  accent: string;
  focusWash: string;
  decadeGrid: string;
  modeDecade: string;
  filmLabel: string;
}

export function chartChrome(theme: Theme = "light"): ChartChrome {
  return {
    paper: token("surface.paper", theme),
    paperWash: token("surface.paperWash", theme),
    ink: token("text.ink", theme),
    inkSoft: token("text.inkSoft", theme),
    inkFaint: token("text.inkFaint", theme),
    rule: token("line.rule", theme),
    trim: token("line.trim", theme),
    accent: token("accent.base", theme),
    focusWash: token("mark.focusWash", theme),
    decadeGrid: token("grid.decade", theme),
    modeDecade: token("grid.modeDecade", theme),
    filmLabel: token("line.filmLabel", theme),
  };
}
