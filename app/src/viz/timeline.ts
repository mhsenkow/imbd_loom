/** Timeline / arc layout — people as rows, years on X (or flipped). */

import * as d3 from "d3";
import type { Edge, Node } from "../lib/types";
import { colorForGender, degreeColor } from "../lib/colors";

export interface TimelinePerson {
  id: string;
  label: string;
  gender?: string;
  degree: number;
  yearMin: number;
  yearMax: number;
  yearPeak: number;
  /** Lane coordinate (y when normal, x when flipped) */
  y: number;
  fill: string;
  titleCount?: number;
  characterCount?: number;
  dominantGenre?: string;
  meta: Record<string, unknown>;
}

export interface TimelineLink {
  source: string;
  target: string;
  weight: number;
  year: number;
  x: number;
  y1: number;
  y2: number;
  path: string;
  fill: string;
  shared: Edge["shared"];
  edge: Edge;
}

export interface TimelineLayout {
  people: TimelinePerson[];
  links: TimelineLink[];
  yearMin: number;
  yearMax: number;
  width: number;
  height: number;
  rowH: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  flipped: boolean;
  xScale: (year: number) => number;
  /** When flipped, maps year → y; otherwise unused (use xScale). */
  yScale: (year: number) => number;
  ticks: number[];
}

export function layoutTimeline(
  nodes: Node[],
  edges: Edge[],
  opts: {
    colorBy: "gender" | "degree";
    minWeight: number;
    pxPerYear?: number;
    rowH?: number;
    flipped?: boolean;
    palette?: string;
  },
): TimelineLayout {
  const flipped = opts.flipped ?? false;
  const palette = opts.palette ?? "loom";
  const rowH = opts.rowH ?? 18;
  const padR = 24;
  const padB = 24;
  const pxPerYear = opts.pxPerYear ?? 14;
  // Flipped: names along top need more top pad; years along left need more left pad.
  const padL = flipped ? 56 : 140;
  const padT = flipped ? 100 : 36;

  const withYears = nodes
    .map((n) => {
      const yearMin = num(n.year_min) ?? num(n.yearMin);
      const yearMax = num(n.year_max) ?? num(n.yearMax);
      const yearPeak = num(n.year_peak) ?? num(n.yearPeak) ?? yearMin;
      return { n, yearMin, yearMax, yearPeak };
    })
    .filter((d) => d.yearMin != null && d.yearMax != null) as Array<{
    n: Node;
    yearMin: number;
    yearMax: number;
    yearPeak: number;
  }>;

  // Sort by peak year then degree — reads as a career procession
  withYears.sort((a, b) => a.yearPeak - b.yearPeak || b.n.degree - a.n.degree);

  let yearMin = d3.min(withYears, (d) => d.yearMin) ?? 1970;
  let yearMax = d3.max(withYears, (d) => d.yearMax) ?? 2024;
  if (yearMin === yearMax) {
    yearMin -= 5;
    yearMax += 5;
  }

  const maxDeg = d3.max(withYears, (d) => d.n.degree) ?? 1;
  const nPeople = withYears.length;

  let width: number;
  let height: number;
  let xScale: (year: number) => number;
  let yScale: (year: number) => number;

  if (flipped) {
    // People across X, years down Y — career lanes are vertical.
    const colW = Math.max(14, rowH);
    const innerH = Math.max(420, (yearMax - yearMin) * pxPerYear);
    width = padL + nPeople * colW + padR;
    height = padT + innerH + padB;
    yScale = (year: number) =>
      padT + ((year - yearMin) / (yearMax - yearMin || 1)) * innerH;
    xScale = yScale; // unused for year positioning when flipped
  } else {
    const innerW = Math.max(600, (yearMax - yearMin) * pxPerYear);
    width = padL + innerW + padR;
    height = padT + nPeople * rowH + padB;
    xScale = (year: number) =>
      padL + ((year - yearMin) / (yearMax - yearMin || 1)) * innerW;
    yScale = xScale;
  }

  const people: TimelinePerson[] = withYears.map((d, i) => {
    const fill =
      opts.colorBy === "gender"
        ? colorForGender(d.n.gender as string)
        : degreeColor(d.n.degree, maxDeg, palette);
    const lane = flipped
      ? padL + i * Math.max(14, rowH) + Math.max(14, rowH) / 2
      : padT + i * rowH + rowH / 2;
    return {
      id: d.n.id,
      label: d.n.label,
      gender: d.n.gender as string | undefined,
      degree: d.n.degree,
      yearMin: d.yearMin,
      yearMax: d.yearMax,
      yearPeak: d.yearPeak,
      y: lane,
      fill,
      titleCount: num(d.n.title_count),
      characterCount: num(d.n.character_count),
      dominantGenre: d.n.dominant_genre as string | undefined,
      meta: d.n as Record<string, unknown>,
    };
  });

  const byId = new Map(people.map((p) => [p.id, p]));
  const links: TimelineLink[] = [];
  for (const e of edges) {
    if (e.weight < opts.minWeight) continue;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    const year =
      num(e.year) ??
      Math.round((Math.max(a.yearMin, b.yearMin) + Math.min(a.yearMax, b.yearMax)) / 2);
    if (!Number.isFinite(year)) continue;

    if (flipped) {
      const y = yScale(year);
      const x1 = a.y;
      const x2 = b.y;
      const midX = (x1 + x2) / 2;
      const bulge = Math.min(80, Math.abs(x2 - x1) * 0.35 + e.weight * 2);
      const path = `M${x1},${y} Q${midX},${y + bulge} ${x2},${y}`;
      links.push({
        source: a.id,
        target: b.id,
        weight: e.weight,
        year,
        x: midX,
        y1: y,
        y2: y,
        path,
        fill: a.fill,
        shared: e.shared,
        edge: e,
      });
    } else {
      const x = xScale(year);
      const y1 = a.y;
      const y2 = b.y;
      const midY = (y1 + y2) / 2;
      const bulge = Math.min(80, Math.abs(y2 - y1) * 0.35 + e.weight * 2);
      const path = `M${x},${y1} Q${x + bulge},${midY} ${x},${y2}`;
      links.push({
        source: a.id,
        target: b.id,
        weight: e.weight,
        year,
        x,
        y1,
        y2,
        path,
        fill: a.fill,
        shared: e.shared,
        edge: e,
      });
    }
  }

  const ticks = d3.ticks(yearMin, yearMax, Math.min(16, yearMax - yearMin));

  return {
    people,
    links,
    yearMin,
    yearMax,
    width,
    height,
    rowH,
    padL,
    padR,
    padT,
    padB,
    flipped,
    xScale,
    yScale,
    ticks,
  };
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
