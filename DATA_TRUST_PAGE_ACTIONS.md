# IMDb Loom — "Trust the Data" Methodology Page — Action Plan

A 100-step checklist to build a data-provenance / methodology / accuracy page that shows
the **sources (with links)**, the **tables & math** behind every metric, and doubles as a
**self-check** that the data is accurate. Ordered so each phase builds on the last.

## Context: what exists today (read first)

The trust story is **already computed but never surfaced interactively.** Findings from a
holistic pass over pipeline + app:

- **Rich provenance already in the data.** Every `data/out/<construct>/manifest.json`
  carries `method_note`, `data_credit`, `gender_method`, `build_seed: 42`, a `build_stats`
  funnel (`population_sql: 480 → after_degree_cap: 160`, `credit_rows`, `min_shared`,
  `min_votes`), `imdb_snapshot_files` (per-file IMDb TSV timestamps), and graph stats
  (`clustering_coefficient`, `avg_path_length`, `community_count`, `featured_path`).
- **`quality.json` is generated, deployed, and ignored.** Per-construct
  `{node_count, edge_count, missing_birth_year_pct, gender_unknown_pct,
  prominence_coverage_pct, edges_with_year_pct}` plus a merged top-level
  `data/out/quality.json`. `scripts/sync-public-data.sh` copies it into `app/public/data`,
  but `rg "quality" app/src` shows the app never fetches it.
- **Method text is print-only.** Only `components/Poster.tsx:429–495` renders `method_note`
  / `data_credit` / `built_at`, as SVG on the exported poster. No interactive About/Credits/
  methodology surface exists.
- **No router.** `App.tsx:119` holds a `view` union (`"home" | "atelier" | "styleguide"`)
  switched by `?view=` query param via `viewFromSearchParams()` (`lib/gallery.ts:1030`).
  Adding a page = extend the union + a render branch; no react-router needed.
- **`Manifest` type is under-typed** (`types.ts:122–136`) — an index signature hides
  `build_stats`, `imdb_snapshot_files`, `summary`, `avg_path_length`, etc.
- **Ready-made copy exists.** `README.md` "Data accuracy (read this)" 9-row table;
  `DATA_IDEAS.md:141` explicitly proposed a "[P3] Data-quality report page"; `BRIEF.md:109`
  on being explicit about method.

### Data sources to credit (with links), confirmed in the pipeline

| Source | Link | Provides | Caveat to disclose |
|---|---|---|---|
| IMDb Non-Commercial Datasets | https://datasets.imdbws.com | people, titles, principals, ratings, crew, episodes, akas | top-billed cast only; non-commercial |
| TMDB API v3 | https://www.themoviedb.org | gender, birth country, popularity | **skipped without `TMDB_API_KEY`** → proxy gender |
| Wikidata SPARQL | https://query.wikidata.org | voice-actor flag (P106), nationality, awards, kin | may be blocked → heuristic fallback |
| Bechdel Test API | https://bechdeltest.com | film Bechdel rating 0–3 | community-sourced; failover mirror |
| Bechdel mirror (TidyTuesday) | https://github.com/rfordatascience/tidytuesday | Bechdel CSV fallback | used only when API fails |
| MovieLens (ml-latest-small) | https://grouplens.org/datasets/movielens/ | user tags | small dataset, limited coverage |
| Wikimedia Pageviews | https://wikimedia.org/api/rest_v1/ | 2024 pageviews | explicit "stub", ≤40 names |

### Honest caveats the page MUST state (found in code, not docs)

- `avg_path_length` is **sampled** (≤40 BFS sources), not exact (`analytics.py:135`).
- Community detection is **approx-Louvain first phase only** (`analytics.py:61`).
- Enrichment is **genre-scoped** to Animation/Horror candidates (`enrich.py:38`).
- Gender falls back to **actor/actress proxy** without TMDB (`__init__.py:44`).
- Edge `year` is the **average** of shared-title years (`emit.py:289`).
- Awards use P166 for **both wins and noms** (`enrich_extra.py:137`).
- One-role edges are **synthetic** genre co-membership, not co-appearances (README).

---

## Phase 0 — Audit & decisions (steps 1–7)

