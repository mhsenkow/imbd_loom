/** Apply connecting filters from PosterSpec to nodes/edges. */

import type { ConstructData, Edge, Node, PosterSpec, StageRow } from "./types";
import { neighborIds } from "./selection";
import { edgeKey, type SearchMatch } from "./search";
import { synthesizeStages } from "./stages";
import { nodeStrength } from "./metrics";

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Title count with roles[] fallback for constructs that omit the facet. */
export function nodeTitleCount(n: Node): number {
  const direct = num(n.title_count) ?? num(n.titleCount);
  if (direct != null) return direct;
  const roles = n.roles;
  if (!Array.isArray(roles) || !roles.length) return 0;
  const ids = new Set(
    roles
      .map((r) => r.tconst)
      .filter((t): t is string => typeof t === "string" && t.length > 0),
  );
  return ids.size || roles.length;
}

/** Career year span — prefer facets, else derive from role years. */
export function nodeYearSpan(n: Node): { min?: number; max?: number } {
  let yMin = num(n.year_min) ?? num(n.yearMin);
  let yMax = num(n.year_max) ?? num(n.yearMax);
  if ((yMin == null || yMax == null) && Array.isArray(n.roles)) {
    const years = n.roles
      .map((r) => num(r.year))
      .filter((y): y is number => y != null);
    if (years.length) {
      yMin ??= Math.min(...years);
      yMax ??= Math.max(...years);
    }
  }
  return { min: yMin, max: yMax };
}

function sortValue(n: Node, sortBy: PosterSpec["sortBy"]): number {
  switch (sortBy) {
    case "prominence":
      return num(n.prominence) ?? nodeStrength(n);
    case "year_peak":
      return num(n.year_peak) ?? num(n.yearPeak) ?? 0;
    case "title_count":
      return nodeTitleCount(n) || nodeStrength(n);
    case "pagerank":
      return num(n.pagerank) ?? 0;
    case "degree":
      return num(n.degree) ?? 0;
    case "strength":
    default:
      return nodeStrength(n);
  }
}

/** Shared ranking metric for Top-N, timeline lanes, and layout order. */
export function nodeSortValue(n: Node, sortBy: PosterSpec["sortBy"]): number {
  return sortValue(n, sortBy);
}

/** Compare two nodes for display order (peak year ascending; others descending). */
export function compareNodesBySort(
  a: Node,
  b: Node,
  sortBy: PosterSpec["sortBy"],
): number {
  if (sortBy === "year_peak") {
    const ay = sortValue(a, sortBy);
    const by = sortValue(b, sortBy);
    return ay - by || nodeStrength(b) - nodeStrength(a) || a.label.localeCompare(b.label);
  }
  const av = sortValue(a, sortBy);
  const bv = sortValue(b, sortBy);
  return bv - av || a.label.localeCompare(b.label);
}

/** Connect + density gates before Top-N (and before search isolate). */
export function filterNodesPool(nodes: Node[], spec: PosterSpec): Node[] {
  let list = nodes.filter((n) => {
    if (spec.genderFilter !== "all" && (n.gender || "unknown") !== spec.genderFilter) {
      return false;
    }
    if (nodeTitleCount(n) < spec.minTitles) return false;
    if (nodeStrength(n) < spec.minDegree) return false;
    const { min: yMin, max: yMax } = nodeYearSpan(n);
    if (yMin != null && yMax != null) {
      if (yMax < spec.yearFrom || yMin > spec.yearTo) return false;
    }
    return true;
  });

  list = [...list].sort((a, b) => compareNodesBySort(a, b, spec.sortBy));

  return list;
}

export function filterNodes(
  nodes: Node[],
  spec: PosterSpec,
  _focusId: string | null,
  search?: SearchMatch | null,
): Node[] {
  let list = filterNodesPool(nodes, spec);

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

export function dropIsolates(
  nodes: Node[],
  edges: Edge[],
  keepIds?: Set<string>,
): Node[] {
  if (!nodes.length) return nodes;
  const linked = new Set<string>();
  for (const e of edges) {
    linked.add(e.source);
    linked.add(e.target);
  }
  return nodes.filter((n) => linked.has(n.id) || keepIds?.has(n.id));
}

/** Suggest a useful max for the min-weight slider from this construct's edges. */
export function weightSliderMax(edges: Edge[]): number {
  if (!edges.length) return 10;
  const weights = edges.map((e) => e.weight).sort((a, b) => a - b);
  const p95 = weights[Math.min(weights.length - 1, Math.floor(weights.length * 0.95))] ?? 10;
  return Math.max(10, Math.min(80, Math.ceil(p95)));
}

export interface MaterializedView {
  nodes: Node[];
  edges: Edge[];
  stages: StageRow[];
}

/**
 * Apply the active PosterSpec to a construct for hero or strip.
 * Strip panels ignore search/neighborhood so companions stay comparable.
 */
export function materializeConstruct(
  data: Pick<ConstructData, "nodes" | "edges">,
  spec: PosterSpec,
  opts?: {
    focusId?: string | null;
    search?: SearchMatch | null;
    /** Companion strip: density/connect only */
    forStrip?: boolean;
  },
): MaterializedView {
  const focusId = opts?.forStrip ? null : (opts?.focusId ?? null);
  const search = opts?.forStrip ? null : (opts?.search ?? null);
  const stripSpec: PosterSpec = opts?.forStrip
    ? { ...spec, neighborhoodOnly: false, searchQuery: "", searchMode: "highlight" }
    : spec;

  let nodes = filterNodes(data.nodes, stripSpec, focusId, search);
  let edges = filterEdges(
    data.edges,
    new Set(nodes.map((n) => n.id)),
    stripSpec,
    focusId,
    search,
  );

  if (stripSpec.hideIsolates) {
    const keep = focusId ? new Set([focusId]) : undefined;
    nodes = dropIsolates(nodes, edges, keep);
    const ids = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }

  // Rebuild stages from survivors so density/connect reshape the alluvials
  const stages = synthesizeStages(nodes);
  return { nodes, edges, stages };
}

export function resolveColorBy(
  spec: PosterSpec,
  keyVariable: string,
): import("./types").ColorBy {
  if (spec.colorMode === "auto") {
    if (keyVariable === "gender") return "gender";
    if (keyVariable === "pagerank") return "pagerank";
    if (keyVariable === "acclaim_gap") return "acclaim_gap";
    return "strength";
  }
  return spec.colorMode;
}
