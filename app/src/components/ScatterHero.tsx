/**
 * Scatter hero — strength × prominence with optional hover highlight.
 */

import { useMemo } from "react";
import type { Node } from "../lib/types";
import { nodeProminence, nodeStrength } from "../lib/metrics";
import { useTheme } from "../lib/theme/ThemeContext";
import { token } from "../lib/theme/tokens";

interface Props {
  nodes: Node[];
  width: number;
  height: number;
  highlightIds?: Set<string> | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}

export function ScatterHero({
  nodes,
  width,
  height,
  highlightIds,
  onHover,
  onSelect,
}: Props) {
  const { theme } = useTheme();
  const pad = { l: 48, r: 16, t: 16, b: 36 };
  const iw = Math.max(10, width - pad.l - pad.r);
  const ih = Math.max(10, height - pad.t - pad.b);

  const pts = useMemo(() => {
    return nodes.map((n) => ({
      id: n.id,
      label: n.label,
      x: nodeStrength(n),
      y: nodeProminence(n),
    }));
  }, [nodes]);

  const x0 = Math.min(...pts.map((p) => p.x), 0);
  const x1 = Math.max(...pts.map((p) => p.x), 1);
  const y0 = Math.min(...pts.map((p) => p.y), 0);
  const y1 = Math.max(...pts.map((p) => p.y), 1);

  const ink = token("text.ink", theme);
  const faint = token("text.inkFaint", theme);
  const accent = token("accent.base", theme);

  return (
    <svg width={width} height={height} className="scatter-hero" role="img" aria-label="Strength vs prominence">
      <text x={pad.l} y={12} fontSize={10} fill={faint}>
        Strength →
      </text>
      <text
        x={12}
        y={pad.t + ih / 2}
        fontSize={10}
        fill={faint}
        transform={`rotate(-90 12 ${pad.t + ih / 2})`}
      >
        Prominence
      </text>
      <line
        x1={pad.l}
        y1={pad.t + ih}
        x2={pad.l + iw}
        y2={pad.t + ih}
        stroke={faint}
        strokeWidth={0.5}
      />
      <line
        x1={pad.l}
        y1={pad.t}
        x2={pad.l}
        y2={pad.t + ih}
        stroke={faint}
        strokeWidth={0.5}
      />
      {pts.map((p) => {
        const cx = pad.l + ((p.x - x0) / Math.max(x1 - x0, 1e-9)) * iw;
        const cy = pad.t + ih - ((p.y - y0) / Math.max(y1 - y0, 1e-9)) * ih;
        const hot = !highlightIds?.size || highlightIds.has(p.id);
        return (
          <circle
            key={p.id}
            cx={cx}
            cy={cy}
            r={hot ? 4 : 2.5}
            fill={hot ? accent : ink}
            opacity={hot ? 0.9 : 0.25}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => onHover?.(p.id)}
            onMouseLeave={() => onHover?.(null)}
            onClick={() => onSelect?.(p.id)}
          >
            <title>
              {p.label}: strength {p.x}, prominence {p.y}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
