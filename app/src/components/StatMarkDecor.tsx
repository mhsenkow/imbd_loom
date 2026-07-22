/** Shared SVG decorations for statistical marks. */

import {
  STAT_COLORS,
  hasStat,
  isBridge,
  isInsightFocus,
  isTop5Prominence,
  nodeStatStroke,
  type ViewStatMarks,
} from "../lib/statsMarks";

export function BridgeDiamond({
  cx,
  cy,
  r = 4.5,
}: {
  cx: number;
  cy: number;
  r?: number;
}) {
  return (
    <polygon
      points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
      fill={STAT_COLORS.bridge}
      stroke="#f7f2e8"
      strokeWidth={0.7}
      pointerEvents="none"
    >
      <title>Bridge (high betweenness)</title>
    </polygon>
  );
}

export function StatHalo({
  cx,
  cy,
  r,
  stroke,
  strokeWidth,
  dashed,
  pulse,
}: {
  cx: number;
  cy: number;
  r: number;
  stroke: string;
  strokeWidth: number;
  dashed?: boolean;
  pulse?: boolean;
}) {
  return (
    <circle
      className={pulse ? "stat-halo-pulse" : undefined}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dashed ? "3 2" : undefined}
      pointerEvents="none"
    />
  );
}

export function GapSpikeMark({
  x,
  y,
  flipped,
}: {
  x: number;
  y: number;
  flipped?: boolean;
}) {
  const s = 5;
  if (flipped) {
    return (
      <g transform={`translate(${x},${y})`} pointerEvents="none">
        <line x1={-s} x2={s} y1={0} y2={0} stroke={STAT_COLORS.guide} strokeWidth={1.4} />
        <line x1={0} x2={0} y1={-s} y2={s} stroke={STAT_COLORS.guide} strokeWidth={1.2} />
        <title>Long career gap (p95+)</title>
      </g>
    );
  }
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <line x1={0} x2={0} y1={-s} y2={s} stroke={STAT_COLORS.guide} strokeWidth={1.4} />
      <line x1={-s} x2={s} y1={0} y2={0} stroke={STAT_COLORS.guide} strokeWidth={1.2} />
      <title>Long career gap (p95+)</title>
    </g>
  );
}

export function BillingGlyph({
  cx,
  cy,
  kind,
}: {
  cx: number;
  cy: number;
  kind: "rising" | "fading";
}) {
  const fill = kind === "rising" ? STAT_COLORS.rising : STAT_COLORS.fading;
  const points =
    kind === "rising"
      ? `${cx},${cy - 5} ${cx + 4},${cy + 3} ${cx - 4},${cy + 3}`
      : `${cx},${cy + 5} ${cx + 4},${cy - 3} ${cx - 4},${cy - 3}`;
  return (
    <polygon points={points} fill={fill} stroke="#f7f2e8" strokeWidth={0.5} pointerEvents="none">
      <title>{kind === "rising" ? "Rising billing" : "Fading billing"}</title>
    </polygon>
  );
}

export function HollowDot({
  cx,
  cy,
  r,
}: {
  cx: number;
  cy: number;
  r: number;
}) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r * 0.45}
      fill="#f7f2e8"
      stroke="none"
      pointerEvents="none"
    >
      <title>One-scene wonder</title>
    </circle>
  );
}

export function PeakPin({
  x,
  y,
  label,
  flipped,
}: {
  x: number;
  y: number;
  label: string;
  flipped?: boolean;
}) {
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <circle r={3.2} fill={STAT_COLORS.guide} stroke="#f7f2e8" strokeWidth={0.8} />
      <text
        x={flipped ? 6 : 0}
        y={flipped ? 0 : -8}
        textAnchor={flipped ? "start" : "middle"}
        dominantBaseline="middle"
        fontSize={8}
        fontFamily="IBM Plex Mono, monospace"
        fill={STAT_COLORS.guide}
      >
        {label}
      </text>
    </g>
  );
}

