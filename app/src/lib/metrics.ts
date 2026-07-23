/** Honest degree vs strength accessors + legacy shim. */

import type { Node } from "./types";

/** Neighbor count (graph degree). Falls back to legacy mislabeled field only if no strength. */
export function nodeDegree(n: Node): number {
  if (typeof n.degree === "number" && n.strength != null) return n.degree;
  // Pre-metrics_version-2 payloads: degree was strength — treat as unknown neighbor count
  if (n.strength == null && typeof n.degree === "number") {
    // Can't recover neighbor count from legacy; approximate nothing — return degree as-is
    // callers that need hubs should use nodeStrength
    return n.degree;
  }
  return Number(n.degree) || 0;
}

/**
 * Weighted strength (Σ edge weights). Shim: if `strength` missing, use legacy `degree`
 * (which was the weighted sum before metrics_version 2).
 */
export function nodeStrength(n: Node): number {
  if (typeof n.strength === "number") return n.strength;
  return Number(n.degree) || 0;
}

export function nodeProminence(n: Node): number {
  const p = n.prominence;
  return typeof p === "number" ? p : Number(p) || 0;
}
