/** Chord diagram hero — actor↔actor co-appearance. */

import * as d3 from "d3";
import type { ColorBy, Edge, Node, SortBy, ThicknessBy } from "../lib/types";
import {
  buildGenreColor,
  edgeSharedCount,
  edgeThicknessValue,
  edgeYearExtents,
  nodeColor,
  nodeExtents,
} from "../lib/encode";
import { compareNodesBySort } from "../lib/filter";
import { nodeStrength } from "../lib/metrics";
import { sharedLabel } from "../lib/sharedTitles";

export interface ChordLayout {
  ribbons: Array<{
    path: string;
    sourceId: string;
    targetId: string;
    sourceLabel: string;
    targetLabel: string;
    value: number;
    fill: string;
    /** Target arc fill — used for weave gradients */
    targetFill: string;
    edge?: Edge;
    sharedLabel: string;
  }>;
  arcs: Array<{
    path: string;
    label: string;
    fill: string;
    angle: number;
    showLabel: boolean;
    id: string;
  }>;
}

export function layoutChord(
  nodes: Node[],
  edges: Edge[],
  radius: number,
  opts: {
    colorBy: ColorBy;
    minWeight: number;
    palette?: string;
    sortBy?: SortBy;
    thicknessBy?: ThicknessBy;
    theme?: "light" | "dark";
  } = {
    colorBy: "strength",
    minWeight: 1,
  },
): ChordLayout {
  const palette = opts.palette ?? "loom";
  const theme = opts.theme ?? "light";
  const sortBy = opts.sortBy ?? "strength";
  const thicknessBy = opts.thicknessBy ?? "shared";
  const filtered = [...nodes].sort((a, b) => compareNodesBySort(a, b, sortBy));
  const n = filtered.length;
  if (n === 0) return { ribbons: [], arcs: [] };

  const index = new Map(filtered.map((d, i) => [d.id, i]));
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const edgeByPair = new Map<string, Edge>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const maxWeight =
    d3.max(edges, (e) => (thicknessBy === "shared" ? edgeSharedCount(e) : e.weight)) ?? 1;
  const years = edgeYearExtents(edges);

  for (const e of edges) {
    if (e.weight < opts.minWeight) continue;
    const i = index.get(e.source);
    const j = index.get(e.target);
    if (i == null || j == null) continue;
    const v = edgeThicknessValue(e, thicknessBy, maxWeight, years);
    // Keep shared-title magnitude readable when thickness is a unit scale
    const cell =
      thicknessBy === "shared" ? edgeSharedCount(e) : Math.max(0.2, v * maxWeight);
    matrix[i][j] += cell;
    matrix[j][i] += cell;
    const key = pairKey(e.source, e.target);
    const prev = edgeByPair.get(key);
    if (!prev || e.weight > prev.weight) edgeByPair.set(key, e);
  }

  const chord = d3.chord().padAngle(0.02).sortGroups(null).sortSubgroups(d3.descending)(matrix);
  const inner = radius - 14;
  const outer = radius;
  const arc = d3.arc<d3.ChordGroup>().innerRadius(inner).outerRadius(outer);
  const ribbon = d3.ribbon<d3.Chord, d3.ChordSubgroup>().radius(inner - 1);
  const extents = nodeExtents(filtered);
  const genreColor = buildGenreColor(filtered, palette, theme);
  const labelThreshold = extents.maxStrength * 0.28;

  const arcs = chord.groups.map((g) => {
    const node = filtered[g.index];
    const angle = (g.startAngle + g.endAngle) / 2;
    return {
      path: arc(g) ?? "",
      label: node.label,
      fill: nodeColor(node, opts.colorBy, extents, genreColor, palette, theme),
      angle,
      showLabel: nodeStrength(node) >= labelThreshold || n <= 40,
      id: node.id,
    };
  });

  const ribbons = chord.map((c) => {
    const src = filtered[c.source.index];
    const tgt = filtered[c.target.index];
    const edge = edgeByPair.get(pairKey(src.id, tgt.id));
    return {
      path: ribbon(c) ?? "",
      sourceId: src.id,
      targetId: tgt.id,
      sourceLabel: src.label,
      targetLabel: tgt.label,
      value: c.source.value,
      fill: nodeColor(src, opts.colorBy, extents, genreColor, palette, theme),
      targetFill: nodeColor(tgt, opts.colorBy, extents, genreColor, palette, theme),
      edge,
      sharedLabel: sharedLabel(edge?.shared),
    };
  });

  return { ribbons, arcs };
}
