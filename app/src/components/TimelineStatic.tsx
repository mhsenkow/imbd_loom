/** Static timeline SVG for poster / print (no pan-zoom chrome). */

import { useMemo } from "react";
import type {
  ColorBy,
  Edge,
  Manifest,
  Node,
  SizeBy,
  SortBy,
  StatMarkId,
  ThicknessBy,
} from "../lib/types";
import { layoutTimeline } from "../viz/timeline";
import { activeId, neighborIds } from "../lib/selection";
import type { SelectionState } from "../lib/selection";
import { edgeKey, type SearchMatch } from "../lib/search";
import {
  computeViewStatMarks,
  hasStat,
  isGapSpike,
  linkStatStyle,
  nodeFillOverride,
  nodeOpacityMod,
  type ViewStatMarks,
} from "../lib/statsMarks";
import {
  DensestPairLabel,
  GapSpikeMark,
  PersonStatDecor,
} from "./StatMarkDecor";
import { TimelineStatGuides } from "./TimelineStatGuides";

interface Props {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
  colorBy: ColorBy;
  minWeight: number;
  title: string;
  subtitle: string;
  selection?: SelectionState;
  onHover?: (id: string | null) => void;
  onPin?: (id: string) => void;
  interactive?: boolean;
  flipped?: boolean;
  search?: SearchMatch | null;
  palette?: string;
  sortBy?: SortBy;
  thicknessBy?: ThicknessBy;
  sizeBy?: SizeBy;
  statMarks?: StatMarkId[];
  manifest?: Manifest | null;
  insightFocusId?: string | null;
  viewStats?: ViewStatMarks | null;
}

