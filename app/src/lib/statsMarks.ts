/** View-local statistical marks for hero / alluvial overlays. */

import type { Edge, Manifest, Node, SortBy, StatMarkId } from "./types";
import { DEFAULT_STAT_MARKS } from "./types";
import { edgeKey } from "./search";
import { compareNodesBySort } from "./filter";
import { token } from "./theme/tokens";
import { nodeStrength } from "./metrics";

export type { StatMarkId };
export { DEFAULT_STAT_MARKS };

type Form = "timeline" | "chord" | "bundle" | "alluvial" | "scatter";

export const STAT_MARK_META: Record<
  StatMarkId,
  { label: string; hint: string; forms: Form[]; group: string }
> = {
  top5_degree: {
    label: "Top 5% degree",
    hint: "Gold halo on hubs",
    forms: ["timeline", "chord", "bundle", "alluvial"],
    group: "Core",
  },
  median_size: {
    label: "Median size",
    hint: "Ghost mark at median degree",
    forms: ["timeline", "chord", "bundle"],
    group: "Core",
  },
  median_peak: {
    label: "Median peak year",
    hint: "Guide rule at median year_peak",
    forms: ["timeline"],
    group: "Core",
  },
  gap_spikes: {
    label: "Gap spikes",
    hint: "Cross tick when gap_years ≥ p95",
    forms: ["timeline"],
    group: "Core",
  },
  bridge_outliers: {
    label: "Bridge diamonds",
    hint: "High betweenness nodes",
    forms: ["timeline", "chord", "bundle"],
    group: "Core",
  },
  featured_path: {
    label: "Featured path",
    hint: "Construct handshake path glow",
    forms: ["timeline", "chord", "bundle"],
    group: "Core",
  },
  densest_pair: {
    label: "Densest pair",
    hint: "Label heaviest co-appearance",
    forms: ["timeline", "chord", "bundle"],
    group: "Core",
  },
  insight_sync: {
    label: "Insight sync",
    hint: "Halo matches Insight focus",
    forms: ["timeline", "chord", "bundle", "alluvial"],
    group: "Core",
  },
  bottom5_degree: {
    label: "Bottom 5% ghost",
    hint: "Fade sparse nodes",
    forms: ["timeline", "chord", "bundle"],
    group: "Percentiles",
  },
  top5_prominence: {
    label: "Top 5% prominence",
    hint: "Warm fill on vote stars",
    forms: ["timeline", "chord", "bundle"],
    group: "Percentiles",
  },
  p90_edges: {
    label: "P90 edge weight",
    hint: "Full thickness only ≥ p90",
    forms: ["timeline", "chord", "bundle"],
    group: "Percentiles",
  },
  rank_ladder: {
    label: "Rank ladder #1–5",
    hint: "Margin labels by sort key",
    forms: ["timeline"],
    group: "Percentiles",
  },
  median_career: {
    label: "Median career bar",
    hint: "Reference span length",
    forms: ["timeline"],
    group: "Central",
  },
  mode_decade: {
    label: "Mode decade",
    hint: "Thicken modal collaboration decade",
    forms: ["timeline"],
    group: "Central",
  },
  modal_flow: {
    label: "Modal alluvial flow",
    hint: "Thicken largest gender→era path",
    forms: ["alluvial"],
    group: "Central",
  },
  span_outliers: {
    label: "Span outliers",
    hint: "Tukey fence on career length",
    forms: ["timeline", "chord", "bundle"],
    group: "Outliers",
  },
  reunion_edges: {
    label: "Reunion gaps",
    hint: "Dashed long-gap reunions",
    forms: ["timeline", "chord", "bundle"],
    group: "Outliers",
  },
  one_scene_wonder: {
    label: "One-scene wonders",
    hint: "Hollow center on flag",
    forms: ["timeline", "chord", "bundle"],
    group: "Outliers",
  },
  billing_glyphs: {
    label: "Billing trajectory",
    hint: "▲ rising / ▼ fading tails",
    forms: ["timeline", "chord", "bundle"],
    group: "Outliers",
  },
  genre_entropy: {
    label: "Genre entropy",
    hint: "Hash stroke on high-entropy careers",
    forms: ["timeline", "chord", "bundle"],
    group: "Outliers",
  },
  genre_drift: {
    label: "Genre drift",
    hint: "Early→late gradient on career bar",
    forms: ["timeline"],
    group: "Outliers",
  },
  weight_zscore: {
    label: "Weight z-score",
    hint: "Glow |z| > 2 edges",
    forms: ["timeline", "chord", "bundle"],
    group: "Outliers",
  },
  era_histogram: {
    label: "Era histogram",
    hint: "Collaboration density under axis",
    forms: ["timeline"],
    group: "Story",
  },
  peak_extremes: {
    label: "Earliest / latest peak",
    hint: "Pins on peak-year extremes",
    forms: ["timeline"],
    group: "Story",
  },
  longest_collab: {
    label: "Longest collaboration",
    hint: "Max first→last worked together",
    forms: ["timeline", "chord", "bundle"],
    group: "Story",
  },
  loyalty_pair: {
    label: "Loyalty pair",
    hint: "Person + top collaborator",
    forms: ["timeline", "chord", "bundle"],
    group: "Story",
  },
  gini_callout: {
    label: "Gini / top-10% share",
    hint: "Highlight strength inequality",
    forms: ["timeline", "chord", "bundle", "scatter"],
    group: "Story",
  },
  assortativity: {
    label: "Assortativity",
    hint: "Manifest degree assortativity callout",
    forms: ["timeline", "chord", "bundle", "scatter"],
    group: "Story",
  },
  giant_component: {
    label: "Giant component",
    hint: "Dim nodes outside the giant component",
    forms: ["timeline", "chord", "bundle"],
    group: "Graph",
  },
  retention_meter: {
    label: "Filter retention",
    hint: "% kept vs full construct",
    forms: ["timeline", "chord", "bundle"],
    group: "Story",
  },
  community_cuts: {
    label: "Community cut edges",
    hint: "Contrast inter-community links",
    forms: ["timeline", "chord", "bundle"],
    group: "Graph",
  },
  ego_rings: {
    label: "Ego rings",
    hint: "1-hop / 2-hop when pinned",
    forms: ["timeline", "chord", "bundle"],
    group: "Graph",
  },
  island_ghost: {
    label: "Island ghost",
    hint: "Dim small components",
    forms: ["timeline", "chord", "bundle"],
    group: "Graph",
  },
  votes_centroid: {
    label: "Votes year centroid",
    hint: "Prominence-weighted mean peak year",
    forms: ["timeline"],
    group: "Story",
  },
};

