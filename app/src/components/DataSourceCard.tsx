/** One credited data source with outbound link + caveat. */

import type { DataSource } from "../lib/provenance";

interface Props {
  source: DataSource;
  id?: string;
}

export function DataSourceCard({ source, id }: Props) {
  return (
    <article className="trust-source-card" id={id ?? `source-${source.id}`}>
      <div className="trust-source-head">
        <h3>
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            {source.name}
          </a>
        </h3>
        <span className={`trust-status trust-status--${source.status} mono`}>
          {source.status}
        </span>
      </div>
      <p className="trust-source-provides">
        <span className="trust-kicker">Provides</span> {source.provides}
      </p>
      <p className="trust-source-caveat">
        <span className="trust-kicker">Caveat</span> {source.caveat}
      </p>
    </article>
  );
}
