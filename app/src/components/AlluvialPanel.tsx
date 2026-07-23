/** Alluvial small-multiple panel. */

import { ACCENT, FONT_SANS, INK, INK_SOFT } from "../lib/fonts";
import { useMemo } from "react";
import type { StageRow } from "../lib/types";
import { layoutAlluvial } from "../viz/alluvial";
import { STAT_COLORS, hasStat, type ViewStatMarks } from "../lib/statsMarks";

interface Props {
  stages: StageRow[];
  width: number;
  height: number;
  title: string;
  palette: string;
  x?: number;
  y?: number;
  colorBy?: "gender" | "degree" | "prominence" | "genre";
  /**
   * Category names (gender / era / degree band) belonging to the focused person
   * in this construct — lights matching bars/flows.
   */
  focusKeys?: Set<string> | null;
  /** Focused person is a member of this construct */
  focusMember?: boolean;
  /** Someone is focused somewhere — dim panels that don’t include them */
  focusActive?: boolean;
  /** View-local statistical marks (hub band / insight path) */
  viewStats?: ViewStatMarks | null;
  /** Extra category keys to emphasize from stats (e.g. hub + insight facets) */
  statKeys?: Set<string> | null;
}

export function AlluvialPanel({
  stages,
  width,
  height,
  title,
  palette,
  x = 0,
  y = 0,
  colorBy = "degree",
  focusKeys = null,
  focusMember = false,
  focusActive = false,
  viewStats = null,
  statKeys = null,
}: Props) {
  const layout = useMemo(
    () => layoutAlluvial(stages, width, height - 14, palette, { colorBy }),
    [stages, width, height, palette, colorBy],
  );

  const dimPanel = focusActive && !focusMember;
  const hotPanel = focusActive && focusMember;

  const boostHub =
    !!viewStats && hasStat(viewStats, "top5_degree") && viewStats.top5DegreeIds.size > 0;

  const modalParts =
    viewStats && hasStat(viewStats, "modal_flow") && viewStats.modalFlowKey
      ? viewStats.modalFlowKey.split("\0")
      : null;

  const isStatHot = (name: string) => {
    if (statKeys?.has(name)) return true;
    if (boostHub && name === "hub") return true;
    if (modalParts && (name === modalParts[0] || name === modalParts[1])) return true;
    return false;
  };

  return (
    <g transform={`translate(${x}, ${y})`} opacity={dimPanel ? 0.28 : 1}>
      <text
        x={0}
        y={8}
        fontFamily={FONT_SANS}
        fontSize={6}
        fontWeight={600}
        letterSpacing={0.8}
        fill={hotPanel ? ACCENT : INK}
      >
        {title.toUpperCase()}
        {hotPanel ? (
          <tspan fill={ACCENT} fontWeight={400} fontSize={4.5} letterSpacing={0}>
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
          stroke={ACCENT}
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
          const statHot = isStatHot(l.sourceName) || isStatHot(l.targetName);
          const modalHot =
            !!modalParts &&
            ((l.sourceName === modalParts[0] && l.targetName === modalParts[1]) ||
              l.sourceName === modalParts[1] ||
              l.targetName === modalParts[0]);
          let fillOpacity = 0.38;
          if (focusKeys && focusMember) {
            fillOpacity = hot ? 0.85 : 0.08;
          } else if (modalHot) {
            fillOpacity = 0.88;
          } else if (statHot && !focusActive) {
            fillOpacity = 0.72;
          } else if (modalParts && !focusActive) {
            fillOpacity = 0.2;
          }
          return (
            <path
              key={i}
              d={l.path}
              fill={hot ? ACCENT : statHot ? STAT_COLORS.halo : l.fill}
              fillOpacity={fillOpacity}
              stroke={modalHot || statHot ? STAT_COLORS.path : "none"}
              strokeWidth={modalHot || statHot ? 0.2 : 0}
              strokeDasharray={modalHot ? "1.5 1.2" : undefined}
              pointerEvents="none"
            >
              <title>{l.title}</title>
            </path>
          );
        })}
        {layout.nodes.map((n) => {
          const hot = focusKeys?.has(n.name) ?? false;
          const statHot = isStatHot(n.name);
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
                fill={hot ? ACCENT : statHot ? STAT_COLORS.halo : n.fill}
                stroke={hot ? INK : statHot ? STAT_COLORS.halo : "none"}
                strokeWidth={hot || statHot ? 0.25 : 0}
              />
              {n.y1 - n.y0 > 5 && (
                <text
                  x={n.x1 + 1.5}
                  y={(n.y0 + n.y1) / 2}
                  fontSize={3.2}
                  fontFamily={FONT_SANS}
                  fill={hot ? ACCENT : statHot ? STAT_COLORS.guide : INK_SOFT}
                  fontWeight={hot || statHot ? 600 : 400}
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