export function TimelineStatic({
  nodes,
  edges,
  width,
  height,
  colorBy,
  minWeight,
  title,
  subtitle,
  selection,
  onHover,
  onPin,
  interactive = false,
  flipped = false,
  search = null,
  palette = "loom",
  sortBy = "year_peak",
  thicknessBy = "shared",
  sizeBy = "degree",
  statMarks = [],
  manifest = null,
  insightFocusId = null,
  viewStats: viewStatsProp = null,
}: Props) {
  const focus = selection ? activeId(selection) : null;
  const neighbors = useMemo(() => neighborIds(focus, edges), [focus, edges]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const stats = useMemo(() => {
    if (viewStatsProp) return viewStatsProp;
    if (!statMarks.length) return null;
    return computeViewStatMarks({
      nodes,
      edges,
      enabled: statMarks,
      manifest,
      insightFocusId,
      sortBy,
    });
  }, [viewStatsProp, statMarks, nodes, edges, manifest, insightFocusId, sortBy]);

  const layout = useMemo(() => {
    const yearSpan = (() => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const n of nodes) {
        const a = Number(n.year_min ?? n.yearMin);
        const b = Number(n.year_max ?? n.yearMax);
        if (Number.isFinite(a)) lo = Math.min(lo, a);
        if (Number.isFinite(b)) hi = Math.max(hi, b);
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return 40;
      return Math.max(20, hi - lo);
    })();
    const pad = flipped ? 80 : 160;
    const pxPerYear = Math.max(3.5, ((flipped ? height : width) - pad) / yearSpan);
    return layoutTimeline(nodes, edges, {
      colorBy,
      minWeight,
      pxPerYear,
      rowH: Math.max(
        3.5,
        Math.min(6, ((flipped ? width : height) - 40) / Math.max(nodes.length, 1)),
      ),
      flipped,
      palette,
      sortBy,
      thicknessBy,
      sizeBy,
    });
  }, [
    nodes,
    edges,
    colorBy,
    minWeight,
    width,
    height,
    flipped,
    palette,
    sortBy,
    thicknessBy,
    sizeBy,
  ]);

  if (!layout.people.length) {
    return (
      <g>
        <text x={0} y={20} fontSize={6} fill="#6e6a62" fontFamily="IBM Plex Sans, sans-serif">
          No career-year data for timeline view.
        </text>
      </g>
    );
  }

  const sx = width / layout.width;
  const sy = (height - 30) / layout.height;
  const s = Math.min(sx, sy);

  const densestLink = (() => {
    if (!stats || !hasStat(stats, "densest_pair") || !stats.densestPair) return null;
    const dp = stats.densestPair;
    return (
      layout.links.find(
        (l) =>
          (l.source === dp.source && l.target === dp.target) ||
          (l.source === dp.target && l.target === dp.source),
      ) ?? null
    );
  })();

  const longestLink = (() => {
    if (!stats || !hasStat(stats, "longest_collab") || !stats.longestCollab) return null;
    const lc = stats.longestCollab;
    return (
      layout.links.find(
        (l) =>
          (l.source === lc.source && l.target === lc.target) ||
          (l.source === lc.target && l.target === lc.source),
      ) ?? null
    );
  })();

  return (
    <g className="hero timeline-static">
      {title ? (
        <text
          x={0}
          y={14}
          fontFamily="IBM Plex Sans, sans-serif"
          fontSize={11}
          fontWeight={600}
          letterSpacing={1.5}
          fill="#1a1814"
        >
          {title.toUpperCase()}
        </text>
      ) : null}
      {subtitle || title ? (
        <text x={0} y={26} fontFamily="IBM Plex Mono, monospace" fontSize={6} fill="#6e6a62">
          {subtitle} · {layout.yearMin}–{layout.yearMax}
          {interactive ? " · hover to peek · click to pin" : ""}
          {flipped ? " · flipped" : ""}
        </text>
      ) : null}

      <g transform={`translate(0, ${title || subtitle ? 30 : 0}) scale(${s})`}>
        {layout.ticks.map((y) => {
          const isMode =
            stats &&
            hasStat(stats, "mode_decade") &&
            stats.modeDecade != null &&
            y >= stats.modeDecade &&
            y < stats.modeDecade + 10;
          return layout.flipped ? (
            <g key={y} transform={`translate(0,${layout.yScale(y)})`}>
              <line
                x1={layout.padL - 6}
                x2={layout.width - layout.padR}
                stroke={isMode ? "#3D5A80" : "#d9d0c0"}
                strokeWidth={isMode ? 1.2 : 0.5}
              />
              <text
                x={layout.padL - 8}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={8}
                fontFamily="IBM Plex Mono, monospace"
                fill={isMode ? "#3D5A80" : "#6e6a62"}
              >
                {y}
              </text>
            </g>
          ) : (
            <g key={y} transform={`translate(${layout.xScale(y)},0)`}>
              <line
                y1={layout.padT - 6}
                y2={layout.height - 4}
                stroke={isMode ? "#3D5A80" : "#d9d0c0"}
                strokeWidth={isMode ? 1.2 : 0.5}
              />
              <text
                y={layout.padT - 10}
                textAnchor="middle"
                fontSize={8}
                fontFamily="IBM Plex Mono, monospace"
                fill={isMode ? "#3D5A80" : "#6e6a62"}
              >
                {y}
              </text>
            </g>
          );
        })}

        <TimelineStatGuides layout={layout} stats={stats} compact />

        {layout.links.map((l, i) => {
          const related = !focus || l.source === focus || l.target === focus;
          const searchHot =
            !search || search.matchedEdgeKeys.has(edgeKey(l.source, l.target));
          const statLink = linkStatStyle(stats, l.source, l.target, l.weight);
          let opacity = !focus ? 0.22 : related ? 0.65 : 0.03;
          if (search && !searchHot) opacity = Math.min(opacity, 0.05);
          if (search && searchHot) opacity = Math.max(opacity, 0.7);
          if (statLink) opacity = Math.max(opacity, statLink.thin ? 0.08 : 0.85);
          const baseW = l.strokeWidth ?? 0.5 + Math.min(2, l.weight * 0.15);
          return (
            <path
              key={i}
              d={l.path}
              fill="none"
              stroke={statLink?.stroke ?? l.fill}
              strokeOpacity={opacity}
              strokeWidth={Math.max(0.25, baseW + (statLink?.strokeWidthBoost ?? 0) * 0.6)}
              strokeDasharray={statLink?.dash}
            />
          );
        })}

        {densestLink && stats?.densestPair ? (
          <DensestPairLabel
            x={layout.flipped ? densestLink.x : densestLink.x + 16}
            y={(densestLink.y1 + densestLink.y2) / 2}
            text={`Densest · ${byId.get(stats.densestPair.source)?.label ?? "?"} ↔ ${
              byId.get(stats.densestPair.target)?.label ?? "?"
            }`}
          />
        ) : null}

        {longestLink && stats?.longestCollab ? (
          <DensestPairLabel
            x={layout.flipped ? longestLink.x : longestLink.x + 16}
            y={(longestLink.y1 + longestLink.y2) / 2 + 12}
            text={`Longest · ${stats.longestCollab.years}y`}
          />
        ) : null}

        {layout.people.map((p) => {
          const related = !focus || neighbors.has(p.id);
          const isFocus = focus === p.id;
          const searchHot = !search || search.matchedNodeIds.has(p.id);
          const opacity =
            (related && searchHot ? 1 : search && !searchHot ? 0.12 : related ? 1 : 0.12) *
            nodeOpacityMod(stats, p.id);
          const fill = nodeFillOverride(stats, p.id, p.fill);
          const drift =
            stats && hasStat(stats, "genre_drift") && stats.driftIds.has(p.id);

          if (layout.flipped) {
            const peakY = layout.yScale(p.yearPeak);
            const y0 = layout.yScale(p.yearMin);
            const y1 = layout.yScale(p.yearMax);
            const midY = (y0 + y1) / 2;
            const r = isFocus ? 3 : 1.8;
            return (
              <g
                key={p.id}
                opacity={opacity}
                style={{ cursor: interactive ? "pointer" : undefined }}
                onMouseEnter={() => onHover?.(p.id)}
                onMouseLeave={() => onHover?.(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onPin?.(p.id);
                }}
              >
                <line
                  x1={p.y}
                  x2={p.y}
                  y1={y0}
                  y2={midY}
                  stroke={drift ? "#C45C26" : fill}
                  strokeWidth={(isFocus ? 2.0 : 1.0) * (p.scale ?? 1)}
                  strokeLinecap="round"
                />
                <line
                  x1={p.y}
                  x2={p.y}
                  y1={midY}
                  y2={y1}
                  stroke={drift ? "#2F5D50" : fill}
                  strokeWidth={(isFocus ? 2.0 : 1.0) * (p.scale ?? 1)}
                  strokeLinecap="round"
                />
                <circle
                  cx={p.y}
                  cy={peakY}
                  r={r}
                  fill={fill}
                  stroke="#f7f2e8"
                  strokeWidth={0.5}
                />
                {stats ? (
                  <PersonStatDecor stats={stats} id={p.id} cx={p.y} cy={peakY} baseR={r} />
                ) : null}
                {stats && isGapSpike(stats, p.id) ? (
                  <GapSpikeMark x={p.y} y={midY} flipped />
                ) : null}
              </g>
            );
          }

          const peakX = layout.xScale(p.yearPeak);
          const x0 = layout.xScale(p.yearMin);
          const x1 = layout.xScale(p.yearMax);
          const midX = (x0 + x1) / 2;
          const r = (isFocus ? 3 : 1.8) * Math.sqrt(p.scale ?? 1);
          return (
            <g
              key={p.id}
              opacity={opacity}
              style={{ cursor: interactive ? "pointer" : undefined }}
              onMouseEnter={() => onHover?.(p.id)}
              onMouseLeave={() => onHover?.(null)}
              onClick={(e) => {
                e.stopPropagation();
                onPin?.(p.id);
              }}
            >
              <line
                x1={x0}
                x2={midX}
                y1={p.y}
                y2={p.y}
                stroke={drift ? "#C45C26" : fill}
                strokeWidth={(isFocus ? 2.0 : 1.0) * (p.scale ?? 1)}
                strokeLinecap="round"
              />
              <line
                x1={midX}
                x2={x1}
                y1={p.y}
                y2={p.y}
                stroke={drift ? "#2F5D50" : fill}
                strokeWidth={(isFocus ? 2.0 : 1.0) * (p.scale ?? 1)}
                strokeLinecap="round"
              />
              <circle
                cx={peakX}
                cy={p.y}
                r={r}
                fill={fill}
                stroke="#f7f2e8"
                strokeWidth={0.5}
              />
              {stats ? (
                <PersonStatDecor stats={stats} id={p.id} cx={peakX} cy={p.y} baseR={r} />
              ) : null}
              {stats && isGapSpike(stats, p.id) ? <GapSpikeMark x={midX} y={p.y} /> : null}
              <text
                x={layout.padL - 6}
                y={p.y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={isFocus ? 9 : 7.5}
                fontWeight={isFocus ? 600 : 400}
                fontFamily="IBM Plex Sans, sans-serif"
                fill={isFocus ? "#c45c26" : "#1a1814"}
              >
                {p.label.length > 20 ? p.label.slice(0, 18) + "…" : p.label}
              </text>
            </g>
          );
        })}
      </g>
    </g>
  );
}
