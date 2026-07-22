/** React SVG components for chord / bundle hero visualizations. */

import { useMemo } from "react";
import type {
  ColorBy,
  Edge,
  LabelMode,
  Manifest,
  Node,
  SortBy,
  StatMarkId,
  ThicknessBy,
} from "../lib/types";
import { layoutChord } from "../viz/chord";
import { layoutBundle } from "../viz/bundle";
import { activeEdge, activeId, neighborIds, type SelectionState } from "../lib/selection";
import { edgeKey, type SearchMatch } from "../lib/search";
import { computeViewStatMarks, hasStat, linkStatStyle, nodeFillOverride, nodeOpacityMod, showMedianSize, type ViewStatMarks } from "../lib/statsMarks";
import {
  DensestPairLabel,
  GiniCallout,
  MedianSizeGhost,
  PersonStatDecor,
  RetentionMeter,
} from "./StatMarkDecor";

interface Props {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
  form: "chord" | "bundle";
  colorBy: ColorBy;
  minWeight: number;
  title: string;
  subtitle: string;
  selection?: SelectionState;
  onHover?: (id: string | null) => void;
  onHoverEdge?: (edge: Edge | null) => void;
  onPinEdge?: (edge: Edge | null) => void;
  onPin?: (id: string) => void;
  interactive?: boolean;
  labelMode?: LabelMode;
  search?: SearchMatch | null;
  palette?: string;
  sortBy?: SortBy;
  thicknessBy?: ThicknessBy;
  statMarks?: StatMarkId[];
  manifest?: Manifest | null;
  insightFocusId?: string | null;
  viewStats?: ViewStatMarks | null;
}

