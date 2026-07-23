/**
 * Data provenance — sources, metric definitions, caveats, accuracy table.
 * Single source of truth for the Trust the data / methodology page.
 */

export interface DataSource {
  id: string;
  name: string;
  url: string;
  provides: string;
  caveat: string;
  /** required | optional | best-effort */
  status: "required" | "optional" | "best-effort";
}

export interface MetricDef {
  id: string;
  label: string;
  definition: string;
  formula: string;
  sourceFile: string;
  relatedCaveatIds?: string[];
}

export interface Caveat {
  id: string;
  text: string;
  appliesTo: string;
}

export interface AccuracyRow {
  id: string;
  signal: string;
  accuracy: "High" | "Medium" | "Medium-high" | "Synthetic" | "As good as the source";
  notes: string;
  sourceId?: string;
  metricId?: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: "imdb",
    name: "IMDb Non-Commercial Datasets",
    url: "https://datasets.imdbws.com",
    provides: "people, titles, principals, ratings, crew, episodes, akas",
    caveat: "Top-billed cast only (title.principals); non-commercial license",
    status: "required",
  },
  {
    id: "tmdb",
    name: "TMDB API v3",
    url: "https://www.themoviedb.org",
    provides: "gender, birth country, popularity",
    caveat: "Skipped without TMDB_API_KEY → falls back to actor/actress proxy",
    status: "optional",
  },
  {
    id: "wikidata",
    name: "Wikidata SPARQL",
    url: "https://query.wikidata.org",
    provides: "voice-actor flag (P106), nationality, awards, kin",
    caveat: "May be blocked (403) → IMDb character '(voice)' heuristic",
    status: "best-effort",
  },
  {
    id: "bechdel",
    name: "Bechdel Test API",
    url: "https://bechdeltest.com",
    provides: "film Bechdel rating 0–3",
    caveat: "Community-sourced; not every film is scored",
    status: "best-effort",
  },
  {
    id: "bechdel-mirror",
    name: "Bechdel mirror (TidyTuesday)",
    url: "https://github.com/rfordatascience/tidytuesday",
    provides: "Bechdel CSV fallback",
    caveat: "Used only when the live API fails",
    status: "best-effort",
  },
  {
    id: "movielens",
    name: "MovieLens (ml-latest-small)",
    url: "https://grouplens.org/datasets/movielens/",
    provides: "user tags",
    caveat: "Small dataset, limited coverage",
    status: "best-effort",
  },
  {
    id: "pageviews",
    name: "Wikimedia Pageviews",
    url: "https://wikimedia.org/api/rest_v1/",
    provides: "2024 pageviews",
    caveat: "Explicit stub — ≤40 names sampled",
    status: "best-effort",
  },
];

