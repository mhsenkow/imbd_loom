/** Authoring sidebar — collapsible, touch-friendly controls. */

import { useState, type ReactNode } from "react";
import type { Manifest, PosterSpec } from "../lib/types";
import { PALETTES } from "../lib/types";
import { PAGE_SIZES } from "../lib/geometry";
import type { SearchMatch } from "../lib/search";
import { searchSummary } from "../lib/search";

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
  searchMatch?: SearchMatch | null;
  filteredCounts?: { people: number; links: number };
}

type Section = "find" | "construct" | "form" | "connect" | "density" | "page";

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
  searchMatch = null,
  filteredCounts,
}: Props) {
  const [section, setSection] = useState<Section | null>("find");
  const openSec = (k: Section) => setSection((s) => (s === k ? null : k));
  const isTimeline = spec.heroForm === "timeline";

  if (!open) {
    return (
      <aside className="panel-rail left">
        <button
          type="button"
          className="rail-btn"
          onClick={onToggle}
          aria-label="Open controls"
          title="Controls"
        >
          <span className="rail-icon">☰</span>
          <span className="rail-label">Controls</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar panel-open">
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
        >
          ✕
        </button>
      </div>

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
            <p className="search-miss">No matches in this construct.</p>
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

          <div className="field">
            <label>
              Sort people by
              {isTimeline ? <span className="field-note"> · chord/bundle</span> : null}
            </label>
            <ChipRow
              value={spec.sortBy}
              onChange={(sortBy) => onChange({ sortBy })}
              disabled={isTimeline}
              options={[
                { id: "degree", label: "Degree" },
                { id: "prominence", label: "Votes" },
                { id: "year_peak", label: "Peak yr" },
                { id: "title_count", label: "Titles" },
              ]}
            />
            {isTimeline ? (
              <p className="control-footnote">Timeline lanes order by peak year.</p>
            ) : null}
          </div>

          <div className="field">
            <label>Color by</label>
            <ChipRow
              value={spec.colorMode}
              onChange={(colorMode) => onChange({ colorMode })}
              options={[
                { id: "auto", label: "Auto" },
                { id: "gender", label: "Gender" },
                { id: "degree", label: "Degree" },
              ]}
            />
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
            {isTimeline ? (
              <p className="control-footnote">Timeline always labels people lanes.</p>
            ) : null}
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
          title="Density"
          open={section === "density"}
          onToggle={() => openSec("density")}
        >
          {filteredCounts ? (
            <p className="density-live mono">
              After filters: {filteredCounts.people} people · {filteredCounts.links} links
            </p>
          ) : null}
          <div className="field">
            <label>
              Top N people <span>{spec.topN}</span>
            </label>
            <input
              type="range"
              min={40}
              max={300}
              step={10}
              value={spec.topN}
              onChange={(e) => onChange({ topN: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>
              Min edge weight <span>{spec.minWeight}</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={spec.minWeight}
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
              max={20}
              value={spec.minTitles}
              onChange={(e) => onChange({ minTitles: Number(e.target.value) })}
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
            <label>Palette</label>
            <select
              value={spec.palette}
              onChange={(e) => onChange({ palette: e.target.value })}
            >
              {Object.keys(PALETTES).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
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