export function MedianSizeGhost({
  cx,
  cy,
  r,
  label = "median",
}: {
  cx: number;
  cy: number;
  r: number;
  label?: string;
}) {
  return (
    <g className="stat-median-ghost" pointerEvents="none" opacity={0.85}>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={STAT_COLORS.ghost}
        strokeWidth={1.2}
        strokeDasharray="2 2"
      />
      <text
        x={cx + r + 4}
        y={cy}
        dominantBaseline="middle"
        fontSize={8}
        fontFamily="IBM Plex Mono, monospace"
        fill={STAT_COLORS.ghost}
      >
        {label}
      </text>
    </g>
  );
}

export function MedianPeakRule({
  flipped,
  x,
  y,
  x1,
  x2,
  y1,
  y2,
  year,
}: {
  flipped: boolean;
  x?: number;
  y?: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  year: number;
}) {
  if (flipped && y != null) {
    return (
      <g className="stat-median-peak" pointerEvents="none">
        <line
          x1={x1}
          x2={x2}
          y1={y}
          y2={y}
          stroke={STAT_COLORS.guide}
          strokeWidth={1.1}
          strokeDasharray="4 3"
          strokeOpacity={0.85}
        />
        <text
          x={x2 - 4}
          y={y - 4}
          textAnchor="end"
          fontSize={8}
          fontFamily="IBM Plex Mono, monospace"
          fill={STAT_COLORS.guide}
        >
          med peak {year}
        </text>
      </g>
    );
  }
  if (x == null) return null;
  return (
    <g className="stat-median-peak" pointerEvents="none">
      <line
        x1={x}
        x2={x}
        y1={y1}
        y2={y2}
        stroke={STAT_COLORS.guide}
        strokeWidth={1.1}
        strokeDasharray="4 3"
        strokeOpacity={0.85}
      />
      <text
        x={x + 4}
        y={y1 + 10}
        fontSize={8}
        fontFamily="IBM Plex Mono, monospace"
        fill={STAT_COLORS.guide}
      >
        med peak {year}
      </text>
    </g>
  );
}

export function MedianCareerBar({
  flipped,
  laneCoord,
  yearMin,
  yearMax,
  xScale,
  yScale,
  span,
}: {
  flipped: boolean;
  laneCoord: number;
  yearMin: number;
  yearMax: number;
  xScale: (y: number) => number;
  yScale: (y: number) => number;
  span: number;
}) {
  const mid = (yearMin + yearMax) / 2;
  const half = span / 2;
  if (flipped) {
    const y0 = yScale(mid - half);
    const y1 = yScale(mid + half);
    return (
      <g pointerEvents="none" opacity={0.55}>
        <line
          x1={laneCoord}
          x2={laneCoord}
          y1={y0}
          y2={y1}
          stroke={STAT_COLORS.ghost}
          strokeWidth={2.2}
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
        <title>{`Median career span ${Math.round(span)}y`}</title>
      </g>
    );
  }
  const x0 = xScale(mid - half);
  const x1 = xScale(mid + half);
  return (
    <g pointerEvents="none" opacity={0.55}>
      <line
        x1={x0}
        x2={x1}
        y1={laneCoord}
        y2={laneCoord}
        stroke={STAT_COLORS.ghost}
        strokeWidth={2.2}
        strokeDasharray="3 3"
        strokeLinecap="round"
      />
      <text
        x={x1 + 6}
        y={laneCoord}
        dominantBaseline="middle"
        fontSize={8}
        fontFamily="IBM Plex Mono, monospace"
        fill={STAT_COLORS.ghost}
      >
        med {Math.round(span)}y
      </text>
    </g>
  );
}

export function EraHistogram({
  bins,
  xScale,
  yBase,
  height = 28,
  modeDecade,
}: {
  bins: Array<{ decade: number; count: number; share: number }>;
  xScale: (y: number) => number;
  yBase: number;
  height?: number;
  modeDecade?: number | null;
}) {
  if (!bins.length) return null;
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <g className="stat-era-hist" pointerEvents="none">
      {bins.map((b) => {
        const x0 = xScale(b.decade);
        const x1 = xScale(b.decade + 10);
        const w = Math.max(2, x1 - x0 - 1);
        const h = (b.count / max) * height;
        const isMode = modeDecade != null && b.decade === modeDecade;
        return (
          <rect
            key={b.decade}
            x={x0}
            y={yBase - h}
            width={w}
            height={h}
            fill={isMode ? STAT_COLORS.guide : STAT_COLORS.ghost}
            fillOpacity={isMode ? 0.45 : 0.22}
          >
            <title>{`${b.decade}s · ${b.count} links`}</title>
          </rect>
        );
      })}
    </g>
  );
}

