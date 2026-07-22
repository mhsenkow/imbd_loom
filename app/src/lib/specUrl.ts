/** Encode / decode PosterSpec fields for print URLs and export. */

import { DEFAULT_SPEC, type PosterSpec } from "./types";

const KEYS = [
  "construct",
  "size",
  "hero",
  "topN",
  "minWeight",
  "minTitles",
  "minDegree",
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
  "hideIsolates",
  "strip",
  "warps",
  "maxWarps",
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
  const flag = (k: string, fallback: boolean) => {
    if (!params.has(k)) return fallback;
    const v = params.get(k);
    return v === "1" || v === "true";
  };

  return {
    ...base,
    activeConstruct: params.get("construct") || base.activeConstruct,
    pageSize: str("size", base.pageSize, ["a1", "a0", "tabloid", "letter"] as const),
    heroForm: str("hero", base.heroForm, ["chord", "bundle", "timeline"] as const),
    topN: num("topN", base.topN),
    minWeight: num("minWeight", base.minWeight),
    minTitles: num("minTitles", base.minTitles),
    minDegree: num("minDegree", base.minDegree),
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
    edgeYearFilter: flag("edgeYear", base.edgeYearFilter),
    hideIsolates: flag("hideIsolates", base.hideIsolates),
    showStrip: flag("strip", base.showStrip),
    showWarps: flag("warps", base.showWarps),
    maxWarps: num("maxWarps", base.maxWarps),
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
    minDegree: String(spec.minDegree),
    gender: spec.genderFilter,
    yearFrom: String(spec.yearFrom),
    yearTo: String(spec.yearTo),
    searchMode: spec.searchMode,
    palette: spec.palette,
    labelMode: spec.labelMode,
    colorMode: spec.colorMode,
    sortBy: spec.sortBy,
    maxWarps: String(spec.maxWarps),
    hideIsolates: spec.hideIsolates ? "1" : "0",
    strip: spec.showStrip ? "1" : "0",
    warps: spec.showWarps ? "1" : "0",
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
