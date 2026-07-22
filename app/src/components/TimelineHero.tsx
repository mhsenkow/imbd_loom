/** Interactive timeline hero — pan/zoom, career lanes, explained co-appearance arcs. */

import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";
import type { ColorBy, Edge, Manifest, Node, SizeBy, SortBy, ThicknessBy } from "../lib/types";
import type { StatMarkId } from "../lib/types";
import { layoutTimeline } from "../viz/timeline";
import { activeEdge, activeId, neighborIds } from "../lib/selection";
import type { SelectionState } from "../lib/selection";
import { filmLine, sharedLabel, uniqueShared } from "../lib/sharedTitles";
import { edgeKey, type SearchMatch } from "../lib/search";
import { computeViewStatMarks, hasStat, isGapSpike, linkStatStyle, nodeFillOverride, nodeOpacityMod, type ViewStatMarks } from "../lib/statsMarks";
import { ChartLegend } from "./ChartLegend";
import {
  DensestPairLabel,
  GapSpikeMark,
  PersonStatDecor,
} from "./StatMarkDecor";
import { TimelineStatGuides } from "./TimelineStatGuides";

interface Props {
  nodes: Node[];
  edges: Edge[];
  colorBy: ColorBy;
  minWeight: number;
  title: string;
  subtitle: string;
  selection: SelectionState;
  onHover: (id: string | null) => void;
  onHoverEdge: (edge: Edge | null) => void;
  onPinEdge: (edge: Edge | null) => void;
  onPin: (id: string) => void;
  printMode?: boolean;
  flipped?: boolean;
  search?: SearchMatch | null;
  palette?: string;
  sortBy?: SortBy;
  thicknessBy?: ThicknessBy;
  sizeBy?: SizeBy;
  /** Statistical overlay toggles */
  statMarks?: StatMarkId[];
  manifest?: Manifest | null;
  /** Insight card primary focus — for insight_sync */
  insightFocusId?: string | null;
  /** Precomputed stats (optional; computed if omitted) */
  viewStats?: ViewStatMarks | null;
}

