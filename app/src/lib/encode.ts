/** Visual encoding helpers — color / size / link thickness. */

import type { Edge, Node, SizeBy, ThicknessBy } from "./types";
import type { ColorBy } from "./types";
import { categoricalScale, colorForGender, degreeColor } from "./colors";

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function nodeMetric(n: Node, by: SizeBy | "prominence" | "degree" | "title_count"): number {
  switch (by) {
    case "prominence":
      return num(n.prominence) ?? n.degree;
    case "title_count":
    case "titles":
      return num(n.title_count) ?? num(n.titleCount) ?? n.degree;
    case "uniform":
      return 1;
    default:
      return n.degree;
  }
}

export function nodeColor(
  n: Node,
  colorBy: ColorBy,
  extents: { maxDegree: number; maxProminence: number },
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
    default:
      return degreeColor(n.degree, extents.maxDegree || 1, palette, theme);
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
  maxProminence: number;
  maxTitles: number;
} {
  let maxDegree = 1;
  let maxProminence = 1;
  let maxTitles = 1;
  for (const n of nodes) {
    maxDegree = Math.max(maxDegree, n.degree || 0);
    maxProminence = Math.max(maxProminence, nodeMetric(n, "prominence"));
    maxTitles = Math.max(maxTitles, nodeMetric(n, "titles"));
  }
  return { maxDegree, maxProminence, maxTitles };
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
    const y = num(e.year);
    if (y == null) return 0.55;
    const t =
      (y - years.yearMin) / Math.max(1, years.yearMax - years.yearMin);
    return 0.35 + 0.65 * Math.min(1, Math.max(0, t));
  }
  // shared titles (default)
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
        : n.degree / extents.maxDegree;
  return 0.55 + 0.7 * Math.min(1, Math.max(0, raw));
}

export function colorLegendLabel(colorBy: ColorBy, palette?: string): string {
  const pal = palette ? ` · ${palette}` : "";
  switch (colorBy) {
    case "gender":
      return `color = gender${pal}`;
    case "prominence":
      return `color = votes${pal}`;
    case "genre":
      return `color = genre${pal}`;
    default:
      return `color = degree${pal}`;
  }
}
