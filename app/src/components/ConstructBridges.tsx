/** Thin warp threads linking people who appear in multiple strip constructs. */

import { useMemo } from "react";
import {
  bridgePathThrough,
  stripBridges,
  type PersonIndexEntry,
  type StripBridge,
} from "../lib/bridges";
import { ACCENT, FONT_MONO, FONT_SANS, INK, INK_FAINT } from "../lib/fonts";

interface Props {
  people: PersonIndexEntry[];
  stripIds: string[];
  /** Construct titles for tooltips */
  stripTitles?: string[];
  panelW: number;
  gap: number;
  height: number;
  /** Cap warp count (density control) */
  maxWarps?: number;
  /** Shared focus with the hero (hover or pin) */
  focusId?: string | null;
  interactive?: boolean;
  onHover?: (id: string | null) => void;
  onPin?: (id: string) => void;
}

export function ConstructBridges({
  people,
  stripIds,
  stripTitles = [],
  panelW,
  gap,
  height,
  maxWarps = 24,
  focusId = null,
  interactive = false,
  onHover,
  onPin,
}: Props) {
  const bridges = useMemo(
    () => stripBridges(people, stripIds, maxWarps),
    [people, stripIds, maxWarps],
  );
  if (bridges.length < 1 || stripIds.length < 2) return null;

  const centers = stripIds.map((_, i) => i * (panelW + gap) + panelW / 2);
  const laneY = height * 0.5;
  const maxSpan = Math.max(...bridges.map((b) => b.panels.length));
  const fullSpanCount = bridges.filter((b) => b.panels.length === stripIds.length).length;
  const focused = focusId ? bridges.find((b) => b.id === focusId) : null;
  const anyFocus = !!focusId;

  return (
    <g className="construct-bridges" aria-label="People spanning multiple constructs">
      {/* Soft lane so empty mid-panels still read as a thread corridor */}
      <rect
        x={centers[0]}
        y={laneY - 16}
        width={Math.max(0, centers[centers.length - 1] - centers[0])}
        height={32}
        fill={INK}
        fillOpacity={0.03}
        pointerEvents="none"
      />

      {bridges.map((b, i) => {
        const amp = 2.5 + (i % 6) * 1.1;
        const y = laneY + ((i % 9) - 4) * 1.8;
        const d = bridgePathThrough(centers, b.panels, y, amp);
        if (!d) return null;
        return (
          <WarpThread
            key={b.id}
            bridge={b}
            d={d}
            y={y}
            amp={amp}
            centers={centers}
            stripTitles={stripTitles}
            stripIds={stripIds}
            full={b.panels.length === stripIds.length}
            spanRatio={b.panels.length / maxSpan}
            isFocus={focusId === b.id}
            dimmed={anyFocus && focusId !== b.id}
            interactive={interactive}
            onHover={onHover}
            onPin={onPin}
          />
        );
      })}

      {focused ? (
        <text
          x={centers[focused.panels[0]] ?? centers[0]}
          y={laneY - 18}
          fontFamily={FONT_SANS}
          fontSize={4.2}
          fontWeight={600}
          fill={ACCENT}
          pointerEvents="none"
        >
          {focused.label}
          <tspan fill={INK_FAINT} fontWeight={400} fontFamily={FONT_MONO}>
            {`  ·  ${focused.panels.length}/${stripIds.length} constructs`}
          </tspan>
        </text>
      ) : null}

      <text
        x={centers[0]}
        y={height - 2}
        fontFamily={FONT_MONO}
        fontSize={3.2}
        fill={INK_FAINT}
        pointerEvents="none"
      >
        {bridges.length} warps
        {fullSpanCount ? ` · ${fullSpanCount} cross all ${stripIds.length}` : ""}
        {interactive ? " · hover a thread ↔ hero" : " · dots = membership"}
      </text>
    </g>
  );
}

function WarpThread({
  bridge,
  d,
  y,
  amp,
  centers,
  stripTitles,
  stripIds,
  full,
  spanRatio,
  isFocus,
  dimmed,
  interactive,
  onHover,
  onPin,
}: {
  bridge: StripBridge;
  d: string;
  y: number;
  amp: number;
  centers: number[];
  stripTitles: string[];
  stripIds: string[];
  full: boolean;
  spanRatio: number;
  isFocus: boolean;
  dimmed: boolean;
  interactive: boolean;
  onHover?: (id: string | null) => void;
  onPin?: (id: string) => void;
}) {
  const names = bridge.panels.map((pi) => stripTitles[pi] || stripIds[pi]).join(" → ");
  let stroke = full ? INK : "#2F5D50";
  let strokeWidth = full ? 0.6 : 0.25 + spanRatio * 0.3;
  let strokeOpacity = full ? 0.5 : 0.2 + spanRatio * 0.25;
  let dotR = full ? 0.9 : 0.65;
  let dotFill = full ? INK : "#2F5D50";
  let dotOpacity = full ? 0.55 : 0.35;

  if (isFocus) {
    stroke = ACCENT;
    strokeWidth = 1.35;
    strokeOpacity = 0.95;
    dotR = 1.35;
    dotFill = ACCENT;
    dotOpacity = 1;
  } else if (dimmed) {
    strokeOpacity *= 0.12;
    dotOpacity *= 0.15;
  }

  return (
    <g
      style={{ cursor: interactive ? "pointer" : undefined }}
      onMouseEnter={() => interactive && onHover?.(bridge.id)}
      onMouseLeave={() => interactive && onHover?.(null)}
      onClick={(e) => {
        if (!interactive || !onPin) return;
        e.stopPropagation();
        onPin(bridge.id);
      }}
    >
      {/* Wide invisible hit target */}
      {interactive ? (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ) : null}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinecap="round"
        pointerEvents="none"
      >
        <title>{`${bridge.label} · ${bridge.panels.length}/${stripIds.length} panels\n${names}\nHover highlights this person in the hero`}</title>
      </path>
      {bridge.panels.map((pi) => (
        <circle
          key={`${bridge.id}-${pi}`}
          cx={centers[pi]}
          cy={y + (bridge.panels.indexOf(pi) % 2 === 0 ? -amp : amp)}
          r={dotR}
          fill={dotFill}
          fillOpacity={dotOpacity}
          pointerEvents="none"
        />
      ))}
    </g>
  );
}
