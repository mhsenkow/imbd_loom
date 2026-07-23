/** METRIC_DEFS → formula cards. */

import { METRIC_DEFS, CAVEATS } from "../lib/provenance";

export function MetricDefList() {
  return (
    <div className="trust-metrics">
      {METRIC_DEFS.map((m) => {
        const caveats = (m.relatedCaveatIds || [])
          .map((id) => CAVEATS.find((c) => c.id === id))
          .filter(Boolean);
        return (
          <article key={m.id} className="trust-metric" id={`metric-${m.id}`}>
            <h3>{m.label}</h3>
            <p>{m.definition}</p>
            <pre className="trust-formula mono" aria-label={`Formula for ${m.label}`}>
              {m.formula}
            </pre>
            <p className="trust-muted mono">
              Source: <code>{m.sourceFile}</code>
            </p>
            {caveats.length ? (
              <ul className="trust-caveat-list">
                {caveats.map((c) => (
                  <li key={c!.id}>{c!.text}</li>
                ))}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
