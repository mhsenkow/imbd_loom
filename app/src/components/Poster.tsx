/** Full mm-sized poster SVG: hero + alluvials + legend + crop marks. */

import { useMemo } from "react";
import type { ConstructData, Edge, Manifest, Node, PosterSpec } from "../lib/types";
import { bands } from "../lib/geometry";
import { GENDER_COLORS } from "../lib/types";
import { HeroViz } from "./HeroViz";
import { TimelineStatic } from "./TimelineStatic";
import { AlluvialPanel } from "./AlluvialPanel";
import type { SelectionState } from "../lib/selection";
import type { SearchMatch } from "../lib/search";

interface Props {
  spec: PosterSpec;
  active: ConstructData;
  all: Record<string, ConstructData>;
  index: Manifest[];
  selection?: SelectionState;
  onHover?: (id: string | null) => void;
  onHoverEdge?: (edge: Edge | null) => void;
  onPinEdge?: (edge: Edge | null) => void;
  onPin?: (id: string) => void;
  interactive?: boolean;
  filteredNodes?: Node[];
  filteredEdges?: Edge[];
  colorBy?: "gender" | "degree";
  search?: SearchMatch | null;
}

export function Poster({
  spec,
  active,
  all,
  index,
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

  // Sub-view strip: up to 4 other constructs (or including active)
  const stripIds = useMemo(() => {
    const ids = index.map((m) => m.id);
    const others = ids.filter((id) => id !== active.manifest.id && all[id]);
    const pick = others.slice(0, 4);
    if (pick.length < 4 && all[active.manifest.id]) {
      return [active.manifest.id, ...pick].slice(0, 4);
    }
    return pick.length ? pick : ids.filter((id) => all[id]).slice(0, 4);
  }, [index, active.manifest.id, all]);

  const panelW = (layout.strip.w - 6 * (stripIds.length - 1)) / Math.max(1, stripIds.length);
  const panelH = layout.strip.h;

  return (
    <svg
      className="poster"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${layout.w} ${layout.h}`}
      width={`${layout.w}mm`}
      height={`${layout.h}mm`}
    >
      {/* Paper */}
      <rect width={layout.w} height={layout.h} fill="#f7f2e8" />

      {/* Trim guide (subtle) */}
      <rect
        x={layout.bleed}
        y={layout.bleed}
        width={layout.trimW}
        height={layout.trimH}
        fill="none"
        stroke="#e0d8c8"
        strokeWidth={0.2}
      />

      {spec.showSafeGuide && (
        <rect
          x={layout.bleed + layout.safe}
          y={layout.bleed + layout.safe}
          width={layout.trimW - layout.safe * 2}
          height={layout.trimH - layout.safe * 2}
          fill="none"
          stroke="#c45c2644"
          strokeWidth={0.3}
          strokeDasharray="2 2"
        />
      )}

      {/* Masthead */}
      <g transform={`translate(${layout.content.x}, ${layout.content.y})`}>
        <text
          fontFamily="IBM Plex Sans, sans-serif"
          fontSize={16}
          fontWeight={600}
          letterSpacing={3}
          fill="#1a1814"
        >
          IMDb LOOM
        </text>
        <text
          x={layout.content.w}
          textAnchor="end"
          fontFamily="IBM Plex Mono, monospace"
          fontSize={5}
          fill="#6e6a62"
          y={6}
        >
          actors woven across constructs · non-commercial data
        </text>
        <line
          x1={0}
          y1={12}
          x2={layout.content.w}
          y2={12}
          stroke="#1a1814"
          strokeWidth={0.4}
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
          />
        )}
      </g>

      {/* Sub-view strip label */}
      <text
        x={layout.strip.x}
        y={layout.strip.y - 2}
        fontFamily="IBM Plex Mono, monospace"
        fontSize={4.5}
        fill="#6e6a62"
        letterSpacing={1}
      >
        CONSTRUCT THREADS
      </text>

      {/* Alluvial strip */}
      <g transform={`translate(${layout.strip.x}, ${layout.strip.y})`}>
        {stripIds.map((id, i) => {
          const data = all[id];
          if (!data) return null;
          return (
            <AlluvialPanel
              key={id}
              x={i * (panelW + 6)}
              y={0}
              width={panelW}
              height={panelH}
              stages={data.stages}
              title={data.manifest.title}
              palette={spec.palette}
            />
          );
        })}
      </g>

      {/* Footer: legend + method + credit */}
      <g transform={`translate(${layout.footer.x}, ${layout.footer.y + 4})`}>
        <Legend colorBy={colorBy} />
        <text
          y={28}
          fontFamily="IBM Plex Mono, monospace"
          fontSize={4.5}
          fill="#6e6a62"
          letterSpacing={0.8}
        >
          METHOD
        </text>
        {wrapText(active.manifest.method_note + (active.manifest.gender_method ? ` Gender method: ${active.manifest.gender_method}.` : ""), 110).map(
          (line, i) => (
            <text
              key={i}
              y={36 + i * 6}
              fontFamily="IBM Plex Sans, sans-serif"
              fontSize={5}
              fill="#3a3630"
            >
              {line}
            </text>
          ),
        )}
        <text
          x={layout.footer.w}
          y={28}
          textAnchor="end"
          fontFamily="IBM Plex Mono, monospace"
          fontSize={4.2}
          fill="#6e6a62"
        >
          {layout.label} · bleed {layout.bleed} mm · {nodes.length} nodes · {edges.length} edges
        </text>
        <text
          x={layout.footer.w}
          y={36}
          textAnchor="end"
          fontFamily="IBM Plex Mono, monospace"
          fontSize={4}
          fill="#6e6a62"
        >
          Built {active.manifest.built_at?.slice(0, 10)}
        </text>
        {wrapText(active.manifest.data_credit, 55).map((line, i) => (
          <text
            key={`c${i}`}
            x={layout.footer.w}
            y={44 + i * 5.5}
            textAnchor="end"
            fontFamily="IBM Plex Mono, monospace"
            fontSize={3.8}
            fill="#8a857c"
          >
            {line}
          </text>
        ))}

        {spec.annotations.map((a) => (
          <g key={a.id}>
            <circle cx={a.x - layout.footer.x} cy={a.y - layout.footer.y} r={1.2} fill="#c45c26" />
            <text
              x={a.x - layout.footer.x + 3}
              y={a.y - layout.footer.y + 1}
              fontSize={4.5}
              fontFamily="IBM Plex Sans, sans-serif"
              fill="#c45c26"
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

function Legend({ colorBy }: { colorBy: "gender" | "degree" }) {
  if (colorBy === "gender") {
    const items = Object.entries(GENDER_COLORS);
    return (
      <g>
        <text fontSize={5} fontFamily="IBM Plex Mono, monospace" fill="#6e6a62" letterSpacing={1}>
          COLOR = GENDER
        </text>
        {items.map(([k, c], i) => (
          <g key={k} transform={`translate(${i * 42}, 8)`}>
            <rect width={5} height={5} fill={c} />
            <text x={7} y={4.2} fontSize={4.5} fontFamily="IBM Plex Sans, sans-serif" fill="#3a3630">
              {k}
            </text>
          </g>
        ))}
      </g>
    );
  }
  return (
    <g>
      <text fontSize={5} fontFamily="IBM Plex Mono, monospace" fill="#6e6a62" letterSpacing={1}>
        COLOR = COLLABORATION DEGREE
      </text>
      <defs>
        <linearGradient id="degGrad" x1="0" x2="1">
          <stop offset="0%" stopColor="#F7F2E8" />
          <stop offset="100%" stopColor="#C45C26" />
        </linearGradient>
      </defs>
      <rect x={0} y={7} width={80} height={5} fill="url(#degGrad)" stroke="#cfc6b4" strokeWidth={0.2} />
      <text x={0} y={18} fontSize={4} fontFamily="IBM Plex Mono, monospace" fill="#6e6a62">
        low
      </text>
      <text x={80} y={18} textAnchor="end" fontSize={4} fontFamily="IBM Plex Mono, monospace" fill="#6e6a62">
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
    <g className="crop-marks" stroke="#1a1814" strokeWidth={0.25}>
      {marks.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
    </g>
  );
}