- [ ] 1. Decide the page's route name and label — recommend `?view=methodology` with UI label "Trust the data" (matches the `view`-union pattern, no router needed).
- [ ] 2. Decide scope: a single global methodology page + a per-construct "data report" drawer, vs one combined page with a construct selector. Recommend combined page with a construct picker so it doubles as a QA tool.
- [ ] 3. Confirm every construct actually ships `quality.json` + `manifest.json` (`ls data/out/*/quality.json`) and note any missing so the page degrades gracefully.
- [ ] 4. Verify `app/package.json` `build:pages` runs `sync-data` so `quality.json`/`index.json` land in `app/public/data` for Pages (the workflow depends on it).
- [ ] 5. Confirm the top-level merged `data/out/quality.json` and `index.json` shapes (fields per construct) that the page will read.
- [ ] 6. Inventory the source copy to reuse: README "Data accuracy" table, `manifest.method_note`, `manifest.data_credit`, and the source/caveat tables above.
- [ ] 7. Create a working branch `feat/trust-data-page`.

## Phase 1 — Data plumbing: loaders & types (steps 8–22)

- [ ] 8. Add `loadQuality()` to `app/src/lib/data.ts` mirroring `loadIndex()` — fetch `dataUrl("quality.json")` (the merged top-level file), typed.
- [ ] 9. Add `loadConstructQuality(id)` for the per-construct `data/<id>/quality.json` if per-construct granularity is needed beyond the merged file.
- [ ] 10. Add a `Quality` interface in `types.ts`: `{ node_count, edge_count, missing_birth_year_pct, gender_unknown_pct, prominence_coverage_pct, edges_with_year_pct }`.
- [ ] 11. Widen the `Manifest` interface (`types.ts:122`) to type the fields the index signature currently hides: `build_seed`, `build_stats`, `imdb_snapshot_files`, `min_shared_titles`, `top_n`, `avg_path_length`, `clustering_coefficient`, `community_count`, `featured_path`, `summary`.
- [ ] 12. Type `build_stats`: `{ population_sql, credit_rows, after_degree_cap, people_faceted, min_shared, min_votes, era_slices, validation_warnings? }`.
- [ ] 13. Type `imdb_snapshot_files` as `Record<string, string>` (filename → ISO timestamp) and `summary` as `{ degree_max, degree_median, era_histogram, gender_mix, top_name }`.
- [ ] 14. Add a `DataSource` type + a single `DATA_SOURCES` constant (in a new `app/src/lib/provenance.ts`) holding name/url/provides/caveat for each of the 7 sources above — one source of truth for the credits.
- [ ] 15. Add a `METRIC_DEFS` constant in `provenance.ts` describing each computed metric (label, plain-English definition, formula string, source-file reference) so the math section is data-driven, not hardcoded JSX.
- [ ] 16. Add a `CAVEATS` constant listing the honest caveats with the metric/source each applies to.
- [ ] 17. Cache the loaded quality/index data in `App.tsx` state (or a small context) so switching to the page doesn't refetch on every toggle.
- [ ] 18. Handle load failure: the page must render source/math/caveat content (static) even if `quality.json` fetch fails, showing a "live metrics unavailable" note.
- [ ] 19. Add a `useReducedData`/`save-data` guard so the page doesn't fetch every construct's manifest eagerly — lazy-load per selected construct.
- [ ] 20. Ensure `dataUrl()` base-prefix logic (`import.meta.env.BASE_URL`) is respected so the page works on GitHub Pages under `/imbd_loom/`.
- [ ] 21. Add a lightweight `formatBuiltAt(iso)` and `formatSnapshotAge(iso)` util for human-readable freshness ("built 3 days ago").
- [ ] 22. Unit-test the loaders against the committed `data/out` fixtures so schema drift breaks CI.

## Phase 2 — Routing & navigation shell (steps 23–33)

