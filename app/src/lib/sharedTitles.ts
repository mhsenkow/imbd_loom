/** Format / dedupe shared-title samples on edges. */

import type { SharedTitle } from "./types";

export function uniqueShared(shared?: SharedTitle[] | null): SharedTitle[] {
  if (!shared?.length) return [];
  const seen = new Set<string>();
  const out: SharedTitle[] = [];
  for (const s of shared) {
    const key = s.tconst || `${s.title}|${s.year ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function filmLine(s: SharedTitle): string {
  return s.year ? `${s.title} (${s.year})` : s.title;
}

export function sharedLabel(shared?: SharedTitle[] | null, limit = 2): string {
  return uniqueShared(shared)
    .slice(0, limit)
    .map(filmLine)
    .join("; ");
}
