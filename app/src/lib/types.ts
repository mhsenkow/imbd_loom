/** Shared types for construct JSON. */

export type Gender = "male" | "female" | "nonbinary" | "unknown";

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
export type ColorMode = "auto" | "gender" | "degree";
export type LabelMode = "hubs" | "all" | "none";
export type SearchMode = "highlight" | "isolate";

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
  /** When someone is pinned, keep only their neighborhood */
  neighborhoodOnly: boolean;
  /** Hide edges whose collaboration year is outside the year window */
  edgeYearFilter: boolean;
  /** Find movie / character / person and highlight or isolate their web */
  searchQuery: string;
  searchMode: SearchMode;
  /** Timeline: swap axes (years vertical, people across) */
  timelineFlip: boolean;
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
  neighborhoodOnly: false,
  edgeYearFilter: false,
  searchQuery: "",
  searchMode: "highlight",
  timelineFlip: false,
};

/** ≤6 categorical hues — print-safe, not fully saturated */
export const PALETTES: Record<string, string[]> = {
  loom: ["#C45C26", "#2F5D50", "#C4A35A", "#5B4B8A", "#8B3A3A", "#3D5A80"],
  ink: ["#1a1a1a", "#4a4a4a", "#7a7a7a", "#a0a0a0", "#c4c4c4", "#e0e0e0"],
  dusk: ["#E07A5F", "#3D405B", "#81B29A", "#F2CC8F", "#F4F1DE", "#6D597A"],
};

export const GENDER_COLORS: Record<string, string> = {
  female: "#C45C26",
  male: "#2F5D50",
  nonbinary: "#5B4B8A",
  unknown: "#9a958c",
};