export const ALL_STAT_MARKS = Object.keys(STAT_MARK_META) as StatMarkId[];

export const STAT_GROUPS = ["Core", "Percentiles", "Central", "Outliers", "Story", "Graph"] as const;

export const STAT_PRESETS: Record<string, StatMarkId[]> = {
  core: [...DEFAULT_STAT_MARKS],
  outliers: [
    "top5_degree",
    "bottom5_degree",
    "span_outliers",
    "gap_spikes",
    "reunion_edges",
    "one_scene_wonder",
    "bridge_outliers",
    "weight_zscore",
    "insight_sync",
  ],
  story: [
    "densest_pair",
    "peak_extremes",
    "longest_collab",
    "loyalty_pair",
    "gini_callout",
    "assortativity",
    "era_histogram",
    "retention_meter",
    "votes_centroid",
    "insight_sync",
  ],
  graph: [
    "featured_path",
    "bridge_outliers",
    "community_cuts",
    "ego_rings",
    "island_ghost",
    "giant_component",
    "densest_pair",
    "insight_sync",
  ],
  all: [...ALL_STAT_MARKS],
  none: [],
};

/**
 * Stat overlay colors — fixed annotation layer (do not track active palette).
 * Values resolve from semantic `stat.*` tokens so charts stay shareable and
 * reading guides don't collide with genre/degree encoding.
 */
export const STAT_COLORS = {
  guide: token("stat.guide", "light"),
  halo: token("stat.halo", "light"),
  warm: token("stat.warm", "light"),
  bridge: token("stat.bridge", "light"),
  path: token("stat.path", "light"),
  densest: token("stat.densest", "light"),
  insight: token("stat.insight", "light"),
  ghost: token("stat.ghost", "light"),
  rising: token("stat.rising", "light"),
  fading: token("stat.fading", "light"),
  community: token("stat.community", "light"),
  reunion: token("stat.reunion", "light"),
  zglow: token("stat.zglow", "light"),
} as const;

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const t = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const i = Math.floor(t);
  const f = t - i;
  const a = sorted[i];
  const b = sorted[Math.min(sorted.length - 1, i + 1)];
  return a + (b - a) * f;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return percentile(s, 0.5);
}

export interface FeaturedPathHop {
  id: string;
  label?: string;
}

export interface RankLadderEntry {
  id: string;
  label: string;
  rank: number;
}

export interface EraBin {
  decade: number;
  count: number;
  share: number;
}

