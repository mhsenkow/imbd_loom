/** Chord diagram hero — actor↔actor co-appearance. */

import * as d3 from "d3";
import type { Edge, Node } from "../lib/types";
import { colorForGender, degreeColor } from "../lib/colors";
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
  opts: { colorBy: "gender" | "degree"; minWeight: number; palette?: string } = {
    colorBy: "degree",
    minWeight: 1,
  },
): ChordLayout {
  const palette = opts.palette ?? "loom";
  const filtered = nodes.slice();
  const n = filtered.length;
  if (n === 0) return { ribbons: [], arcs: [] };

  const index = new Map(filtered.map((d, i) => [d.id, i]));
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const edgeByPair = new Map<string, Edge>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const e of edges) {
    if (e.weight < opts.minWeight) continue;
    const i = index.get(e.source);
    const j = index.get(e.target);
    if (i == null || j == null) continue;
    matrix[i][j] += e.weight;
    matrix[j][i] += e.weight;
    const key = pairKey(e.source, e.target);
    const prev = edgeByPair.get(key);
    if (!prev || e.weight > prev.weight) edgeByPair.set(key, e);
  }

  const chord = d3.chord().padAngle(0.02).sortSubgroups(d3.descending)(matrix);
  const inner = radius - 14;
  const outer = radius;
  const arc = d3.arc<d3.ChordGroup>().innerRadius(inner).outerRadius(outer);
  const ribbon = d3.ribbon<d3.Chord, d3.ChordSubgroup>().radius(inner - 1);
  const maxDeg = d3.max(filtered, (d) => d.degree) ?? 1;
  const labelThreshold = maxDeg * 0.28;

  const arcs = chord.groups.map((g) => {
    const node = filtered[g.index];
    const angle = (g.startAngle + g.endAngle) / 2;
    const fill =
      opts.colorBy === "gender"
        ? colorForGender(node.gender as string)
        : degreeColor(node.degree, maxDeg, palette);
    return {
      path: arc(g) ?? "",
      label: node.label,
      fill,
      angle,
      showLabel: node.degree >= labelThreshold || n <= 40,
      id: node.id,
    };
  });

  const ribbons = chord.map((c) => {
    const src = filtered[c.source.index];
    const tgt = filtered[c.target.index];
    const fill =
      opts.colorBy === "gender"
        ? colorForGender(src.gender as string)
        : degreeColor(src.degree, maxDeg, palette);
    const edge = edgeByPair.get(pairKey(src.id, tgt.id));
    return {
      path: ribbon(c) ?? "",
      sourceId: src.id,
      targetId: tgt.id,
      sourceLabel: src.label,
      targetLabel: tgt.label,
      value: c.source.value,
      fill,
      edge,
      sharedLabel: sharedLabel(edge?.shared, 2),
    };
  });

  return { ribbons, arcs };
}
