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
}

export function AlluvialPanel({ stages, width, height, title, palette, x = 0, y = 0 }: Props) {
  const layout = useMemo(
    () => layoutAlluvial(stages, width, height - 14, palette),
    [stages, width, height, palette],
  );

  return (
    <g transform={`translate(${x}, ${y})`}>
      <text
        x={0}
        y={8}
        fontFamily="IBM Plex Sans, sans-serif"
        fontSize={6}
        fontWeight={600}
        letterSpacing={0.8}
        fill="#1a1814"
      >
        {title.toUpperCase()}
      </text>
      <g transform="translate(0, 12)">
        {layout.links.map((l, i) => (
          <path
            key={i}
            d={l.path}
            fill={l.fill}
            fillOpacity={0.45}
            stroke="none"
          >
            <title>{l.title}</title>
          </path>
        ))}
        {layout.nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x0}
              y={n.y0}
              width={Math.max(1, n.x1 - n.x0)}
              height={Math.max(0.5, n.y1 - n.y0)}
              fill={n.fill}
            />
            {n.y1 - n.y0 > 5 && (
              <text
                x={n.x1 + 1.5}
                y={(n.y0 + n.y1) / 2}
                fontSize={3.2}
                fontFamily="IBM Plex Sans, sans-serif"
                fill="#3a3630"
                dominantBaseline="middle"
              >
                {n.name.length > 18 ? n.name.slice(0, 16) + "…" : n.name}
              </text>
            )}
          </g>
        ))}
      </g>
    </g>
  );
}
