/** Chart reading guide — what marks and links mean. */

import { GENDER_COLORS } from "../lib/types";

interface Props {
  form: "chord" | "bundle" | "timeline";
  flipped?: boolean;
  colorBy?: "gender" | "degree";
}

export function ChartLegend({ form, flipped = false, colorBy }: Props) {
  const link =
    form === "timeline"
      ? flipped
        ? "Curved links = co-appearances. Height ≈ overlap year. Thickness = shared titles."
        : "Curved links = co-appearances on the same title. Position ≈ overlap; thickness = count."
      : form === "chord"
        ? "Ribbons = co-appearances. Thicker ribbon = more shared titles."
        : "Bundled lines = co-appearances. Stroke weight = shared-title count.";

  const node =
    form === "timeline"
      ? flipped
        ? "Vertical bar = career span. Dot = peak year."
        : "Horizontal bar = career span. Dot = peak year."
      : "Each mark is a person.";

  return (
    <div className="chart-legend">
      <div className="legend-row">
        <span className="legend-key">People</span>
        <span className="legend-val">{node}</span>
      </div>
      <div className="legend-row">
        <span className="legend-key">Links</span>
        <span className="legend-val">{link}</span>
      </div>
      {colorBy === "gender" && (
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
                <span className="swatch-dot" style={{ background: GENDER_COLORS[id] }} />
                {label}
              </span>
            ))}
          </span>
        </div>
      )}
      {colorBy === "degree" && (
        <div className="legend-row">
          <span className="legend-key">Color</span>
          <span className="legend-val">Darker = higher collaboration degree.</span>
        </div>
      )}
      <div className="legend-row">
        <span className="legend-key">Tip</span>
        <span className="legend-val">
          Hover a link for titles · click to pin · pin a person for roles.
        </span>
      </div>
    </div>
  );
}
