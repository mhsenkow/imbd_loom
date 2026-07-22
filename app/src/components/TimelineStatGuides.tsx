/** Shared guide overlays for timeline heroes (explorer + print). */

import type { TimelineLayout } from "../viz/timeline";
import {
  STAT_COLORS,
  hasStat,
  showMedianPeak,
  showMedianSize,
  type ViewStatMarks,
} from "../lib/statsMarks";
import {
  EraHistogram,
  GiniCallout,
  MedianCareerBar,
  MedianPeakRule,
  MedianSizeGhost,
  PeakPin,
  RetentionMeter,
} from "./StatMarkDecor";

interface Props {
  layout: TimelineLayout;
  stats: ViewStatMarks | null;
  /** Compact print sizing */
  compact?: boolean;
}

export function TimelineStatGuides({ layout, stats, compact = false }: Props) {
  if (!stats) return null;

  return (
    <g className="timeline-stat-guides" pointerEvents="none">
      {hasStat(stats, "era_histogram") && !layout.flipped && stats.eraBins.length ? (
        <EraHistogram
          bins={stats.eraBins}
          xScale={layout.xScale}
          yBase={layout.height - (compact ? 2 : 4)}
          height={compact ? 14 : 26}
          modeDecade={hasStat(stats, "mode_decade") ? stats.modeDecade : null}
        />
      ) : null}

      {showMedianPeak(stats) && stats.medianPeakYear != null ? (
        <MedianPeakRule
          flipped={layout.flipped}
          x={layout.flipped ? undefined : layout.xScale(stats.medianPeakYear)}
          y={layout.flipped ? layout.yScale(stats.medianPeakYear) : undefined}
          x1={layout.padL - (compact ? 6 : 8)}
          x2={layout.width - layout.padR}
          y1={layout.padT - (compact ? 6 : 8)}
          y2={layout.height - (compact ? 4 : 8)}
          year={Math.round(stats.medianPeakYear)}
        />
      ) : null}

      {hasStat(stats, "votes_centroid") &&
      stats.votesCentroidYear != null &&
      !layout.flipped ? (
        <g className="stat-votes-centroid">
          <line
            x1={layout.xScale(stats.votesCentroidYear)}
            x2={layout.xScale(stats.votesCentroidYear)}
            y1={layout.padT - 8}
            y2={layout.height - 8}
            stroke={STAT_COLORS.warm}
            strokeWidth={1.4}
            strokeOpacity={0.75}
          />
          <text
            x={layout.xScale(stats.votesCentroidYear) + 4}
            y={layout.padT + (compact ? 8 : 22)}
            fontSize={compact ? 6 : 8}
            fontFamily="IBM Plex Mono, monospace"
            fill={STAT_COLORS.warm}
          >
            votes ⌀ {Math.round(stats.votesCentroidYear)}
          </text>
        </g>
      ) : null}

      {hasStat(stats, "median_career") &&
      stats.medianCareerSpan != null &&
      layout.people.length ? (
        <MedianCareerBar
          flipped={layout.flipped}
          laneCoord={
            layout.flipped
              ? layout.people[Math.floor(layout.people.length / 2)].y
              : layout.height - (compact ? 22 : 36)
          }
          yearMin={layout.yearMin}
          yearMax={layout.yearMax}
          xScale={layout.xScale}
          yScale={layout.yScale}
          span={stats.medianCareerSpan}
        />
      ) : null}

      {hasStat(stats, "peak_extremes") && !layout.flipped
        ? layout.people
            .filter(
              (p) => p.id === stats.earliestPeakId || p.id === stats.latestPeakId,
            )
            .map((p) => (
              <PeakPin
                key={`peak-${p.id}`}
                x={layout.xScale(p.yearPeak)}
                y={p.y}
                label={p.id === stats.earliestPeakId ? "earliest" : "latest"}
              />
            ))
        : null}

      {showMedianSize(stats) ? (
        <MedianSizeGhost
          cx={
            layout.flipped
              ? layout.padL + 14
              : layout.width - layout.padR - (compact ? 36 : 40)
          }
          cy={layout.flipped ? layout.height - 20 : layout.padT + (compact ? 10 : 14)}
          r={compact ? 1.8 : 2.8}
          label={
            stats.medianDegreeValue != null
              ? `median deg ${Math.round(stats.medianDegreeValue)}`
              : "median"
          }
        />
      ) : null}

      {hasStat(stats, "retention_meter") && stats.retentionPct != null ? (
        <RetentionMeter
          x={
            layout.flipped
              ? layout.width - 36
              : layout.width - layout.padR - (compact ? 16 : 20)
          }
          y={layout.flipped ? 40 : layout.height - (compact ? 28 : 40)}
          pct={stats.retentionPct}
        />
      ) : null}

      {hasStat(stats, "gini_callout") && stats.gini != null ? (
        <GiniCallout
          x={layout.padL + (compact ? 4 : 8)}
          y={layout.height - (compact ? 12 : 20)}
          gini={stats.gini}
          top10Share={stats.top10Share}
        />
      ) : null}
    </g>
  );
}