export interface ViewStatMarks {
  enabled: Set<StatMarkId>;
  top5DegreeFloor: number;
  top5DegreeIds: Set<string>;
  bottom5DegreeCeil: number;
  bottom5DegreeIds: Set<string>;
  top5ProminenceFloor: number;
  top5ProminenceIds: Set<string>;
  medianDegree: number | null;
  medianDegreeValue: number | null;
  medianPeakYear: number | null;
  medianCareerSpan: number | null;
  gapP95: number | null;
  gapSpikeIds: Set<string>;
  bridgeIds: Set<string>;
  featuredPathIds: string[];
  featuredPathEdgeKeys: Set<string>;
  densestPair: { source: string; target: string; weight: number; key: string } | null;
  insightFocusId: string | null;
  p90Weight: number | null;
  rankLadder: RankLadderEntry[];
  modeDecade: number | null;
  modalFlowKey: string | null;
  spanFence: number | null;
  spanOutlierIds: Set<string>;
  reunionEdgeKeys: Set<string>;
  oneSceneIds: Set<string>;
  risingIds: Set<string>;
  fadingIds: Set<string>;
  highEntropyIds: Set<string>;
  driftIds: Set<string>;
  zHotEdgeKeys: Set<string>;
  eraBins: EraBin[];
  earliestPeakId: string | null;
  latestPeakId: string | null;
  longestCollab: {
    source: string;
    target: string;
    years: number;
    key: string;
  } | null;
  loyaltyPair: { personId: string; collaboratorId: string } | null;
  gini: number | null;
  top10DegreeIds: Set<string>;
  top10Share: number | null;
  retentionPct: number | null;
  communityById: Map<string, number>;
  cutEdgeKeys: Set<string>;
  hop1Ids: Set<string>;
  hop2Ids: Set<string>;
  egoCenterId: string | null;
  smallIslandIds: Set<string>;
  /** Prominence-weighted mean of year_peak */
  votesCentroidYear: number | null;
  /** From manifest.summary when present */
  assortativity: number | null;
  giantComponentShare: number | null;
}

function parseFeaturedPath(manifest?: Manifest | null): FeaturedPathHop[] {
  if (!manifest) return [];
  const raw = manifest.featured_path;
  if (!Array.isArray(raw) || !raw.length) return [];
  const hops: FeaturedPathHop[] = [];
  for (const item of raw) {
    if (typeof item === "string") hops.push({ id: item });
    else if (item && typeof item === "object" && "id" in item) {
      hops.push({
        id: String((item as { id: unknown }).id),
        label:
          "label" in item && (item as { label?: unknown }).label != null
            ? String((item as { label: unknown }).label)
            : undefined,
      });
    }
  }
  return hops;
}

function connectedComponents(nodes: Node[], edges: Edge[]): string[][] {
  const ids = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    const comp: string[] = [];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    out.push(comp);
  }
  return out;
}

function hopsFrom(focusId: string, edges: Edge[], maxHop: number): { hop1: Set<string>; hop2: Set<string> } {
  const hop1 = new Set<string>();
  const hop2 = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  for (const nb of adj.get(focusId) ?? []) hop1.add(nb);
  if (maxHop >= 2) {
    for (const a of hop1) {
      for (const nb of adj.get(a) ?? []) {
        if (nb === focusId || hop1.has(nb)) continue;
        hop2.add(nb);
      }
    }
  }
  return { hop1, hop2 };
}

function giniCoefficient(values: number[]): number | null {
  if (values.length < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    sum += sorted[i];
    weighted += (i + 1) * sorted[i];
  }
  if (sum <= 0) return 0;
  return (2 * weighted) / (n * sum) - (n + 1) / n;
}

/**
 * Compute all view-local stats used by paint passes.
 * Relative to the *filtered* nodes/edges currently on screen.
 */
