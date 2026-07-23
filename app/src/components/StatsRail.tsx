/**
 * Stats rail — structural numbers from manifest.summary / correlations
 * without reloading nodes.json.
 */

import type { Manifest } from "../lib/types";

interface Props {
  manifest: Manifest | null;
  onHoverIds?: (ids: string[] | null) => void;
}

export function StatsRail({ manifest, onHoverIds }: Props) {
  const s = manifest?.summary;
  const corr = manifest?.correlations;
  if (!s && !corr && !manifest?.insight) {
    return (
      <aside className="stats-rail" aria-label="Network stats">
        <p className="trust-muted">Rebuild constructs for structural stats.</p>
      </aside>
    );
  }

  const hist = s?.strength_hist ?? s?.degree_hist ?? [];
  const maxBin = Math.max(1, ...hist.map((b) => Number(b.count) || 0));
  const scatter = s?.scatter_strength_prominence ?? [];
  const xs = scatter.map((p) => p.x);
  const ys = scatter.map((p) => p.y);
  const x0 = Math.min(...xs, 0);
  const x1 = Math.max(...xs, 1);
  const y0 = Math.min(...ys, 0);
  const y1 = Math.max(...ys, 1);

  return (
    <aside className="stats-rail" aria-label="Network stats">
      <h3 className="stats-rail-title">Numbers in the weave</h3>
      {manifest?.insight ? <p className="stats-rail-insight">{manifest.insight}</p> : null}

      <dl className="stats-rail-metrics">
        {s?.strength_gini != null && (
          <div>
            <dt title="Inequality of strength">Strength Gini</dt>
            <dd className="mono">{s.strength_gini}</dd>
          </div>
        )}
        {s?.degree_gini != null && (
          <div>
            <dt title="Inequality of neighbor count">Degree Gini</dt>
            <dd className="mono">{s.degree_gini}</dd>
          </div>
        )}
        {s?.assortativity != null && (
          <div>
            <dt>Assortativity</dt>
            <dd className="mono">{s.assortativity}</dd>
          </div>
        )}
        {s?.density != null && (
          <div>
            <dt>Density</dt>
            <dd className="mono">{s.density}</dd>
          </div>
        )}
        {s?.modularity != null && (
          <div>
            <dt>Modularity</dt>
            <dd className="mono">{s.modularity}</dd>
          </div>
        )}
        {s?.giant_component_share != null && (
          <div>
            <dt>Giant component</dt>
            <dd className="mono">{Math.round(s.giant_component_share * 100)}%</dd>
          </div>
        )}
        {manifest?.community_count != null && (
          <div>
            <dt>Communities</dt>
            <dd className="mono">{manifest.community_count}</dd>
          </div>
        )}
      </dl>

      {hist.length ? (
        <div className="stats-rail-hist" role="img" aria-label="Strength histogram">
          <p className="stats-rail-kicker">Strength distribution</p>
          <div className="stats-rail-bars">
            {hist.map((b, i) => (
              <div
                key={i}
                className="stats-rail-bar"
                style={{ height: `${(100 * Number(b.count)) / maxBin}%` }}
                title={`${b.lo}–${b.hi}: ${b.count}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {scatter.length ? (
        <div className="stats-rail-scatter">
          <p className="stats-rail-kicker">Strength × prominence</p>
          <svg viewBox="0 0 120 80" className="stats-rail-scatter-svg" aria-hidden>
            {scatter.map((p) => {
              const cx = ((p.x - x0) / Math.max(x1 - x0, 1e-9)) * 110 + 5;
              const cy = 75 - ((p.y - y0) / Math.max(y1 - y0, 1e-9)) * 70;
              return (
                <circle
                  key={p.id}
                  cx={cx}
                  cy={cy}
                  r={1.6}
                  className="stats-rail-dot"
                  onMouseEnter={() => onHoverIds?.([p.id])}
                  onMouseLeave={() => onHoverIds?.(null)}
                />
              );
            })}
          </svg>
        </div>
      ) : null}

      {corr && Object.keys(corr).length ? (
        <div className="stats-rail-corr">
          <p className="stats-rail-kicker">Correlations</p>
          <ul>
            {Object.entries(corr)
              .slice(0, 6)
              .map(([k, v]) => (
                <li key={k} className="mono">
                  {k}: {v.r == null ? "—" : v.r}
                  {v.rho != null ? ` (ρ=${v.rho})` : ""}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <p className="stats-rail-note">
        Degree = neighbors · Strength = Σ edge weight · Prominence = log-votes / billing
      </p>
    </aside>
  );
}
