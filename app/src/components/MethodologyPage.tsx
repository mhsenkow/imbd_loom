/**
 * Trust the data — methodology / provenance / quality report page.
 * Route: ?view=methodology&c=<constructId>
 */

import { useEffect, useMemo, useState } from "react";
import type { ConstructData, Manifest, Quality } from "../lib/types";
import {
  dataUrl,
  loadConstruct,
  loadConstructQuality,
  loadSourcesMeta,
} from "../lib/data";
import {
  ACCURACY_ROWS,
  CAVEATS,
  DATA_SOURCES,
  accuracyTone,
  genderMethodLabel,
} from "../lib/provenance";
import {
  formatBuiltAt,
  formatSnapshotAge,
  imdbNameUrl,
  oldestIso,
} from "../lib/formatTime";
import { useIntegrityChecks } from "../lib/integrity";
import { DataSourceCard } from "./DataSourceCard";
import { QualityTiles } from "./QualityTiles";
import { BuildFunnel } from "./BuildFunnel";
import { MetricDefList } from "./MetricDefList";
import { VerifySpotCheck } from "./VerifySpotCheck";
import { useTheme } from "../lib/theme/ThemeContext";
import type { ThemePreference } from "../lib/theme/tokens";
import { Chip } from "./ui/Chip";

interface Props {
  index: Manifest[];
  constructId: string;
  onSelectConstruct: (id: string) => void;
  onBackHome: () => void;
  onOpenAtelier: (id: string) => void;
  qualityRollup: Quality[] | null;
  qualityUnavailable: boolean;
}

const TOC = [
  { id: "sources", label: "Sources" },
  { id: "math", label: "Math" },
  { id: "report", label: "Construct report" },
  { id: "verify", label: "Double-check" },
  { id: "overview", label: "All constructs" },
];

