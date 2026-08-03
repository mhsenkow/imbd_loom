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
import { FONT_MONO, FONT_SANS } from "../lib/fonts";
import { ChartDefs } from "./ChartDefs";
import { edgeEvidenceLabel, edgeSharedCount, isSameCharacterEdge } from "../lib/encode";
import { weaveGradient } from "../lib/theme/scales";
import { chartChrome } from "../lib/theme/chartChrome";
import {
  linkFillOpacity,
  linkInteractionStyle,
  markOpacity,
  resolveLinkState,
} from "../lib/theme/lineStyle";
import { useTheme } from "../lib/theme/ThemeContext";
import { computeViewStatMarks, hasStat, linkStatStyle, nodeFillOverride, nodeOpacityMod, showMedianSize, type ViewStatMarks } from "../lib/statsMarks";
import {
  DensestPairLabel,
  DensestPairCard,
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
  sortBy = "strength",
  thicknessBy = "shared",
  statMarks = [],
  manifest = null,
  insightFocusId = null,
  viewStats: viewStatsProp = null,
}: Props) {
  const { theme } = useTheme();
  const chrome = useMemo(() => chartChrome(theme), [theme]);
  const { paper: PAPER, ink: INK, inkFaint: INK_FAINT, inkSoft: INK_SOFT, linkHot } = chrome;
  const cx = width / 2;
  const cy = height / 2 + 8;
  const radius = Math.min(width, height) * 0.38;
  const focus = selection ? activeId(selection) : null;
  const edgeFocus = selection ? activeEdge(selection) : null;
  const skimId = selection?.skimId ?? null;
  const skimEdge = selection?.skimEdge ?? null;
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
            theme,
          })
        : null,
    [nodes, edges, radius, form, colorBy, minWeight, palette, sortBy, thicknessBy, theme],
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
            theme,
          })
        : null,
    [nodes, edges, radius, form, colorBy, minWeight, palette, sortBy, thicknessBy, theme],
  );

  const isEdge = (sourceId: string, targetId: string) =>
    !!edgeFocus &&
    ((edgeFocus.source === sourceId && edgeFocus.target === targetId) ||
      (edgeFocus.source === targetId && edgeFocus.target === sourceId));

  const isSkimLink = (sourceId: string, targetId: string) =>
    !edgeFocus &&
    !!skimEdge &&
    ((skimEdge.source === sourceId && skimEdge.target === targetId) ||
      (skimEdge.source === targetId && skimEdge.target === sourceId));

  const densestInsight = useMemo(() => {
    if (!stats || !hasStat(stats, "densest_pair") || !stats.densestPair) return null;
    const dp = stats.densestPair;
    const a = byId.get(dp.source)?.label ?? "?";
    const b = byId.get(dp.target)?.label ?? "?";
    return { ...dp, sourceLabel: a, targetLabel: b };
  }, [stats, byId]);

  return (
    <g className="hero">
      <text
        x={0}
        y={14}
        fontFamily={FONT_SANS}
        fontSize={11}
        fontWeight={600}
        letterSpacing={1.5}
        fill={INK}
      >
        {title.toUpperCase()}
      </text>
      <text x={0} y={26} fontFamily={FONT_MONO} fontSize={6} fill={INK_FAINT}>
        {subtitle}
        {interactive
          ? manifest?.id === "same_character"
            ? " · links = shared character names · hover / click a link"
            : " · links = shared titles · hover / click a link"
          : ""}
      </text>

      <g transform={`translate(${cx}, ${cy})`}>
        {chord && (
          <>
            <ChartDefs
              theme={theme}
              weaves={chord.ribbons
                .map((r, i) =>
                  r.fill === r.targetFill
                    ? null
                    : {
                        ...weaveGradient(
                          r.fill,
                          r.targetFill,
                          `weave-${r.sourceId}-${r.targetId}-${i}`,
                          "horizontal",
                        ),
                      },
                )
                .filter((w): w is NonNullable<typeof w> => w != null)}
            />
            <g className="ribbons">
              {chord.ribbons.map((r, i) => {
                const related =
                  !focus ||
                  ((r.sourceId === focus || r.targetId === focus) &&
                    neighbors.has(r.sourceId) &&
                    neighbors.has(r.targetId));
                const hot = isEdge(r.sourceId, r.targetId);
                const skim = isSkimLink(r.sourceId, r.targetId);
                const searchHot =
                  !search ||
                  search.matchedEdgeKeys.has(edgeKey(r.sourceId, r.targetId));
                const state = resolveLinkState({
                  hot,
                  skim,
                  related: related && searchHot,
                  hasFocus: !!focus || (!!search && !searchHot),
                });
                const statLink = linkStatStyle(
                  stats,
                  r.sourceId,
                  r.targetId,
                  r.value,
                  theme,
                );
                let fillOpacity = linkFillOpacity(
                  statLink?.thin ? "dim" : state,
                  theme,
                );
                if (statLink && !statLink.thin) {
                  fillOpacity = Math.max(fillOpacity, statLink.strokeOpacity ?? 0.88);
                }
                const weaveId = `weave-${r.sourceId}-${r.targetId}-${i}`;
                const useGradient =
                  !hot &&
                  !skim &&
                  !(search && searchHot) &&
                  !statLink &&
                  r.fill !== r.targetFill;
                const fill =
                  hot || skim
                    ? linkHot
                    : search && searchHot
                      ? linkHot
                      : (statLink?.stroke ?? (useGradient ? `url(#${weaveId})` : r.fill));
                return (
                  <path
                    key={i}
                    className={resolveLinkState({ hot, skim, related, hasFocus: !!focus }) === "skim" || skim ? "loom-link is-skim" : "loom-link"}
                    d={r.path}
                    fill={fill}
                    fillOpacity={fillOpacity}
                    stroke={statLink?.dash && state === "ambient" ? statLink.stroke : "none"}
                    strokeWidth={statLink?.dash && state === "ambient" ? 0.6 : 0}
                    strokeDasharray={statLink?.dash && state === "ambient" ? statLink.dash : undefined}
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
                      {r.edge && isSameCharacterEdge(r.edge)
                        ? `${r.sourceLabel} ↔ ${r.targetLabel}: ${edgeEvidenceLabel(r.edge)}${
                            edgeSharedCount(r.edge) > 1
                              ? ` · ${edgeSharedCount(r.edge)} shared character names`
                              : ""
                          }`
                        : `${r.sourceLabel} ↔ ${r.targetLabel}: ${
                            r.edge ? edgeSharedCount(r.edge) : r.value
                          } shared title(s) · weighted tie score ${r.edge?.weight ?? r.value}${
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
                const isSkim = !isFocus && skimId === a.id;
                const searchHot = !search || search.matchedNodeIds.has(a.id);
                const lx = Math.cos(a.angle - Math.PI / 2) * (radius + 2);
                const ly = Math.sin(a.angle - Math.PI / 2) * (radius + 2);
                const nodeOp =
                  (related && searchHot
                    ? 1
                    : search && !searchHot
                      ? markOpacity({ state: "searchMiss", theme })
                      : related
                        ? 1
                        : markOpacity({ state: "dim", theme })) * nodeOpacityMod(stats, a.id);
                return (
                  <g
                    key={a.id}
                    className={isSkim ? "loom-link is-skim" : undefined}
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
                      fill={nodeFillOverride(stats, a.id, a.fill, theme)}
                      stroke={isFocus || isSkim ? linkHot : PAPER}
                      strokeWidth={isFocus ? 1.4 : isSkim ? 1 : 0.45}
                    />
                    {stats ? (
                      <PersonStatDecor
                        stats={stats}
                        id={a.id}
                        cx={lx}
                        cy={ly}
                        baseR={isFocus || isSkim ? 3.2 : 2.4}
                      />
                    ) : null}
                    {(labelMode === "all" ||
                      (labelMode === "hubs" && a.showLabel) ||
                      isFocus ||
                      isSkim) && (
                      <text
                        transform={`rotate(${(a.angle * 180) / Math.PI - 90}) translate(${radius + 4}) ${
                          a.angle > Math.PI ? "rotate(180)" : ""
                        }`}
                        textAnchor={a.angle > Math.PI ? "end" : "start"}
                        fontSize={isFocus ? 5 : 4.2}
                        fontWeight={isFocus ? 600 : 400}
                        fontFamily={FONT_SANS}
                        fill={isFocus ? linkHot : INK_SOFT}
                        dominantBaseline="middle"
                      >
                        {a.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            {densestInsight && width >= 450 ? (
              <DensestPairCard
                x={Math.min(radius + 8, width / 2 - Math.max(84, width / 2 - radius - 8))}
                y={-radius + 24}
                width={Math.max(84, width / 2 - radius - 8)}
                source={densestInsight.sourceLabel}
                target={densestInsight.targetLabel}
                sharedCount={densestInsight.sharedCount}
                weightedScore={densestInsight.weight}
                exampleTitle={densestInsight.exampleTitle}
              />
            ) : densestInsight ? (
              <DensestPairLabel
                x={-radius * 0.2}
                y={-radius - 8}
                text={`Most shared · ${densestInsight.sourceLabel} ↔ ${densestInsight.targetLabel} (${densestInsight.sharedCount})`}
              />
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
                const skim = isSkimLink(l.sourceId, l.targetId);
                const searchHot =
                  !search ||
                  search.matchedEdgeKeys.has(edgeKey(l.sourceId, l.targetId));
                const state = resolveLinkState({
                  hot,
                  skim,
                  related: related && searchHot,
                  hasFocus: !!focus || (!!search && !searchHot),
                });
                const statLink = linkStatStyle(
                  stats,
                  l.sourceId,
                  l.targetId,
                  l.weight,
                  theme,
                );
                const paint = linkInteractionStyle({
                  state: statLink?.thin ? "dim" : state,
                  theme,
                  baseWidth: l.strokeWidth,
                  widthBoost: statLink?.strokeWidthBoost,
                  dash: state === "ambient" && l.weight <= 1 ? "2 2.5" : statLink?.dash,
                  stroke: hot || skim ? undefined : statLink?.stroke,
                });
                return (
                  <path
                    key={i}
                    className={paint.className}
                    d={l.path}
                    fill="none"
                    stroke={
                      hot || skim || (search && searchHot)
                        ? linkHot
                        : (statLink?.stroke ?? l.fill)
                    }
                    strokeOpacity={statLink?.strokeOpacity ?? paint.strokeOpacity}
                    strokeWidth={paint.strokeWidth}
                    strokeDasharray={
                      hot || skim
                        ? undefined
                        : (paint.strokeDasharray ??
                          (l.weight <= 1 ? "2 2.5" : undefined))
                    }
                    strokeLinecap={paint.strokeLinecap}
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
                const isSkim = !isFocus && skimId === leaf.id;
                const searchHot = !search || search.matchedNodeIds.has(leaf.id);
                const r = isFocus ? 3.2 : isSkim ? 2.8 : 2.2;
                const nodeOp =
                  (related && searchHot
                    ? 1
                    : search && !searchHot
                      ? markOpacity({ state: "searchMiss", theme })
                      : related
                        ? 1
                        : markOpacity({ state: "dim", theme })) *
                  nodeOpacityMod(stats, leaf.id);
                return (
                  <g
                    key={leaf.id}
                    className={isSkim ? "loom-link is-skim" : undefined}
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
                      r={r + 0.9}
                      fill="none"
                      stroke={isFocus || isSkim ? linkHot : leaf.fill}
                      strokeWidth={0.45}
                      strokeOpacity={0.55}
                      strokeDasharray={isFocus || isSkim ? undefined : "1.2 1.1"}
                    />
                    <circle
                      cx={leaf.x}
                      cy={leaf.y}
                      r={r * 0.72}
                      fill={nodeFillOverride(stats, leaf.id, leaf.fill, theme)}
                      stroke={isFocus || isSkim ? linkHot : PAPER}
                      strokeWidth={isFocus ? 1 : isSkim ? 0.7 : 0.35}
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
                        fontFamily={FONT_SANS}
                        fill={isFocus ? linkHot : INK_SOFT}
                        dominantBaseline="middle"
                      >
                        {leaf.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            {densestInsight ? (
              <DensestPairLabel
                x={-radius * 0.25}
                y={-radius - 6}
                text={`Most shared · ${densestInsight.sourceLabel} ↔ ${densestInsight.targetLabel} (${densestInsight.sharedCount})`}
              />
            ) : null}
          </>
        )}

        {stats && showMedianSize(stats) ? (
          <MedianSizeGhost
            cx={radius + 28}
            cy={densestInsight && form === "chord" && width >= 450 ? -radius + 92 : -radius + 8}
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
