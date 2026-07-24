/** Authoring sidebar — collapsible, touch-friendly controls. */

import { useMemo, useState, type ReactNode } from "react";
import type { PersonIndexEntry } from "../lib/bridges";
import type { Manifest, PosterSpec } from "../lib/types";
import { PAGE_SIZES } from "../lib/geometry";
import type { SearchMatch } from "../lib/search";
import { searchSummary } from "../lib/search";
import { ALL_STAT_MARKS, STAT_GROUPS, STAT_MARK_META, STAT_PRESETS, toggleStatMark } from "../lib/statsMarks";
import { useTheme } from "../lib/theme/ThemeContext";
import { PALETTE_META, PALETTE_NAMES, type ThemePreference } from "../lib/theme/tokens";
import { Chip } from "./ui/Chip";
import { Swatch } from "./ui/Swatch";

interface Props {
  spec: PosterSpec;
  onChange: (patch: Partial<PosterSpec>) => void;
  index: Manifest[];
  onExport: () => void;
  exporting: boolean;
  exportAvailable?: boolean;
  status: string;
  open: boolean;
  onToggle: () => void;
  onOpenHome?: () => void;
  onOpenMethodology?: () => void;
  searchMatch?: SearchMatch | null;
  filteredCounts?: { people: number; links: number };
  /** People remaining after connect filters, before Top-N */
  poolSize?: number;
  /** Adaptive max for min-edge-weight slider */
  weightMax?: number;
  /** Cross-construct people index for Find fallbacks */
  peopleIndex?: PersonIndexEntry[];
}

type Section = "find" | "construct" | "form" | "connect" | "encode" | "stats" | "density" | "page";

function Accordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`accordion ${open ? "open" : ""}`}>
      <button type="button" className="accordion-head" onClick={onToggle}>
        <span>{title}</span>
        <span className="chev" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`chip-row${disabled ? " disabled" : ""}`} role="group">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`chip ${value === o.id ? "active" : ""}`}
          onClick={() => onChange(o.id)}
          disabled={disabled}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sidebar({
  spec,
  onChange,
  index,
  onExport,
  exporting,
  exportAvailable = true,
  status,
  open,
  onToggle,
  onOpenHome,
  onOpenMethodology,
  searchMatch = null,
  filteredCounts,
  poolSize,
  weightMax = 10,
  peopleIndex = [],
}: Props) {
  const [section, setSection] = useState<Section | null>("find");
  const { themePreference, setTheme, setPalette } = useTheme();
  const openSec = (k: Section) => setSection((s) => (s === k ? null : k));
  const isTimeline = spec.heroForm === "timeline";
  const clampedWeight = Math.min(spec.minWeight, weightMax);
  const peopleHits = useMemo(() => {
    const q = spec.searchQuery.trim().toLowerCase();
    if (q.length < 2 || !peopleIndex.length) return [];
    return peopleIndex
      .filter(
        (p) =>
          p.label.toLowerCase().includes(q) &&
          p.constructs.some((c) => c !== spec.activeConstruct),
      )
      .slice(0, 8);
  }, [peopleIndex, spec.searchQuery, spec.activeConstruct]);
  if (!open) {
    return (
      <aside className="panel-rail left">
        {onOpenHome && (
          <button
            type="button"
            className="rail-btn"
            onClick={onOpenHome}
            aria-label="Back to gallery"
            title="Gallery"
          >
            <span className="rail-icon">◈</span>
            <span className="rail-label">Gallery</span>
          </button>
        )}
        <button
          type="button"
          className="rail-btn"
          onClick={onToggle}
          aria-label="Open controls"
          aria-expanded={false}
          title="Controls"
        >
          <span className="rail-icon">☰</span>
          <span className="rail-label">Controls</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar panel-open" aria-label="Controls">
      <div className="panel-top">
        <div className="brand">
          <h1>IMDb Loom</h1>
          <span className="tag">poster atelier</span>
        </div>
        <button
          type="button"
          className="panel-close"
          onClick={onToggle}
          aria-label="Close controls"
          aria-expanded={true}
        >
          ✕
        </button>
      </div>

      {onOpenHome && (
        <div className="sidebar-home">
          <button type="button" className="ghost home-link" onClick={onOpenHome}>
            ← Story gallery
          </button>
        </div>
      )}

      <div className="sidebar-scroll">
        <Accordion title="Find" open={section === "find"} onToggle={() => openSec("find")}>
          <div className="field">
            <label>Movie / character / person</label>
            <div className="search-row">
              <input
                type="search"
                className="search-input"
                placeholder="e.g. Scream, Athena, Mel Blanc"
                value={spec.searchQuery}
                onChange={(e) => onChange({ searchQuery: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
              {spec.searchQuery ? (
                <button
                  type="button"
                  className="ghost search-clear"
                  onClick={() => onChange({ searchQuery: "" })}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
          <div className="field">
            <label>Match mode</label>
            <ChipRow
              value={spec.searchMode}
              onChange={(searchMode) => onChange({ searchMode })}
              options={[
                { id: "highlight", label: "Highlight" },
                { id: "isolate", label: "Isolate" },
              ]}
            />
          </div>
          {searchMatch ? (
            <p className="search-hit mono">{searchSummary(searchMatch)}</p>
          ) : spec.searchQuery.trim().length >= 2 ? (
            <>
              <p className="search-miss">No matches in this construct.</p>
              {peopleHits.length > 0 ? (
                <div className="search-global">
                  <p className="search-hint">Found in other constructs:</p>
                  <ul className="search-global-list">
                    {peopleHits.map((p) => (
                      <li key={p.id}>
                        <span className="search-global-name">{p.label}</span>
                        <span className="search-global-jumps">
                          {p.constructs.slice(0, 4).map((cid) => (
                            <button
                              key={cid}
                              type="button"
                              className="ghost search-jump"
                              onClick={() =>
                                onChange({
                                  activeConstruct: cid,
                                  searchQuery: p.label,
                                  searchMode: "highlight",
                                })
                              }
                            >
                              {index.find((m) => m.id === cid)?.title ?? cid}
                            </button>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="search-hint">
              Highlight dims everything else. Isolate keeps only the matched series /
              character web.
            </p>
          )}
        </Accordion>

        <Accordion
          title="Construct"
          open={section === "construct"}
          onToggle={() => openSec("construct")}
        >
          <div className="construct-list">
            {(index.length
              ? index
              : [{ id: spec.activeConstruct, title: spec.activeConstruct, subtitle: "" }]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                className={`construct-btn ${spec.activeConstruct === m.id ? "active" : ""}`}
                onClick={() => onChange({ activeConstruct: m.id })}
              >
                <span className="title">{m.title}</span>
                {"subtitle" in m && m.subtitle ? (
                  <span className="sub">{m.subtitle}</span>
                ) : null}
              </button>
            ))}
          </div>
        </Accordion>

        <Accordion
          title="Hero form"
          open={section === "form"}
          onToggle={() => openSec("form")}
        >
          <div className="seg seg-3">
            {(
              [
                ["chord", "Chord"],
                ["bundle", "Bundle"],
                ["timeline", "Years"],
                ["scatter", "Scatter"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={spec.heroForm === id ? "active" : ""}
                onClick={() => onChange({ heroForm: id })}
              >
                {label}
              </button>
            ))}
          </div>
          {isTimeline && (
            <label className="check touch">
              <input
                type="checkbox"
                checked={spec.timelineFlip}
                onChange={(e) => onChange({ timelineFlip: e.target.checked })}
              />
              <span>Flip timeline (years ↕ · people ↔)</span>
            </label>
          )}
        </Accordion>

        <Accordion
          title="Connect"
          open={section === "connect"}
          onToggle={() => openSec("connect")}
        >
          <div className="field">
            <label>Gender</label>
            <ChipRow
              value={spec.genderFilter}
              onChange={(genderFilter) => onChange({ genderFilter })}
              options={[
                { id: "all", label: "All" },
                { id: "female", label: "Women" },
                { id: "male", label: "Men" },
                { id: "nonbinary", label: "NB" },
                { id: "unknown", label: "?" },
              ]}
            />
          </div>

          <div className="field">
            <label>
              Career window{" "}
              <span>
                {spec.yearFrom}–{spec.yearTo}
              </span>
            </label>
            <div className="dual-range">
              <input
                type="range"
                min={1920}
                max={2030}
                step={1}
                value={spec.yearFrom}
                onChange={(e) =>
                  onChange({
                    yearFrom: Math.min(Number(e.target.value), spec.yearTo - 1),
                  })
                }
              />
              <input
                type="range"
                min={1920}
                max={2030}
                step={1}
                value={spec.yearTo}
                onChange={(e) =>
                  onChange({
                    yearTo: Math.max(Number(e.target.value), spec.yearFrom + 1),
                  })
                }
              />
            </div>
          </div>

          <label className="check touch">
            <input
              type="checkbox"
              checked={spec.neighborhoodOnly}
              onChange={(e) => onChange({ neighborhoodOnly: e.target.checked })}
            />
            <span>Neighborhood only (when pinned)</span>
          </label>
          <label className="check touch">
            <input
              type="checkbox"
              checked={spec.edgeYearFilter}
              onChange={(e) => onChange({ edgeYearFilter: e.target.checked })}
            />
            <span>Filter links by career window</span>
          </label>
        </Accordion>

        <Accordion
          title="Encode"
          open={section === "encode"}
          onToggle={() => openSec("encode")}
        >
          <div className="field">
            <label>Sort people by</label>
            <ChipRow
              value={spec.sortBy}
              onChange={(sortBy) => onChange({ sortBy })}
              options={[
                { id: "strength", label: "Strength" },
                { id: "degree", label: "Neighbors" },
                { id: "prominence", label: "Votes" },
                { id: "pagerank", label: "PageRank" },
                { id: "year_peak", label: "Peak" },
                { id: "title_count", label: "Titles" },
              ]}
            />
          </div>

          <div className="field">
            <label>Color by</label>
            <ChipRow
              value={spec.colorMode}
              onChange={(colorMode) => onChange({ colorMode })}
              options={[
                { id: "auto", label: "Auto" },
                { id: "gender", label: "Gender" },
                { id: "strength", label: "Strength" },
                { id: "degree", label: "Neighbors" },
                { id: "prominence", label: "Votes" },
                { id: "pagerank", label: "PageRank" },
                { id: "acclaim_gap", label: "Acclaim gap" },
                { id: "genre", label: "Genre" },
              ]}
            />
          </div>

          <div className="field">
            <label>Line thickness by</label>
            <ChipRow
              value={spec.thicknessBy}
              onChange={(thicknessBy) => onChange({ thicknessBy })}
              options={[
                { id: "shared", label: "Shared" },
                { id: "uniform", label: "Even" },
                { id: "recency", label: "Recency" },
              ]}
            />
          </div>

          <div className="field">
            <label>People size by</label>
            <ChipRow
              value={spec.sizeBy}
              onChange={(sizeBy) => onChange({ sizeBy })}
              options={[
                { id: "strength", label: "Strength" },
                { id: "degree", label: "Neighbors" },
                { id: "prominence", label: "Votes" },
                { id: "pagerank", label: "PageRank" },
                { id: "titles", label: "Titles" },
                { id: "uniform", label: "Even" },
              ]}
            />
            <p className="control-footnote">
              Timeline career bars · chord/bundle use color + order primarily.
            </p>
          </div>

          <div className="field">
            <label>
              Labels
              {isTimeline ? <span className="field-note"> · chord/bundle</span> : null}
            </label>
            <ChipRow
              value={spec.labelMode}
              onChange={(labelMode) => onChange({ labelMode })}
              disabled={isTimeline}
              options={[
                { id: "hubs", label: "Hubs" },
                { id: "all", label: "All" },
                { id: "none", label: "None" },
              ]}
            />
          </div>
        </Accordion>

        <Accordion
          title={`Stats${spec.statMarks.length ? ` · ${spec.statMarks.length}` : ""}`}
          open={section === "stats"}
          onToggle={() => openSec("stats")}
        >
          <p className="control-footnote">
            Overlay marks on the hero (and strip). Relative to the current filtered
            cut. Core presets stay quiet; turn on more for denser readouts.
          </p>
          <div className="chip-row" style={{ marginBottom: 8 }}>
            {(
              [
                ["core", "Core"],
                ["outliers", "Outliers"],
                ["graph", "Graph"],
                ["story", "Story"],
                ["all", "All"],
                ["none", "None"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="chip"
                onClick={() => onChange({ statMarks: [...STAT_PRESETS[id]] })}
              >
                {label}
              </button>
            ))}
          </div>
          {spec.statMarks.length >= 20 ? (
            <p className="control-footnote">
              Dense overlay — try Core or Outliers if the chart feels crowded.
            </p>
          ) : null}
          {STAT_GROUPS.map((group) => {
            const ids = ALL_STAT_MARKS.filter((id) => STAT_MARK_META[id].group === group);
            if (!ids.length) return null;
            return (
              <div key={group} className="stat-mark-group">
                <div className="stat-mark-group-label mono">{group}</div>
                <div className="stat-mark-list">
                  {ids.map((id) => {
                    const meta = STAT_MARK_META[id];
                    const on = spec.statMarks.includes(id);
                    const formOk =
                      meta.forms.includes(
                        isTimeline
                          ? "timeline"
                          : spec.heroForm === "bundle"
                            ? "bundle"
                            : "chord",
                      ) || meta.forms.includes("alluvial");
                    return (
                      <label
                        key={id}
                        className={`check touch${!formOk ? " muted" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            onChange({
                              statMarks: toggleStatMark(spec.statMarks, id),
                            })
                          }
                        />
                        <span>
                          {meta.label}
                          <span className="stat-mark-hint mono">{meta.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Accordion>

        <Accordion
          title="Density"
          open={section === "density"}
          onToggle={() => openSec("density")}
        >
          {filteredCounts ? (
            <p className="density-live mono">
              Showing {filteredCounts.people}
              {poolSize != null && poolSize > 0 && poolSize < spec.topN
                ? ` of ${poolSize} in pool`
                : poolSize != null && poolSize > 0
                  ? ` (pool ${poolSize})`
                  : ""}
              {" · "}
              {filteredCounts.links} links
            </p>
          ) : null}
          <p className="control-footnote">
            Applies to hero, construct strip, and warps.
          </p>
          <div className="field">
            <label>
              Top N people <span>{spec.topN}</span>
            </label>
            <input
              type="range"
              min={10}
              max={300}
              step={5}
              value={spec.topN}
              onChange={(e) => onChange({ topN: Number(e.target.value) })}
            />
            {poolSize != null && poolSize > 0 && poolSize < spec.topN ? (
              <p className="control-footnote">
                This construct only has {poolSize} people after Connect filters —
                Top N can’t add more.
              </p>
            ) : null}
          </div>
          <div className="field">
            <label>
              Min edge weight <span>{clampedWeight}</span>
            </label>
            <input
              type="range"
              min={1}
              max={weightMax}
              value={clampedWeight}
              onChange={(e) => onChange({ minWeight: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>
              Min titles <span>{spec.minTitles}</span>
            </label>
            <input
              type="range"
              min={1}
              max={40}
              value={spec.minTitles}
              onChange={(e) => onChange({ minTitles: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>
              Min strength <span>{spec.minDegree}</span>
            </label>
            <input
              type="range"
              min={0}
              max={30}
              value={spec.minDegree}
              onChange={(e) => onChange({ minDegree: Number(e.target.value) })}
            />
          </div>
          <label className="check touch">
            <input
              type="checkbox"
              checked={spec.hideIsolates}
              onChange={(e) => onChange({ hideIsolates: e.target.checked })}
            />
            <span>Hide people with no remaining links</span>
          </label>
          <label className="check touch">
            <input
              type="checkbox"
              checked={spec.showStrip}
              onChange={(e) => onChange({ showStrip: e.target.checked })}
            />
            <span>Show construct strip</span>
          </label>
          <label className="check touch">
            <input
              type="checkbox"
              checked={spec.showWarps}
              disabled={!spec.showStrip}
              onChange={(e) => onChange({ showWarps: e.target.checked })}
            />
            <span>Show warp threads</span>
          </label>
          <div className="field">
            <label>
              Max warps <span>{spec.maxWarps}</span>
            </label>
            <input
              type="range"
              min={0}
              max={48}
              step={2}
              value={spec.maxWarps}
              disabled={!spec.showStrip || !spec.showWarps}
              onChange={(e) => onChange({ maxWarps: Number(e.target.value) })}
            />
          </div>
        </Accordion>

        <Accordion title="Page" open={section === "page"} onToggle={() => openSec("page")}>
          <div className="field">
            <label>Size</label>
            <select
              value={spec.pageSize}
              onChange={(e) =>
                onChange({ pageSize: e.target.value as PosterSpec["pageSize"] })
              }
            >
              {Object.entries(PAGE_SIZES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Theme</label>
            <div className="chip-row theme-row">
              {(["auto", "light", "dark"] as ThemePreference[]).map((t) => (
                <Chip
                  key={t}
                  active={themePreference === t}
                  onClick={() => setTheme(t)}
                >
                  {t}
                </Chip>
              ))}
            </div>
            <p className="field-hint">
              Recolors atelier chrome and the poster sheet (print/PDF still forces paper).
            </p>
          </div>
          <div className="field">
            <label>Palette</label>
            <p className="field-hint">
              Recolors people, ribbons, and gender marks. Colorblind-safe:{" "}
              <strong>Okabe</strong>, <strong>Tol Bright</strong>, <strong>Ink</strong>.
            </p>
            <div className="palette-picker" role="listbox" aria-label="Color palette">
              {PALETTE_NAMES.map((name) => {
                const meta = PALETTE_META[name];
                const active = spec.palette === name;
                return (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`palette-option${active ? " active" : ""}`}
                    onClick={() => {
                      setPalette(name);
                      onChange({ palette: name });
                    }}
                  >
                    <span className="palette-swatches" aria-hidden>
                      {meta.hues.slice(0, 6).map((h, i) => (
                        <Swatch key={i} color={h} size={9} />
                      ))}
                    </span>
                    <span className="palette-meta">
                      <span className="palette-label">{meta.label}</span>
                      <span className="palette-desc">{meta.description}</span>
                      {meta.colorblindSafe ? (
                        <span className="palette-badge mono">CB-safe</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <label className="check touch">
            <input
              type="checkbox"
              checked={spec.showCropMarks}
              onChange={(e) => onChange({ showCropMarks: e.target.checked })}
            />
            <span>Crop marks</span>
          </label>
          <label className="check touch">
            <input
              type="checkbox"
              checked={spec.showSafeGuide}
              onChange={(e) => onChange({ showSafeGuide: e.target.checked })}
            />
            <span>Safe margin guide</span>
          </label>
        </Accordion>
      </div>

      <div className="sidebar-footer">
        <div className="status">{status}</div>
        {onOpenMethodology ? (
          <button
            type="button"
            className="ghost home-link"
            onClick={onOpenMethodology}
          >
            Trust the data
          </button>
        ) : null}
        <button
          type="button"
          className="export-btn"
          onClick={onExport}
          disabled={exporting || !exportAvailable}
          title={
            exportAvailable
              ? "Export PDF via local Puppeteer"
              : "PDF export requires the local Vite atelier"
          }
        >
          {exporting ? "Exporting…" : exportAvailable ? "Export PDF" : "Export (local only)"}
        </button>
      </div>
    </aside>
  );
}
