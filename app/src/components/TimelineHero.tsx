/** Interactive timeline hero — pan/zoom, career lanes, explained co-appearance arcs. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { ColorBy, Edge, Manifest, Node, SizeBy, SortBy, ThicknessBy } from "../lib/types";
import type { StatMarkId } from "../lib/types";
import { layoutTimeline } from "../viz/timeline";
import { activeEdge, activeId, neighborIds } from "../lib/selection";
import type { SelectionState } from "../lib/selection";
import { filmLine, sharedLabel, uniqueShared } from "../lib/sharedTitles";
import { edgeKey, type SearchMatch } from "../lib/search";
import { computeViewStatMarks, hasStat, isGapSpike, linkStatStyle, nodeFillOverride, nodeOpacityMod, type ViewStatMarks } from "../lib/statsMarks";
import { FONT_MONO, FONT_SANS } from "../lib/fonts";
import { driftThreadColors } from "../lib/theme/scales";
import { chartChrome } from "../lib/theme/chartChrome";
import {
  gridLineStyle,
  linkInteractionStyle,
  markOpacity,
  resolveLinkState,
} from "../lib/theme/lineStyle";
import { token } from "../lib/theme/tokens";
import { useTheme } from "../lib/theme/ThemeContext";
import { ChartDefs } from "./ChartDefs";
import { weaveGradient } from "../lib/theme/scales";
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
  sizeBy = "strength",
  statMarks = [],
  manifest = null,
  insightFocusId = null,
  viewStats: viewStatsProp = null,
}: Props) {
  const { theme, printForced } = useTheme();
  const chartTheme = printMode || printForced ? "light" : theme;
  const chrome = useMemo(() => chartChrome(chartTheme), [chartTheme]);
  const { paper: PAPER, ink: INK, inkFaint: INK_FAINT, trim: TRIM, linkHot, filmLabel, focusWash } =
    chrome;
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const zoomIdleRef = useRef(0);
  const focus = activeId(selection);
  const edgeFocus = activeEdge(selection);
  const skimId = selection.skimId ?? null;
  const skimEdge = selection.skimEdge ?? null;
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
        theme: chartTheme,
      }),
    [nodes, edges, colorBy, minWeight, printMode, flipped, palette, sortBy, thicknessBy, sizeBy, chartTheme],
  );

  const driftColors = useMemo(
    () => driftThreadColors(palette, chartTheme),
    [palette, chartTheme],
  );
  const rankColor = token("stat.halo", chartTheme);

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

  const fitToView = useCallback(() => {
    const svgEl = svgRef.current;
    const wrap = wrapRef.current;
    const zoom = zoomRef.current;
    if (!svgEl || !wrap || !zoom) return;
    const svg = d3.select(svgEl);
    const w = Math.max(1, wrap.clientWidth - 16);
    const h = Math.max(1, wrap.clientHeight - 16);
    const scale = Math.min(1.15, w / layout.width, h / layout.height);
    const tx = (wrap.clientWidth - layout.width * scale) / 2;
    const ty = Math.max(8, (wrap.clientHeight - layout.height * scale) / 2);
    svg
      .transition()
      .duration(220)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, [layout.width, layout.height]);

  const zoomBy = useCallback((factor: number) => {
    const svgEl = svgRef.current;
    const zoom = zoomRef.current;
    if (!svgEl || !zoom) return;
    d3.select(svgEl).transition().duration(160).call(zoom.scaleBy, factor);
  }, []);

  useEffect(() => {
    if (printMode || !svgRef.current || !wrapRef.current) return;
    const svgEl = svgRef.current;
    const wrap = wrapRef.current;
    const svg = d3.select(svgEl);
    const g = svg.select<SVGGElement>("g.zoom-root");
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.25, 8])
      .filter((event) => {
        // Allow wheel, mouse drag, and multi-touch pinch/pan
        if (event.type === "wheel") return true;
        if ("touches" in event) return true;
        return !(event as MouseEvent).button;
      })
      .touchable(true)
      .on("start", () => {
        window.clearTimeout(zoomIdleRef.current);
        setIsZooming(true);
      })
      .on("zoom", (event) => {
        g.attr("transform", event.transform.toString());
      })
      .on("end", () => {
        window.clearTimeout(zoomIdleRef.current);
        zoomIdleRef.current = window.setTimeout(() => setIsZooming(false), 80);
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    let lastW = 0;
    let lastH = 0;
    const applyFit = (force = false) => {
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (!force && Math.abs(cw - lastW) < 8 && Math.abs(ch - lastH) < 8) {
        return;
      }
      lastW = cw;
      lastH = ch;
      const w = Math.max(1, cw - 16);
      const h = Math.max(1, ch - 16);
      const scale = Math.min(1.15, w / layout.width, h / layout.height);
      const tx = (cw - layout.width * scale) / 2;
      const ty = Math.max(8, (ch - layout.height * scale) / 2);
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    };
    applyFit(true);

    let roTimer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(roTimer);
      roTimer = window.setTimeout(() => applyFit(false), 80);
    });
    ro.observe(wrap);
    // Chrome above the viewport (legend / status strip) changes wrap height
    const shell = wrap.closest(".timeline-shell");
    if (shell) ro.observe(shell);

    return () => {
      window.clearTimeout(roTimer);
      window.clearTimeout(zoomIdleRef.current);
      ro.disconnect();
      svg.on(".zoom", null);
      zoomRef.current = null;
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
    if (focus) op = neighbors.has(id) ? 1 : markOpacity({ state: "dim", theme: chartTheme });
    else if (search) {
      op = search.matchedNodeIds.has(id)
        ? 1
        : markOpacity({ state: "searchMiss", theme: chartTheme });
    }
    return Math.min(op, nodeOpacityMod(stats, id));
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

  const compactLabels = layout.people.length > 40 || layout.width > 1400;
  const tickYears = compactLabels
    ? layout.ticks.filter((y) => y % 10 === 0 || layout.ticks.length <= 10)
    : layout.ticks;

  const yearTicks = tickYears.map((y) => {
    const isDecade = y % 10 === 0;
    const isModeDecade =
      stats &&
      hasStat(stats, "mode_decade") &&
      stats.modeDecade != null &&
      y >= stats.modeDecade &&
      y < stats.modeDecade + 10;
    const kind = isModeDecade ? "mode" : isDecade ? "decade" : "year";
    const grid = gridLineStyle({ kind, theme: chartTheme });
    const dash = kind === "year" ? "1.5 3" : undefined;
    if (layout.flipped) {
      const yy = layout.yScale(y);
      return (
        <g key={y} transform={`translate(0,${yy})`}>
          {isModeDecade ? (
            <rect
              x={layout.padL - 8}
              y={-6}
              width={layout.width - layout.padL - layout.padR + 8}
              height={12}
              fill={chrome.modeDecade}
              fillOpacity={0.1}
            />
          ) : null}
          <line
            className={grid.className}
            x1={layout.padL - 8}
            x2={layout.width - layout.padR}
            stroke={grid.stroke}
            strokeWidth={grid.strokeWidth}
            strokeOpacity={grid.strokeOpacity}
            strokeDasharray={dash}
          />
          <text
            x={layout.padL - 12}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={isModeDecade || isDecade ? 10 : 9}
            fontWeight={isModeDecade || isDecade ? 600 : 400}
            fontFamily={FONT_MONO}
            letterSpacing={isDecade ? "-0.02em" : undefined}
            fill={isModeDecade ? chrome.modeDecade : INK_FAINT}
          >
            {y}
          </text>
        </g>
      );
    }
    return (
      <g key={y} transform={`translate(${layout.xScale(y)},0)`}>
        {isModeDecade ? (
          <rect
            x={-5}
            y={layout.padT - 8}
            width={10}
            height={layout.height - layout.padT}
            fill={chrome.modeDecade}
            fillOpacity={0.1}
          />
        ) : null}
        <line
          className={grid.className}
          y1={layout.padT - 8}
          y2={layout.height - 8}
          stroke={grid.stroke}
          strokeWidth={grid.strokeWidth}
          strokeOpacity={grid.strokeOpacity}
          strokeDasharray={dash}
        />
        <text
          y={layout.padT - 14}
          textAnchor="middle"
          fontSize={isModeDecade || isDecade ? 10 : 9}
          fontWeight={isModeDecade || isDecade ? 600 : 400}
          fontFamily={FONT_MONO}
          letterSpacing={isDecade ? "-0.02em" : undefined}
          fill={isModeDecade ? chrome.modeDecade : INK_FAINT}
        >
          {y}
        </text>
      </g>
    );
  });

  const personFill = (id: string, base: string, hot?: boolean) => {
    if (hot) return linkHot;
    return nodeFillOverride(stats, id, base, chartTheme);
  };

  const svgInner = (
    <svg
      ref={svgRef}
      className="timeline-svg"
      width="100%"
      height="100%"
      viewBox={printMode ? `0 0 ${layout.width} ${layout.height}` : undefined}
      role="img"
      aria-label={`${title} timeline`}
    >
      <g className="zoom-root">
        <ChartDefs
          theme={chartTheme}
          weaves={visibleLinks
            .map((l, i) =>
              l.fill === l.targetFill
                ? null
                : weaveGradient(
                    l.fill,
                    l.targetFill,
                    `tl-weave-${l.source}-${l.target}-${i}`,
                  ),
            )
            .filter((w): w is NonNullable<typeof w> => w != null)}
        />
        {yearTicks}

        <TimelineStatGuides layout={layout} stats={stats} />

        <g className="timeline-links">
          {visibleLinks.map((l, i) => {
            const related = !focus || l.source === focus || l.target === focus;
            const isEdge =
              !!edgeFocus &&
              ((edgeFocus.source === l.source && edgeFocus.target === l.target) ||
                (edgeFocus.source === l.target && edgeFocus.target === l.source));
            const isSkimLink =
              !isEdge &&
              !!skimEdge &&
              ((skimEdge.source === l.source && skimEdge.target === l.target) ||
                (skimEdge.source === l.target && skimEdge.target === l.source));
            const searchHot =
              !search || search.matchedEdgeKeys.has(edgeKey(l.source, l.target));
            const state = resolveLinkState({
              hot: isEdge,
              skim: isSkimLink,
              related: related && (!search || searchHot),
              hasFocus: !!focus || (!!search && !searchHot),
            });
            const films = sharedLabel(l.shared);
            const statLink = linkStatStyle(stats, l.source, l.target, l.weight, chartTheme);
            const pressure = Math.min(1, 0.55 + l.weight * 0.06);
            const paint = linkInteractionStyle({
              state: statLink?.thin ? "dim" : state,
              theme: chartTheme,
              baseWidth: l.strokeWidth,
              opacityScale: pressure,
              widthBoost: statLink?.strokeWidthBoost,
              dash: statLink?.dash,
              stroke: isEdge || isSkimLink ? undefined : statLink?.stroke,
            });
            // Hot/skim use accent; ambient keeps weave / fill color when no stat stroke
            const weaveId = `tl-weave-${l.source}-${l.target}-${i}`;
            const useGradient =
              state === "ambient" &&
              !statLink?.stroke &&
              l.fill !== l.targetFill &&
              paint.strokeOpacity > 0.2;
            const stroke =
              state === "hot" || state === "skim"
                ? paint.stroke
                : (statLink?.stroke ?? (useGradient ? `url(#${weaveId})` : l.fill));
            return (
              <path
                key={`${l.source}-${l.target}-${l.year}-${i}`}
                className={`link-enter ${paint.className}`}
                d={l.path}
                fill="none"
                stroke={stroke}
                strokeOpacity={statLink?.strokeOpacity ?? paint.strokeOpacity}
                strokeWidth={paint.strokeWidth}
                strokeDasharray={paint.strokeDasharray ?? statLink?.dash}
                strokeLinecap={paint.strokeLinecap}
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
                x={-5}
                y={-9}
                width={Math.min(220, lab.text.length * 6.2 + 12)}
                height={17}
                rx={1.5}
                fill={PAPER}
                fillOpacity={0.96}
                stroke={TRIM}
                strokeWidth={0.55}
              />
              <line
                x1={-5}
                y1={-9}
                x2={-5}
                y2={8}
                stroke={linkHot}
                strokeWidth={1.3}
                strokeOpacity={0.55}
              />
              <text x={1} y={3} fontSize={9} fontFamily={FONT_MONO} fill={filmLabel}>
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
                text={`Most shared · ${a} ↔ ${b} (${dp.sharedCount})`}
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
            const isSkim = !isFocus && skimId === p.id;
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
              const scale = p.scale ?? 1;
              const threadW = (isFocus || isSkim || hot ? 2.2 : 1.2) * scale;
              const r = (isFocus ? 4.2 : isSkim ? 3.4 : 2.6) * Math.sqrt(scale);
              return (
                <g
                  key={p.id}
                  className={`person-enter${isSkim ? " is-skim" : ""}`}
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
                  {/* Ruled thread underlayer */}
                  <line
                    x1={p.y}
                    x2={p.y}
                    y1={y0}
                    y2={y1}
                    stroke={PAPER}
                    strokeWidth={threadW + 1.4}
                    strokeLinecap="round"
                    strokeOpacity={0.9}
                  />
                  <line
                    x1={p.y}
                    x2={p.y}
                    y1={y0}
                    y2={midY}
                    stroke={drift ? driftColors.fading : fill}
                    strokeWidth={threadW}
                    strokeLinecap="round"
                    strokeOpacity={0.88}
                  />
                  <line
                    x1={p.y}
                    x2={p.y}
                    y1={midY}
                    y2={y1}
                    stroke={drift ? driftColors.rising : fill}
                    strokeWidth={threadW}
                    strokeLinecap="round"
                    strokeOpacity={0.88}
                  />
                  <circle
                    cx={p.y}
                    cy={peakY}
                    r={Math.max(r * 2.8, 14)}
                    fill="transparent"
                    stroke="none"
                  />
                  {/* Peak pin: paper halo + ink tick */}
                  {isFocus ? (
                    <circle
                      cx={p.y}
                      cy={peakY}
                      r={r + 4}
                      fill={focusWash}
                      stroke="none"
                      pointerEvents="none"
                    />
                  ) : null}
                  <circle
                    cx={p.y}
                    cy={peakY}
                    r={r + 1.6}
                    fill={PAPER}
                    stroke="none"
                    opacity={0.95}
                  />
                  <circle
                    cx={p.y}
                    cy={peakY}
                    r={r}
                    fill={fill}
                    stroke={isFocus ? linkHot : PAPER}
                    strokeWidth={isFocus ? 1.2 : isSkim ? 0.85 : 0.5}
                  />
                  <line
                    x1={p.y}
                    x2={p.y}
                    y1={peakY - r - 2.5}
                    y2={peakY - r - 0.5}
                    stroke={fill}
                    strokeWidth={1.1}
                    strokeLinecap="round"
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
                      fontFamily={FONT_MONO}
                      fill={rankColor}
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
                    fontFamily={FONT_SANS}
                    fill={INK}
                  >
                    <title>{p.label}</title>
                    {p.label.length > 18 ? p.label.slice(0, 16) + "…" : p.label}
                  </text>
                </g>
              );
            }

            const x0 = layout.xScale(p.yearMin);
            const x1 = layout.xScale(p.yearMax);
            const peakX = layout.xScale(p.yearPeak);
            const midX = (x0 + x1) / 2;
            const scale = p.scale ?? 1;
            const threadW = (isFocus || isSkim || hot ? 2.2 : 1.2) * scale;
            const r = (isFocus ? 4.2 : isSkim ? 3.4 : 2.6) * Math.sqrt(scale);
            return (
              <g
                key={p.id}
                className={`person-enter${isSkim ? " is-skim" : ""}`}
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
                  x2={x1}
                  y1={p.y}
                  y2={p.y}
                  stroke={PAPER}
                  strokeWidth={threadW + 1.4}
                  strokeLinecap="round"
                  strokeOpacity={0.9}
                />
                <line
                  x1={x0}
                  x2={midX}
                  y1={p.y}
                  y2={p.y}
                  stroke={drift ? driftColors.fading : fill}
                  strokeWidth={threadW}
                  strokeLinecap="round"
                  strokeOpacity={0.88}
                />
                <line
                  x1={midX}
                  x2={x1}
                  y1={p.y}
                  y2={p.y}
                  stroke={drift ? driftColors.rising : fill}
                  strokeWidth={threadW}
                  strokeLinecap="round"
                  strokeOpacity={0.88}
                />
                <circle
                  cx={peakX}
                  cy={p.y}
                  r={Math.max(r * 2.8, 14)}
                  fill="transparent"
                  stroke="none"
                />
                {isFocus ? (
                  <circle
                    cx={peakX}
                    cy={p.y}
                    r={r + 4}
                    fill={focusWash}
                    stroke="none"
                    pointerEvents="none"
                  />
                ) : null}
                <circle
                  cx={peakX}
                  cy={p.y}
                  r={r + 1.6}
                  fill={PAPER}
                  stroke="none"
                  opacity={0.95}
                />
                <circle
                  cx={peakX}
                  cy={p.y}
                  r={r}
                  fill={fill}
                  stroke={isFocus ? linkHot : PAPER}
                  strokeWidth={isFocus ? 1.2 : isSkim ? 0.85 : 0.5}
                />
                <line
                  x1={peakX}
                  x2={peakX}
                  y1={p.y - r - 2.5}
                  y2={p.y - r - 0.5}
                  stroke={fill}
                  strokeWidth={1.1}
                  strokeLinecap="round"
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
                    fontFamily={FONT_MONO}
                    fill={rankColor}
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
                  fontFamily={FONT_SANS}
                  fill={INK}
                >
                  <title>{p.label}</title>
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
    <div className={`timeline-shell paper-grain${isZooming ? " is-zooming" : ""}`}>
      <div className="timeline-chrome">
        <div>
          <div className="timeline-title">{title}</div>
          <div className="timeline-sub">
            {subtitle} · drag / pinch to pan &amp; zoom ·{" "}
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

      <ChartLegend form="timeline" flipped={flipped} colorBy={colorBy} palette={palette} statMarks={stats} />

      <div
        className="timeline-viewport"
        ref={wrapRef}
        onMouseLeave={() => {
          onHover(null);
          onHoverEdge(null);
        }}
      >
        {(edgeBanner || search) && (
          <div className={`status-strip status-strip--overlay${edgeBanner ? " status-strip--link" : ""}`}>
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
        {svgInner}
        <div className="timeline-zoom-controls" role="group" aria-label="Zoom controls">
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(1.35)}>
            +
          </button>
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomBy(1 / 1.35)}>
            −
          </button>
          <button type="button" aria-label="Fit to view" title="Fit" onClick={fitToView}>
            ⌂
          </button>
        </div>
      </div>
    </div>
  );
}