export function TimelineHero({
  nodes,
  edges,
  colorBy,
  minWeight,
  title,
  subtitle,
  selection,
  onHover,
  onHoverEdge,
  onPinEdge,
  onPin,
  printMode = false,
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const focus = activeId(selection);
  const edgeFocus = activeEdge(selection);
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

  const layout = useMemo(
    () =>
      layoutTimeline(nodes, edges, {
        colorBy,
        minWeight,
        pxPerYear: printMode ? 10 : 16,
        rowH: printMode ? 14 : 20,
        flipped,
        palette,
        sortBy,
        thicknessBy,
        sizeBy,
      }),
    [nodes, edges, colorBy, minWeight, printMode, flipped, palette, sortBy, thicknessBy, sizeBy],
  );

  const visibleLinks = useMemo(() => {
    let links = layout.links;
    if (search && search.matchedEdgeKeys.size) {
      // Prefer matched series links, then fill with neighborhood
      const matched = links.filter((l) =>
        search.matchedEdgeKeys.has(edgeKey(l.source, l.target)),
      );
      if (matched.length) links = matched;
    }
    if (focus) {
      return links.filter((l) => l.source === focus || l.target === focus);
    }
    const ranked = [...links].sort((a, b) => b.weight - a.weight);
    return ranked.slice(0, Math.min(180, ranked.length));
  }, [layout.links, focus, search]);

  const labeledLinks = useMemo(() => {
    return [...visibleLinks]
      .filter((l) => uniqueShared(l.shared).length > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, focus || search ? 6 : 8)
      .map((l) => {
        const film = uniqueShared(l.shared)[0];
        if (layout.flipped) {
          return {
            key: `${l.source}-${l.target}-${l.year}`,
            x: l.x,
            y: l.y1 + 14,
            text: filmLine(film),
          };
        }
        const bulge = Math.min(80, Math.abs(l.y2 - l.y1) * 0.35 + l.weight * 2);
        return {
          key: `${l.source}-${l.target}-${l.year}`,
          x: l.x + bulge * 0.55,
          y: (l.y1 + l.y2) / 2,
          text: filmLine(film),
        };
      });
  }, [visibleLinks, focus, search, layout.flipped]);

  useEffect(() => {
    if (printMode || !svgRef.current || !wrapRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>("g.zoom-root");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 6])
      .filter((event) => {
        if (event.type === "wheel") return true;
        return !(event as MouseEvent).button;
      })
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      });
    svg.call(zoom);
    const wrap = wrapRef.current;
    const fitScale = Math.min(1, (wrap.clientWidth - 16) / layout.width);
    svg.call(zoom.transform, d3.zoomIdentity.translate(8, 8).scale(fitScale));
    return () => {
      svg.on(".zoom", null);
    };
  }, [layout.width, layout.height, printMode, flipped]);

  if (!layout.people.length) {
    return (
      <div className="timeline-empty">
        No career-year data for this construct yet. Rebuild the pipeline, or try another construct.
      </div>
    );
  }

  const personOpacity = (id: string) => {
    let op = 1;
    if (focus) op = neighbors.has(id) ? 1 : 0.15;
    else if (search) op = search.matchedNodeIds.has(id) ? 1 : 0.12;
    return Math.min(op, nodeOpacityMod(stats, id));
  };

  const linkOpacity = (source: string, target: string, isEdge: boolean) => {
    if (isEdge) return 0.95;
    if (focus) {
      return source === focus || target === focus ? 0.75 : 0.03;
    }
    if (search) {
      return search.matchedEdgeKeys.has(edgeKey(source, target)) ? 0.85 : 0.04;
    }
    return 0.35;
  };

  const edgeBanner = edgeFocus
    ? (() => {
        const a = byId.get(edgeFocus.source);
        const b = byId.get(edgeFocus.target);
        const films = sharedLabel(edgeFocus.shared, 3);
        return {
          who: `${a?.label ?? "?"} ↔ ${b?.label ?? "?"}`,
          meta: `${edgeFocus.weight} shared title${edgeFocus.weight === 1 ? "" : "s"}${
            edgeFocus.year ? ` · around ${edgeFocus.year}` : ""
          }`,
          films: films || "Shared-credit titles loading — rebuild pipeline for film names.",
        };
      })()
    : null;

  const yearTicks = layout.ticks.map((y) => {
    const isModeDecade =
      stats &&
      hasStat(stats, "mode_decade") &&
      stats.modeDecade != null &&
      y >= stats.modeDecade &&
      y < stats.modeDecade + 10;
    if (layout.flipped) {
      const yy = layout.yScale(y);
      return (
        <g key={y} transform={`translate(0,${yy})`}>
          <line
            x1={layout.padL - 8}
            x2={layout.width - layout.padR}
            stroke={isModeDecade ? "#3D5A80" : "#d9d0c0"}
            strokeWidth={isModeDecade ? 1.6 : 0.6}
            strokeOpacity={isModeDecade ? 0.7 : 1}
          />
          <text
            x={layout.padL - 12}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={isModeDecade ? 11 : 10}
            fontWeight={isModeDecade ? 600 : 400}
            fontFamily="IBM Plex Mono, monospace"
            fill={isModeDecade ? "#3D5A80" : "#6e6a62"}
          >
            {y}
          </text>
        </g>
      );
    }
    return (
      <g key={y} transform={`translate(${layout.xScale(y)},0)`}>
        <line
          y1={layout.padT - 8}
          y2={layout.height - 8}
          stroke={isModeDecade ? "#3D5A80" : "#d9d0c0"}
          strokeWidth={isModeDecade ? 1.6 : 0.6}
          strokeOpacity={isModeDecade ? 0.7 : 1}
        />
        <text
          y={layout.padT - 14}
          textAnchor="middle"
          fontSize={isModeDecade ? 11 : 10}
          fontWeight={isModeDecade ? 600 : 400}
          fontFamily="IBM Plex Mono, monospace"
          fill={isModeDecade ? "#3D5A80" : "#6e6a62"}
        >
          {y}
        </text>
      </g>
    );
  });

  const personFill = (id: string, base: string, hot?: boolean) => {
    if (hot) return "#c45c26";
    return nodeFillOverride(stats, id, base);
  };

  const svgInner = (
    <svg
      ref={svgRef}
      className="timeline-svg"
      width={printMode ? "100%" : layout.width}
      height={printMode ? undefined : layout.height}
      viewBox={printMode ? `0 0 ${layout.width} ${layout.height}` : undefined}
      role="img"
      aria-label={`${title} timeline`}
    >
      <g className="zoom-root">
        {yearTicks}

        <TimelineStatGuides layout={layout} stats={stats} />

        <g className="timeline-links">
          {visibleLinks.map((l, i) => {
            const related = !focus || l.source === focus || l.target === focus;
            const isEdge =
              !!edgeFocus &&
              ((edgeFocus.source === l.source && edgeFocus.target === l.target) ||
                (edgeFocus.source === l.target && edgeFocus.target === l.source));
            const opacity = linkOpacity(l.source, l.target, isEdge);
            const films = sharedLabel(l.shared);
            const statLink = linkStatStyle(stats, l.source, l.target, l.weight);
            const baseW = (isEdge ? 0.8 : 0) + (l.strokeWidth ?? 0.8 + Math.min(3, l.weight * 0.25));
            const w = Math.max(0.35, baseW + (statLink?.strokeWidthBoost ?? 0));
            return (
              <path
                key={`${l.source}-${l.target}-${l.year}-${i}`}
                d={l.path}
                fill="none"
                stroke={isEdge ? "#c45c26" : statLink?.stroke ?? l.fill}
                strokeOpacity={statLink?.strokeOpacity ?? opacity}
                strokeWidth={w}
                strokeDasharray={statLink?.dash}
                style={{
                  pointerEvents: related || !focus ? "stroke" : "none",
                  cursor: "pointer",
                }}
                onMouseEnter={() => {
                  onHoverEdge(l.edge);
                  onHover(l.source);
                }}
                onMouseLeave={() => onHoverEdge(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onPinEdge(l.edge);
                }}
              >
                <title>
                  {`${byId.get(l.source)?.label ?? l.source} ↔ ${
                    byId.get(l.target)?.label ?? l.target
                  }\n${l.weight} shared title(s)${l.year ? ` · ~${l.year}` : ""}${
                    films ? `\n${films}` : ""
                  }`}
                </title>
              </path>
            );
          })}
        </g>

        <g className="timeline-link-labels" pointerEvents="none">
          {labeledLinks.map((lab) => (
            <g key={lab.key} transform={`translate(${lab.x}, ${lab.y})`}>
              <rect
                x={-4}
                y={-8}
                width={Math.min(220, lab.text.length * 6.2 + 8)}
                height={16}
                rx={2}
                fill="#f7f2e8"
                fillOpacity={0.92}
              />
              <text x={0} y={3} fontSize={9} fontFamily="IBM Plex Sans, sans-serif" fill="#5c3d2e">
                {lab.text.length > 36 ? lab.text.slice(0, 34) + "…" : lab.text}
              </text>
            </g>
          ))}
          {stats &&
          hasStat(stats, "densest_pair") &&
          stats.densestPair &&
          (() => {
            const dp = stats.densestPair;
            const link = visibleLinks.find(
              (l) =>
                (l.source === dp.source && l.target === dp.target) ||
                (l.source === dp.target && l.target === dp.source),
            );
            if (!link) return null;
            const a = byId.get(dp.source)?.label ?? "?";
            const b = byId.get(dp.target)?.label ?? "?";
            return (
              <DensestPairLabel
                key="densest"
                x={layout.flipped ? link.x : link.x + 24}
                y={(link.y1 + link.y2) / 2}
                text={`Densest · ${a} ↔ ${b} (${dp.weight})`}
              />
            );
          })()}
          {stats &&
          hasStat(stats, "longest_collab") &&
          stats.longestCollab &&
          (() => {
            const lc = stats.longestCollab;
            const link = visibleLinks.find(
              (l) =>
                (l.source === lc.source && l.target === lc.target) ||
                (l.source === lc.target && l.target === lc.source),
            );
            if (!link) return null;
            const a = byId.get(lc.source)?.label ?? "?";
            const b = byId.get(lc.target)?.label ?? "?";
            return (
              <DensestPairLabel
                key="longest"
                x={layout.flipped ? link.x : link.x + 24}
                y={(link.y1 + link.y2) / 2 + 18}
                text={`Longest · ${a} ↔ ${b} (${lc.years}y)`}
              />
            );
          })()}
        </g>

        <g className="timeline-people">
          {layout.people.map((p) => {
            const isFocus = focus === p.id;
            const opacity = personOpacity(p.id);
            const hot = search?.matchedNodeIds.has(p.id);
            const fill = personFill(p.id, p.fill, hot);
            const drift =
              stats && hasStat(stats, "genre_drift") && stats.driftIds.has(p.id);
            const rank =
              stats && hasStat(stats, "rank_ladder")
                ? stats.rankLadder.find((r) => r.id === p.id)
                : null;

            if (layout.flipped) {
              const y0 = layout.yScale(p.yearMin);
              const y1 = layout.yScale(p.yearMax);
              const peakY = layout.yScale(p.yearPeak);
              const midY = (y0 + y1) / 2;
              const r = (isFocus ? 4.5 : 2.8) * Math.sqrt(p.scale ?? 1);
              return (
                <g
                  key={p.id}
                  opacity={opacity}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => {
                    onHoverEdge(null);
                    onHover(p.id);
                  }}
                  onMouseLeave={() => onHover(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onHoverEdge(null);
                    onPin(p.id);
                  }}
                >
                  <line
                    x1={p.y}
                    x2={p.y}
                    y1={y0}
                    y2={midY}
                    stroke={drift ? "#C45C26" : fill}
                    strokeWidth={(isFocus || hot ? 2.4 : 1.35) * (p.scale ?? 1)}
                    strokeLinecap="round"
                    strokeOpacity={0.85}
                  />
                  <line
                    x1={p.y}
                    x2={p.y}
                    y1={midY}
                    y2={y1}
                    stroke={drift ? "#2F5D50" : fill}
                    strokeWidth={(isFocus || hot ? 2.4 : 1.35) * (p.scale ?? 1)}
                    strokeLinecap="round"
                    strokeOpacity={0.85}
                  />
                  <circle
                    cx={p.y}
                    cy={peakY}
                    r={r}
                    fill={fill}
                    stroke="#f7f2e8"
                    strokeWidth={isFocus ? 1.2 : 0.6}
                  />
                  {stats ? (
                    <PersonStatDecor stats={stats} id={p.id} cx={p.y} cy={peakY} baseR={r} />
                  ) : null}
                  {stats && isGapSpike(stats, p.id) ? (
                    <GapSpikeMark x={p.y} y={midY} flipped />
                  ) : null}
                  {rank ? (
                    <text
                      x={p.y}
                      y={layout.padT - 28}
                      textAnchor="middle"
                      fontSize={9}
                      fontFamily="IBM Plex Mono, monospace"
                      fill="#C4A35A"
                      fontWeight={600}
                    >
                      #{rank.rank}
                    </text>
                  ) : null}
                  <text
                    x={p.y}
                    y={layout.padT - 12}
                    textAnchor="start"
                    transform={`rotate(-60 ${p.y} ${layout.padT - 12})`}
                    fontSize={isFocus ? 10 : 8.5}
                    fontWeight={isFocus ? 600 : 400}
                    fontFamily="IBM Plex Sans, sans-serif"
                    fill="#1a1814"
                  >
                    {p.label.length > 18 ? p.label.slice(0, 16) + "…" : p.label}
                  </text>
                </g>
              );
            }

            const x0 = layout.xScale(p.yearMin);
            const x1 = layout.xScale(p.yearMax);
            const peakX = layout.xScale(p.yearPeak);
            const midX = (x0 + x1) / 2;
            const r = (isFocus ? 4.5 : 2.8) * Math.sqrt(p.scale ?? 1);
            return (
              <g
                key={p.id}
                opacity={opacity}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => {
                  onHoverEdge(null);
                  onHover(p.id);
                }}
                onMouseLeave={() => onHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onHoverEdge(null);
                  onPin(p.id);
                }}
              >
                <line
                  x1={x0}
                  x2={midX}
                  y1={p.y}
                  y2={p.y}
                  stroke={drift ? "#C45C26" : fill}
                  strokeWidth={(isFocus || hot ? 2.4 : 1.35) * (p.scale ?? 1)}
                  strokeLinecap="round"
                  strokeOpacity={0.85}
                />
                <line
                  x1={midX}
                  x2={x1}
                  y1={p.y}
                  y2={p.y}
                  stroke={drift ? "#2F5D50" : fill}
                  strokeWidth={(isFocus || hot ? 2.4 : 1.35) * (p.scale ?? 1)}
                  strokeLinecap="round"
                  strokeOpacity={0.85}
                />
                <circle
                  cx={peakX}
                  cy={p.y}
                  r={r}
                  fill={fill}
                  stroke="#f7f2e8"
                  strokeWidth={isFocus ? 1.2 : 0.6}
                />
                {stats ? (
                  <PersonStatDecor stats={stats} id={p.id} cx={peakX} cy={p.y} baseR={r} />
                ) : null}
                {stats && isGapSpike(stats, p.id) ? <GapSpikeMark x={midX} y={p.y} /> : null}
                {rank ? (
                  <text
                    x={4}
                    y={p.y}
                    dominantBaseline="middle"
                    fontSize={9}
                    fontFamily="IBM Plex Mono, monospace"
                    fill="#C4A35A"
                    fontWeight={600}
                  >
                    #{rank.rank}
                  </text>
                ) : null}
                <text
                  x={layout.padL - 8}
                  y={p.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={isFocus ? 11 : 9.5}
                  fontWeight={isFocus ? 600 : 400}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill="#1a1814"
                >
                  {p.label.length > 22 ? p.label.slice(0, 20) + "…" : p.label}
                </text>
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );

  if (printMode) {
    // Print uses TimelineStatic on the poster; explorer never needs this stub.
    return null;
  }

  const statsHint =
    stats && stats.enabled.size
      ? ` · ${stats.enabled.size} stats${
          stats.medianPeakYear != null ? ` · med peak ${Math.round(stats.medianPeakYear)}` : ""
        }`
      : "";

  return (
    <div className="timeline-shell">
      <div className="timeline-chrome">
        <div>
          <div className="timeline-title">{title}</div>
          <div className="timeline-sub">
            {subtitle} · drag to pan · scroll to zoom ·{" "}
            <strong>links = shared titles</strong>
            {flipped ? " · flipped" : ""}
          </div>
        </div>
        <div className="timeline-hint mono">
          {layout.yearMin}–{layout.yearMax} · {layout.people.length} people · showing{" "}
          {visibleLinks.length}
          {focus
            ? " partner links"
            : search
              ? " matched links"
              : ` strongest of ${layout.links.length}`}
          {statsHint}
        </div>
      </div>

      <ChartLegend form="timeline" flipped={flipped} colorBy={colorBy} statMarks={stats} />

      {(edgeBanner || search) && (
        <div className={`status-strip${edgeBanner ? " status-strip--link" : ""}`}>
          {edgeBanner ? (
            <>
              <div className="link-banner-who">{edgeBanner.who}</div>
              <div className="link-banner-meta mono">{edgeBanner.meta}</div>
              <div className="link-banner-films">{edgeBanner.films}</div>
            </>
          ) : search ? (
            <div className="search-banner-inline">
              Focusing {search.focusLabel ? `“${search.focusLabel}”` : `“${search.query}”`} —{" "}
              {search.matchedNodeIds.size} people, {search.matchedEdgeKeys.size} links
            </div>
          ) : null}
        </div>
      )}

      <div
        className="timeline-viewport"
        ref={wrapRef}
        onMouseLeave={() => {
          onHover(null);
          onHoverEdge(null);
        }}
      >
        {svgInner}
      </div>
    </div>
  );
}
