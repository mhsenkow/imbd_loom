/** Construct availability / dependency hints for gallery + empty states. */

import type { Manifest } from "./types";

/** Wikidata-dependent constructs that ship empty when enrichment is cold. */
export const WIKIDATA_COLD_CONSTRUCTS = new Set([
  "acting_dynasties",
  "athletes_actors",
  "drama_schools",
  "award_cohorts",
]);

export function isConstructEmpty(manifest: Pick<Manifest, "node_count"> | null | undefined): boolean {
  return (manifest?.node_count ?? 0) === 0;
}

export function isWikidataColdConstruct(id: string): boolean {
  return WIKIDATA_COLD_CONSTRUCTS.has(id);
}

export function emptyConstructBadge(id: string): string | null {
  if (!isWikidataColdConstruct(id)) return null;
  return "Wikidata cold";
}
