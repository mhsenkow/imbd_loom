/** Hierarchical edge bundling hero alternative. */

import * as d3 from "d3";
import type { ColorBy, Edge, Node, SortBy, ThicknessBy } from "../lib/types";
import {
  buildGenreColor,
  edgeSharedCount,
  edgeYearExtents,
  linkStrokeWidth,
  nodeColor,
  nodeExtents,
} from "../lib/encode";
import { compareNodesBySort } from "../lib/filter";
import { nodeStrength } from "../lib/metrics";
import { sharedLabel } from "../lib/sharedTitles";

export interface BundleLayout {
  links: Array<{
    path: string;
    fill: string;
    weight: number;
    strokeWidth: number;
    title: string;
    sourceId: string;
    targetId: string;
    edge: Edge;
  }>;
  leaves: Array<{
    x: number;
    y: number;
    label: string;
    fill: string;
    showLabel: boolean;
    angle: number;
    id: string;
  }>;
}

export function layoutBundle(
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
): BundleLayout {
  const palette = opts.palette ?? "loom";
  const theme = opts.theme ?? "light";
  const sortBy = opts.sortBy ?? "strength";
  const thicknessBy = opts.thicknessBy ?? "shared";
  if (nodes.length === 0) return { links: [], leaves: [] };

  const groupKey = (n: Node) => {
    if (opts.colorBy === "gender") return (n.gender as string) || "unknown";
    if (opts.colorBy === "genre") return String(n.dominant_genre || "unknown");
    const d = nodeStrength(n);
    if (d >= 40) return "hub";
    if (d >= 15) return "connected";
    if (d >= 5) return "linked";
    return "sparse";
  };

  const ordered = [...nodes].sort((a, b) => compareNodesBySort(a, b, sortBy));
  const groups = d3.group(ordered, groupKey);
  const rootData = {
    name: "root",
    children: Array.from(groups, ([name, kids]) => ({
      name,
      children: [...kids]
        .sort((a, b) => compareNodesBySort(a, b, sortBy))
        .map((k) => ({ name: k.id, node: k })),
    })),
  };

  const root = d3
    .hierarchy(rootData)
    .sum(() => 1)
    .sort((a, b) => {
      if (a.depth === 1 && b.depth === 1) {
        return String(a.data.name).localeCompare(String(b.data.name));
      }
      return 0;
    });

  const cluster = d3.cluster<typeof rootData>().size([2 * Math.PI, radius - 20]);
  cluster(root as d3.HierarchyNode<typeof rootData>);

  const idToLeaf = new Map<string, d3.HierarchyPointNode<any>>();
  (root as unknown as d3.HierarchyPointNode<any>).leaves().forEach((leaf) => {
    if (leaf.data.node) idToLeaf.set(leaf.data.node.id, leaf);
  });

  const line = d3
    .lineRadial<{ x: number; y: number }>()
    .curve(d3.curveBundle.beta(0.85))
    .radius((d) => d.y)
    .angle((d) => d.x);

  const extents = nodeExtents(nodes);
  const genreColor = buildGenreColor(nodes, palette, theme);
  const labelThreshold = extents.maxStrength * 0.3;
  const maxWeight =
    d3.max(edges, (e) => (thicknessBy === "shared" ? edgeSharedCount(e) : e.weight)) ?? 1;
  const years = edgeYearExtents(edges);

  const leaves = Array.from(idToLeaf.values()).map((leaf) => {
    const node = leaf.data.node as Node;
    return {
      x: Math.sin(leaf.x) * leaf.y,
      y: -Math.cos(leaf.x) * leaf.y,
      label: node.label,
      fill: nodeColor(node, opts.colorBy, extents, genreColor, palette, theme),
      showLabel: nodeStrength(node) >= labelThreshold,
      angle: leaf.x,
      id: node.id,
    };
  });

  const links: BundleLayout["links"] = [];
  for (const e of edges) {
    if (e.weight < opts.minWeight) continue;
    const a = idToLeaf.get(e.source);
    const b = idToLeaf.get(e.target);
    if (!a || !b) continue;
    const pathNodes = a.path(b);
    const pts = pathNodes.map((p) => ({ x: p.x, y: p.y }));
    const src = a.data.node as Node;
    links.push({
      path: line(pts) ?? "",
      fill: nodeColor(src, opts.colorBy, extents, genreColor, palette, theme),
      weight: e.weight,
      strokeWidth: linkStrokeWidth(e, thicknessBy, maxWeight, years),
      title: `${src.label} ↔ ${(b.data.node as Node).label}: ${edgeSharedCount(e)} shared title(s) · weighted tie score ${e.weight}${
        sharedLabel(e.shared) ? `\n${sharedLabel(e.shared)}` : ""
      }`,
      sourceId: src.id,
      targetId: (b.data.node as Node).id,
      edge: e,
    });
  }

  return { links, leaves };
}