export function HeroViz({
  nodes,
  edges,
  width,
  height,
  form,
  colorBy,
  minWeight,
  title,
  subtitle,
  selection,
  onHover,
  onHoverEdge,
  onPinEdge,
  onPin,
  interactive = false,
  labelMode = "hubs",
  search = null,
  palette = "loom",
  sortBy = "degree",
  thicknessBy = "shared",
  statMarks = [],
  manifest = null,
  insightFocusId = null,
  viewStats: viewStatsProp = null,
}: Props) {
  const cx = width / 2;
  const cy = height / 2 + 8;
  const radius = Math.min(width, height) * 0.38;
  const focus = selection ? activeId(selection) : null;
  const edgeFocus = selection ? activeEdge(selection) : null;
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
    });
  }, [viewStatsProp, statMarks, nodes, edges, manifest, insightFocusId]);

  const chord = useMemo(
    () =>
      form === "chord"
        ? layoutChord(nodes, edges, radius, {
            colorBy,
            minWeight,
            palette,
            sortBy,
            thicknessBy,
          })
        : null,
    [nodes, edges, radius, form, colorBy, minWeight, palette, sortBy, thicknessBy],
  );

  const bundle = useMemo(
    () =>
      form === "bundle"
        ? layoutBundle(nodes, edges, radius, {
            colorBy,
            minWeight,
            palette,
            sortBy,
            thicknessBy,
          })
        : null,
    [nodes, edges, radius, form, colorBy, minWeight, palette, sortBy, thicknessBy],
  );

  const isEdge = (sourceId: string, targetId: string) =>
    !!edgeFocus &&
    ((edgeFocus.source === sourceId && edgeFocus.target === targetId) ||
      (edgeFocus.source === targetId && edgeFocus.target === sourceId));

  const densestLabel = useMemo(() => {
    if (!stats || !hasStat(stats, "densest_pair") || !stats.densestPair) return null;
    const dp = stats.densestPair;
    const a = byId.get(dp.source)?.label ?? "?";
    const b = byId.get(dp.target)?.label ?? "?";
    return `Densest · ${a} ↔ ${b} (${dp.weight})`;
  }, [stats, byId]);

  return (
    <g className="hero">
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
      <text x={0} y={26} fontFamily="IBM Plex Mono, monospace" fontSize={6} fill="#6e6a62">
        {subtitle}
        {interactive ? " · links = shared titles · hover / click a link" : ""}
      </text>

      <g transform={`translate(${cx}, ${cy})`}>
        {chord && (
          <>
            <g className="ribbons">
              {chord.ribbons.map((r, i) => {
                const related =
                  !focus ||
                  ((r.sourceId === focus || r.targetId === focus) &&
                    neighbors.has(r.sourceId) &&
                    neighbors.has(r.targetId));
                const hot = isEdge(r.sourceId, r.targetId);
                const searchHot =
                  !search ||
                  search.matchedEdgeKeys.has(edgeKey(r.sourceId, r.targetId));
                const statLink = linkStatStyle(stats, r.sourceId, r.targetId, r.value);
                let fillOpacity = !focus ? (hot ? 0.9 : 0.55) : related ? 0.9 : 0.05;
                if (search && !searchHot) fillOpacity = Math.min(fillOpacity, 0.06);
                if (search && searchHot) fillOpacity = Math.max(fillOpacity, 0.85);
                if (statLink) fillOpacity = Math.max(fillOpacity, statLink.thin ? 0.08 : 0.88);
                return (
                  <path
                    key={i}
                    d={r.path}
                    fill={
                      hot || (search && searchHot)
                        ? "#c45c26"
                        : statLink?.stroke ?? r.fill
                    }
                    fillOpacity={fillOpacity}
                    stroke={statLink?.dash ? statLink.stroke : "none"}
                    strokeWidth={statLink?.dash ? 0.6 : 0}
                    strokeDasharray={statLink?.dash}
                    style={{ cursor: interactive ? "pointer" : undefined }}
                    onMouseEnter={() => {
                      if (r.edge) onHoverEdge?.(r.edge);
                      onHover?.(r.sourceId);
                    }}
                    onMouseLeave={() => {
                      onHoverEdge?.(null);
                      onHover?.(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (r.edge) onPinEdge?.(r.edge);
                    }}
                  >
                    <title>
                      {`${r.sourceLabel} ↔ ${r.targetLabel}: ${r.value} shared title(s)${
                        r.sharedLabel ? `\n${r.sharedLabel}` : ""
                      }`}
                    </title>
                  </path>
                );
              })}
            </g>
            <g className="arcs">
              {chord.arcs.map((a) => {
                const related = !focus || neighbors.has(a.id);
                const isFocus = focus === a.id;
                const searchHot = !search || search.matchedNodeIds.has(a.id);
                const lx = Math.cos(a.angle - Math.PI / 2) * (radius + 2);
                const ly = Math.sin(a.angle - Math.PI / 2) * (radius + 2);
                const nodeOp =
                  (related && searchHot ? 1 : search && !searchHot ? 0.12 : related ? 1 : 0.14) *
                  nodeOpacityMod(stats, a.id);
                return (
                  <g
                    key={a.id}
                    opacity={nodeOp}
                    style={{ cursor: interactive ? "pointer" : undefined }}
                    onMouseEnter={() => onHover?.(a.id)}
                    onMouseLeave={() => onHover?.(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPin?.(a.id);
                    }}
                  >
                    <path
                      d={a.path}
                      fill={nodeFillOverride(stats, a.id, a.fill)}
                      stroke={isFocus ? "#c45c26" : "#f7f2e8"}
                      strokeWidth={isFocus ? 1.2 : 0.3}
                    />
                    {stats ? (
                      <PersonStatDecor
                        stats={stats}
                        id={a.id}
                        cx={lx}
                        cy={ly}
                        baseR={isFocus ? 3.2 : 2.4}
                      />
                    ) : null}
                    {(labelMode === "all" ||
                      (labelMode === "hubs" && a.showLabel) ||
                      isFocus) && (
                      <text
                        transform={`rotate(${(a.angle * 180) / Math.PI - 90}) translate(${radius + 4}) ${
                          a.angle > Math.PI ? "rotate(180)" : ""
                        }`}
                        textAnchor={a.angle > Math.PI ? "end" : "start"}
                        fontSize={isFocus ? 5 : 4.2}
                        fontWeight={isFocus ? 600 : 400}
                        fontFamily="IBM Plex Sans, sans-serif"
                        fill={isFocus ? "#c45c26" : "#3a3630"}
                        dominantBaseline="middle"
                      >
                        {a.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            {densestLabel ? (
              <DensestPairLabel x={-radius * 0.2} y={-radius - 8} text={densestLabel} />
            ) : null}
          </>
        )}

        {bundle && (
          <>
            <g className="bundle-links">
              {bundle.links.map((l, i) => {
                const related =
                  !focus || l.sourceId === focus || l.targetId === focus;
                const hot = isEdge(l.sourceId, l.targetId);
                const searchHot =
                  !search ||
                  search.matchedEdgeKeys.has(edgeKey(l.sourceId, l.targetId));
                const statLink = linkStatStyle(stats, l.sourceId, l.targetId, l.weight);
                let strokeOpacity = !focus
                  ? hot
                    ? 0.95
                    : 0.35
                  : related
                    ? 0.75
                    : 0.04;
                if (search && !searchHot) strokeOpacity = Math.min(strokeOpacity, 0.05);
                if (search && searchHot) strokeOpacity = Math.max(strokeOpacity, 0.85);
                if (statLink) strokeOpacity = Math.max(strokeOpacity, statLink.thin ? 0.08 : 0.9);
                const baseW =
                  (hot ? 0.9 : 0) + (l.strokeWidth ?? 0.4 + Math.min(2, l.weight * 0.15));
                return (
                  <path
                    key={i}
                    d={l.path}
                    fill="none"
                    stroke={
                      hot || (search && searchHot)
                        ? "#c45c26"
                        : statLink?.stroke ?? l.fill
                    }
                    strokeOpacity={strokeOpacity}
                    strokeWidth={Math.max(0.25, baseW + (statLink?.strokeWidthBoost ?? 0))}
                    strokeDasharray={statLink?.dash}
                    style={{ cursor: interactive ? "pointer" : undefined }}
                    onMouseEnter={() => {
                      onHoverEdge?.(l.edge);
                      onHover?.(l.sourceId);
                    }}
                    onMouseLeave={() => {
                      onHoverEdge?.(null);
                      onHover?.(null);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPinEdge?.(l.edge);
                    }}
                  >
                    <title>{l.title}</title>
                  </path>
                );
              })}
            </g>
            <g className="bundle-leaves">
              {bundle.leaves.map((leaf) => {
                const related = !focus || neighbors.has(leaf.id);
                const isFocus = focus === leaf.id;
                const searchHot = !search || search.matchedNodeIds.has(leaf.id);
                const r = isFocus ? 3.2 : 2.2;
                const nodeOp =
                  (related && searchHot
                    ? 1
                    : search && !searchHot
                      ? 0.12
                      : related
                        ? 1
                        : 0.14) * nodeOpacityMod(stats, leaf.id);
                return (
                  <g
                    key={leaf.id}
                    opacity={nodeOp}
                    style={{ cursor: interactive ? "pointer" : undefined }}
                    onMouseEnter={() => onHover?.(leaf.id)}
                    onMouseLeave={() => onHover?.(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPin?.(leaf.id);
                    }}
                  >
                    <circle
                      cx={leaf.x}
                      cy={leaf.y}
                      r={r}
                      fill={nodeFillOverride(stats, leaf.id, leaf.fill)}
                      stroke={isFocus ? "#c45c26" : "#f7f2e8"}
                      strokeWidth={isFocus ? 1 : 0.4}
                    />
                    {stats ? (
                      <PersonStatDecor
                        stats={stats}
                        id={leaf.id}
                        cx={leaf.x}
                        cy={leaf.y}
                        baseR={r}
                      />
                    ) : null}
                    {(labelMode === "all" ||
                      (labelMode === "hubs" && leaf.showLabel) ||
                      isFocus) && (
                      <text
                        transform={`rotate(${(leaf.angle * 180) / Math.PI - 90}) translate(${radius + 6}) ${
                          leaf.angle > Math.PI ? "rotate(180)" : ""
                        }`}
                        textAnchor={leaf.angle > Math.PI ? "end" : "start"}
                        fontSize={isFocus ? 5 : 4.2}
                        fontFamily="IBM Plex Sans, sans-serif"
                        fill={isFocus ? "#c45c26" : "#3a3630"}
                        dominantBaseline="middle"
                      >
                        {leaf.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            {densestLabel ? (
              <DensestPairLabel x={-radius * 0.25} y={-radius - 6} text={densestLabel} />
            ) : null}
          </>
        )}

        {stats && showMedianSize(stats) ? (
          <MedianSizeGhost
            cx={radius + 28}
            cy={-radius + 8}
            r={2.2}
            label={
              stats.medianDegreeValue != null
                ? `med ${Math.round(stats.medianDegreeValue)}`
                : "median"
            }
          />
        ) : null}
        {stats && hasStat(stats, "retention_meter") && stats.retentionPct != null ? (
          <RetentionMeter x={-radius - 8} y={radius - 4} pct={stats.retentionPct} />
        ) : null}
        {stats && hasStat(stats, "gini_callout") && stats.gini != null ? (
          <GiniCallout
            x={-radius * 0.3}
            y={radius + 18}
            gini={stats.gini}
            top10Share={stats.top10Share}
          />
        ) : null}
      </g>
    </g>
  );
}
