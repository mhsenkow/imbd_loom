/** Full mm-sized poster SVG: hero + alluvials + legend + crop marks. */

import { useMemo } from "react";
import type { ConstructData, Edge, Manifest, Node, PosterSpec } from "../lib/types";
import { bands } from "../lib/geometry";
import { GENDER_COLORS } from "../lib/types";
import { HeroViz } from "./HeroViz";
import { TimelineStatic } from "./TimelineStatic";
import { AlluvialPanel } from "./AlluvialPanel";
import { ConstructBridges } from "./ConstructBridges";
import type { SelectionState } from "../lib/selection";
import { activeId } from "../lib/selection";
import type { SearchMatch } from "../lib/search";
import { pickStripIds, type PersonIndexEntry } from "../lib/bridges";
import { materializeConstruct } from "../lib/filter";
import { personFacetLabels, synthesizeStages } from "../lib/stages";
import { ACCENT, FONT_MONO, FONT_SANS, INK, INK_FAINT, INK_SOFT, PAPER, TRIM } from "../lib/fonts";
import { sequentialLow } from "../lib/theme/scales";
import { LIGHT, PALETTES, token, type PaletteName } from "../lib/theme/tokens";
import { hasStat, isInsightFocus, type ViewStatMarks } from "../lib/statsMarks";

interface Props {
  spec: PosterSpec;
  active: ConstructData;
  all: Record<string, ConstructData>;
  index: Manifest[];
  peopleIndex?: PersonIndexEntry[];
  selection?: SelectionState;
  onHover?: (id: string | null) => void;
  onHoverEdge?: (edge: Edge | null) => void;
  onPinEdge?: (edge: Edge | null) => void;
  onPin?: (id: string) => void;
  interactive?: boolean;
  filteredNodes?: Node[];
  filteredEdges?: Edge[];
  colorBy?: import("../lib/types").ColorBy;
  search?: SearchMatch | null;
  viewStats?: ViewStatMarks | null;
  insightFocusId?: string | null;
}

