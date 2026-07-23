import { weaveGradientStops } from "../lib/theme/scales";
import { opacity, token, type Theme } from "../lib/theme/tokens";

export interface WeaveStop {
  id: string;
  sourceFill: string;
  targetFill: string;
  /** Gradient direction; timeline uses vertical, chord/bundle often horizontal. */
  orientation?: "vertical" | "horizontal";
}

interface Props {
  theme?: Theme;
  weaves?: WeaveStop[];
  /** Include paper-grain feTurbulence filter. */
  grain?: boolean;
  grainId?: string;
}

export function ChartDefs({
  theme = "light",
  weaves = [],
  grain = false,
  grainId = "paper-grain-filter",
}: Props) {
  const grainOpacity =
    theme === "dark" ? opacity.paperGrainDark : opacity.paperGrain;

  return (
    <defs>
      {weaves.map((w) => {
        const vertical = (w.orientation ?? "vertical") === "vertical";
        const stops = weaveGradientStops(w.sourceFill, w.targetFill);
        return (
          <linearGradient
            key={w.id}
            id={w.id}
            x1="0%"
            y1="0%"
            x2={vertical ? "0%" : "100%"}
            y2={vertical ? "100%" : "0%"}
          >
            {stops.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.stopColor} />
            ))}
          </linearGradient>
        );
      })}
      {grain ? (
        <filter id={grainId} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves={3}
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.9  0 0 0 0 0.88  0 0 0 0 0.82  0 0 0 0.4 0"
          />
          <feComposite in2="SourceGraphic" operator="in" result="grain" />
          <feBlend in="SourceGraphic" in2="grain" mode="multiply" />
        </filter>
      ) : null}
      <linearGradient id="chart-deg-grad" x1="0" x2="1">
        <stop offset="0%" stopColor={token("mark.dim", theme)} />
        <stop offset="100%" stopColor={token("mark.hub", theme)} />
      </linearGradient>
      <style>{`
        .chart-grain-layer { opacity: ${grainOpacity}; }
      `}</style>
    </defs>
  );
}
