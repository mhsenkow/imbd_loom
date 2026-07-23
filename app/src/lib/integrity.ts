/** Client-side consistency checks against loaded construct JSON. */

import { useMemo } from "react";
import type { ConstructData, Quality } from "../lib/types";

export interface IntegrityResult {
  ok: boolean;
  warnings: string[];
}

export function runIntegrityChecks(
  data: ConstructData | null,
  quality: Quality | null,
): IntegrityResult {
  const warnings: string[] = [];
  if (!data) return { ok: true, warnings: [] };

  const { nodes, edges, manifest } = data;
  if (nodes.length !== manifest.node_count) {
    warnings.push(
      `node_count mismatch: loaded ${nodes.length} vs manifest ${manifest.node_count}`,
    );
  }
  if (edges.length !== manifest.edge_count) {
    warnings.push(
      `edge_count mismatch: loaded ${edges.length} vs manifest ${manifest.edge_count}`,
    );
  }
  if (quality) {
    if (quality.node_count !== nodes.length) {
      warnings.push(
        `quality.node_count ${quality.node_count} ≠ loaded nodes ${nodes.length}`,
      );
    }
    if (quality.edge_count !== edges.length) {
      warnings.push(
        `quality.edge_count ${quality.edge_count} ≠ loaded edges ${edges.length}`,
      );
    }
  }

  const ids = new Set(nodes.map((n) => n.id));
  let dangling = 0;
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) dangling += 1;
  }
  if (dangling) warnings.push(`${dangling} dangling edge endpoint(s)`);

  const withYear = edges.filter((e) => e.year != null).length;
  const recomputed =
    edges.length === 0 ? 100 : Math.round((1000 * withYear) / edges.length) / 10;
  if (quality && Math.abs(recomputed - quality.edges_with_year_pct) > 0.6) {
    warnings.push(
      `edges_with_year_pct drift: quality ${quality.edges_with_year_pct} vs recomputed ${recomputed}`,
    );
  }

  return { ok: warnings.length === 0, warnings };
}

export function useIntegrityChecks(
  data: ConstructData | null,
  quality: Quality | null,
): IntegrityResult {
  return useMemo(() => {
    const result = runIntegrityChecks(data, quality);
    if (result.warnings.length && typeof console !== "undefined") {
      console.warn("[loom integrity]", result.warnings);
    }
    return result;
  }, [data, quality]);
}