export function Poster({
  spec,
  active,
  all,
  index,
  peopleIndex = [],
  selection,
  onHover,
  onHoverEdge,
  onPinEdge,
  onPin,
  interactive = false,
  filteredNodes,
  filteredEdges,
  colorBy: colorByProp,
  search = null,
  viewStats = null,
  insightFocusId = null,
}: Props) {
  const layout = bands(spec.pageSize);
  const colorBy =
    colorByProp ??
    (active.manifest.key_variable === "gender" ? "gender" : "degree");

  const nodes = useMemo(() => {
    if (filteredNodes) return filteredNodes;
    const sorted = [...active.nodes].sort((a, b) => b.degree - a.degree);
    return sorted.slice(0, spec.topN);
  }, [active.nodes, spec.topN, filteredNodes]);

  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(() => {
    if (filteredEdges) return filteredEdges;
    return active.edges.filter(
      (e) =>
        e.weight >= spec.minWeight &&
        nodeIds.has(e.source) &&
        nodeIds.has(e.target),
    );
  }, [active.edges, nodeIds, spec.minWeight, filteredEdges]);

  // Sub-view strip: active + companions that share people AND have usable stages
  const stripIds = useMemo(() => {
    if (!spec.showStrip) return [] as string[];
    const ids = index.map((m) => m.id).filter((id) => all[id]);
    const stageCounts: Record<string, number> = {};
    for (const id of ids) {
      const data = all[id];
      // Prefer constructs that still have people after the same density gates
      const view = data
        ? materializeConstruct(data, spec, { forStrip: true })
        : { nodes: [] as Node[], stages: [] };
      const stages =
        view.stages.length > 0
          ? view.stages
          : synthesizeStages(data?.nodes || []);
      stageCounts[id] = stages.length;
    }
    return pickStripIds(ids, active.manifest.id, peopleIndex, stageCounts, 4);
  }, [index, active.manifest.id, all, peopleIndex, spec]);

  /** Per-panel people after the same density/connect filters as the hero */
  const stripViews = useMemo(() => {
    const out: Record<string, ReturnType<typeof materializeConstruct>> = {};
    for (const id of stripIds) {
      const data = all[id];
      if (!data) continue;
      out[id] = materializeConstruct(data, spec, { forStrip: true });
    }
    return out;
  }, [stripIds, all, spec]);

  /**
   * Warps only for people who survive filters in each panel they claim —
   * so Top-N / min weight / gender / years thin the thread set too.
   */
  const bridgePeople = useMemo((): PersonIndexEntry[] => {
    if (!spec.showWarps || stripIds.length < 2) return [];
    const labelById = new Map(peopleIndex.map((p) => [p.id, p.label]));
    const membership = new Map<string, Set<string>>();
    for (const cid of stripIds) {
      const view = stripViews[cid];
      if (!view) continue;
      for (const n of view.nodes) {
        let set = membership.get(n.id);
        if (!set) {
          set = new Set();
          membership.set(n.id, set);
        }
        set.add(cid);
      }
    }
    const activeId = stripIds[0];
    const list: PersonIndexEntry[] = [];
    for (const [pid, cids] of membership) {
      if (!cids.has(activeId) || cids.size < 2) continue;
      list.push({
        id: pid,
        label: labelById.get(pid) || pid,
        constructs: [...cids],
      });
    }
    return list;
  }, [stripIds, stripViews, peopleIndex, spec.showWarps]);

  const panelGap = 6;
  const panelW =
    (layout.strip.w - panelGap * Math.max(0, stripIds.length - 1)) /
    Math.max(1, stripIds.length);
  const panelH = layout.strip.h;

  const stripTitles = stripIds.map((id) => all[id]?.manifest.title || id);
  const bridgeStats = useMemo(() => {
    const activeId0 = stripIds[0];
    if (!activeId0) return { multi: 0, full: 0 };
    let multi = 0;
    let full = 0;
    for (const p of bridgePeople) {
      const hit = stripIds.filter((id) => p.constructs.includes(id));
      if (!hit.includes(activeId0) || hit.length < 2) continue;
      multi += 1;
      if (hit.length === stripIds.length) full += 1;
    }
    return { multi, full };
  }, [bridgePeople, stripIds]);

  const focusPersonId = selection ? activeId(selection) : null;

  /** Per-panel facets for the focused person (degree/era can differ by construct). */
  const focusByPanel = useMemo(() => {
    const out: Record<
      string,
      { member: boolean; keys: Set<string>; label: string | null }
    > = {};
    for (const id of stripIds) {
      const view = stripViews[id];
      const n = view?.nodes.find((x) => x.id === focusPersonId);
      if (n) {
        const facets = personFacetLabels(n);
        out[id] = { member: true, keys: facets.keys, label: n.label };
      } else {
        out[id] = { member: false, keys: new Set(), label: null };
      }
    }
    return out;
  }, [stripIds, stripViews, focusPersonId]);

  const focusLabel = useMemo(() => {
    if (!focusPersonId) return null;
    const fromBridge = bridgePeople.find((p) => p.id === focusPersonId);
    if (fromBridge) return fromBridge.label;
    const fromHero = nodes.find((n) => n.id === focusPersonId);
    if (fromHero) return fromHero.label;
    for (const id of stripIds) {
      const n = stripViews[id]?.nodes.find((x) => x.id === focusPersonId);
      if (n) return n.label;
    }
    return focusPersonId;
  }, [focusPersonId, bridgePeople, nodes, stripIds, stripViews]);

  const focusPanelCount = useMemo(
    () => stripIds.filter((id) => focusByPanel[id]?.member).length,
    [stripIds, focusByPanel],
  );

  /** Insight-sync facets for alluvial when no hover/pin focus. */
  const insightStatKeys = useMemo(() => {
    if (!viewStats || !hasStat(viewStats, "insight_sync") || !insightFocusId) return null;
    if (focusPersonId) return null; // pin/hover already drives focusKeys
    const n = nodes.find((x) => x.id === insightFocusId);
    if (!n || !isInsightFocus(viewStats, insightFocusId)) return null;
    return personFacetLabels(n).keys;
  }, [viewStats, insightFocusId, focusPersonId, nodes]);

  return (
    <svg
      className="poster"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${layout.w} ${layout.h}`}
      width={`${layout.w}mm`}
      height={`${layout.h}mm`}
    >
      {/* Paper */}
      <rect width={layout.w} height={layout.h} fill={PAPER} />

      {/* Trim guide (subtle) */}
      <rect
        x={layout.bleed}
        y={layout.bleed}
        width={layout.trimW}
        height={layout.trimH}
        fill="none"
        stroke={TRIM}
        strokeWidth={0.2}
      />

      {spec.showSafeGuide && (
        <rect
          x={layout.bleed + layout.safe}
          y={layout.bleed + layout.safe}
          width={layout.trimW - layout.safe * 2}
          height={layout.trimH - layout.safe * 2}
          fill="none"
          stroke={token("accent.soft", "light")}
          strokeWidth={0.3}
          strokeDasharray="2 2"
        />
      )}

      {/* Masthead */}
      <g transform={`translate(${layout.content.x}, ${layout.content.y})`}>
        <text
          fontFamily={FONT_SANS}
          fontSize={18}
          fontWeight={600}
          letterSpacing={2.5}
          fill={INK}
        >
          IMDb LOOM
        </text>
        <text
          x={layout.content.w}
          textAnchor="end"
          fontFamily={FONT_MONO}
          fontSize={5}
          fill={INK_FAINT}
          y={7}
          letterSpacing={0.6}
        >
          {active.manifest.title}
        </text>
        <line
          x1={0}
          y1={12}
          x2={layout.content.w}
          y2={12}
          stroke={INK}
          strokeWidth={0.35}
        />
        <line
          x1={0}
          y1={13.2}
          x2={layout.content.w}
          y2={13.2}
          stroke={TRIM}
          strokeWidth={0.25}
        />
      </g>

      {/* Hero */}
      <g transform={`translate(${layout.hero.x}, ${layout.hero.y + 18})`}>
        {spec.heroForm === "timeline" ? (
          <TimelineStatic
            nodes={nodes}
            edges={edges}
            width={layout.hero.w}
            height={layout.hero.h - 18}
            colorBy={colorBy}
            minWeight={spec.minWeight}
            title={active.manifest.title}
            subtitle={active.manifest.subtitle}
            selection={selection}
            onHover={onHover}
            onPin={onPin}
            interactive={interactive}
            flipped={spec.timelineFlip}
            search={search}
            palette={spec.palette}
            sortBy={spec.sortBy}
            thicknessBy={spec.thicknessBy}
            sizeBy={spec.sizeBy}
            statMarks={spec.statMarks}
            manifest={active.manifest}
            insightFocusId={insightFocusId}
            viewStats={viewStats}
          />
        ) : (
          <HeroViz
            nodes={nodes}
            edges={edges}
            width={layout.hero.w}
            height={layout.hero.h - 18}
            form={spec.heroForm === "bundle" ? "bundle" : "chord"}
            colorBy={colorBy}
            minWeight={spec.minWeight}
            title={active.manifest.title}
            subtitle={active.manifest.subtitle}
            selection={selection}
            onHover={onHover}
            onHoverEdge={onHoverEdge}
            onPinEdge={onPinEdge}
            onPin={onPin}
            interactive={interactive}
            labelMode={spec.labelMode}
            search={search}
            palette={spec.palette}
            sortBy={spec.sortBy}
            thicknessBy={spec.thicknessBy}
            statMarks={spec.statMarks}
            manifest={active.manifest}
            insightFocusId={insightFocusId}
            viewStats={viewStats}
          />
        )}
      </g>

      {spec.showStrip && stripIds.length > 0 ? (
        <>
          {/* Sub-view strip label */}
          <text
            x={layout.strip.x}
            y={layout.strip.y - 2}
            fontFamily={FONT_MONO}
            fontSize={4.5}
            fill={INK_FAINT}
            letterSpacing={1}
          >
            CONSTRUCT THREADS
            <tspan fill={INK_FAINT}>
              {focusLabel
                ? `  ·  ${focusLabel} in ${focusPanelCount}/${stripIds.length} panels`
                : `  ·  ${bridgeStats.multi} people warp from this construct`}
              {!focusLabel && interactive
                ? "  ·  hover hero or a thread"
                : !focusLabel
                  ? "  ·  same filters as hero"
                  : ""}
            </tspan>
          </text>

          {/* Alluvial strip — stages rebuilt from filtered people */}
          <g transform={`translate(${layout.strip.x}, ${layout.strip.y})`}>
            {stripIds.map((id, i) => {
              const data = all[id];
              const view = stripViews[id];
              if (!data || !view) return null;
              const focus = focusByPanel[id];
              return (
                <AlluvialPanel
                  key={id}
                  x={i * (panelW + panelGap)}
                  y={0}
                  width={panelW}
                  height={panelH}
                  stages={view.stages}
                  title={data.manifest.title}
                  palette={spec.palette}
                  colorBy={colorBy}
                  focusActive={!!focusPersonId}
                  focusMember={!!focus?.member}
                  focusKeys={focus?.member ? focus.keys : null}
                  viewStats={id === active.manifest.id ? viewStats : null}
                  statKeys={
                    id === active.manifest.id && !focusPersonId ? insightStatKeys : null
                  }
                />
              );
            })}
            {spec.showWarps ? (
              <ConstructBridges
                people={bridgePeople}
                stripIds={stripIds}
                stripTitles={stripTitles}
                panelW={panelW}
                gap={panelGap}
                height={panelH}
                maxWarps={spec.maxWarps}
                focusId={focusPersonId}
                interactive={interactive}
                onHover={onHover}
                onPin={onPin}
              />
            ) : null}
          </g>
        </>
      ) : null}

      {/* Footer: legend + method + credit */}
      <g transform={`translate(${layout.footer.x}, ${layout.footer.y + 4})`}>
        <Legend colorBy={colorBy} palette={spec.palette} statCount={spec.statMarks.length} />
        <line
          x1={0}
          y1={24}
          x2={48}
          y2={24}
          stroke={TRIM}
          strokeWidth={0.3}
        />
        <text
          y={30}
          fontFamily={FONT_MONO}
          fontSize={4.2}
          fill={INK_FAINT}
          letterSpacing={1.2}
          className="plate-credit"
        >
          METHOD
        </text>
        {wrapText(active.manifest.method_note + (active.manifest.gender_method ? ` Gender method: ${active.manifest.gender_method}.` : ""), 110).map(
          (line, i) => (
            <text
              key={i}
              y={38 + i * 6}
              fontFamily={FONT_SANS}
              fontSize={5}
              fill={INK_SOFT}
            >
              {line}
            </text>
          ),
        )}
        <text
          x={layout.footer.w}
          y={30}
          textAnchor="end"
          fontFamily={FONT_MONO}
          fontSize={4}
          fill={INK_FAINT}
          letterSpacing={0.4}
          className="plate-credit"
        >
          {layout.label} · bleed {layout.bleed} mm · {nodes.length} nodes · {edges.length} edges
        </text>
        <text
          x={layout.footer.w}
          y={38}
          textAnchor="end"
          fontFamily={FONT_MONO}
          fontSize={3.8}
          fill={INK_FAINT}
        >
          Built {active.manifest.built_at?.slice(0, 10)}
        </text>
        {wrapText(active.manifest.data_credit, 55).map((line, i) => (
          <text
            key={`c${i}`}
            x={layout.footer.w}
            y={46 + i * 5.5}
            textAnchor="end"
            fontFamily={FONT_MONO}
            fontSize={3.6}
            fill={INK_FAINT}
          >
            {line}
          </text>
        ))}

        {spec.annotations.map((a) => (
          <g key={a.id}>
            <circle cx={a.x - layout.footer.x} cy={a.y - layout.footer.y} r={1.2} fill={ACCENT} />
            <text
              x={a.x - layout.footer.x + 3}
              y={a.y - layout.footer.y + 1}
              fontSize={4.5}
              fontFamily={FONT_SANS}
              fill={ACCENT}
            >
              {a.text}
            </text>
          </g>
        ))}
      </g>

      {spec.showCropMarks && <CropMarks layout={layout} />}
    </svg>
  );
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 6);
}

function Legend({
  colorBy,
  palette = "loom",
  statCount = 0,
}: {
  colorBy: import("../lib/types").ColorBy;
  palette?: string;
  statCount?: number;
}) {
  if (colorBy === "gender") {
    const items = Object.entries(GENDER_COLORS);
    return (
      <g>
        <text fontSize={5} fontFamily={FONT_MONO} fill={INK_FAINT} letterSpacing={1}>
          COLOR = GENDER
          {statCount ? `  ·  ${statCount} STAT MARKS` : ""}
        </text>
        {items.map(([k, c], i) => (
          <g key={k} transform={`translate(${i * 42}, 8)`}>
            <rect width={5} height={5} fill={c} />
            <text x={7} y={4.2} fontSize={4.5} fontFamily={FONT_SANS} fill={INK_SOFT}>
              {k}
            </text>
          </g>
        ))}
      </g>
    );
  }
  const hues = PALETTES[palette as PaletteName] ?? PALETTES.loom;
  const low = sequentialLow(palette, "light");
  const high = hues[0];
  const label =
    colorBy === "prominence"
      ? "COLOR = VOTE PROMINENCE"
      : colorBy === "genre"
        ? "COLOR = DOMINANT GENRE"
        : "COLOR = COLLABORATION DEGREE";
  return (
    <g>
      <text fontSize={5} fontFamily={FONT_MONO} fill={INK_FAINT} letterSpacing={1}>
        {label}
        {statCount ? `  ·  ${statCount} STAT MARKS` : ""}
      </text>
      <defs>
        <linearGradient id="degGrad" x1="0" x2="1">
          <stop offset="0%" stopColor={low} />
          <stop offset="100%" stopColor={high} />
        </linearGradient>
      </defs>
      <rect
        x={0}
        y={7}
        width={80}
        height={5}
        fill="url(#degGrad)"
        stroke={LIGHT.LEGEND_STROKE}
        strokeWidth={0.2}
      />
      <text x={0} y={18} fontSize={4} fontFamily={FONT_MONO} fill={INK_FAINT}>
        low
      </text>
      <text x={80} y={18} textAnchor="end" fontSize={4} fontFamily={FONT_MONO} fill={INK_FAINT}>
        high
      </text>
    </g>
  );
}

function CropMarks({
  layout,
}: {
  layout: ReturnType<typeof bands>;
}) {
  const b = layout.bleed;
  const marks: Array<[number, number, number, number]> = [
    // TL
    [0, b, b - 0.5, b],
    [b, 0, b, b - 0.5],
    // TR
    [layout.w - b + 0.5, b, layout.w, b],
    [layout.w - b, 0, layout.w - b, b - 0.5],
    // BL
    [0, layout.h - b, b - 0.5, layout.h - b],
    [b, layout.h - b + 0.5, b, layout.h],
    // BR
    [layout.w - b + 0.5, layout.h - b, layout.w, layout.h - b],
    [layout.w - b, layout.h - b + 0.5, layout.w - b, layout.h],
  ];
  return (
    <g className="crop-marks" stroke={INK} strokeWidth={0.18} strokeOpacity={0.7}>
      {marks.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
    </g>
  );
}
