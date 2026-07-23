/** Chart reading guide — what marks and links mean (collapsible). */

import { useEffect, useState } from "react";
import { genderColors } from "../lib/colors";
import { Swatch } from "./ui/Swatch";
import { colorLegendLabel } from "../lib/encode";
import type { ColorBy } from "../lib/types";
import { useTheme } from "../lib/theme/ThemeContext";
import {
  STAT_COLORS,
  STAT_MARK_META,
  hasStat,
  type StatMarkId,
  type ViewStatMarks,
} from "../lib/statsMarks";

interface Props {
  form: "chord" | "bundle" | "timeline" | "scatter";
  flipped?: boolean;
  colorBy?: ColorBy;
  palette?: string;
  statMarks?: ViewStatMarks | null;
}

const STORAGE_KEY = "loom-chart-legend-open";

function activeMarkIds(stats: ViewStatMarks | null | undefined, form: Props["form"]): StatMarkId[] {
  if (!stats) return [];
  const out: StatMarkId[] = [];
  for (const id of Object.keys(STAT_MARK_META) as StatMarkId[]) {
    if (!hasStat(stats, id)) continue;
    const forms = STAT_MARK_META[id].forms;
    if (forms.includes(form) || forms.includes("alluvial")) out.push(id);
  }
  return out;
}

function swatchColor(id: StatMarkId): string {
  switch (id) {
    case "top5_degree":
    case "gini_callout":
    case "rank_ladder":
      return STAT_COLORS.halo;
    case "bridge_outliers":
    case "community_cuts":
    case "genre_entropy":
      return STAT_COLORS.bridge;
    case "featured_path":
    case "longest_collab":
    case "loyalty_pair":
    case "billing_glyphs":
      return STAT_COLORS.path;
    case "median_peak":
    case "gap_spikes":
    case "mode_decade":
    case "era_histogram":
    case "span_outliers":
    case "peak_extremes":
    case "retention_meter":
    case "votes_centroid":
      return STAT_COLORS.guide;
    case "reunion_edges":
      return STAT_COLORS.reunion;
    case "top5_prominence":
    case "densest_pair":
    case "insight_sync":
      return STAT_COLORS.warm;
    default:
      return STAT_COLORS.ghost;
  }
}

function MarkIcon({ id, color }: { id: StatMarkId; color: string }) {
  const s = 10;
  switch (id) {
    case "bridge_outliers":
      return (
        <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden className="legend-mark-icon">
          <polygon points="5,1 9,5 5,9 1,5" fill={color} />
        </svg>
      );
    case "gap_spikes":
      return (
        <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden className="legend-mark-icon">
          <line x1="5" y1="1" x2="5" y2="9" stroke={color} strokeWidth="1.2" />
          <line x1="1" y1="5" x2="9" y2="5" stroke={color} strokeWidth="1.2" />
          <circle cx="5" cy="5" r="1.2" fill={color} />
        </svg>
      );
    case "top5_degree":
    case "top5_prominence":
    case "insight_sync":
      return (
        <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden className="legend-mark-icon">
          <circle cx="5" cy="5" r="3.2" fill="none" stroke={color} strokeWidth="1.2" />
        </svg>
      );
    case "median_size":
    case "median_peak":
      return (
        <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden className="legend-mark-icon">
          <circle cx="5" cy="5" r="3.5" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 1.5" />
        </svg>
      );
    default:
      return <Swatch color={color} size={8} />;
  }
}

export function ChartLegend({ form, flipped = false, colorBy, palette = "loom", statMarks = null }: Props) {
  const { theme } = useTheme();
  const genderSwatches = genderColors(palette, theme);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (saved === "0") return false;
    if (saved === "1") return true;
    return true;
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* ignore quota */
    }
  }, [open]);

  const link =
    form === "timeline"
      ? flipped
        ? "Curved links = co-appearances. Height ≈ overlap year. Thickness follows Encode."
        : "Curved links = co-appearances. Position ≈ overlap; thickness follows Encode."
      : form === "chord"
        ? "Ribbons = co-appearances. Weight follows Thickness · arc order follows Sort."
        : "Bundled lines = co-appearances. Stroke follows Thickness · clusters follow Color.";

  const node =
    form === "timeline"
      ? flipped
        ? "Vertical bar = career span (Size). Dot = peak year. Lane order follows Sort."
        : "Horizontal bar = career span (Size). Dot = peak year. Lane order follows Sort."
      : "Each mark is a person. Order follows Sort.";

  const colorRow =
    colorBy === "gender" ? (
      <div className="legend-row">
        <span className="legend-key">Color</span>
        <span className="legend-val legend-swatches">
          {(
            [
              ["female", "Women"],
              ["male", "Men"],
              ["nonbinary", "NB"],
              ["unknown", "?"],
            ] as const
          ).map(([id, label]) => (
            <span key={id} className="legend-swatch">
              <Swatch color={genderSwatches[id]} size={8} />
              {label}
            </span>
          ))}
        </span>
      </div>
    ) : colorBy === "prominence" ? (
      <div className="legend-row">
        <span className="legend-key">Color</span>
        <span className="legend-val">Darker = higher vote prominence.</span>
      </div>
    ) : colorBy === "genre" ? (
      <div className="legend-row">
        <span className="legend-key">Color</span>
        <span className="legend-val">Hue = dominant genre.</span>
      </div>
    ) : (
      <div className="legend-row">
        <span className="legend-key">Color</span>
        <span className="legend-val">Darker = higher collaboration degree.</span>
      </div>
    );

  const marks = activeMarkIds(statMarks, form);
  // Cap legend clutter — show first 8 + count
  const shown = marks.slice(0, 8);
  const extra = marks.length - shown.length;

  return (
    <div className={`chart-legend${open ? " open" : " collapsed"}`}>
      <button
        type="button"
        className="chart-legend-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="chart-legend-toggle-label">Reading guide</span>
        {!open && colorBy ? (
          <span className="chart-legend-toggle-hint mono">
            {colorLegendLabel(colorBy, palette)}
            {marks.length ? ` · ${marks.length} stats` : ""}
          </span>
        ) : null}
        <span className="chev" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <div className="chart-legend-body">
          <div className="legend-row">
            <span className="legend-key">People</span>
            <span className="legend-val">{node}</span>
          </div>
          <div className="legend-row">
            <span className="legend-key">Links</span>
            <span className="legend-val">{link}</span>
          </div>
          {colorRow}
          {shown.length ? (
            <div className="legend-row">
              <span className="legend-key">Stats</span>
              <span className="legend-val legend-stats">
                {shown.map((id) => (
                  <span key={id} className="legend-stat-line">
                    <MarkIcon id={id} color={swatchColor(id)} />
                    {STAT_MARK_META[id].hint}
                  </span>
                ))}
                {extra > 0 ? (
                  <span className="legend-stat-line mono">+{extra} more in Controls → Stats</span>
                ) : null}
              </span>
            </div>
          ) : null}
          <div className="legend-row">
            <span className="legend-key">Tip</span>
            <span className="legend-val">
              Hover a link for titles · click to pin · pin a person for roles.
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