export function DensestPairLabel({
  x,
  y,
  text,
}: {
  x: number;
  y: number;
  text: string;
}) {
  const w = Math.min(220, text.length * 5.4 + 10);
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none" className="stat-densest-label">
      <rect
        x={-4}
        y={-9}
        width={w}
        height={16}
        rx={2}
        fill="#f7f2e8"
        fillOpacity={0.94}
        stroke={STAT_COLORS.densest}
        strokeWidth={0.7}
      />
      <text x={0} y={3} fontSize={9} fontFamily="IBM Plex Sans, sans-serif" fill={STAT_COLORS.densest}>
        {text.length > 38 ? text.slice(0, 36) + "…" : text}
      </text>
    </g>
  );
}

export function RetentionMeter({
  x,
  y,
  pct,
}: {
  x: number;
  y: number;
  pct: number;
}) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ;
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none" className="stat-retention">
      <circle r={r} fill="none" stroke="#e8e0d4" strokeWidth={3} />
      <circle
        r={r}
        fill="none"
        stroke={STAT_COLORS.guide}
        strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90)"
      />
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8}
        fontFamily="IBM Plex Mono, monospace"
        fill={STAT_COLORS.guide}
      >
        {Math.round(pct)}%
      </text>
      <text
        y={r + 12}
        textAnchor="middle"
        fontSize={7}
        fontFamily="IBM Plex Mono, monospace"
        fill={STAT_COLORS.ghost}
      >
        kept
      </text>
    </g>
  );
}

export function GiniCallout({
  x,
  y,
  gini,
  top10Share,
}: {
  x: number;
  y: number;
  gini: number;
  top10Share: number | null;
}) {
  const text =
    top10Share != null
      ? `Gini ${gini.toFixed(2)} · top 10% hold ${Math.round(top10Share * 100)}% of links`
      : `Gini ${gini.toFixed(2)}`;
  return (
    <DensestPairLabel x={x} y={y} text={text} />
  );
}

export function PersonStatDecor({
  stats,
  id,
  cx,
  cy,
  baseR,
}: {
  stats: ViewStatMarks;
  id: string;
  cx: number;
  cy: number;
  baseR: number;
}) {
  const stroke = nodeStatStroke(stats, id);
  const rising = hasStat(stats, "billing_glyphs") && stats.risingIds.has(id);
  const fading = hasStat(stats, "billing_glyphs") && stats.fadingIds.has(id);
  const hollow = hasStat(stats, "one_scene_wonder") && stats.oneSceneIds.has(id);
  const entropy = hasStat(stats, "genre_entropy") && stats.highEntropyIds.has(id);
  return (
    <g className="person-stat-decor" pointerEvents="none">
      {stroke ? (
        <StatHalo
          cx={cx}
          cy={cy}
          r={baseR + stroke.strokeWidth + 1.5}
          stroke={stroke.stroke}
          strokeWidth={stroke.strokeWidth}
          dashed={stroke.dashed}
          pulse={isInsightFocus(stats, id)}
        />
      ) : null}
      {entropy ? (
        <circle
          cx={cx}
          cy={cy}
          r={baseR + 3.5}
          fill="none"
          stroke={STAT_COLORS.community}
          strokeWidth={1}
          strokeDasharray="1 2"
        />
      ) : null}
      {isBridge(stats, id) ? (
        <BridgeDiamond cx={cx} cy={cy} r={Math.max(3.5, baseR * 0.9)} />
      ) : null}
      {hollow ? <HollowDot cx={cx} cy={cy} r={baseR} /> : null}
      {rising ? <BillingGlyph cx={cx + baseR + 5} cy={cy - 2} kind="rising" /> : null}
      {fading ? <BillingGlyph cx={cx + baseR + 5} cy={cy - 2} kind="fading" /> : null}
      {isTop5Prominence(stats, id) && !stroke ? (
        <StatHalo
          cx={cx}
          cy={cy}
          r={baseR + 2.5}
          stroke={STAT_COLORS.warm}
          strokeWidth={1.5}
        />
      ) : null}
    </g>
  );
}
