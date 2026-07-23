/** Shared types for construct JSON. */

import {
  PALETTES as THEME_PALETTES,
  type PaletteName,
} from "./theme/tokens";
import { genderColors } from "./colors";

export type Gender = "male" | "female" | "nonbinary" | "unknown";

/** ≤6 categorical hues — re-exported from theme/tokens (single source of truth). */
export const PALETTES: Record<string, readonly string[]> = THEME_PALETTES;

export type { PaletteName };

/**
 * Default gender swatches (loom slots). Prefer `genderColors(palette)` at render
 * so legends track the active palette.
 */
export const GENDER_COLORS: Record<string, string> = genderColors("loom", "light");

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

export interface BuildStats {
  population_sql?: number;
  credit_rows?: number;
  after_degree_cap?: number;
  people_faceted?: number;
  min_shared?: number;
  min_votes?: number;
  era_slices?: number;
  validation_warnings?: string[];
  stages_source?: string;
  [key: string]: unknown;
}

export interface ManifestSummary {
  degree_max?: number;
  degree_median?: number;
  era_histogram?: Record<string, number>;
  gender_mix?: Record<string, number>;
  top_name?: string;
}

export interface FeaturedPathHop {
  id: string;
  label: string;
}

export interface Quality {
  id?: string;
  node_count: number;
  edge_count: number;
  missing_birth_year_pct: number;
  gender_unknown_pct: number;
  prominence_coverage_pct: number;
  edges_with_year_pct: number;
  /** Optional enrichment coverage (pipeline may add these). */
  tmdb_coverage_pct?: number;
  voice_flag_source?: string;
  bechdel_matched_pct?: number;
  validation_warnings?: string[];
  imdb_snapshot_as_of?: string;
  gender_method?: string;
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
  build_seed?: number;
  build_stats?: BuildStats;
  imdb_snapshot_files?: Record<string, string>;
  min_shared_titles?: number;
  top_n?: number;
  avg_path_length?: number;
  avg_path_sample_n?: number;
  clustering_coefficient?: number;
  community_count?: number;
  featured_path?: FeaturedPathHop[];
  summary?: ManifestSummary;
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