export const METRIC_DEFS: MetricDef[] = [
  {
    id: "edge",
    label: "Edge (co-appearance)",
    definition:
      "Two people both credited as actor/actress on the same title_key. Self-join with a.nconst < b.nconst; keep pairs with shared_count ≥ min_shared (default 2).",
    formula: "edge(a,b) ⇔ |titles(a) ∩ titles(b)| ≥ min_shared",
    sourceFile: "pipeline/loom/constructs/emit.py",
    relatedCaveatIds: ["top-billed", "one-role-synthetic"],
  },
  {
    id: "episode-collapse",
    label: "Episode collapse",
    definition:
      "Episodes roll up to the parent series so a sitcom cast is one strong edge, not hundreds of weak ones.",
    formula: "title_key = COALESCE(parentTconst, tconst)",
    sourceFile: "pipeline/loom/constructs/emit.py",
  },
  {
    id: "weight",
    label: "Edge weight",
    definition:
      "Log-vote-weighted sum over shared titles. Plain shared-title count is also available as thickness encoding.",
    formula: "weight = ROUND(Σ ln(votes + 1))",
    sourceFile: "pipeline/loom/constructs/emit.py",
  },
  {
    id: "degree",
    label: "Node degree (neighbors)",
    definition:
      "Count of distinct neighbors in the construct graph. Not the same as strength.",
    formula: "degree(v) = |{u : edge(v,u)}|",
    sourceFile: "pipeline/loom/constructs/emit.py",
  },
  {
    id: "strength",
    label: "Node strength (hub signal)",
    definition:
      "Sum of incident edge weights. Top-N ranking and default color/size use strength. Pre-metrics_version-2 JSON mislabeled this as degree.",
    formula: "strength(v) = Σ_{e ∋ v} weight(e)",
    sourceFile: "pipeline/loom/constructs/emit.py",
  },
  {
    id: "prominence",
    label: "Prominence (log-votes)",
    definition:
      "Log-vote, billing-discounted career signal (canonical). Raw votes version kept as prominence_raw.",
    formula: "prominence = Σ ln(votes + 1) / max(ordering, 1)",
    sourceFile: "pipeline/loom/facets.py",
  },
  {
    id: "pagerank",
    label: "PageRank",
    definition: "Weighted PageRank (damping 0.85) — influence independent of raw fame.",
    formula: "PR = (1−d)/n + d Σ_{u→v} PR(u)·w(u,v)/strength(u)",
    sourceFile: "pipeline/loom/analytics.py",
  },
  {
    id: "acclaim-gap",
    label: "Acclaim–popularity gap",
    definition: "z(title_rating_median) − z(prominence) within the construct.",
    formula: "acclaim_gap = z(rating) − z(prominence)",
    sourceFile: "pipeline/loom/analytics.py",
  },
  {
    id: "betweenness",
    label: "Betweenness / bridge score",
    definition: "Brandes betweenness on the unweighted graph, normalized.",
    formula: "c_B(v) / ((n−1)(n−2))",
    sourceFile: "pipeline/loom/analytics.py",
  },
  {
    id: "clustering",
    label: "Clustering coefficient",
    definition: "Local clustering averaged over nodes.",
    formula: "C = (1/n) Σ 2·triangles(v) / (deg(v)(deg(v)−1))",
    sourceFile: "pipeline/loom/analytics.py",
  },
  {
    id: "community",
    label: "Community count",
    definition: "Approx-Louvain first phase only — not a full multi-level Louvain.",
    formula: "communities ≈ Louvain-phase-1(G)",
    sourceFile: "pipeline/loom/analytics.py",
    relatedCaveatIds: ["louvain-approx"],
  },
  {
    id: "avg-path",
    label: "Average path length",
    definition: "Mean shortest-path length. Sampled from ≤40 BFS sources — not exact.",
    formula: "L̂ = mean_{s∈S, |S|≤40} mean_t dist(s,t)",
    sourceFile: "pipeline/loom/analytics.py",
    relatedCaveatIds: ["path-sample"],
  },
  {
    id: "genre-entropy",
    label: "Genre entropy",
    definition: "Shannon entropy (base 2) of a person's genre mix.",
    formula: "H = −Σ p_i log₂(p_i)",
    sourceFile: "pipeline/loom/facets.py",
  },
  {
    id: "concentration",
    label: "Genre concentration",
    definition: "Share of credits in the top genre.",
    formula: "concentration = max(p_i)",
    sourceFile: "pipeline/loom/facets.py",
  },
  {
    id: "genre-drift",
    label: "Genre drift",
    definition: "How much early- vs late-career genre sets diverge.",
    formula: "drift = 1 − Jaccard(early, late)",
    sourceFile: "pipeline/loom/facets.py",
  },
  {
    id: "degree-bands",
    label: "Degree bands",
    definition: "Alluvial stage buckets for collaboration intensity.",
    formula: "hub ≥ 40 · connected ≥ 15 · linked ≥ 5 · else sparse",
    sourceFile: "pipeline/loom/stages.py",
  },
  {
    id: "era-cutoffs",
    label: "Era cutoffs",
    definition: "Career / stage era boundaries used in alluvials.",
    formula: "cuts at 1980 / 2000 / 2015",
    sourceFile: "pipeline/loom/stages.py",
  },
  {
    id: "filters",
    label: "Global filters",
    definition: "Applied before construct population queries.",
    formula: "min_votes ≥ 50 · exclude adult · default title types · flag low-signal genres",
    sourceFile: "pipeline/loom/constructs/emit.py",
  },
  {
    id: "edge-year",
    label: "Edge year",
    definition: "Representative year for a collaboration link.",
    formula: "year(e) = mean(startYear of shared titles)",
    sourceFile: "pipeline/loom/constructs/emit.py",
    relatedCaveatIds: ["edge-year-avg"],
  },
];

