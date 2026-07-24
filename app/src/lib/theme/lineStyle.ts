/**
 * Shared chart line language — weight, opacity, color, interaction states.
 * Prefer this over per-form hardcoded strokeOpacity / ACCENT / RULE.
 */

import { linkStrokeWidth } from "../encode";
import type { Edge, ThicknessBy } from "../types";
import { chartChrome } from "./chartChrome";
import { opacity, token, type Theme } from "./tokens";

/** Semantic interaction ladder for weave / warp / grid strokes. */
export type LinkVisualState = "ambient" | "related" | "skim" | "hot" | "dim" | "stat";

export type GridLineKind = "year" | "decade" | "mode";

export interface LinePaint {
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  strokeLinecap: "round" | "butt" | "square";
  strokeDasharray?: string;
  className: string;
}

function darkBoost(theme: Theme): number {
  return theme === "dark" ? opacity.darkFloorBoost : 0;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Resolve ladder opacity with dark floor boost. */
export function linkOpacity(state: LinkVisualState, theme: Theme = "light"): number {
  const boost = darkBoost(theme);
  switch (state) {
    case "hot":
      return opacity.linkHot;
    case "related":
      return clamp01(opacity.linkRelated + boost * 0.4);
    case "skim":
      return clamp01(opacity.linkSkim + boost * 0.5);
    case "dim":
      return clamp01(opacity.linkDim + boost);
    case "stat":
      return opacity.linkHot;
    case "ambient":
    default:
      return clamp01(opacity.linkAmbient + boost);
  }
}

/** Fill opacity for chord ribbons — same semantics as stroke ladder. */
export function linkFillOpacity(state: LinkVisualState, theme: Theme = "light"): number {
  // Chord reads denser as fill; bump ambient slightly vs stroke forms
  if (state === "ambient") return clamp01(linkOpacity("ambient", theme) + 0.08);
  if (state === "dim") return linkOpacity("dim", theme);
  return linkOpacity(state, theme);
}

export function linkClassName(state: LinkVisualState): string {
  const parts = ["loom-link"];
  if (state === "skim") parts.push("is-skim");
  if (state === "hot") parts.push("is-hot");
  if (state === "dim") parts.push("is-dim");
  if (state === "related") parts.push("is-related");
  return parts.join(" ");
}

/**
 * Stroke style for co-appearance / bundle / timeline links.
 * Pass layout `baseWidth` from encode when available; otherwise derives from edge.
 */
export function linkInteractionStyle(opts: {
  state: LinkVisualState;
  theme?: Theme;
  /** Layout stroke width from linkStrokeWidth / viz */
  baseWidth?: number;
  edge?: Edge;
  thicknessBy?: ThicknessBy;
  maxWeight?: number;
  years?: { yearMin: number; yearMax: number };
  /** Multiply final opacity (e.g. weight pressure, print scale) */
  opacityScale?: number;
  /** Extra width boost (stat marks) */
  widthBoost?: number;
  dash?: string;
  /** Override stroke color (stat channel) */
  stroke?: string;
}): LinePaint {
  const theme = opts.theme ?? "light";
  const chrome = chartChrome(theme);
  const state = opts.state;

  let baseWidth = opts.baseWidth;
  if (baseWidth == null && opts.edge && opts.years) {
    baseWidth = linkStrokeWidth(
      opts.edge,
      opts.thicknessBy ?? "shared",
      opts.maxWeight ?? opts.edge.weight,
      opts.years,
      state === "hot",
    );
  }
  baseWidth ??= 1;

  let strokeWidth = baseWidth;
  if (state === "hot") strokeWidth = baseWidth + 0.7;
  else if (state === "skim") strokeWidth = baseWidth + 0.35;
  else if (state === "related") strokeWidth = baseWidth + 0.15;
  if (opts.widthBoost) strokeWidth += opts.widthBoost;

  let stroke = opts.stroke ?? chrome.linkBase;
  if (!opts.stroke) {
    if (state === "hot") stroke = chrome.linkHot;
    else if (state === "skim") stroke = chrome.linkSkim;
    else if (state === "related") stroke = chrome.linkBase;
    else stroke = chrome.linkBase;
  }

  const op = clamp01(linkOpacity(state, theme) * (opts.opacityScale ?? 1));

  return {
    stroke,
    strokeOpacity: op,
    strokeWidth: Math.max(0.35, strokeWidth),
    strokeLinecap: "round",
    strokeDasharray: state === "hot" || state === "skim" ? undefined : opts.dash,
    className: linkClassName(state),
  };
}

/** Decade / year / mode grid rules — shared Hero ↔ Static. */
export function gridLineStyle(opts: {
  kind: GridLineKind;
  theme?: Theme;
}): LinePaint {
  const theme = opts.theme ?? "light";
  const chrome = chartChrome(theme);
  const boost = darkBoost(theme);

  if (opts.kind === "mode") {
    return {
      stroke: chrome.modeDecade,
      strokeOpacity: clamp01(opacity.gridMode + boost * 0.3),
      strokeWidth: 1.6,
      strokeLinecap: "butt",
      className: "loom-grid loom-grid-mode",
    };
  }
  if (opts.kind === "decade") {
    return {
      stroke: chrome.decadeGrid,
      strokeOpacity: clamp01(opacity.gridDecade + boost * 0.4),
      strokeWidth: 0.9,
      strokeLinecap: "butt",
      className: "loom-grid loom-grid-decade",
    };
  }
  return {
    stroke: chrome.rule,
    strokeOpacity: clamp01(opacity.gridYear + boost * 0.5),
    strokeWidth: 0.45,
    strokeLinecap: "butt",
    className: "loom-grid loom-grid-year",
  };
}

export type WarpVisualState = "ambient" | "hot" | "dim" | "skim";

/** Construct-thread warps across the alluvial strip. */
export function warpLineStyle(opts: {
  full: boolean;
  spanRatio: number;
  state: WarpVisualState;
  theme?: Theme;
  /** Rank among warps 0…n — denser lists fade slightly */
  rank?: number;
  maxWarps?: number;
}): LinePaint & { dotR: number; dotFill: string; dotOpacity: number } {
  const theme = opts.theme ?? "light";
  const chrome = chartChrome(theme);
  const boost = darkBoost(theme);
  const span = Math.min(1, Math.max(0.2, opts.spanRatio));

  let stroke = opts.full ? chrome.ink : chrome.linkBase;
  let strokeWidth = opts.full ? 0.85 : 0.45 + span * 0.4;
  let strokeOpacity = clamp01(
    (opts.full ? opacity.warpAmbient + 0.05 : opacity.warpAmbient - 0.05 + span * 0.2) + boost,
  );
  let strokeDasharray: string | undefined = opts.full ? undefined : "2.5 2";
  let dotR = opts.full ? 1.05 : 0.75;
  let dotFill = stroke;
  let dotOpacity = clamp01(strokeOpacity + 0.08);

  // Density falloff for high maxWarps
  if (opts.rank != null && opts.maxWarps != null && opts.maxWarps > 12) {
    const t = opts.rank / Math.max(1, opts.maxWarps - 1);
    strokeOpacity = clamp01(strokeOpacity * (1 - t * 0.25));
    dotOpacity = clamp01(dotOpacity * (1 - t * 0.2));
  }

  if (opts.state === "hot") {
    stroke = chrome.linkHot;
    strokeWidth = 1.35;
    strokeOpacity = opacity.linkHot;
    strokeDasharray = undefined;
    dotR = 1.35;
    dotFill = chrome.linkHot;
    dotOpacity = 1;
  } else if (opts.state === "skim") {
    stroke = chrome.linkSkim;
    strokeWidth += 0.25;
    strokeOpacity = clamp01(linkOpacity("skim", theme));
    strokeDasharray = undefined;
    dotFill = chrome.linkSkim;
    dotOpacity = clamp01(strokeOpacity + 0.1);
  } else if (opts.state === "dim") {
    strokeOpacity = clamp01(strokeOpacity * opacity.warpDimFactor);
    dotOpacity = clamp01(dotOpacity * opacity.warpDimFactor);
  }

  return {
    stroke,
    strokeOpacity,
    strokeWidth,
    strokeLinecap: "round",
    strokeDasharray,
    className: linkClassName(
      opts.state === "hot" ? "hot" : opts.state === "skim" ? "skim" : opts.state === "dim" ? "dim" : "ambient",
    ),
    dotR,
    dotFill,
    dotOpacity,
  };
}

/** Mark / person opacity under focus or search. */
export function markOpacity(opts: {
  state: "full" | "dim" | "searchMiss";
  theme?: Theme;
}): number {
  const theme = opts.theme ?? "light";
  if (opts.state === "full") return 1;
  return clamp01(opacity.markDim + darkBoost(theme));
}

/** Resolve link visual state from focus/skim/edge flags. */
export function resolveLinkState(flags: {
  hot?: boolean;
  skim?: boolean;
  related?: boolean;
  hasFocus?: boolean;
}): LinkVisualState {
  if (flags.hot) return "hot";
  if (flags.skim) return "skim";
  if (flags.hasFocus) return flags.related ? "related" : "dim";
  return "ambient";
}

export { token };
