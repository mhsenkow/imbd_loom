/** Build funnel: population_sql → after_degree_cap. */

import type { BuildStats } from "../lib/types";

interface Props {
  stats?: BuildStats | null;
  nodeCount?: number;
}

const STEPS: Array<{ key: keyof BuildStats; label: string }> = [
  { key: "population_sql", label: "Population (SQL)" },
  { key: "credit_rows", label: "Credit rows" },
  { key: "people_faceted", label: "People faceted" },
  { key: "after_degree_cap", label: "After Top-N cap" },
];

export function BuildFunnel({ stats, nodeCount }: Props) {
  if (!stats) {
    return <p className="trust-muted">Build funnel unavailable for this construct.</p>;
  }
  const values = STEPS.map((s) => ({
    ...s,
    value: typeof stats[s.key] === "number" ? (stats[s.key] as number) : null,
  })).filter((s) => s.value != null) as Array<{ key: string; label: string; value: number }>;

  if (!values.length) {
    return <p className="trust-muted">Build funnel unavailable for this construct.</p>;
  }

  const max = Math.max(...values.map((v) => v.value), 1);

  return (
    <div className="trust-funnel" role="img" aria-label="Build funnel counts">
      {values.map((step, i) => (
        <div key={step.key} className="trust-funnel-step">
          <div className="trust-funnel-meta">
            <span className="trust-funnel-label">{step.label}</span>
            <span className="trust-funnel-value mono">{step.value.toLocaleString()}</span>
          </div>
          <div className="trust-funnel-bar-track">
            <div
              className="trust-funnel-bar"
              style={{ width: `${Math.max(4, (100 * step.value) / max)}%` }}
            />
          </div>
          {i < values.length - 1 ? <div className="trust-funnel-arrow" aria-hidden>↓</div> : null}
        </div>
      ))}
      {nodeCount != null && stats.after_degree_cap != null && nodeCount !== stats.after_degree_cap ? (
        <p className="trust-muted">
          Live graph has {nodeCount} nodes vs cap {stats.after_degree_cap} in build_stats.
        </p>
      ) : null}
      {stats.min_shared != null || stats.min_votes != null ? (
        <p className="trust-muted mono">
          min_shared={stats.min_shared ?? "—"} · min_votes={stats.min_votes ?? "—"}
        </p>
      ) : null}
    </div>
  );
}
