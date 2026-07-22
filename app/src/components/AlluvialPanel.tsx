/** Alluvial small-multiple panel. */

import { useMemo } from "react";
import type { StageRow } from "../lib/types";
import { layoutAlluvial } from "../viz/alluvial";

interface Props {
  stages: StageRow[];
  width: number;
  height: number;
  title: string;
  palette: string;
  x?: number;
  y?: number;
  /**
   * Category names (gender / era / degree band) belonging to the focused person
   * in this construct — lights matching bars/flows.
   */
  focusKeys?: Set<string> | null;
  /** Focused person is a member of this construct */
  focusMember?: boolean;
  /** Someone is focused somewhere — dim panels that don’t include them */
  focusActive?: boolean;
}

export function AlluvialPanel({
  stages,
  width,
  height,
  title,
  palette,
  x = 0,
  y = 0,
  focusKeys = null,
  focusMember = false,
  focusActive = false,
}: Props) {
  const layout = useMemo(
    () => layoutAlluvial(stages, width, height - 14, palette),
    [stages, width, height, palette],
  );

  const dimPanel = focusActive && !focusMember;
  const hotPanel = focusActive && focusMember;

  return (
    <g transform={`translate(${x}, ${y})`} opacity={dimPanel ? 0.28 : 1}>
      <text
        x={0}
        y={8}
        fontFamily="IBM Plex Sans, sans-serif"
        fontSize={6}
        fontWeight={600}
        letterSpacing={0.8}
        fill={hotPanel ? "#c45c26" : "#1a1814"}
      >
        {title.toUpperCase()}
        {hotPanel ? (
          <tspan fill="#c45c26" fontWeight={400} fontSize={4.5} letterSpacing={0}>
            {"  · in"}
          </tspan>
        ) : null}
      </text>
      {hotPanel ? (
        <rect
          x={-1}
          y={10}
          width={width + 2}
          height={height - 10}
          fill="none"
          stroke="#c45c26"
          strokeWidth={0.35}
          strokeOpacity={0.55}
          rx={0.5}
          pointerEvents="none"
        />
      ) : null}
      <g transform="translate(0, 12)">
        {layout.links.map((l, i) => {
          const hot =
            focusKeys &&
            (focusKeys.has(l.sourceName) || focusKeys.has(l.targetName));
          let fillOpacity = 0.45;
          if (focusKeys && focusMember) {
            fillOpacity = hot ? 0.85 : 0.08;
          }
          return (
            <path
              key={i}
              d={l.path}
              fill={hot ? "#c45c26" : l.fill}
              fillOpacity={fillOpacity}
              stroke="none"
              pointerEvents="none"
            >
              <title>{l.title}</title>
            </path>
          );
        })}
        {layout.nodes.map((n) => {
          const hot = focusKeys?.has(n.name) ?? false;
          let opacity = 1;
          if (focusKeys && focusMember) {
            opacity = hot ? 1 : 0.18;
          }
          return (
            <g key={n.id} opacity={opacity} pointerEvents="none">
              <rect
                x={n.x0}
                y={n.y0}
                width={Math.max(1, n.x1 - n.x0)}
                height={Math.max(0.5, n.y1 - n.y0)}
                fill={hot ? "#c45c26" : n.fill}
                stroke={hot ? "#1a1814" : "none"}
                strokeWidth={hot ? 0.25 : 0}
              />
              {n.y1 - n.y0 > 5 && (
                <text
                  x={n.x1 + 1.5}
                  y={(n.y0 + n.y1) / 2}
                  fontSize={3.2}
                  fontFamily="IBM Plex Sans, sans-serif"
                  fill={hot ? "#c45c26" : "#3a3630"}
                  fontWeight={hot ? 600 : 400}
                  dominantBaseline="middle"
                >
                  {n.name.length > 18 ? n.name.slice(0, 16) + "…" : n.name}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </g>
  );
}