export function computeViewStatMarks(opts: {
  nodes: Node[];
  edges: Edge[];
  enabled: readonly StatMarkId[];
  manifest?: Manifest | null;
  insightFocusId?: string | null;
  /** Full construct size before filters — for retention meter */
  fullNodeCount?: number;
  /** Current sort — for rank ladder */
  sortBy?: SortBy;
  /** Pinned / focused person for ego rings */
  focusId?: string | null;
}): ViewStatMarks {
  const enabled = new Set(opts.enabled);
  const { nodes, edges } = opts;
  const idSet = new Set(nodes.map((n) => n.id));

  const degrees = nodes.map((n) => nodeStrength(n)).sort((a, b) => a - b);
  const medianDegreeValue = median(degrees);
  const top5Floor = degrees.length ? percentile(degrees, 0.95) : 0;
  const bottom5Ceil = degrees.length ? percentile(degrees, 0.05) : 0;
  const top5DegreeIds = new Set<string>();
  const bottom5DegreeIds = new Set<string>();
  if (degrees.length >= 4) {
    for (const n of nodes) {
      const d = nodeStrength(n);
      if (d >= top5Floor && d > 0) top5DegreeIds.add(n.id);
      if (d <= bottom5Ceil) bottom5DegreeIds.add(n.id);
    }
    if (!top5DegreeIds.size && nodes.length) {
      const best = [...nodes].sort((a, b) => nodeStrength(b) - nodeStrength(a))[0];
      if (best) top5DegreeIds.add(best.id);
    }
  }

  const prominences = nodes
    .map((n) => num(n.prominence) ?? 0)
    .sort((a, b) => a - b);
  const top5ProminenceFloor = prominences.length ? percentile(prominences, 0.95) : 0;
  const top5ProminenceIds = new Set<string>();
  if (prominences.length >= 4 && top5ProminenceFloor > 0) {
    for (const n of nodes) {
      if ((num(n.prominence) ?? 0) >= top5ProminenceFloor) top5ProminenceIds.add(n.id);
    }
  }

  const peaks = nodes
    .map((n) => ({ id: n.id, y: num(n.year_peak) ?? num(n.yearPeak) }))
    .filter((d): d is { id: string; y: number } => d.y != null);
  const medianPeakYear = median(peaks.map((p) => p.y));
  let earliestPeakId: string | null = null;
  let latestPeakId: string | null = null;
  if (peaks.length) {
    let lo = peaks[0];
    let hi = peaks[0];
    for (const p of peaks) {
      if (p.y < lo.y) lo = p;
      if (p.y > hi.y) hi = p;
    }
    earliestPeakId = lo.id;
    latestPeakId = hi.id;
  }

  const spans = nodes
    .map((n) => {
      const a = num(n.year_min) ?? num(n.yearMin);
      const b = num(n.year_max) ?? num(n.yearMax);
      if (a == null || b == null) return null;
      return { id: n.id, span: b - a };
    })
    .filter(Boolean) as Array<{ id: string; span: number }>;
  const spanVals = spans.map((s) => s.span).sort((a, b) => a - b);
  const medianCareerSpan = median(spanVals);
  let spanFence: number | null = null;
  const spanOutlierIds = new Set<string>();
  if (spanVals.length >= 6) {
    const q1 = percentile(spanVals, 0.25);
    const q3 = percentile(spanVals, 0.75);
    spanFence = q3 + 1.5 * (q3 - q1);
    for (const s of spans) {
      if (s.span > spanFence && s.span >= 20) spanOutlierIds.add(s.id);
    }
  }

  const gaps = nodes
    .map((n) => num(n.gap_years) ?? num(n.gapYears))
    .filter((g): g is number => g != null && g > 0)
    .sort((a, b) => a - b);
  const gapP95 = gaps.length >= 4 ? percentile(gaps, 0.95) : gaps.length ? gaps[gaps.length - 1] : null;
  const gapSpikeIds = new Set<string>();
  if (gapP95 != null && gapP95 >= 3) {
    for (const n of nodes) {
      const g = num(n.gap_years) ?? num(n.gapYears);
      if (g != null && g >= gapP95) gapSpikeIds.add(n.id);
    }
  }

  const bridges = nodes
    .map((n) => ({ id: n.id, score: num(n.bridge_score) ?? num(n.bridgeScore) ?? 0 }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);
  const bridgeIds = new Set<string>();
  if (bridges.length) {
    const scores = bridges.map((b) => b.score).sort((a, b) => a - b);
    const floor = percentile(scores, 0.95);
    for (const b of bridges) {
      if (b.score >= floor) bridgeIds.add(b.id);
    }
    if (bridgeIds.size > 6) {
      bridgeIds.clear();
      for (const b of bridges.slice(0, 5)) bridgeIds.add(b.id);
    }
  }

  const pathHops = parseFeaturedPath(opts.manifest);
  const featuredPathIds = pathHops.map((h) => h.id).filter((id) => idSet.has(id));
  const featuredPathEdgeKeys = new Set<string>();
  for (let i = 0; i < featuredPathIds.length - 1; i++) {
    featuredPathEdgeKeys.add(edgeKey(featuredPathIds[i], featuredPathIds[i + 1]));
  }

  let densestPair: ViewStatMarks["densestPair"] = null;
  const weights = edges.map((e) => e.weight).sort((a, b) => a - b);
  const p90Weight = weights.length ? percentile(weights, 0.9) : null;
  let weightMean = 0;
  for (const w of weights) weightMean += w;
  weightMean = weights.length ? weightMean / weights.length : 0;
  let weightVar = 0;
  for (const w of weights) weightVar += (w - weightMean) ** 2;
  const weightSd = weights.length > 1 ? Math.sqrt(weightVar / (weights.length - 1)) : 0;
  const zHotEdgeKeys = new Set<string>();

  const reunionEdgeKeys = new Set<string>();
  let longestCollab: ViewStatMarks["longestCollab"] = null;

  for (const e of edges) {
    const key = edgeKey(e.source, e.target);
    if (!densestPair || e.weight > densestPair.weight) {
      densestPair = { source: e.source, target: e.target, weight: e.weight, key };
    }
    if (weightSd > 0) {
      const z = (e.weight - weightMean) / weightSd;
      if (Math.abs(z) > 2) zHotEdgeKeys.add(key);
    }
    const gap = num(e.reunion_gap) ?? num(e.reunionGap);
    const isReunion = e.reunion === true || (gap != null && gap >= 20);
    if (isReunion) reunionEdgeKeys.add(key);

    const first = num(e.first_worked_together) ?? num(e.firstWorkedTogether);
    const last = num(e.last_worked_together) ?? num(e.lastWorkedTogether);
    if (first != null && last != null && last >= first) {
      const years = last - first;
      if (!longestCollab || years > longestCollab.years) {
        longestCollab = { source: e.source, target: e.target, years, key };
      }
    }
  }

  const insightFocusId =
    opts.insightFocusId && idSet.has(opts.insightFocusId) ? opts.insightFocusId : null;

  const sortBy = opts.sortBy ?? "strength";
  const ranked = [...nodes].sort((a, b) => compareNodesBySort(a, b, sortBy));
  // For year_peak ascending, rank ladder should still show "top" as highest degree-like —
  // use descending by sort value except year_peak where we show first 5 in lane order.
  const rankSource =
    sortBy === "year_peak"
      ? ranked.slice(0, 5)
      : ranked.slice(0, 5);
  const rankLadder: RankLadderEntry[] = rankSource.map((n, i) => ({
    id: n.id,
    label: n.label,
    rank: i + 1,
  }));

  // Mode decade from edge years
  const decadeCounts = new Map<number, number>();
  let dated = 0;
  for (const e of edges) {
    const y = num(e.year);
    if (y == null) continue;
    dated += 1;
    const d = Math.floor(y / 10) * 10;
    decadeCounts.set(d, (decadeCounts.get(d) ?? 0) + 1);
  }
  let modeDecade: number | null = null;
  let modeN = 0;
  for (const [d, n] of decadeCounts) {
    if (n > modeN) {
      modeN = n;
      modeDecade = d;
    }
  }
  const eraBins: EraBin[] = [...decadeCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({
      decade,
      count,
      share: dated ? count / dated : 0,
    }));

  // Modal gender→era flow key
  const flowCounts = new Map<string, number>();
  for (const n of nodes) {
    const g = String(n.gender || "unknown");
    const yp = num(n.year_peak) ?? num(n.yearPeak) ?? num(n.year_max);
    let era = "unknown era";
    if (yp != null) {
      if (yp < 1980) era = "pre-1980";
      else if (yp < 2000) era = "1980–1999";
      else if (yp < 2015) era = "2000–2014";
      else era = "2015+";
    }
    const k = `${g}\0${era}`;
    flowCounts.set(k, (flowCounts.get(k) ?? 0) + 1);
  }
  let modalFlowKey: string | null = null;
  let modalFlowN = 0;
  for (const [k, v] of flowCounts) {
    if (v > modalFlowN) {
      modalFlowN = v;
      modalFlowKey = k;
    }
  }

  const oneSceneIds = new Set<string>();
  const risingIds = new Set<string>();
  const fadingIds = new Set<string>();
  const highEntropyIds = new Set<string>();
  const driftIds = new Set<string>();
  const trajs = nodes
    .map((n) => ({ id: n.id, t: num(n.billing_trajectory) ?? num(n.billingTrajectory) }))
    .filter((d): d is { id: string; t: number } => d.t != null);
  const trajVals = trajs.map((d) => d.t).sort((a, b) => a - b);
  const riseFloor = trajVals.length >= 4 ? percentile(trajVals, 0.95) : null;
  const fadeCeil = trajVals.length >= 4 ? percentile(trajVals, 0.05) : null;
  const ents = nodes
    .map((n) => ({ id: n.id, e: num(n.genre_entropy) ?? num(n.genreEntropy) }))
    .filter((d): d is { id: string; e: number } => d.e != null);
  const entVals = ents.map((d) => d.e).sort((a, b) => a - b);
  const entFloor = entVals.length >= 4 ? percentile(entVals, 0.9) : null;

  for (const n of nodes) {
    if (n.one_scene_wonder === true || n.oneSceneWonder === true) oneSceneIds.add(n.id);
    const t = num(n.billing_trajectory) ?? num(n.billingTrajectory);
    if (t != null && riseFloor != null && t >= riseFloor && t > 0) risingIds.add(n.id);
    if (t != null && fadeCeil != null && t <= fadeCeil && t < 0) fadingIds.add(n.id);
    const ent = num(n.genre_entropy) ?? num(n.genreEntropy);
    if (ent != null && entFloor != null && ent >= entFloor) highEntropyIds.add(n.id);
    const drift = num(n.genre_drift) ?? num(n.drift);
    if (drift != null && drift > 0.35) driftIds.add(n.id);
    else if (n.early_genre && n.late_genre && n.early_genre !== n.late_genre) driftIds.add(n.id);
  }

  // Loyalty: highest collaborator_loyalty with a top_collaborator_id in view
  let loyaltyPair: ViewStatMarks["loyaltyPair"] = null;
  let bestLoyalty = -1;
  for (const n of nodes) {
    const loy = num(n.collaborator_loyalty) ?? num(n.collaboratorLoyalty);
    const partner = String(n.top_collaborator_id ?? n.topCollaboratorId ?? "");
    if (loy == null || !partner || !idSet.has(partner)) continue;
    if (loy > bestLoyalty) {
      bestLoyalty = loy;
      loyaltyPair = { personId: n.id, collaboratorId: partner };
    }
  }

  const gini = giniCoefficient(nodes.map((n) => nodeStrength(n)));
  const top10DegreeIds = new Set<string>();
  let top10Share: number | null = null;
  if (nodes.length >= 5) {
    const byDeg = [...nodes].sort((a, b) => nodeStrength(b) - nodeStrength(a));
    const k = Math.max(1, Math.ceil(nodes.length * 0.1));
    let topSum = 0;
    let allSum = 0;
    for (const n of nodes) allSum += nodeStrength(n);
    for (let i = 0; i < k; i++) {
      top10DegreeIds.add(byDeg[i].id);
      topSum += nodeStrength(byDeg[i]);
    }
    top10Share = allSum > 0 ? topSum / allSum : null;
  }

  const fullN = opts.fullNodeCount ?? nodes.length;
  const retentionPct =
    fullN > 0 ? Math.round((nodes.length / fullN) * 1000) / 10 : null;

  const communityById = new Map<string, number>();
  for (const n of nodes) {
    const c = num(n.community);
    if (c != null) communityById.set(n.id, c);
  }
  const cutEdgeKeys = new Set<string>();
  if (communityById.size) {
    for (const e of edges) {
      const a = communityById.get(e.source);
      const b = communityById.get(e.target);
      if (a != null && b != null && a !== b) cutEdgeKeys.add(edgeKey(e.source, e.target));
    }
  }

  const focusId = opts.focusId && idSet.has(opts.focusId) ? opts.focusId : null;
  const { hop1, hop2 } = focusId
    ? hopsFrom(focusId, edges, 2)
    : { hop1: new Set<string>(), hop2: new Set<string>() };

  const comps = connectedComponents(nodes, edges);
  const smallIslandIds = new Set<string>();
  for (const c of comps) {
    if (c.length > 0 && c.length <= 3 && comps.length >= 2) {
      for (const id of c) smallIslandIds.add(id);
    }
  }

  let votesCentroidYear: number | null = null;
  {
    let wSum = 0;
    let yw = 0;
    for (const n of nodes) {
      const y = num(n.year_peak) ?? num(n.yearPeak);
      if (y == null) continue;
      const w = Math.max(0.01, num(n.prominence) ?? nodeStrength(n) ?? 1);
      wSum += w;
      yw += y * w;
    }
    if (wSum > 0) votesCentroidYear = yw / wSum;
  }

  const assortativity =
    opts.manifest?.summary?.assortativity != null
      ? Number(opts.manifest.summary.assortativity)
      : null;
  const giantComponentShare =
    opts.manifest?.summary?.giant_component_share != null
      ? Number(opts.manifest.summary.giant_component_share)
      : null;

  return {
    enabled,
    top5DegreeFloor: top5Floor,
    top5DegreeIds,
    bottom5DegreeCeil: bottom5Ceil,
    bottom5DegreeIds,
    top5ProminenceFloor,
    top5ProminenceIds,
    medianDegree: medianDegreeValue,
    medianDegreeValue,
    medianPeakYear,
    medianCareerSpan,
    gapP95,
    gapSpikeIds,
    bridgeIds,
    featuredPathIds,
    featuredPathEdgeKeys,
    densestPair,
    insightFocusId,
    p90Weight,
    rankLadder,
    modeDecade,
    modalFlowKey,
    spanFence,
    spanOutlierIds,
    reunionEdgeKeys,
    oneSceneIds,
    risingIds,
    fadingIds,
    highEntropyIds,
    driftIds,
    zHotEdgeKeys,
    eraBins,
    earliestPeakId,
    latestPeakId,
    longestCollab,
    loyaltyPair,
    gini,
    top10DegreeIds,
    top10Share,
    retentionPct,
    communityById,
    cutEdgeKeys,
    hop1Ids: hop1,
    hop2Ids: hop2,
    egoCenterId: focusId,
    smallIslandIds,
    votesCentroidYear,
    assortativity: Number.isFinite(assortativity as number) ? assortativity : null,
    giantComponentShare: Number.isFinite(giantComponentShare as number)
      ? giantComponentShare
      : null,
  };
}

export function hasStat(stats: ViewStatMarks, id: StatMarkId): boolean {
  return stats.enabled.has(id);
}

export function isTop5Degree(stats: ViewStatMarks, id: string): boolean {
  return hasStat(stats, "top5_degree") && stats.top5DegreeIds.has(id);
}

export function isBottom5Degree(stats: ViewStatMarks, id: string): boolean {
  return hasStat(stats, "bottom5_degree") && stats.bottom5DegreeIds.has(id);
}

export function isTop5Prominence(stats: ViewStatMarks, id: string): boolean {
  return hasStat(stats, "top5_prominence") && stats.top5ProminenceIds.has(id);
}

export function isBridge(stats: ViewStatMarks, id: string): boolean {
  return hasStat(stats, "bridge_outliers") && stats.bridgeIds.has(id);
}

export function isGapSpike(stats: ViewStatMarks, id: string): boolean {
  return hasStat(stats, "gap_spikes") && stats.gapSpikeIds.has(id);
}

export function isSpanOutlier(stats: ViewStatMarks, id: string): boolean {
  return hasStat(stats, "span_outliers") && stats.spanOutlierIds.has(id);
}

export function isInsightFocus(stats: ViewStatMarks, id: string): boolean {
  return hasStat(stats, "insight_sync") && stats.insightFocusId === id;
}

export function isFeaturedNode(stats: ViewStatMarks, id: string): boolean {
  return hasStat(stats, "featured_path") && stats.featuredPathIds.includes(id);
}

export function isFeaturedEdge(stats: ViewStatMarks, source: string, target: string): boolean {
  return hasStat(stats, "featured_path") && stats.featuredPathEdgeKeys.has(edgeKey(source, target));
}

export function isDensestPair(stats: ViewStatMarks, source: string, target: string): boolean {
  return (
    hasStat(stats, "densest_pair") &&
    !!stats.densestPair &&
    stats.densestPair.key === edgeKey(source, target)
  );
}

export function isReunionEdge(stats: ViewStatMarks, source: string, target: string): boolean {
  return hasStat(stats, "reunion_edges") && stats.reunionEdgeKeys.has(edgeKey(source, target));
}

export function isCutEdge(stats: ViewStatMarks, source: string, target: string): boolean {
  return hasStat(stats, "community_cuts") && stats.cutEdgeKeys.has(edgeKey(source, target));
}

export function isZHotEdge(stats: ViewStatMarks, source: string, target: string): boolean {
  return hasStat(stats, "weight_zscore") && stats.zHotEdgeKeys.has(edgeKey(source, target));
}

export function isLongestCollab(stats: ViewStatMarks, source: string, target: string): boolean {
  return (
    hasStat(stats, "longest_collab") &&
    !!stats.longestCollab &&
    stats.longestCollab.key === edgeKey(source, target)
  );
}

export function isLoyaltyNode(stats: ViewStatMarks, id: string): boolean {
  if (!hasStat(stats, "loyalty_pair") || !stats.loyaltyPair) return false;
  return stats.loyaltyPair.personId === id || stats.loyaltyPair.collaboratorId === id;
}

export function isP90Edge(stats: ViewStatMarks, weight: number): boolean {
  if (!hasStat(stats, "p90_edges") || stats.p90Weight == null) return true;
  return weight >= stats.p90Weight;
}

export function nodeOpacityMod(stats: ViewStatMarks | null | undefined, id: string): number {
  if (!stats) return 1;
  let op = 1;
  if (isBottom5Degree(stats, id)) op = Math.min(op, 0.18);
  if (hasStat(stats, "island_ghost") && stats.smallIslandIds.has(id)) op = Math.min(op, 0.22);
  if (hasStat(stats, "giant_component") && stats.smallIslandIds.has(id)) op = Math.min(op, 0.2);
  if (hasStat(stats, "ego_rings") && stats.egoCenterId) {
    if (id === stats.egoCenterId || stats.hop1Ids.has(id)) {
      /* full */
    } else if (stats.hop2Ids.has(id)) op = Math.min(op, 0.55);
    else op = Math.min(op, 0.12);
  }
  return op;
}

/** Halo stroke for a person mark — insight > top5 > featured > gini top10. */
export function nodeStatStroke(
  stats: ViewStatMarks | null | undefined,
  id: string,
): { stroke: string; strokeWidth: number; dashed?: boolean } | null {
  if (!stats) return null;
  if (isInsightFocus(stats, id)) {
    return { stroke: STAT_COLORS.insight, strokeWidth: 2.2, dashed: true };
  }
  if (isLoyaltyNode(stats, id)) {
    return { stroke: STAT_COLORS.path, strokeWidth: 2, dashed: true };
  }
  if (isTop5Degree(stats, id)) {
    return { stroke: STAT_COLORS.halo, strokeWidth: 2 };
  }
  if (isTop5Prominence(stats, id)) {
    return { stroke: STAT_COLORS.warm, strokeWidth: 1.8 };
  }
  if (hasStat(stats, "gini_callout") && stats.top10DegreeIds.has(id)) {
    return { stroke: STAT_COLORS.halo, strokeWidth: 1.4, dashed: true };
  }
  if (isFeaturedNode(stats, id)) {
    return { stroke: STAT_COLORS.path, strokeWidth: 1.6 };
  }
  if (isSpanOutlier(stats, id)) {
    return { stroke: STAT_COLORS.guide, strokeWidth: 1.8 };
  }
  return null;
}

export function nodeFillOverride(
  stats: ViewStatMarks | null | undefined,
  id: string,
  base: string,
): string {
  if (!stats) return base;
  if (isTop5Prominence(stats, id)) return STAT_COLORS.warm;
  return base;
}

export function parseStatMarksParam(raw: string | null, fallback: StatMarkId[]): StatMarkId[] {
  if (raw == null || raw === "") return fallback;
  if (raw === "0" || raw === "none") return [];
  if (raw === "1" || raw === "all") return [...ALL_STAT_MARKS];
  if (raw in STAT_PRESETS) return [...STAT_PRESETS[raw]];
  const allowed = new Set(ALL_STAT_MARKS);
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean) as StatMarkId[];
  return parts.filter((p) => allowed.has(p));
}

