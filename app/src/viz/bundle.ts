/** Hierarchical edge bundling hero alternative. */

import * as d3 from "d3";
import type { Edge, Node } from "../lib/types";
import { colorForGender, degreeColor } from "../lib/colors";
import { sharedLabel } from "../lib/sharedTitles";

export interface BundleLayout {
  links: Array<{
    path: string;
    fill: string;
    weight: number;
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
  opts: { colorBy: "gender" | "degree"; minWeight: number; palette?: string } = {
    colorBy: "degree",
    minWeight: 1,
  },
): BundleLayout {
  const palette = opts.palette ?? "loom";
  if (nodes.length === 0) return { links: [], leaves: [] };

  // Group by gender (or dominant_genre if present) for hierarchy
  const groupKey = (n: Node) =>
    (n.dominant_genre as string) || (n.gender as string) || "unknown";

  const groups = d3.group(nodes, groupKey);
  const rootData = {
    name: "root",
    children: Array.from(groups, ([name, kids]) => ({
      name,
      children: kids.map((k) => ({ name: k.id, node: k })),
    })),
  };

  const root = d3
    .hierarchy(rootData)
    .sum(() => 1)
    .sort((a, b) => (a.data.name > b.data.name ? 1 : -1));

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

  const maxDeg = d3.max(nodes, (d) => d.degree) ?? 1;
  const labelThreshold = maxDeg * 0.3;

  const leaves = Array.from(idToLeaf.values()).map((leaf) => {
    const node = leaf.data.node as Node;
    const fill =
      opts.colorBy === "gender"
        ? colorForGender(node.gender as string)
        : degreeColor(node.degree, maxDeg, palette);
    return {
      x: Math.sin(leaf.x) * leaf.y,
      y: -Math.cos(leaf.x) * leaf.y,
      label: node.label,
      fill,
      showLabel: node.degree >= labelThreshold,
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
    const tgt = b.data.node as Node;
    const fill =
      opts.colorBy === "gender"
        ? colorForGender(src.gender as string)
        : degreeColor(src.degree, maxDeg, palette);
    links.push({
      path: line(pts) ?? "",
      fill,
      weight: e.weight,
      title: `${src.label} ↔ ${tgt.label}: ${e.weight} shared title(s)${
        sharedLabel(e.shared) ? `\n${sharedLabel(e.shared)}` : ""
      }`,
      sourceId: src.id,
      targetId: tgt.id,
      edge: e,
    });
  }

  return { links, leaves };
}
