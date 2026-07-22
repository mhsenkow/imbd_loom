/** React SVG components for chord / bundle hero visualizations. */

import { useMemo } from "react";
import type { Edge, LabelMode, Node } from "../lib/types";
import { layoutChord } from "../viz/chord";
import { layoutBundle } from "../viz/bundle";
import { activeEdge, activeId, neighborIds, type SelectionState } from "../lib/selection";
import { edgeKey, type SearchMatch } from "../lib/search";

interface Props {
  nodes: Node[];
  edges: Edge[];
  width: number;
  height: number;
  form: "chord" | "bundle";
  colorBy: "gender" | "degree";
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
}: Props) {
  const cx = width / 2;
  const cy = height / 2 + 8;
  const radius = Math.min(width, height) * 0.38;
  const focus = selection ? activeId(selection) : null;
  const edgeFocus = selection ? activeEdge(selection) : null;
  const neighbors = useMemo(() => neighborIds(focus, edges), [focus, edges]);

  const chord = useMemo(
    () =>
      form === "chord"
        ? layoutChord(nodes, edges, radius, { colorBy, minWeight, palette })
        : null,
    [nodes, edges, radius, form, colorBy, minWeight, palette],
  );

  const bundle = useMemo(
    () =>
      form === "bundle"
        ? layoutBundle(nodes, edges, radius, { colorBy, minWeight, palette })
        : null,
    [nodes, edges, radius, form, colorBy, minWeight, palette],
  );

  const isEdge = (sourceId: string, targetId: string) =>
    !!edgeFocus &&
    ((edgeFocus.source === sourceId && edgeFocus.target === targetId) ||
      (edgeFocus.source === targetId && edgeFocus.target === sourceId));

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
                let fillOpacity = !focus ? (hot ? 0.9 : 0.55) : related ? 0.9 : 0.05;
                if (search && !searchHot) fillOpacity = Math.min(fillOpacity, 0.06);
                if (search && searchHot) fillOpacity = Math.max(fillOpacity, 0.85);
                return (
                  <path
                    key={i}
                    d={r.path}
                    fill={hot || (search && searchHot) ? "#c45c26" : r.fill}
                    fillOpacity={fillOpacity}
                    stroke="none"
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
                return (
                  <g
                    key={a.id}
                    opacity={related && searchHot ? 1 : search && !searchHot ? 0.12 : related ? 1 : 0.14}
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
                      fill={a.fill}
                      stroke={isFocus ? "#c45c26" : "#f7f2e8"}
                      strokeWidth={isFocus ? 1.2 : 0.3}
                    />
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
                let strokeOpacity = !focus
                  ? hot
                    ? 0.95
                    : 0.35
                  : related
                    ? 0.75
                    : 0.04;
                if (search && !searchHot) strokeOpacity = Math.min(strokeOpacity, 0.05);
                if (search && searchHot) strokeOpacity = Math.max(strokeOpacity, 0.85);
                return (
                  <path
                    key={i}
                    d={l.path}
                    fill="none"
                    stroke={hot || (search && searchHot) ? "#c45c26" : l.fill}
                    strokeOpacity={strokeOpacity}
                    strokeWidth={0.4 + Math.min(2, l.weight * 0.15) + (hot ? 0.8 : 0)}
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
                return (
                  <g
                    key={leaf.id}
                    opacity={
                      related && searchHot
                        ? 1
                        : search && !searchHot
                          ? 0.12
                          : related
                            ? 1
                            : 0.14
                    }
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
                      r={isFocus ? 3.2 : 2.2}
                      fill={leaf.fill}
                      stroke={isFocus ? "#c45c26" : "#f7f2e8"}
                      strokeWidth={isFocus ? 1 : 0.4}
                    />
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
          </>
        )}
      </g>
    </g>
  );
}