export function serializeStatMarks(marks: readonly StatMarkId[]): string {
  if (!marks.length) return "none";
  for (const [name, preset] of Object.entries(STAT_PRESETS)) {
    if (
      name !== "none" &&
      preset.length === marks.length &&
      preset.every((m) => marks.includes(m))
    ) {
      return name;
    }
  }
  if (marks.length === ALL_STAT_MARKS.length && ALL_STAT_MARKS.every((m) => marks.includes(m))) {
    return "all";
  }
  return marks.join(",");
}

export function toggleStatMark(marks: readonly StatMarkId[], id: StatMarkId): StatMarkId[] {
  if (marks.includes(id)) return marks.filter((m) => m !== id);
  return [...marks, id];
}

export function showMedianSize(stats: ViewStatMarks | null | undefined): boolean {
  return !!stats && hasStat(stats, "median_size");
}

export function showMedianPeak(stats: ViewStatMarks | null | undefined): boolean {
  return !!stats && hasStat(stats, "median_peak") && stats.medianPeakYear != null;
}

export function linkStatStyle(
  stats: ViewStatMarks | null | undefined,
  source: string,
  target: string,
  weight?: number,
): {
  stroke?: string;
  strokeWidthBoost: number;
  strokeOpacity?: number;
  dash?: string;
  thin?: boolean;
} | null {
  if (!stats) return null;
  if (isDensestPair(stats, source, target)) {
    return { stroke: STAT_COLORS.densest, strokeWidthBoost: 1.8, strokeOpacity: 0.95 };
  }
  if (isLongestCollab(stats, source, target)) {
    return { stroke: STAT_COLORS.path, strokeWidthBoost: 1.5, strokeOpacity: 0.92, dash: "6 3" };
  }
  if (isFeaturedEdge(stats, source, target)) {
    return {
      stroke: STAT_COLORS.path,
      strokeWidthBoost: 1.2,
      strokeOpacity: 0.9,
      dash: "5 3",
    };
  }
  if (isReunionEdge(stats, source, target)) {
    return {
      stroke: STAT_COLORS.reunion,
      strokeWidthBoost: 1.1,
      strokeOpacity: 0.9,
      dash: "2 4",
    };
  }
  if (isZHotEdge(stats, source, target)) {
    return { stroke: STAT_COLORS.zglow, strokeWidthBoost: 1.4, strokeOpacity: 0.95 };
  }
  if (isCutEdge(stats, source, target)) {
    return {
      stroke: STAT_COLORS.community,
      strokeWidthBoost: 0.8,
      strokeOpacity: 0.85,
      dash: "1 2",
    };
  }
  if (weight != null && hasStat(stats, "p90_edges") && !isP90Edge(stats, weight)) {
    return { strokeWidthBoost: -0.4, strokeOpacity: 0.12, thin: true };
  }
  return null;
}

