/** Progressive disclosure: hover peek → dwell settle → pinned detail. */

import type { Edge, Node } from "./types";
import { edgeSharedCount } from "./encode";

export interface SelectionState {
  hoveredId: string | null;
  pinnedId: string | null;
  hoveredEdge: Edge | null;
  /** Clicked link — stays until another pin/clear so Inspect can show films. */
  pinnedEdge: Edge | null;
  /**
   * Immediate pointer target for a soft accent while the weave has not
   * dwell-settled yet (no neighbor dimming).
   */
  skimId?: string | null;
  skimEdge?: Edge | null;
}

export const EMPTY_SELECTION: SelectionState = {
  hoveredId: null,
  pinnedId: null,
  hoveredEdge: null,
  pinnedEdge: null,
  skimId: null,
  skimEdge: null,
};

/** How long hover must rest before the main weave dims/solidifies. */
export const HOVER_SETTLE_MS = 260;
/** Brief lag before clearing settled focus so exit isn't a hard cut. */
export const HOVER_CLEAR_MS = 120;

export function activeEdge(sel: SelectionState): Edge | null {
  return sel.pinnedEdge ?? sel.hoveredEdge;
}

/** Immediate focus for Inspect / peek (follows the pointer). */
export function activeId(sel: SelectionState): string | null {
  return sel.pinnedId ?? sel.hoveredId;
}

/**
 * Focus used by the main chart. Uses a dwell-settled hover so scanning the
 * weave updates Inspect without thrashing dimming until you pause or pin.
 */
export function vizFocusId(
  sel: SelectionState,
  settledHoverId: string | null,
): string | null {
  return sel.pinnedId ?? settledHoverId;
}

export function vizActiveEdge(
  sel: SelectionState,
  settledEdge: Edge | null,
): Edge | null {
  return sel.pinnedEdge ?? settledEdge;
}

/** Selection view for heroes — settled hover dims; skim accents while scanning. */
export function vizSelection(
  sel: SelectionState,
  settledHoverId: string | null,
  settledEdge: Edge | null,
): SelectionState {
  if (sel.pinnedId || sel.pinnedEdge) {
    return { ...sel, skimId: null, skimEdge: null };
  }
  const settled = !!(settledHoverId || settledEdge);
  return {
    ...sel,
    hoveredId: settledHoverId,
    hoveredEdge: settledEdge,
    // Soft pointer accent only before dwell solidifies the weave.
    skimId: settled ? null : sel.hoveredId,
    skimEdge: settled ? null : sel.hoveredEdge,
  };
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
    .sort(
      (a, b) =>
        edgeSharedCount(b[1].edge) - edgeSharedCount(a[1].edge) ||
        b[1].weight - a[1].weight,
    )
    .slice(0, limit)
    .map(([nid, { weight, edge }]) => ({ node: byId.get(nid)!, weight, edge }))
    .filter((d) => d.node);
}