- [ ] 23. Extend the `view` union in `App.tsx:119` to include `"methodology"`.
- [ ] 24. Add a `?view=methodology` branch to `viewFromSearchParams()` in `lib/gallery.ts:1030` (mirror the `home`/`gallery` handling).
- [ ] 25. Add an early-return render branch in `App.tsx` (alongside the home branch ~`App.tsx:582`) rendering `<MethodologyPage/>`.
- [ ] 26. Ensure `writeUrl()` / `popstate` handling (`App.tsx:91–109`, `:215`) round-trips the new view so back/forward and deep links work.
- [ ] 27. Create `app/src/components/MethodologyPage.tsx` as the page shell (scrollable, themed with the token system, max-width reading column).
- [ ] 28. Add a "Trust the data" nav link in the home gallery header CTA area (`HomeGallery.tsx:124`) and footer (`HomeGallery.tsx:167`).
- [ ] 29. Add a discreet link from the atelier chrome (e.g. sidebar footer `Sidebar.tsx:715` or a rail button) so it's reachable while exploring.
- [ ] 30. Add a link from the Inspect/DetailPanel "why linked" explainers (`DetailPanel.tsx:107`) to the relevant methodology section (edge definition).
- [ ] 31. Add a construct selector at the top of the page (reuse `index.json` labels) that drives the per-construct report sections.
- [ ] 32. Deep-link construct selection via a second query param (e.g. `?view=methodology&c=voice_cartoons`) so a specific report is shareable.
- [ ] 33. Add a back-to-gallery / back-to-explorer button and a table-of-contents anchor nav for the page's sections.

## Phase 3 — Section: Data sources & provenance (steps 34–48)

- [ ] 34. Render a "Where the data comes from" section from `DATA_SOURCES` — each source as a card with name, outbound link (`target=_blank` + `rel="noopener noreferrer"`), what it provides, and its caveat.
- [ ] 35. Mark each source's live/optional status: IMDb (required), TMDB (optional — degrades to proxy), Wikidata/Bechdel/MovieLens/Pageviews (best-effort).
- [ ] 36. Render the **IMDb snapshot provenance** from `manifest.imdb_snapshot_files` — a table of the 7 TSVs with their capture timestamps for the selected construct.
- [ ] 37. Show a prominent "Data as of …" freshness banner from `manifest.built_at` + oldest snapshot file, with the humanized age.
- [ ] 38. Render the `data_credit` string verbatim from the manifest as the canonical attribution line.
- [ ] 39. Add the licensing note ("IMDb Non-Commercial Datasets — fine for a personal poster, not for resale") from the README.
- [ ] 40. Render the per-construct `method_note` verbatim (population + edge definition sentence) — the single most important trust statement.
- [ ] 41. Show the `gender_method` flag translated to plain English ("gender from TMDB" vs "IMDb actor/actress proxy — binary, imperfect") and `tmdb_gender_rows` count.
- [ ] 42. Reproduce the README "Data accuracy" 9-row Signal/Accuracy/Notes table as an interactive component (Co-appearances=High … One-role edges=Synthetic).
- [ ] 43. Color-code accuracy levels (High / Medium / Synthetic) using the theme's semantic tokens — not new hardcoded colors.
- [ ] 44. Cross-link each accuracy row to the source card and the relevant metric definition.
- [ ] 45. Add a "How to verify this yourself" callout linking to `datasets.imdbws.com` and explaining the schema at a high level.
- [ ] 46. State explicitly that principals = **top-billed cast only**, not full credits (a common misconception the graph depends on).
- [ ] 47. Note the enrichment is **genre-scoped** (Animation/Horror candidate set) so coverage outside those genres leans on proxies.
- [ ] 48. Add the Bechdel failover chain explanation (live API → TidyTuesday mirror → stale cache) for the Bechdel construct.

## Phase 4 — Section: The math / how metrics are computed (steps 49–63)

