/** Apply connecting filters from PosterSpec to nodes/edges. */

import type { Edge, Node, PosterSpec } from "./types";
import { neighborIds } from "./selection";
import { edgeKey, type SearchMatch } from "./search";

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function sortValue(n: Node, sortBy: PosterSpec["sortBy"]): number {
  switch (sortBy) {
    case "prominence":
      return num(n.prominence) ?? n.degree;
    case "year_peak":
      return num(n.year_peak) ?? num(n.yearPeak) ?? 0;
    case "title_count":
      return num(n.title_count) ?? num(n.titleCount) ?? n.degree;
    default:
      return n.degree;
  }
}

export function filterNodes(
  nodes: Node[],
  spec: PosterSpec,
  _focusId: string | null,
  search?: SearchMatch | null,
): Node[] {
  let list = nodes.filter((n) => {
    if (spec.genderFilter !== "all" && (n.gender || "unknown") !== spec.genderFilter) {
      return false;
    }
    const titles = num(n.title_count) ?? num(n.titleCount) ?? 0;
    if (titles < spec.minTitles) return false;
    const yMin = num(n.year_min) ?? num(n.yearMin);
    const yMax = num(n.year_max) ?? num(n.yearMax);
    if (yMin != null && yMax != null) {
      if (yMax < spec.yearFrom || yMin > spec.yearTo) return false;
    }
    return true;
  });

  const desc = spec.sortBy !== "year_peak";
  list = [...list].sort((a, b) => {
    const av = sortValue(a, spec.sortBy);
    const bv = sortValue(b, spec.sortBy);
    return desc ? bv - av : av - bv;
  });

  if (search && spec.searchMode === "isolate") {
    // Keep the matched web even if those people sit outside top-N by degree
    list = list.filter((n) => search.matchedNodeIds.has(n.id));
  } else {
    list = list.slice(0, spec.topN);
  }

  return list;
}

export function filterEdges(
  edges: Edge[],
  nodeIds: Set<string>,
  spec: PosterSpec,
  focusId: string | null,
  search?: SearchMatch | null,
): Edge[] {
  let list = edges.filter((e) => {
    if (e.weight < spec.minWeight) return false;
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return false;
    if (spec.edgeYearFilter) {
      const y = num(e.year);
      if (y != null && (y < spec.yearFrom || y > spec.yearTo)) return false;
    }
    return true;
  });

  if (search && spec.searchMode === "isolate") {
    list = list.filter((e) => search.matchedEdgeKeys.has(edgeKey(e.source, e.target)));
  }

  if (spec.neighborhoodOnly && focusId) {
    const neigh = neighborIds(focusId, list);
    list = list.filter((e) => neigh.has(e.source) && neigh.has(e.target));
  }

  return list;
}

export function resolveColorBy(
  spec: PosterSpec,
  keyVariable: string,
): "gender" | "degree" {
  if (spec.colorMode === "gender") return "gender";
  if (spec.colorMode === "degree") return "degree";
  return keyVariable === "gender" ? "gender" : "degree";
}
