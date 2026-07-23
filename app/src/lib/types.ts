/** Shared types for construct JSON. */

export type Gender = "male" | "female" | "nonbinary" | "unknown";

/**
 * Statistical overlay marks for hero / alluvial.
 * Default set stays lean; sidebar can enable the rest.
 */
export type StatMarkId =
  // Core / first-ship
  | "top5_degree"
  | "median_size"
  | "median_peak"
  | "gap_spikes"
  | "bridge_outliers"
  | "featured_path"
  | "densest_pair"
  | "insight_sync"
  // Percentiles & rank
  | "bottom5_degree"
  | "top5_prominence"
  | "p90_edges"
  | "rank_ladder"
  // Central tendency
  | "median_career"
  | "mode_decade"
  | "modal_flow"
  // Outliers
  | "span_outliers"
  | "reunion_edges"
  | "one_scene_wonder"
  | "billing_glyphs"
  | "genre_entropy"
  | "genre_drift"
  | "weight_zscore"
  // Distributions / story
  | "era_histogram"
  | "peak_extremes"
  | "longest_collab"
  | "loyalty_pair"
  | "gini_callout"
  | "retention_meter"
  // Graph structure
  | "community_cuts"
  | "ego_rings"
  | "island_ghost"
  | "votes_centroid";

export const DEFAULT_STAT_MARKS: StatMarkId[] = [
  "top5_degree",
  "median_size",
  "median_peak",
  "gap_spikes",
  "bridge_outliers",
  "featured_path",
  "densest_pair",
  "insight_sync",
];

export interface RoleCredit {
  title: string;
  character?: string | null;
  year?: number | null;
  billing?: number | null;
  tconst?: string;
  votes?: number;
}

export interface Node {
  id: string;
  label: string;
  type: "person" | "title" | "genre" | "role";
  gender?: Gender | string;
  degree: number;
  roles?: RoleCredit[];
  [key: string]: unknown;
}

export interface SharedTitle {
  title: string;
  year?: number | null;
  tconst?: string;
  votes?: number;
}

export interface Edge {
  source: string;
  target: string;
  weight: number;
  construct: string;
  year?: number;
  /** Example titles both people appear in */
  shared?: SharedTitle[];
  [key: string]: unknown;
}

export interface StageRow {
  stageFrom: string;
  stageTo: string;
  categoryFrom: string;
  categoryTo: string;
  value: number;
}

export interface Manifest {
  id: string;
  title: string;
  subtitle: string;
  key_variable: string;
  built_at: string;
  node_count: number;
  edge_count: number;
  stage_row_count: number;
  method_note: string;
  data_credit: string;
  gender_method?: string;
  tmdb_gender_rows?: number;
  [key: string]: unknown;
}

export interface ConstructData {
  nodes: Node[];
  edges: Edge[];
  stages: StageRow[];
  manifest: Manifest;
}

export interface Annotation {
  id: string;
  text: string;
  /** mm coords relative to artboard */
  x: number;
  y: number;
  /** optional target node id */
  targetId?: string;
}

export type GenderFilter = "all" | Gender;
export type SortBy = "degree" | "prominence" | "year_peak" | "title_count";
export type ColorMode = "auto" | "gender" | "degree" | "prominence" | "genre";
export type ColorBy = "gender" | "degree" | "prominence" | "genre";
export type LabelMode = "hubs" | "all" | "none";
export type SearchMode = "highlight" | "isolate";
/** Link stroke / ribbon weight encoding */
export type ThicknessBy = "shared" | "uniform" | "recency";
/** Person mark scale (timeline bars, etc.) */
export type SizeBy = "degree" | "prominence" | "titles" | "uniform";

export interface PosterSpec {
  pageSize: "a1" | "a0" | "tabloid" | "letter";
  activeConstruct: string;
  heroForm: "chord" | "bundle" | "timeline";
  topN: number;
  minWeight: number;
  showSafeGuide: boolean;
  showCropMarks: boolean;
  annotations: Annotation[];
  palette: string;
  /** Connecting filters — reshape who/what appears in the weave */
  genderFilter: GenderFilter;
  yearFrom: number;
  yearTo: number;
  minTitles: number;
  sortBy: SortBy;
  colorMode: ColorMode;
  labelMode: LabelMode;
  thicknessBy: ThicknessBy;
  sizeBy: SizeBy;
  /** When someone is pinned, keep only their neighborhood */
  neighborhoodOnly: boolean;
  /** Hide edges whose collaboration year is outside the year window */
  edgeYearFilter: boolean;
  /** Find movie / character / person and highlight or isolate their web */
  searchQuery: string;
  searchMode: SearchMode;
  /** Timeline: swap axes (years vertical, people across) */
  timelineFlip: boolean;
  /** Drop people with no surviving links after edge filters */
  hideIsolates: boolean;
  /** Minimum collaboration degree (pre top-N) */
  minDegree: number;
  /** Show construct-thread strip under the hero */
  showStrip: boolean;
  /** Draw warp threads across strip panels */
  showWarps: boolean;
  /** Cap how many warp threads render */
  maxWarps: number;
  /** Statistical overlay marks on hero / alluvial */
  statMarks: StatMarkId[];
}

export const DEFAULT_SPEC: PosterSpec = {
  pageSize: "a1",
  activeConstruct: "voice_cartoons",
  heroForm: "timeline",
  topN: 160,
  minWeight: 2,
  showSafeGuide: false,
  showCropMarks: true,
  annotations: [],
  palette: "loom",
  genderFilter: "all",
  yearFrom: 1920,
  yearTo: 2030,
  minTitles: 1,
  sortBy: "degree",
  colorMode: "auto",
  labelMode: "hubs",
  thicknessBy: "shared",
  sizeBy: "degree",
  neighborhoodOnly: false,
  edgeYearFilter: false,
  searchQuery: "",
  searchMode: "highlight",
  timelineFlip: false,
  hideIsolates: true,
  minDegree: 0,
  showStrip: true,
  showWarps: true,
  maxWarps: 24,
  statMarks: [...DEFAULT_STAT_MARKS],
};

/** ≤6 categorical hues — print-safe, not fully saturated */
export const PALETTES: Record<string, string[]> = {
  /** Print-safe categorical weave (primary) */
  loom: ["#C45C26", "#2F5D50", "#C4A35A", "#5B4B8A", "#8B3A3A", "#3D5A80"],
  /** Grayscale letterpress — first-class poster mode */
  ink: ["#1a1814", "#3a3630", "#6e6a62", "#9a958c", "#c4bfb4", "#e8e0d0"],
  /** Soft dusk — first-class poster mode (warm, print-safe) */
  dusk: ["#E07A5F", "#3D405B", "#81B29A", "#F2CC8F", "#C4A35A", "#6D597A"],
};

/** Midtones for ribbon/link gradients (same hue family, softer ink). */
export const PALETTE_MIDTONES: Record<string, string[]> = {
  loom: ["#D4845A", "#4A7A6C", "#D4B87A", "#7A6BA0", "#A55A5A", "#5A7294"],
  ink: ["#2e2c28", "#524e48", "#848078", "#b0aaa0", "#d4cfc4", "#f0ebe2"],
  dusk: ["#E8947C", "#555870", "#9AC4B0", "#F5D9A8", "#D4B87A", "#857294"],
};

export const GENDER_COLORS: Record<string, string> = {
  female: "#C45C26",
  male: "#2F5D50",
  nonbinary: "#5B4B8A",
  unknown: "#9a958c",
};
