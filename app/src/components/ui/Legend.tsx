/**
 * Legend composing ChartLegend + live palette swatches for the active encoding.
 */

import { genderColors } from "../../lib/colors";
import { ChartLegend } from "../ChartLegend";
import { Swatch } from "./Swatch";
import { colorLegendLabel } from "../../lib/encode";
import type { ColorBy } from "../../lib/types";
import { PALETTE_META, type PaletteName } from "../../lib/theme/tokens";
import { sequentialLow } from "../../lib/theme/scales";
import type { ViewStatMarks } from "../../lib/statsMarks";
import { useTheme } from "../../lib/theme/ThemeContext";

interface Props {
  form: "chord" | "bundle" | "timeline";
  flipped?: boolean;
  colorBy?: ColorBy;
  palette?: string;
  statMarks?: ViewStatMarks | null;
}

export function Legend({
  form,
  flipped,
  colorBy,
  palette = "loom",
  statMarks,
}: Props) {
  const { theme } = useTheme();
  const meta = PALETTE_META[palette as PaletteName] ?? PALETTE_META.loom;
  const encoding = colorBy ? colorLegendLabel(colorBy, palette) : null;
  const genders = genderColors(palette, theme);

  return (
    <div className="legend-compose">
      {encoding ? (
        <div className="legend-palette-row" aria-label={`${encoding} · ${meta.label}`}>
          <span className="mono legend-palette-name">
            {encoding} · {meta.label}
          </span>
          {colorBy === "gender" ? (
            <span className="legend-swatches">
              {(["female", "male", "nonbinary", "unknown"] as const).map((g) => (
                <Swatch key={g} color={genders[g]} size={8} title={g} />
              ))}
            </span>
          ) : colorBy === "genre" ? (
            <span className="legend-swatches">
              {meta.hues.slice(0, 6).map((h, i) => (
                <Swatch key={i} color={h} size={8} />
              ))}
            </span>
          ) : (
            <span className="legend-swatches legend-seq">
              <Swatch color={sequentialLow(palette, "light")} size={8} />
              <span className="legend-seq-bar" style={{
                background: `linear-gradient(90deg, ${sequentialLow(palette, "light")}, ${meta.hues[0]})`,
              }} />
              <Swatch color={meta.hues[0]} size={8} />
            </span>
          )}
        </div>
      ) : null}
      <ChartLegend
        form={form}
        flipped={flipped}
        colorBy={colorBy}
        palette={palette}
        statMarks={statMarks}
      />
    </div>
  );
}