export function MethodologyPage({
  index,
  constructId,
  onSelectConstruct,
  onBackHome,
  onOpenAtelier,
  qualityRollup,
  qualityUnavailable,
}: Props) {
  const { themePreference, setTheme } = useTheme();
  const [data, setData] = useState<ConstructData | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [snapshotAsOf, setSnapshotAsOf] = useState<string | null>(null);

  const selected = index.find((m) => m.id === constructId) ?? index[0];
  const activeId = selected?.id ?? constructId;

  useEffect(() => {
    let cancelled = false;
    const saveData =
      typeof navigator !== "undefined" &&
      !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (!saveData) {
          const meta = await loadSourcesMeta();
          if (!cancelled && meta?.imdb_snapshot_as_of) {
            setSnapshotAsOf(meta.imdb_snapshot_as_of);
          }
        }
        if (!activeId) return;
        const [c, q] = await Promise.all([
          loadConstruct(activeId),
          loadConstructQuality(activeId),
        ]);
        if (cancelled) return;
        setData(c);
        setQuality(q);
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setQuality(null);
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const manifest = data?.manifest ?? selected ?? null;
  const integrity = useIntegrityChecks(data, quality);
  const rollup = useMemo(() => {
    const rows = [...(qualityRollup ?? [])];
    rows.sort((a, b) => {
      const score = (q: Quality) =>
        q.gender_unknown_pct + q.missing_birth_year_pct - q.prominence_coverage_pct;
      return score(b) - score(a);
    });
    return rows;
  }, [qualityRollup]);

  const oldestSnap = oldestIso(manifest?.imdb_snapshot_files);
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [activeId]);

  const asOf = snapshotAsOf || oldestSnap || manifest?.built_at;
  const isOneRole = activeId === "one_role";
  const isProxyGender =
    (manifest?.gender_method || "").toLowerCase().includes("proxy") ||
    (manifest?.gender_method || "").toLowerCase().includes("actress");

  return (
    <div className="trust-page">
      <a className="trust-skip" href="#trust-main">
        Skip to content
      </a>
      <header className="trust-header">
        <div>
          <p className="trust-kicker">Methodology</p>
          <h1>Trust the data</h1>
          <p className="trust-lede">
            Sources, math, and live quality for every construct — so you can verify the weave.
          </p>
        </div>
        <div className="trust-header-actions">
          <div className="chip-row">
            {(["auto", "light", "dark"] as ThemePreference[]).map((t) => (
              <Chip key={t} active={themePreference === t} onClick={() => setTheme(t)}>
                {t}
              </Chip>
            ))}
          </div>
          <button type="button" className="ghost" onClick={onBackHome}>
            ← Gallery
          </button>
          {activeId ? (
            <button type="button" className="gallery-cta" onClick={() => onOpenAtelier(activeId)}>
              Open in atelier
            </button>
          ) : null}
        </div>
      </header>

      <nav className="trust-toc" aria-label="On this page">
        {TOC.map((t) => (
          <a key={t.id} href={`#${t.id}`}>
            {t.label}
          </a>
        ))}
      </nav>

      <div className="trust-banner" role="status">
        <strong>Data as of</strong>{" "}
        {asOf ? (
          <>
            {formatBuiltAt(asOf)} · {formatSnapshotAge(asOf)}
          </>
        ) : (
          "snapshot timestamps unavailable"
        )}
        {integrity.ok ? (
          <span className="trust-badge trust-badge--good mono">integrity ok</span>
        ) : (
          <span className="trust-badge trust-badge--poor mono">integrity warnings</span>
        )}
        {qualityUnavailable ? (
          <span className="trust-badge trust-badge--watch mono">live metrics unavailable</span>
        ) : null}
      </div>

      <main id="trust-main" className="trust-main">
        <section className="trust-section" id="picker">
          <h2>Construct</h2>
          <label className="trust-field">
            <span>Report for</span>
            <select
              value={activeId}
              onChange={(e) => onSelectConstruct(e.target.value)}
              aria-label="Select construct"
            >
              {index.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          {loading ? <p className="trust-muted">Loading construct…</p> : null}
          {loadError ? <p className="trust-error">Could not load construct: {loadError}</p> : null}
          {isOneRole ? (
            <p className="trust-callout trust-callout--synthetic">
              This construct uses <strong>synthetic</strong> genre co-membership edges — not
              co-appearances.
            </p>
          ) : null}
          {isProxyGender ? (
            <p className="trust-callout">
              Gender method is the IMDb actor/actress proxy for this cut — treat gender splits
              with an asterisk.
            </p>
          ) : null}
        </section>

        <section className="trust-section" id="sources">
          <h2>Where the data comes from</h2>
          <p className="trust-lede">
            Required IMDb dumps plus optional enrichment. Every outbound link opens in a new tab.
          </p>
          <div className="trust-source-grid">
            {DATA_SOURCES.map((s) => (
              <DataSourceCard key={s.id} source={s} />
            ))}
          </div>

          {manifest?.data_credit ? (
            <blockquote className="trust-credit">{manifest.data_credit}</blockquote>
          ) : null}
          <p className="trust-callout">
            IMDb Non-Commercial Datasets — fine for a personal poster, not for resale.
          </p>
          <p className="trust-callout">
            Principals = <strong>top-billed cast only</strong>, not full credits. The graph
            depends on this.
          </p>
          <p className="trust-callout">
            Enrichment is <strong>genre-scoped</strong> (Animation / Horror candidates). Outside
            those genres, coverage leans on proxies.
          </p>
          <p className="trust-callout">
            Bechdel failover chain: live API → TidyTuesday mirror → stale cache.
          </p>

          {manifest?.method_note ? (
            <div className="trust-method">
              <h3>Method note</h3>
              <p>{manifest.method_note}</p>
              <p className="trust-muted">{genderMethodLabel(manifest.gender_method)}</p>
              {manifest.tmdb_gender_rows != null ? (
                <p className="trust-muted mono">tmdb_gender_rows = {manifest.tmdb_gender_rows}</p>
              ) : null}
            </div>
          ) : null}

          {manifest?.imdb_snapshot_files ? (
            <div className="trust-table-wrap">
              <table className="trust-table">
                <caption>IMDb snapshot files for {manifest.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Captured</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(manifest.imdb_snapshot_files).map(([file, ts]) => (
                    <tr key={file}>
                      <td className="mono">{file}</td>
                      <td className="mono">{formatBuiltAt(ts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="trust-muted">IMDb snapshot table unavailable for this construct.</p>
          )}

          <div className="trust-table-wrap">
            <table className="trust-table">
              <caption>Signal accuracy</caption>
              <thead>
                <tr>
                  <th scope="col">Signal</th>
                  <th scope="col">Accuracy</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ACCURACY_ROWS.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.signal}
                      {row.sourceId ? (
                        <>
                          {" "}
                          <a href={`#source-${row.sourceId}`}>↗</a>
                        </>
                      ) : null}
                      {row.metricId ? (
                        <>
                          {" "}
                          <a href={`#metric-${row.metricId}`}>ƒ</a>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className={`trust-acc trust-acc--${accuracyTone(row.accuracy)}`}>
                        {row.accuracy}
                      </span>
                    </td>
                    <td>{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="trust-callout">
            <h3>How to verify this yourself</h3>
            <p>
              Download the dumps from{" "}
              <a href="https://datasets.imdbws.com" target="_blank" rel="noopener noreferrer">
                datasets.imdbws.com
              </a>
              . Principals join people to titles; ratings attach votes; our edges are the
              actor/actress self-join on a shared title_key with a minimum shared-title count.
            </p>
          </div>
        </section>

        <section className="trust-section" id="math">
          <h2>How the numbers are computed</h2>
          <MetricDefList />
          <h3>Honest caveats</h3>
          <ul className="trust-caveat-list">
            {CAVEATS.map((c) => (
              <li key={c.id}>
                <strong>{c.appliesTo}:</strong> {c.text}
              </li>
            ))}
          </ul>
          {manifest?.build_seed != null ? (
            <p className="trust-callout">
              <strong>build_seed = {manifest.build_seed}</strong> — layout and sampling are
              deterministic / reproducible.
            </p>
          ) : null}
        </section>

        <section className="trust-section" id="report">
          <h2>Construct data-quality report</h2>
          {quality ? (
            <QualityTiles quality={quality} />
          ) : (
            <p className="trust-muted">
              {qualityUnavailable
                ? "Live quality metrics unavailable — static method text still applies."
                : "No quality.json for this construct."}
            </p>
          )}

          <h3>Build funnel</h3>
          <BuildFunnel stats={manifest?.build_stats} nodeCount={data?.nodes.length} />

          {(manifest?.build_stats?.validation_warnings?.length ||
            quality?.validation_warnings?.length) ? (
            <div className="trust-callout trust-callout--poor">
              <h3>Validation warnings</h3>
              <ul>
                {(
                  quality?.validation_warnings ||
                  manifest?.build_stats?.validation_warnings ||
                  []
                ).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {manifest?.summary ? (
            <div className="trust-summary">
              <h3>Summary</h3>
              <p className="mono">
                degree_max={manifest.summary.degree_max ?? "—"} · degree_median=
                {manifest.summary.degree_median ?? "—"} · top=
                {manifest.summary.top_name ?? "—"}
              </p>
              {manifest.summary.gender_mix ? (
                <p>
                  Gender mix:{" "}
                  {Object.entries(manifest.summary.gender_mix)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ")}
                  {isProxyGender ? " *" : ""}
                </p>
              ) : null}
              {manifest.summary.era_histogram ? (
                <div className="trust-era" role="img" aria-label="Era histogram">
                  {Object.entries(manifest.summary.era_histogram).map(([era, n]) => {
                    const max = Math.max(
                      ...Object.values(manifest.summary!.era_histogram!),
                      1,
                    );
                    return (
                      <div key={era} className="trust-era-row">
                        <span className="mono">{era}</span>
                        <div className="trust-funnel-bar-track">
                          <div
                            className="trust-funnel-bar"
                            style={{ width: `${(100 * n) / max}%` }}
                          />
                        </div>
                        <span className="mono">{n}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <p className="trust-muted mono">
                nodes {manifest.node_count} · edges {manifest.edge_count}
                {manifest.clustering_coefficient != null
                  ? ` · clustering ${manifest.clustering_coefficient}`
                  : ""}
                {manifest.avg_path_length != null
                  ? ` · avg path ~${manifest.avg_path_length} (n=${
                      manifest.avg_path_sample_n ?? "≤40"
                    } sources)`
                  : ""}
                {manifest.community_count != null
                  ? ` · communities ${manifest.community_count}`
                  : ""}
              </p>
            </div>
          ) : null}

          {manifest?.featured_path?.length ? (
            <div className="trust-featured">
              <h3>Featured path</h3>
              <p>
                {manifest.featured_path.map((hop, i) => (
                  <span key={hop.id}>
                    {i > 0 ? " → " : null}
                    <a href={imdbNameUrl(hop.id)} target="_blank" rel="noopener noreferrer">
                      {hop.label}
                    </a>{" "}
                    <button
                      type="button"
                      className="ghost inline"
                      onClick={() => onOpenAtelier(activeId)}
                    >
                      open
                    </button>
                  </span>
                ))}
              </p>
            </div>
          ) : null}
        </section>

        <section className="trust-section" id="verify">
          <h2>Double-check accuracy</h2>
          {!integrity.ok ? (
            <div className="trust-callout trust-callout--poor">
              <h3>Data integrity</h3>
              <ul>
                {integrity.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="trust-callout trust-callout--good">
              Client checks match: node/edge counts, no dangling endpoints, edges_with_year_pct
              agrees.
            </p>
          )}

          <VerifySpotCheck data={data} constructId={activeId} />

          <div className="trust-reproduce">
            <h3>Reproduce this build</h3>
            <pre className="trust-formula mono">{`cd pipeline && uv run loom build --construct ${activeId} --top-n ${manifest?.top_n ?? 160}`}</pre>
            <p className="trust-muted">
              Seed {manifest?.build_seed ?? 42} keeps sampling/layout deterministic.
            </p>
            <p>
              Inspect source of truth:{" "}
              <a href={dataUrl(`${activeId}/manifest.json`)} target="_blank" rel="noopener noreferrer">
                manifest.json
              </a>
              {" · "}
              <a href={dataUrl(`${activeId}/quality.json`)} target="_blank" rel="noopener noreferrer">
                quality.json
              </a>
            </p>
          </div>
        </section>

        <section className="trust-section" id="overview">
          <h2>Cross-construct quality overview</h2>
          {rollup.length ? (
            <div className="trust-table-wrap">
              <table className="trust-table">
                <caption>All constructs sorted by coverage risk</caption>
                <thead>
                  <tr>
                    <th scope="col">Construct</th>
                    <th scope="col">Nodes</th>
                    <th scope="col">Edges</th>
                    <th scope="col">Gender ?%</th>
                    <th scope="col">Birth miss%</th>
                    <th scope="col">Prominence%</th>
                    <th scope="col">Edge year%</th>
                  </tr>
                </thead>
                <tbody>
                  {rollup.map((q) => {
                    const title = index.find((m) => m.id === q.id)?.title ?? q.id;
                    return (
                      <tr
                        key={q.id}
                        className={q.id === activeId ? "trust-row-active" : undefined}
                      >
                        <td>
                          <button
                            type="button"
                            className="ghost inline"
                            onClick={() => q.id && onSelectConstruct(q.id)}
                          >
                            {title}
                          </button>
                        </td>
                        <td className="mono">{q.node_count}</td>
                        <td className="mono">{q.edge_count}</td>
                        <td className="mono">{q.gender_unknown_pct}</td>
                        <td className="mono">{q.missing_birth_year_pct}</td>
                        <td className="mono">{q.prominence_coverage_pct}</td>
                        <td className="mono">{q.edges_with_year_pct}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="trust-muted">Quality rollup not loaded.</p>
          )}
        </section>
      </main>
    </div>
  );
}
