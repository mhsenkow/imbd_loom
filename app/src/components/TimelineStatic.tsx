/** Static timeline SVG for poster / print (no pan-zoom chrome). */

import { useMemo } from "react";
import type { Edge, Node } from "../lib/types";
import { layoutTimeline } from "../viz/timeline";
import { activeId, neighborIds } from "../lib/selection";
import type { SelectionState } from "../lib/selection";
import { edgeKey, type SearchMatch } from "../lib/search";

interface Props {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
  colorBy: "gender" | "degree";
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
}: Props) {
  const focus = selection ? activeId(selection) : null;
  const neighbors = useMemo(() => neighborIds(focus, edges), [focus, edges]);

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
      rowH: Math.max(3.5, Math.min(6, ((flipped ? width : height) - 40) / Math.max(nodes.length, 1))),
      flipped,
      palette,
    });
  }, [nodes, edges, colorBy, minWeight, width, height, flipped, palette]);

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

  return (
    <g className="hero timeline-static">
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
        {subtitle} · {layout.yearMin}–{layout.yearMax}
        {interactive ? " · hover to peek · click to pin" : ""}
        {flipped ? " · flipped" : ""}
      </text>

      <g transform={`translate(0, 30) scale(${s})`}>
        {layout.ticks.map((y) =>
          layout.flipped ? (
            <g key={y} transform={`translate(0,${layout.yScale(y)})`}>
              <line
                x1={layout.padL - 6}
                x2={layout.width - layout.padR}
                stroke="#d9d0c0"
                strokeWidth={0.5}
              />
              <text
                x={layout.padL - 8}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={8}
                fontFamily="IBM Plex Mono, monospace"
                fill="#6e6a62"
              >
                {y}
              </text>
            </g>
          ) : (
            <g key={y} transform={`translate(${layout.xScale(y)},0)`}>
              <line
                y1={layout.padT - 6}
                y2={layout.height - 4}
                stroke="#d9d0c0"
                strokeWidth={0.5}
              />
              <text
                y={layout.padT - 10}
                textAnchor="middle"
                fontSize={8}
                fontFamily="IBM Plex Mono, monospace"
                fill="#6e6a62"
              >
                {y}
              </text>
            </g>
          ),
        )}

        {layout.links.map((l, i) => {
          const related = !focus || l.source === focus || l.target === focus;
          const searchHot =
            !search || search.matchedEdgeKeys.has(edgeKey(l.source, l.target));
          let opacity = !focus ? 0.22 : related ? 0.65 : 0.03;
          if (search && !searchHot) opacity = Math.min(opacity, 0.05);
          if (search && searchHot) opacity = Math.max(opacity, 0.7);
          return (
            <path
              key={i}
              d={l.path}
              fill="none"
              stroke={l.fill}
              strokeOpacity={opacity}
              strokeWidth={0.5 + Math.min(2, l.weight * 0.15)}
            />
          );
        })}

        {layout.people.map((p) => {
          const related = !focus || neighbors.has(p.id);
          const isFocus = focus === p.id;
          const searchHot = !search || search.matchedNodeIds.has(p.id);
          const opacity =
            related && searchHot ? 1 : search && !searchHot ? 0.12 : related ? 1 : 0.12;

          if (layout.flipped) {
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
                  y1={layout.yScale(p.yearMin)}
                  y2={layout.yScale(p.yearMax)}
                  stroke={p.fill}
                  strokeWidth={isFocus ? 2.4 : 1.2}
                  strokeLinecap="round"
                />
                <circle
                  cx={p.y}
                  cy={layout.yScale(p.yearPeak)}
                  r={isFocus ? 3 : 1.8}
                  fill={p.fill}
                  stroke="#f7f2e8"
                  strokeWidth={0.5}
                />
              </g>
            );
          }

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
                x1={layout.xScale(p.yearMin)}
                x2={layout.xScale(p.yearMax)}
                y1={p.y}
                y2={p.y}
                stroke={p.fill}
                strokeWidth={isFocus ? 2.4 : 1.2}
                strokeLinecap="round"
              />
              <circle
                cx={layout.xScale(p.yearPeak)}
                cy={p.y}
                r={isFocus ? 3 : 1.8}
                fill={p.fill}
                stroke="#f7f2e8"
                strokeWidth={0.5}
              />
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
