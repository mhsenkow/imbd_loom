/** Progressive disclosure: hover peek → pinned detail panel. */

import type { Edge, Node } from "../lib/types";

export interface SelectionState {
  hoveredId: string | null;
  pinnedId: string | null;
  hoveredEdge: Edge | null;
  /** Clicked link — stays until another pin/clear so Inspect can show films. */
  pinnedEdge: Edge | null;
}

export const EMPTY_SELECTION: SelectionState = {
  hoveredId: null,
  pinnedId: null,
  hoveredEdge: null,
  pinnedEdge: null,
};

export function activeEdge(sel: SelectionState): Edge | null {
  return sel.pinnedEdge ?? sel.hoveredEdge;
}

export function activeId(sel: SelectionState): string | null {
  return sel.pinnedId ?? sel.hoveredId;
}

export function neighborIds(
  id: string | null,
  edges: Edge[],
): Set<string> {
  const set = new Set<string>();
  if (!id) return set;
  set.add(id);
  for (const e of edges) {
    if (e.source === id) set.add(e.target);
    if (e.target === id) set.add(e.source);
  }
  return set;
}

export function topNeighbors(
  id: string,
  nodes: Node[],
  edges: Edge[],
  limit = 8,
): Array<{ node: Node; weight: number; edge: Edge }> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const best = new Map<string, { weight: number; edge: Edge }>();
  for (const e of edges) {
    let other: string | null = null;
    if (e.source === id) other = e.target;
    if (e.target === id) other = e.source;
    if (!other) continue;
    const prev = best.get(other);
    if (!prev || e.weight > prev.weight) best.set(other, { weight: e.weight, edge: e });
  }
  return [...best.entries()]
    .sort((a, b) => b[1].weight - a[1].weight)
    .slice(0, limit)
    .map(([nid, { weight, edge }]) => ({ node: byId.get(nid)!, weight, edge }))
    .filter((d) => d.node);
}
