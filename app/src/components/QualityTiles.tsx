/** quality.json health indicator tiles. */

import type { Quality } from "../lib/types";
import { healthForPct } from "../lib/provenance";

const TILES: Array<{
  key: keyof Pick<
    Quality,
    | "missing_birth_year_pct"
    | "gender_unknown_pct"
    | "prominence_coverage_pct"
    | "edges_with_year_pct"
  >;
  label: string;
  gloss: string;
  unit?: string;
}> = [
  {
    key: "missing_birth_year_pct",
    label: "Missing birth year",
    gloss: "Share of people without a birth year in name.basics.",
    unit: "%",
  },
  {
    key: "gender_unknown_pct",
    label: "Gender unknown",
    gloss: "High ⇒ TMDB enrichment was unavailable or unmatched for this cut.",
    unit: "%",
  },
  {
    key: "prominence_coverage_pct",
    label: "Prominence coverage",
    gloss: "Share of people with a non-zero vote-weighted prominence.",
    unit: "%",
  },
  {
    key: "edges_with_year_pct",
    label: "Edges with year",
    gloss: "Share of links that carry a representative collaboration year.",
    unit: "%",
  },
];

interface Props {
  quality: Quality;
}

export function QualityTiles({ quality }: Props) {
  return (
    <div>
      <div className="trust-tiles" role="list">
        {TILES.map((t) => {
          const value = Number(quality[t.key] ?? 0);
          const health = healthForPct(t.key, value);
          return (
            <div key={t.key} className={`trust-tile trust-tile--${health}`} role="listitem">
              <div className="trust-tile-label">{t.label}</div>
              <div className="trust-tile-value mono">
                {value}
                {t.unit ?? ""}
              </div>
              <div className="trust-tile-health mono">{health}</div>
              <p className="trust-tile-gloss">{t.gloss}</p>
            </div>
          );
        })}
      </div>
      {(quality.tmdb_coverage_pct != null ||
        quality.voice_flag_source ||
        quality.bechdel_matched_pct != null ||
        quality.gender_method) && (
        <p className="trust-muted mono">
          {quality.gender_method ? `gender_method=${quality.gender_method}` : null}
          {quality.tmdb_coverage_pct != null
            ? ` · tmdb_coverage ${quality.tmdb_coverage_pct}%`
            : null}
          {quality.voice_flag_source ? ` · voice=${quality.voice_flag_source}` : null}
          {quality.bechdel_matched_pct != null
            ? ` · bechdel_matched ${quality.bechdel_matched_pct}%`
            : null}
        </p>
      )}
    </div>
  );
}
