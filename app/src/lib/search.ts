/** Match people / roles / shared titles for explorer search. */

import type { Edge, Node, SearchMode } from "./types";

export type { SearchMode };

export interface SearchMatch {
  query: string;
  /** Normalized query */
  q: string;
  matchedNodeIds: Set<string>;
  /** `source|target` with sorted ids */
  matchedEdgeKeys: Set<string>;
  /** Why we matched — drives the banner copy */
  kinds: Set<"person" | "title" | "character">;
  /** Best display label for the hit (e.g. a title name) */
  focusLabel: string | null;
  /** Count of title/character hits for UI */
  titleHits: number;
  personHits: number;
}

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function includes(hay: string | null | undefined, needle: string): boolean {
  if (!hay) return false;
  return norm(hay).includes(needle);
}

/** Build match sets from the current construct graph. */
export function matchSearch(
  nodes: Node[],
  edges: Edge[],
  query: string,
): SearchMatch | null {
  const q = norm(query);
  if (q.length < 2) return null;

  const matchedNodeIds = new Set<string>();
  const matchedEdgeKeys = new Set<string>();
  const kinds = new Set<"person" | "title" | "character">();
  let focusLabel: string | null = null;
  let titleHits = 0;
  let personHits = 0;

  for (const n of nodes) {
    let hit = false;
    if (includes(n.label, q)) {
      hit = true;
      kinds.add("person");
      personHits += 1;
      if (!focusLabel) focusLabel = n.label;
    }
    for (const r of n.roles ?? []) {
      if (includes(r.title, q)) {
        hit = true;
        kinds.add("title");
        titleHits += 1;
        if (!focusLabel || focusLabel === n.label) focusLabel = r.title;
      }
      if (includes(r.character ?? undefined, q)) {
        hit = true;
        kinds.add("character");
        if (!focusLabel) focusLabel = r.character ?? null;
      }
    }
    if (hit) matchedNodeIds.add(n.id);
  }

  for (const e of edges) {
    let edgeHit = false;
    for (const s of e.shared ?? []) {
      if (includes(s.title, q)) {
        edgeHit = true;
        kinds.add("title");
        titleHits += 1;
        if (!focusLabel) focusLabel = s.title;
      }
    }
    if (edgeHit) {
      matchedEdgeKeys.add(edgeKey(e.source, e.target));
      matchedNodeIds.add(e.source);
      matchedNodeIds.add(e.target);
    } else if (matchedNodeIds.has(e.source) && matchedNodeIds.has(e.target)) {
      // Keep co-appearance between two matched people (person search)
      matchedEdgeKeys.add(edgeKey(e.source, e.target));
    }
  }

  // For title/character searches: also include edges where both ends are matched
  // even if shared[] sample missed the title (weight still implies co-appearance).
  if (kinds.has("title") || kinds.has("character")) {
    for (const e of edges) {
      if (matchedNodeIds.has(e.source) && matchedNodeIds.has(e.target)) {
        matchedEdgeKeys.add(edgeKey(e.source, e.target));
      }
    }
  }

  if (!matchedNodeIds.size) return null;

  return {
    query,
    q,
    matchedNodeIds,
    matchedEdgeKeys,
    kinds,
    focusLabel,
    titleHits,
    personHits,
  };
}

export function searchSummary(m: SearchMatch): string {
  const bits: string[] = [];
  if (m.kinds.has("title")) bits.push("title");
  if (m.kinds.has("character")) bits.push("character");
  if (m.kinds.has("person")) bits.push("person");
  const via = bits.length ? bits.join(" · ") : "match";
  const label = m.focusLabel ? `“${m.focusLabel}”` : `“${m.query}”`;
  return `${label} · ${m.matchedNodeIds.size} people · ${m.matchedEdgeKeys.size} links · via ${via}`;
}