- [ ] 49. Render a "How the numbers are computed" section driven by `METRIC_DEFS`, one row/card per metric with plain-English + formula.
- [ ] 50. Document **edges = co-appearance**: two people credited (`actor`/`actress`) on the same `title_key`, self-join with `a.nconst < b.nconst`, `HAVING shared_count ≥ min_shared` (default 2).
- [ ] 51. Document **episode collapse**: `title_key = COALESCE(parentTconst, tconst)` so episodes roll up to the series (why a sitcom cast is one strong edge, not 200 weak ones).
- [ ] 52. Document **edge weight** = `ROUND(Σ ln(votes+1))` over shared titles (log-vote-weighted), with the plain-count alternative noted.
- [ ] 53. Document **node degree** = sum of incident edge weights, and the **Top-N cap** (default 200, hard max 300) ranked by degree.
- [ ] 54. Document **prominence** = `Σ(votes / billing)`, billing = `max(ordering, 1)` — vote-weighted, billing-discounted.
- [ ] 55. Document **betweenness / bridge_score** (Brandes, unweighted, normalized `1/((n-1)(n-2))`).
- [ ] 56. Document **clustering coefficient**, **community count** (approx-Louvain), and **avg path length** — flagging avg path length as a ≤40-source **sample estimate**.
- [ ] 57. Document **genre entropy** (Shannon base-2), **concentration** (top-genre share), and **genre drift** (`1 − Jaccard(early, late)`).
- [ ] 58. Document the **degree-band** thresholds (hub ≥40, connected ≥15, linked ≥5, else sparse) and **era cutoffs** (1980/2000/2015) used in the alluvial stages.
- [ ] 59. Document the **filters** applied everywhere: `min_votes ≥ 50`, adult exclusion, default title types, low-signal-genre flagging.
- [ ] 60. Render the **build funnel** from `build_stats` as a visual: `population_sql → credit_rows → people_faceted → after_degree_cap` (the "480 → 160" story `DATA_IDEAS.md:33` asked for).
- [ ] 61. Show `build_seed: 42` and state that layout/sampling are **deterministic** (reproducible) — a concrete trust signal.
- [ ] 62. For each formula, cite the pipeline file (e.g. `facets.py`, `analytics.py`, `emit.py`) so a technical reader can audit it; link to the repo if public.
- [ ] 63. Add a KaTeX/MathML or clean monospace rendering for the formulas so `Σ`, `log2`, Jaccard read correctly (avoid ASCII mangling).

## Phase 5 — Section: Per-construct data-quality report (steps 64–75)

- [ ] 64. Render the four `quality.json` metrics for the selected construct as labeled stat tiles: missing birth year %, gender unknown %, prominence coverage %, edges-with-year %.
- [ ] 65. Add a plain-English gloss under each (e.g. "gender unknown % high ⇒ TMDB enrichment was unavailable for this cut").
- [ ] 66. Turn each metric into a **health indicator** (good/watch/poor thresholds) using theme tokens — this is the "double-check" surface.
- [ ] 67. Render the `summary` block: `gender_mix`, `era_histogram` (as a small bar chart reusing the chart tokens), `degree_max`, `degree_median`, `top_name`.
- [ ] 68. Show node/edge counts and compare against `build_stats` so a reader sees how many were dropped by the cap.
- [ ] 69. Surface `build_stats.validation_warnings` (from `validate_construct`) if present — dangling edges, NaN degree, weight < 1 — as explicit data-integrity flags.
- [ ] 70. Add a cross-construct overview table (from the merged `quality.json`) so all constructs' health is visible at a glance for QA.
- [ ] 71. Sort/highlight constructs with the worst coverage so data problems are easy to spot (the page as a monitoring dashboard).
- [ ] 72. Show the `featured_path` (from manifest) as a concrete example edge chain, linking each person into the atelier.
- [ ] 73. Flag constructs whose `gender_method` is the proxy so their gender splits carry a visible asterisk.
- [ ] 74. Note any construct with synthetic edges (one-role) prominently so its graph isn't read as co-appearance.
- [ ] 75. Add an empty/failure state for constructs missing quality or manifest data.

## Phase 6 — "Double-check accuracy" verification tools (steps 76–86)

- [ ] 76. For each person in a report, add a **"verify on IMDb"** deep link (`https://www.imdb.com/name/{nconst}/`) built from the node id.
- [ ] 77. For each shared title, add a **"verify on IMDb"** title link (`https://www.imdb.com/title/{tconst}/`) from `edge.shared[].tconst`.
- [ ] 78. Add a **spot-check widget**: pick a random edge, show its `shared` titles + weight, and link both people + titles to IMDb so a human can confirm the co-appearance.
- [ ] 79. Add a Bechdel spot-check linking matched films to `bechdeltest.com/view/{id}` for the Bechdel construct.
- [ ] 80. Add a Wikidata verify link for voice-actor flags (`https://www.wikidata.org/wiki/…` via the P345 IMDb-id mapping) where the voice heuristic fired.
- [ ] 81. Add a client-side consistency check: recompute `node_count`/`edge_count` from the loaded `nodes.json`/`edges.json` and assert they match `manifest`/`quality` — surface any mismatch as a warning.
- [ ] 82. Add a client-side check that every `edge.source`/`edge.target` exists in `nodes` (no dangling endpoints) and report violations.
- [ ] 83. Add a check that `edges_with_year_pct` recomputed client-side matches the reported value (validates the quality pipeline itself).
- [ ] 84. Add a "reproduce this build" instructions block (the exact `uv run loom build` command + seed) so the numbers are independently reproducible.
- [ ] 85. Add a downloadable link to the raw `manifest.json` / `quality.json` for the selected construct so power users can inspect the source of truth.
- [ ] 86. Log any client-side verification failures to the console and (optionally) a visible "data integrity" badge at the top of the report.

