/** Visual encoding helpers — color / size / link thickness. */

import type { Edge, Node, SizeBy, ThicknessBy } from "./types";
import type { ColorBy } from "./types";
import { categoricalScale, colorForGender, degreeColor } from "./colors";
import { nodeProminence, nodeStrength } from "./metrics";
import { divergingScale } from "./theme/scales";

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function nodeMetric(
  n: Node,
  by: SizeBy | "prominence" | "degree" | "strength" | "title_count" | "pagerank",
): number {
  switch (by) {
    case "prominence":
      return nodeProminence(n) || nodeStrength(n);
    case "title_count":
    case "titles":
      return num(n.title_count) ?? num(n.titleCount) ?? nodeStrength(n);
    case "pagerank":
      return num(n.pagerank) ?? 0;
    case "degree":
      return num(n.degree) ?? 0;
    case "uniform":
      return 1;
    case "strength":
    default:
      return nodeStrength(n);
  }
}

export function nodeColor(
  n: Node,
  colorBy: ColorBy,
  extents: {
    maxDegree: number;
    maxStrength: number;
    maxProminence: number;
    maxPagerank?: number;
  },
  genreColor: (k: string) => string,
  palette: string,
  theme: "light" | "dark" = "light",
): string {
  switch (colorBy) {
    case "gender":
      return colorForGender(n.gender as string | undefined, theme, palette);
    case "prominence":
      return degreeColor(nodeMetric(n, "prominence"), extents.maxProminence || 1, palette, theme);
    case "genre":
      return genreColor(String(n.dominant_genre || "unknown"));
    case "pagerank":
      return degreeColor(
        nodeMetric(n, "pagerank"),
        extents.maxPagerank || 1e-9,
        palette,
        theme,
      );
    case "acclaim_gap": {
      const scale = divergingScale([-2, 2], theme);
      return scale(num(n.acclaim_gap) ?? 0);
    }
    case "degree":
      return degreeColor(nodeMetric(n, "degree"), extents.maxDegree || 1, palette, theme);
    case "strength":
    default:
      return degreeColor(nodeStrength(n), extents.maxStrength || 1, palette, theme);
  }
}

export function buildGenreColor(
  nodes: Node[],
  palette: string,
  theme: "light" | "dark" = "light",
): (k: string) => string {
  const keys = Array.from(
    new Set(nodes.map((n) => String(n.dominant_genre || "unknown"))),
  ).sort();
  return categoricalScale(palette, keys, theme);
}

export function nodeExtents(nodes: Node[]): {
  maxDegree: number;
  maxStrength: number;
  maxProminence: number;
  maxTitles: number;
  maxPagerank: number;
} {
  let maxDegree = 1;
  let maxStrength = 1;
  let maxProminence = 1;
  let maxTitles = 1;
  let maxPagerank = 1e-9;
  for (const n of nodes) {
    maxDegree = Math.max(maxDegree, num(n.degree) || 0);
    maxStrength = Math.max(maxStrength, nodeStrength(n));
    maxProminence = Math.max(maxProminence, nodeMetric(n, "prominence"));
    maxTitles = Math.max(maxTitles, nodeMetric(n, "titles"));
    maxPagerank = Math.max(maxPagerank, num(n.pagerank) || 0);
  }
  return { maxDegree, maxStrength, maxProminence, maxTitles, maxPagerank };
}

export function edgeYearExtents(edges: Edge[]): { yearMin: number; yearMax: number } {
  let yearMin = Infinity;
  let yearMax = -Infinity;
  for (const e of edges) {
    const y = num(e.year);
    if (y == null) continue;
    yearMin = Math.min(yearMin, y);
    yearMax = Math.max(yearMax, y);
  }
  if (!Number.isFinite(yearMin) || !Number.isFinite(yearMax)) {
    return { yearMin: 1920, yearMax: 2030 };
  }
  return { yearMin, yearMax };
}

/** Matrix / stroke magnitude for a link under Thickness encoding. */
export function edgeThicknessValue(
  e: Edge,
  thicknessBy: ThicknessBy,
  maxWeight: number,
  years: { yearMin: number; yearMax: number },
): number {
  if (thicknessBy === "uniform") return 1;
  if (thicknessBy === "recency") {
    const rec = num(e.recency);
    if (rec != null) {
      const maxR = 40;
      return Math.max(0.2, 1 - Math.min(rec, maxR) / maxR);
    }
    const y = num(e.year) ?? num(e.last_worked_together);
    if (y == null) return 0.55;
    const t = (y - years.yearMin) / Math.max(1, years.yearMax - years.yearMin);
    return 0.35 + 0.65 * Math.min(1, Math.max(0, t));
  }
  return Math.max(0.01, e.weight / Math.max(1, maxWeight));
}

/** Pixel-ish stroke width for timeline / bundle lines. */
export function linkStrokeWidth(
  e: Edge,
  thicknessBy: ThicknessBy,
  maxWeight: number,
  years: { yearMin: number; yearMax: number },
  hot = false,
): number {
  const v = edgeThicknessValue(e, thicknessBy, maxWeight, years);
  if (thicknessBy === "uniform") return hot ? 1.8 : 1.1;
  if (thicknessBy === "recency") return (hot ? 1.2 : 0.55) + v * 2.2;
  return (hot ? 1.2 : 0.5) + Math.min(3.2, e.weight * 0.28);
}

/** Relative mark scale 0.55–1.25 for career bars / dots. */
export function markScale(n: Node, sizeBy: SizeBy, extents: ReturnType<typeof nodeExtents>): number {
  if (sizeBy === "uniform") return 1;
  const raw =
    sizeBy === "prominence"
      ? nodeMetric(n, "prominence") / extents.maxProminence
      : sizeBy === "titles"
        ? nodeMetric(n, "titles") / extents.maxTitles
        : sizeBy === "pagerank"
          ? nodeMetric(n, "pagerank") / (extents.maxPagerank || 1e-9)
          : sizeBy === "degree"
            ? (num(n.degree) || 0) / extents.maxDegree
            : nodeStrength(n) / extents.maxStrength;
  return 0.55 + 0.7 * Math.min(1, Math.max(0, raw));
}

export function colorLegendLabel(colorBy: ColorBy, palette?: string): string {
  const pal = palette ? ` · ${palette}` : "";
  switch (colorBy) {
    case "gender":
      return `color = gender${pal}`;
    case "prominence":
      return `color = prominence (log-votes)${pal}`;
    case "genre":
      return `color = genre${pal}`;
    case "pagerank":
      return `color = PageRank${pal}`;
    case "acclaim_gap":
      return `color = acclaim − popularity${pal}`;
    case "degree":
      return `color = degree (neighbors)${pal}`;
    case "strength":
    default:
      return `color = strength (Σ weight)${pal}`;
  }
}
