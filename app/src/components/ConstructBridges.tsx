/** Thin warp threads linking people who appear in multiple strip constructs. */

import { useMemo } from "react";
import {
  bridgePathThrough,
  stripBridges,
  type PersonIndexEntry,
  type StripBridge,
} from "../lib/bridges";
import { FONT_MONO, FONT_SANS } from "../lib/fonts";
import { chartChrome } from "../lib/theme/chartChrome";
import { warpLineStyle } from "../lib/theme/lineStyle";
import { useTheme } from "../lib/theme/ThemeContext";

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
  /** Immediate skim (pre-settle) — soft accent without dimming others */
  skimId?: string | null;
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
  skimId = null,
  interactive = false,
  onHover,
  onPin,
}: Props) {
  const { theme } = useTheme();
  const chrome = useMemo(() => chartChrome(theme), [theme]);
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
        fill={chrome.ink}
        fillOpacity={theme === "dark" ? 0.06 : 0.04}
        pointerEvents="none"
      />

      {bridges.map((b, i) => {
        const amp = 2.5 + (i % 6) * 1.1;
        const y = laneY + ((i % 9) - 4) * 1.8;
        const d = bridgePathThrough(centers, b.panels, y, amp);
        if (!d) return null;
        const isFocus = focusId === b.id;
        const isSkim = !isFocus && skimId === b.id;
        const dimmed = anyFocus && !isFocus;
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
            isFocus={isFocus}
            isSkim={isSkim}
            dimmed={dimmed}
            rank={i}
            maxWarps={maxWarps}
            theme={theme}
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
          fill={chrome.linkHot}
          pointerEvents="none"
        >
          {focused.label}
          <tspan fill={chrome.inkFaint} fontWeight={400} fontFamily={FONT_MONO}>
            {`  ·  ${focused.panels.length}/${stripIds.length} constructs`}
          </tspan>
        </text>
      ) : null}

      <text
        x={centers[0]}
        y={height - 2}
        fontFamily={FONT_MONO}
        fontSize={3.2}
        fill={chrome.inkFaint}
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
  isSkim,
  dimmed,
  rank,
  maxWarps,
  theme,
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
  isSkim: boolean;
  dimmed: boolean;
  rank: number;
  maxWarps: number;
  theme: "light" | "dark";
  interactive: boolean;
  onHover?: (id: string | null) => void;
  onPin?: (id: string) => void;
}) {
  const names = bridge.panels.map((pi) => stripTitles[pi] || stripIds[pi]).join(" → ");
  const state = isFocus ? "hot" : isSkim ? "skim" : dimmed ? "dim" : "ambient";
  const paint = warpLineStyle({
    full,
    spanRatio,
    state,
    theme,
    rank,
    maxWarps,
  });

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
          strokeWidth={5}
          strokeLinecap="round"
        />
      ) : null}
      <path
        className={paint.className}
        d={d}
        fill="none"
        stroke={paint.stroke}
        strokeWidth={paint.strokeWidth}
        strokeOpacity={paint.strokeOpacity}
        strokeLinecap={paint.strokeLinecap}
        strokeDasharray={paint.strokeDasharray}
        pointerEvents="none"
      >
        <title>{`${bridge.label} · ${bridge.panels.length}/${stripIds.length} panels\n${names}\nHover highlights this person in the hero`}</title>
      </path>
      {bridge.panels.map((pi) => (
        <circle
          key={`${bridge.id}-${pi}`}
          cx={centers[pi]}
          cy={y + (bridge.panels.indexOf(pi) % 2 === 0 ? -amp : amp)}
          r={paint.dotR}
          fill={paint.dotFill}
          fillOpacity={paint.dotOpacity}
          pointerEvents="none"
        />
      ))}
    </g>
  );
}