/** Short labels for which marks currently apply to a person. */
export function describeNodeStats(stats: ViewStatMarks | null | undefined, id: string): string[] {
  if (!stats) return [];
  const tags: string[] = [];
  if (isInsightFocus(stats, id)) tags.push("insight");
  if (isTop5Degree(stats, id)) tags.push("top 5% strength");
  if (isTop5Prominence(stats, id)) tags.push("top 5% votes");
  if (isBottom5Degree(stats, id)) tags.push("bottom 5%");
  if (isBridge(stats, id)) tags.push("bridge");
  if (isSpanOutlier(stats, id)) tags.push("long span");
  if (isGapSpike(stats, id)) tags.push("gap");
  if (hasStat(stats, "one_scene_wonder") && stats.oneSceneIds.has(id)) tags.push("one-scene");
  if (hasStat(stats, "billing_glyphs") && stats.risingIds.has(id)) tags.push("rising");
  if (hasStat(stats, "billing_glyphs") && stats.fadingIds.has(id)) tags.push("fading");
  if (hasStat(stats, "genre_entropy") && stats.highEntropyIds.has(id)) tags.push("poly-genre");
  if (hasStat(stats, "genre_drift") && stats.driftIds.has(id)) tags.push("genre drift");
  if (isLoyaltyNode(stats, id)) tags.push("loyalty");
  if (hasStat(stats, "gini_callout") && stats.top10DegreeIds.has(id)) tags.push("top 10% strength");
  if (hasStat(stats, "giant_component") && !stats.smallIslandIds.has(id) && stats.giantComponentShare != null) {
    tags.push("giant");
  }
  if (isFeaturedNode(stats, id)) tags.push("featured path");
  if (stats.earliestPeakId === id && hasStat(stats, "peak_extremes")) tags.push("earliest peak");
  if (stats.latestPeakId === id && hasStat(stats, "peak_extremes")) tags.push("latest peak");
  return tags;
}