## Phase 7 — Pipeline improvements this page exposes (steps 87–93)

- [ ] 87. Have `emit.py quality_report` also record **per-source enrichment coverage** (e.g. `tmdb_coverage_pct`, `voice_flag_source`, `bechdel_matched_pct`) so the page can show which sources actually contributed.
- [ ] 88. Persist `validation_warnings` into `quality.json` (not only `build_stats`) so the deployed quality file is self-contained for the page.
- [ ] 89. Add the IMDb dataset snapshot date to the top-level merged `quality.json` (currently only per-manifest) for a global "data as of" banner.
- [ ] 90. Consider computing **exact** avg path length for small graphs (or clearly labeling the sample size N) so the page isn't disclosing an unbounded approximation.
- [ ] 91. Split the awards P166 field into wins vs noms (or rename to `awards_p166` and label it honestly) so the caveat can be removed rather than disclosed.
- [ ] 92. Emit a machine-readable `sources.json` from the pipeline (the `DATA_SOURCES` table) so the page's credits stay in sync with what the pipeline actually hit, per build.
- [ ] 93. Add a pipeline test asserting `method_note` and `data_credit` are non-empty for every construct so the trust page never renders blanks.

## Phase 8 — Styling, accessibility, QA & docs (steps 94–100)

- [ ] 94. Style the page entirely with the theme token system (from the coloration pass) — paper reading surface, ink hierarchy, accent for links; verify light/dark parity.
- [ ] 95. Ensure all outbound source links have visible affordance, `rel="noopener noreferrer"`, and meet WCAG AA contrast against the surface.
- [ ] 96. Make the page responsive: single-column reading layout on mobile (`max-width: 560px`), tables scroll in their own `overflow-x` container.
- [ ] 97. Verify keyboard nav + screen-reader semantics (headings hierarchy, table `<caption>`/`<th scope>`, landmark regions, skip-to-content).
- [ ] 98. Respect `prefers-reduced-motion` for any funnel/animation and `prefers-reduced-data` for eager fetches.
- [ ] 99. Update `README.md` (link the page from "Explorer tips"), `DATA_IDEAS.md:141` (mark the data-quality report page done), and `VISUAL_QA.md` (add a trust-page QA row).
- [ ] 100. Open the PR from `feat/trust-data-page` with screenshots (light/dark, desktop/mobile), a note that `quality.json` is now consumed, and the list of caveats now disclosed vs fixed in the pipeline.

---

### Suggested new files

```
app/src/components/MethodologyPage.tsx   # the page shell + sections
app/src/components/DataSourceCard.tsx     # one credited source w/ link + caveat
app/src/components/QualityTiles.tsx       # quality.json health indicators
app/src/components/BuildFunnel.tsx        # population_sql → after_degree_cap viz
app/src/components/MetricDefList.tsx      # METRIC_DEFS → formulas table
app/src/components/VerifySpotCheck.tsx    # random-edge IMDb verification widget
app/src/lib/provenance.ts                 # DATA_SOURCES, METRIC_DEFS, CAVEATS
```

Extend, don't invent: add `loadQuality()` to `lib/data.ts`, widen `Manifest` +
add `Quality` in `types.ts`, add `"methodology"` to the `view` union in `App.tsx:119`
and `viewFromSearchParams()` in `lib/gallery.ts:1030`. Source copy comes from the
README accuracy table and the manifests' own `method_note` / `data_credit`.
