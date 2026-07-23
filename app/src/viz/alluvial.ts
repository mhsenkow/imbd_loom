/** Alluvial / Sankey layout from stage tables. */

import { sankey, sankeyLinkHorizontal, type SankeyGraph, type SankeyNode, type SankeyLink } from "d3-sankey";
import type { StageRow } from "../lib/types";
import { categoricalScale, colorForGender } from "../lib/colors";

export interface AlluvialNode {
  id: string;
  name: string;
  stage: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  fill: string;
}

export interface AlluvialLink {
  path: string;
  fill: string;
  value: number;
  title: string;
  width: number;
  sourceName: string;
  targetName: string;
}

export interface AlluvialLayout {
  nodes: AlluvialNode[];
  links: AlluvialLink[];
  stages: string[];
}

type SNode = SankeyNode<{ id: string; name: string; stage: string }, { value: number }>;
type SLink = SankeyLink<{ id: string; name: string; stage: string }, { value: number }>;

export function layoutAlluvial(
  stages: StageRow[],
  width: number,
  height: number,
  paletteName: string,
  opts?: { colorBy?: "gender" | "degree" | "prominence" | "genre" },
): AlluvialLayout {
  if (!stages.length) return { nodes: [], links: [], stages: [] };
  const colorBy = opts?.colorBy ?? "degree";

  // Determine stage order from edges
  const stageOrder: string[] = [];
  const seen = new Set<string>();
  for (const s of stages) {
    if (!seen.has(s.stageFrom)) {
      seen.add(s.stageFrom);
      stageOrder.push(s.stageFrom);
    }
  }
  for (const s of stages) {
    if (!seen.has(s.stageTo)) {
      seen.add(s.stageTo);
      stageOrder.push(s.stageTo);
    }
  }

  const nodeIds = new Set<string>();
  const linksRaw: { source: string; target: string; value: number }[] = [];
  for (const s of stages) {
    const src = `${s.stageFrom}::${s.categoryFrom}`;
    const tgt = `${s.stageTo}::${s.categoryTo}`;
    nodeIds.add(src);
    nodeIds.add(tgt);
    linksRaw.push({ source: src, target: tgt, value: Number(s.value) || 0 });
  }

  // Cap categories per stage for readability
  const byStage = new Map<string, { id: string; value: number }[]>();
  for (const id of nodeIds) {
    const [stage, name] = id.split("::");
    const val = linksRaw
      .filter((l) => l.source === id || l.target === id)
      .reduce((a, l) => a + l.value, 0);
    if (!byStage.has(stage)) byStage.set(stage, []);
    byStage.get(stage)!.push({ id, value: val });
  }
  const keep = new Set<string>();
  for (const [, list] of byStage) {
    list
      .sort((a, b) => b.value - a.value)
      .slice(0, 18)
      .forEach((x) => keep.add(x.id));
  }

  const nodes = Array.from(keep).map((id) => {
    const [stage, name] = id.split("::");
    return { id, name, stage };
  });
  const nodeSet = new Set(nodes.map((n) => n.id));
  const links = linksRaw.filter((l) => nodeSet.has(l.source) && nodeSet.has(l.target) && l.value > 0);

  if (!nodes.length || !links.length) return { nodes: [], links: [], stages: stageOrder };

  const graph = sankey<{ id: string; name: string; stage: string }, { value: number }>()
    .nodeId((d) => d.id)
    .nodeWidth(8)
    .nodePadding(4)
    .extent([
      [0, 0],
      [width, height],
    ])({
    nodes: nodes.map((n) => ({ ...n })),
    links: links.map((l) => ({ ...l })),
  } as SankeyGraph<{ id: string; name: string; stage: string }, { value: number }>);

  const cats = Array.from(new Set(nodes.map((n) => n.name)));
  const color = categoricalScale(paletteName, cats);
  const fillFor = (name: string, stage: string) => {
    if (
      colorBy === "gender" &&
      (stage === "gender" ||
        name === "female" ||
        name === "male" ||
        name === "nonbinary" ||
        name === "unknown")
    ) {
      return colorForGender(name, "light", paletteName);
    }
    return color(name);
  };
  const pathGen = sankeyLinkHorizontal();

  const outNodes: AlluvialNode[] = (graph.nodes as SNode[]).map((n) => ({
    id: n.id!,
    name: n.name,
    stage: n.stage,
    x0: n.x0 ?? 0,
    x1: n.x1 ?? 0,
    y0: n.y0 ?? 0,
    y1: n.y1 ?? 0,
    fill: fillFor(n.name, n.stage),
  }));

  const outLinks: AlluvialLink[] = (graph.links as SLink[]).map((l) => {
    const src = l.source as SNode;
    const tgt = l.target as SNode;
    return {
      path: pathGen(l as never) ?? "",
      fill: fillFor(src.name, src.stage),
      value: l.value,
      title: `${src.name} → ${tgt.name}: ${l.value}`,
      width: Math.max(1, l.width ?? 1),
      sourceName: src.name,
      targetName: tgt.name,
    };
  });

  return { nodes: outNodes, links: outLinks, stages: stageOrder };
}
