/** Encode / decode PosterSpec fields for print URLs and export. */

import { DEFAULT_SPEC, type PosterSpec } from "./types";

const KEYS = [
  "construct",
  "size",
  "hero",
  "topN",
  "minWeight",
  "minTitles",
  "gender",
  "yearFrom",
  "yearTo",
  "search",
  "searchMode",
  "flip",
  "palette",
  "labelMode",
  "colorMode",
  "sortBy",
  "neighborhood",
  "edgeYear",
] as const;

export function specFromSearchParams(
  params: URLSearchParams,
  base: PosterSpec = DEFAULT_SPEC,
): PosterSpec {
  const num = (k: string, fallback: number) => {
    const v = params.get(k);
    if (v == null || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = <T extends string>(k: string, fallback: T, allowed?: readonly T[]): T => {
    const v = params.get(k) as T | null;
    if (!v) return fallback;
    if (allowed && !allowed.includes(v)) return fallback;
    return v;
  };

  return {
    ...base,
    activeConstruct: params.get("construct") || base.activeConstruct,
    pageSize: str("size", base.pageSize, ["a1", "a0", "tabloid", "letter"] as const),
    heroForm: str("hero", base.heroForm, ["chord", "bundle", "timeline"] as const),
    topN: num("topN", base.topN),
    minWeight: num("minWeight", base.minWeight),
    minTitles: num("minTitles", base.minTitles),
    genderFilter: str(
      "gender",
      base.genderFilter,
      ["all", "female", "male", "nonbinary", "unknown"] as const,
    ),
    yearFrom: num("yearFrom", base.yearFrom),
    yearTo: num("yearTo", base.yearTo),
    searchQuery: params.get("search") ?? base.searchQuery,
    searchMode: str("searchMode", base.searchMode, ["highlight", "isolate"] as const),
    timelineFlip: params.get("flip") === "1" || params.get("flip") === "true",
    palette: params.get("palette") || base.palette,
    labelMode: str("labelMode", base.labelMode, ["hubs", "all", "none"] as const),
    colorMode: str("colorMode", base.colorMode, ["auto", "gender", "degree"] as const),
    sortBy: str(
      "sortBy",
      base.sortBy,
      ["degree", "prominence", "year_peak", "title_count"] as const,
    ),
    neighborhoodOnly:
      params.get("neighborhood") === "1" || params.get("neighborhood") === "true",
    edgeYearFilter:
      params.has("edgeYear")
        ? params.get("edgeYear") === "1" || params.get("edgeYear") === "true"
        : base.edgeYearFilter,
  };
}

export function specToQuery(spec: PosterSpec): Record<string, string> {
  const q: Record<string, string> = {
    construct: spec.activeConstruct,
    size: spec.pageSize,
    hero: spec.heroForm,
    topN: String(spec.topN),
    minWeight: String(spec.minWeight),
    minTitles: String(spec.minTitles),
    gender: spec.genderFilter,
    yearFrom: String(spec.yearFrom),
    yearTo: String(spec.yearTo),
    searchMode: spec.searchMode,
    palette: spec.palette,
    labelMode: spec.labelMode,
    colorMode: spec.colorMode,
    sortBy: spec.sortBy,
  };
  if (spec.searchQuery.trim()) q.search = spec.searchQuery.trim();
  if (spec.timelineFlip) q.flip = "1";
  if (spec.neighborhoodOnly) q.neighborhood = "1";
  if (spec.edgeYearFilter) q.edgeYear = "1";
  else q.edgeYear = "0";
  return q;
}

export function specToSearchParams(spec: PosterSpec): URLSearchParams {
  return new URLSearchParams(specToQuery(spec));
}

void KEYS;