export const CAVEATS: Caveat[] = [
  {
    id: "path-sample",
    text: "avg_path_length is sampled from ≤40 BFS sources — an estimate, not exact.",
    appliesTo: "avg-path",
  },
  {
    id: "louvain-approx",
    text: "Community detection is approx-Louvain first phase only.",
    appliesTo: "community",
  },
  {
    id: "enrichment-scope",
    text: "Enrichment is genre-scoped to Animation/Horror candidates — coverage outside those leans on proxies.",
    appliesTo: "tmdb / wikidata",
  },
  {
    id: "gender-proxy",
    text: "Without TMDB_API_KEY, gender falls back to IMDb actor/actress categories (binary, imperfect).",
    appliesTo: "gender",
  },
  {
    id: "edge-year-avg",
    text: "Edge year is the average of shared-title startYear values, not filming dates.",
    appliesTo: "edge-year",
  },
  {
    id: "awards-p166",
    text: "Awards facet is Wikidata P166 (awards received) labeled awards_p166; nominations are not scraped.",
    appliesTo: "awards",
  },
  {
    id: "one-role-synthetic",
    text: "One-role edges are synthetic genre co-membership, not co-appearances.",
    appliesTo: "one_role",
  },
  {
    id: "top-billed",
    text: "Principals = top-billed cast only — not full credits. The graph depends on this.",
    appliesTo: "edge",
  },
];

export const ACCURACY_ROWS: AccuracyRow[] = [
  {
    id: "coappear",
    signal: "Co-appearances",
    accuracy: "High",
    notes: "Same IMDb title in title.principals (top-billed cast only — not full credits)",
    sourceId: "imdb",
    metricId: "edge",
  },
  {
    id: "shared",
    signal: "Edge shared samples",
    accuracy: "High",
    notes: "Top shared titles by votes (attached at build) for Inspect / hover",
    sourceId: "imdb",
  },
  {
    id: "character",
    signal: "Character + film in Inspect",
    accuracy: "High",
    notes: "Parsed from IMDb characters; some credits lack names",
    sourceId: "imdb",
  },
  {
    id: "years",
    signal: "Years / career span",
    accuracy: "Medium-high",
    notes: "Uses title startYear (release), not filming dates",
    sourceId: "imdb",
    metricId: "edge-year",
  },
  {
    id: "gender",
    signal: "Gender",
    accuracy: "Medium",
    notes: "Falls back to IMDb actor/actress without TMDB. Add TMDB_API_KEY for better data",
    sourceId: "tmdb",
  },
  {
    id: "voice",
    signal: "Voice roles",
    accuracy: "Medium",
    notes: "Wikidata may be blocked; falls back to (voice) character / job heuristics",
    sourceId: "wikidata",
  },
  {
    id: "bechdel",
    signal: "Bechdel",
    accuracy: "As good as the source",
    notes: "Community ratings on bechdeltest.com; not every film is scored. Failover: live API → TidyTuesday mirror → stale cache",
    sourceId: "bechdel",
  },
  {
    id: "genres",
    signal: "Genres",
    accuracy: "Medium",
    notes: "IMDb allows ≤3 genres per title; multi-genre titles inflate bridges",
    sourceId: "imdb",
  },
  {
    id: "one-role",
    signal: "One-role edges",
    accuracy: "Synthetic",
    notes: "Same dominant genre — not co-appearances",
    metricId: "edge",
  },
];

export function accuracyTone(
  accuracy: AccuracyRow["accuracy"],
): "good" | "watch" | "poor" | "synthetic" {
  if (accuracy === "High" || accuracy === "Medium-high") return "good";
  if (accuracy === "Medium" || accuracy === "As good as the source") return "watch";
  if (accuracy === "Synthetic") return "synthetic";
  return "watch";
}

export function genderMethodLabel(method: string | undefined): string {
  if (!method) return "Gender method not recorded for this construct.";
  const m = method.toLowerCase();
  if (m.includes("tmdb")) return "Gender from TMDB (enriched).";
  if (m.includes("proxy") || m.includes("actress") || m.includes("actor")) {
    return "IMDb actor/actress proxy — binary, imperfect (no TMDB key at build).";
  }
  return method;
}

export function healthForPct(
  key: "missing_birth_year_pct" | "gender_unknown_pct" | "prominence_coverage_pct" | "edges_with_year_pct",
  value: number,
): "good" | "watch" | "poor" {
  if (key === "prominence_coverage_pct" || key === "edges_with_year_pct") {
    if (value >= 90) return "good";
    if (value >= 70) return "watch";
    return "poor";
  }
  // missing / unknown — lower is better
  if (value <= 10) return "good";
  if (value <= 25) return "watch";
  return "poor";
}
