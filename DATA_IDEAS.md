# IMDb Loom — 100 Ways to Improve & Expand the Data

> **Implementation status (2026-07-22):** Pipeline code for essentially the full
> list is in place — shared filters/facets/analytics, new IMDb files
> (crew/episode/akas), fixed `one_role`, 31 constructs, enrichment extras,
> `people.json` / `quality.json` / era slices, gallery tabs, weekly GitHub
> Action. Rebuild `loom build --construct all` + sync public data to ship.
> Items that still need a live API key or external dump to *populate* (not just
> code): TMDB detail enrichment (#25–26), full Wikidata family density (#30),
> OMDb/box-office (#35), critic dumps (#39). Fallbacks exist for all of those.

Actionable backlog for the pipeline (`pipeline/loom/`). Each item is written so an
agent can pick it up and implement it. Grounded in the current stack:
DuckDB over IMDb TSV→Parquet (`name.basics`, `title.basics`, `title.principals`,
`title.ratings`), enrichment caches in `data/cache/` (TMDB gender, Wikidata voice
flags, Bechdel), constructs emitting `nodes/edges/stages/manifest` JSON to
`data/out/<id>/`.

Priority key: **[P1]** high-impact / unblocks others · **[P2]** solid win · **[P3]** nice-to-have.

---

## A. Fix & harden what exists (1–12)

1. **[P1] Fix `one_role` era/volume bias.** Rank by prominence (votes-weighted) instead of raw title count; the current top-160 is ~74% pre-1950 Japanese studio Drama casts. Stratify: take top-K per dominant genre.
2. **[P1] Add a vote floor to every construct.** Join `title_ratings` and require e.g. `numVotes >= 50` per credited title (tunable per construct in the registry) so obscure filler credits stop dominating degree counts.
3. **[P1] Exclude or isolate the `Adult` genre by default.** Add a pipeline-wide `EXCLUDED_GENRES` constant with per-construct override; 21/160 of `one_role` is currently Adult.
4. **[P2] De-duplicate episode-level credit inflation.** TV credits in `title_principals` can repeat per episode; collapse to one credit per person×series before counting.
5. **[P2] Normalize name diacritics/romanization** (`Ryûnosuke` vs `Ryūnosuke`) with a single transliteration pass at parquet time; store both `label` and `label_ascii`.
6. **[P2] Add `ordering`-aware billing.** `title_principals.ordering` is already there for some constructs — use it uniformly as `billing` on every node's roles and expose median billing as a facet.
7. **[P2] Backfill `year` on all edges.** Some constructs emit edges without `year`; compute it from the shared title's `startYear` so the edge-year filter works everywhere.
8. **[P2] Validate construct outputs with a schema check** (pydantic or JSON schema) in `emit.py`: required node fields, edge endpoints exist, weights ≥ 1, no NaNs.
9. **[P3] Emit build stats to the manifest**: population size before/after each filter step, so the app's method note can show "38,412 → 2,105 → 160".
10. **[P3] Add a `--seed` deterministic ordering** so rebuilds produce byte-identical JSON when data hasn't changed (stable diffs in git).
11. **[P3] Record IMDb dataset snapshot date** (file mtimes) in each manifest for provenance.
12. **[P3] Unit-test each construct** against a tiny fixture DuckDB with known expected nodes/edges.

## B. Use IMDb datasets not yet downloaded (13–24)

13. **[P1] Download `title.crew.tsv.gz`** — adds directors/writers per title. Prereq for all director-based facets and constructs below.
14. **[P1] Download `title.episode.tsv.gz`** — maps episodes to parent series; fixes item 4 properly and enables per-season analysis.
15. **[P2] Download `title.akas.tsv.gz`** — regional titles + `region`/`language`; enables country/language facets without external APIs.
16. **[P1] Parse `name.basics.birthYear/deathYear`** into person nodes: `birth_year`, `death_year`, and derived `age_at_peak`, `worked_posthumously` (credits after deathYear = archive footage signal).
17. **[P2] Parse `name.basics.knownForTitles`** — a 4-title "signature works" list per person; attach as `known_for` on nodes for tooltips.
18. **[P2] Parse `name.basics.primaryProfession`** — actors who are also directors/producers/writers; facet `professions: []` enables hyphenate constructs.
19. **[P2] Use `title_principals.job` and `characters` fully** — the raw `characters` JSON array is richer than current heuristics; extract all character names, not just the first.
20. **[P2] Use `title.basics.runtimeMinutes`** — total screen-time proxy per career (`sum of runtimes`), facet `minutes_credited`.
21. **[P2] Use `title.basics.isAdult` flag** instead of genre string matching for the Adult exclusion (item 3).
22. **[P3] Use `title.basics.endYear`** for series: career spans that account for long-running shows rather than just `startYear`.
23. **[P3] Track `title.basics.titleType` mix per person** — facet `medium_mix` (% movie / tvSeries / tvMovie / short / video) for a "cinema vs TV careers" lens.
24. **[P3] Derive decade tags per title** at parquet time (1920s…2020s) as a materialized column to speed every era query.

## C. New external data sources (25–40)

25. **[P1] TMDB person details beyond gender**: birthplace, `place_of_birth` country, profile popularity, biography length. Extend the existing `_enrich_tmdb` cache schema.
26. **[P1] TMDB credits cross-check**: `also_known_as` names for better romanization and dedup (pairs with item 5).
27. **[P2] Wikidata occupations** (P106): comedian, martial artist, wrestler, musician, model → facet `prior_occupation`; enables "athletes who became actors".
28. **[P2] Wikidata country of citizenship** (P27) → facet `nationality`; enables national-cinema constructs and fixes the "why all Japanese names" opacity.
29. **[P2] Wikidata awards** (P166): Oscar/Emmy/Golden Globe nominations & wins → facets `award_noms`, `award_wins`.
30. **[P2] Wikidata spouse/partner/family relations** (P26/P40/P3373) → "acting dynasties" edges (parent–child, siblings, couples).
31. **[P2] Wikidata date of birth precision** to fill IMDb's missing `birthYear` (~60% missing).
32. **[P3] Wikidata educated-at** (P69) → drama-school clusters (RADA, Juilliard, Beijing Film Academy).
33. **[P3] Wikidata height** (P2048) — playful facet for typecasting analysis (action vs character actors).
34. **[P2] Bechdel API: fetch the full dump** (it's small) rather than per-title lookups; store rating 0–3 for all matched titles, keyed by tconst.
35. **[P3] The Numbers / OMDb box-office** (needs key) → `box_office_total` per career; "bankability" facet.
36. **[P3] MovieLens tag-genome** (free) → per-title semantic tags ("slasher", "campy", "final girl") far richer than IMDb's 3 genres.
37. **[P3] Wikipedia pageviews API** → `fame_now` facet: current cultural footprint vs historical credit volume.
38. **[P3] Open Library / Goodreads adaptation flags** → "book-adaptation specialists" facet.
39. **[P3] Rotten Tomatoes-style critic consensus via open datasets** (e.g. Kaggle metacritic dumps) → `critic_score_median` per career.
40. **[P3] Language of production from `title.akas` + Wikidata** (P364) → `working_languages: []` per person; polyglot-career lens.

## D. New person-level facets (41–58)

41. **[P1] `prominence` everywhere**: votes-weighted billing score (`sum(numVotes / billing)`) computed once in a shared temp table, attached to all constructs.
42. **[P1] `career_phase` segmentation**: early/peak/late thirds of each career with per-phase genre mix — enables "genre drift" stories (comedy → drama with age).
43. **[P2] `genre_entropy`**: Shannon entropy over genre distribution — the proper continuous version of one-role vs genre-bridge (replaces the brittle ≥90% cutoff).
44. **[P2] `typecast_character`**: most-repeated character name across titles (Mel Blanc → Bugs; horror actors → "Sheriff") from `characters` JSON.
45. **[P2] `collaborator_loyalty`**: % of credits shared with their #1 co-star — measures repertory-company careers.
46. **[P2] `gap_years`**: longest hiatus between credits — comeback stories.
47. **[P2] `debut_age` / `retirement_age`** using birthYear (items 16/31) — child-actor and late-bloomer lenses.
48. **[P2] `franchise_count`**: distinct film series participated in (detect by shared title-name prefixes + `title.episode` parents).
49. **[P2] `billing_trajectory`**: slope of billing order over time — rising star vs fading star as a signed number.
50. **[P3] `genre_first` / `genre_last`**: the genre of first and final credits — entry and exit doors of careers.
51. **[P3] `posthumous_credits`** count (after deathYear) — archive-footage and CGI-resurrection tracking.
52. **[P3] `short_to_feature_ratio`**: careers built in shorts vs features.
53. **[P3] `tv_movie_crossover_year`**: first year a TV-dominant career got a movie credit (and vice versa).
54. **[P3] `same_director_repeat`**: number of titles with the same director (needs `title.crew`) — muse relationships.
55. **[P3] `ensemble_size_median`**: median cast size of their titles — indie-intimate vs blockbuster-ensemble careers.
56. **[P3] `title_rating_median` and `title_rating_max`**: quality band of a career from `title_ratings.averageRating`.
57. **[P3] `one_scene_wonder` flag**: high `numVotes` titles but consistently last-position billing.
58. **[P3] `name_change_detect`**: same person with differing `primaryName` across TMDB/Wikidata/akas — stage-name facet.

## E. New edge/link semantics (59–68)

59. **[P1] Weighted co-appearance by prominence**, not just count: edge weight = Σ over shared titles of `log(numVotes)` — separates "did 3 blockbusters together" from "3 obscure shorts".
60. **[P2] Director–actor edges** (needs `title.crew`): bipartite loom of muses; weight = collaborations count.
61. **[P2] Same-character edges**: two people who played the *same character* (different Batmans, different Bonds) via normalized `characters` strings — a genuinely magical lens.
62. **[P2] Temporal edges**: `first_worked_together` and `last_worked_together` years on every co-appearance edge; enables "reunion" detection (>20-year gaps).
63. **[P2] Genre-context edges**: annotate each co-appearance edge with the genre(s) of shared titles so the app can filter links by genre without changing constructs.
64. **[P3] Mentor edges**: co-appearance where A's career started ≥15 years before B's and B's billing rose in subsequent shared titles.
65. **[P3] Dynasty edges** from Wikidata family relations (item 30), typed `family: parent|sibling|spouse`.
66. **[P3] Negative-space edges**: top-N pairs with massive genre/era overlap who *never* shared a title ("should have met").
67. **[P3] Series-sibling edges**: two actors in the same episodic series but never in the same episode (needs `title.episode`).
68. **[P3] Award-cohort edges**: nominated in the same category, same year (item 29).

## F. New constructs / lenses (69–88)

69. **[P1] The Repertory Companies** — clusters of ≥4 people with ≥3 shared titles each (Christopher Guest troupe, Wes Anderson regulars). Uses item 59 weights.
70. **[P1] Child Stars** — debut_age < 12; what happened next, colored by whether they worked past 25. Needs items 16/47.
71. **[P1] The Same Character Club** — network of characters played by 3+ actors (Batman, Sherlock, Dracula) with actor–character bipartite hero. Needs item 61.
72. **[P2] Director's Muses** — actors with ≥4 titles under the same director; hero = director-centered stars. Needs `title.crew`.
73. **[P2] Acting Dynasties** — family trees woven with co-appearance (Barrymores → Sutherlands → Skarsgårds). Needs item 30.
74. **[P2] The Reunion Map** — pairs who reunited after ≥20 years apart, timeline hero showing the gap arcs. Needs item 62.
75. **[P2] Genre Drift** — people whose early/late career genres differ most (entropy over career phases). Needs item 42.
76. **[P2] The Comeback Trail** — careers with ≥8-year gaps followed by ≥5 more credits. Needs item 46.
77. **[P2] Horror Royalty Bloodlines** — scream-queen web extended with family edges and decade strata.
78. **[P2] The Blockbuster Ensemble** — careers ≥80% in top-decile-votes titles; the inverse ("The B-Movie Loyalists") as a paired construct.
79. **[P2] National Cinema Bridges** — actors credited across ≥2 production countries (via akas regions / Wikidata) — Hong Kong→Hollywood, Bollywood crossover.
80. **[P3] Voice ↔ Face** — people with both substantial voice (Animation) and on-camera careers; ratio as color.
81. **[P3] The Hyphenates** — actor-directors and actor-writers (item 18); edge = directed themselves.
82. **[P3] Franchise Nomads** — people in ≥3 distinct franchises (item 48) — the connective tissue of IP cinema.
83. **[P3] Athletes to Actors** — Wikidata prior occupation (item 27); wrestlers, martial artists, athletes who crossed over.
84. **[P3] The Drama School Webs** — RADA vs Juilliard vs stage-school clusters (item 32) woven by co-appearance.
85. **[P3] Award Season Cohorts** — nominees woven by year and category (item 29); who kept meeting on the red carpet and on screen.
86. **[P3] Documentary Selves** — people mostly credited as "Self"; talk-show / doc ecosystem as its own weave.
87. **[P3] The Typecast Index** — top repeated character-name careers (item 44): perpetual cops, nurses, judges.
88. **[P3] Silent → Sound Survivors** — careers spanning 1927±5; who made the transition and who vanished.

## G. Derived metrics, graph analytics & app-facing data (89–100)

89. **[P1] Betweenness centrality per construct** (compute in Python on the built graph) → `bridge_score` node facet; surface "connectors" in Insights.
90. **[P2] Community detection** (Louvain/Leiden on each construct) → `community` node facet; app can color by community.
91. **[P2] Precompute per-construct summary stats JSON** (degree distribution, era histogram, gender mix) for the gallery cards and Insight cards — no client-side recompute.
92. **[P2] Small-world metrics in the manifest**: average path length, clustering coefficient — printable "this web is N handshakes wide" callouts.
93. **[P2] Six-degrees paths**: precompute shortest path between the 2 highest-prominence nodes per construct and emit as an annotated `featured_path` for poster callouts.
94. **[P3] Node embeddings** (node2vec on the co-appearance graph) → 2D projection coordinates as an alternative "constellation" hero layout.
95. **[P3] Era-sliced graph snapshots**: per-decade edge lists so the app can animate the weave growing through time.
96. **[P3] `data/out/index.json` enrichment**: add per-construct thumbnail stats (node/edge counts, era span, top name) so the gallery can render richer cards before loading full JSON.
97. **[P3] Percentile-normalized facets**: ship `degree_pct`, `prominence_pct` (0–100 within construct) so the UI can offer "top 10%" filters that mean the same thing everywhere.
98. **[P3] Cross-construct person index**: `people.json` mapping nconst → which constructs they appear in; enables "follow this person across looms" in the app.
99. **[P3] Data-quality report page**: emit `quality.json` per construct (missing birth years %, gender-unknown %, vote coverage %) and render it in the app's method panel.
100. **[P3] Nightly refresh automation**: GitHub Action that re-downloads IMDb weekly, rebuilds constructs, commits changed `data/out/`, and redeploys Pages — the loom stays alive.

---

## Suggested sequencing

```mermaid
flowchart LR
    fixes[A: Fixes 1-3] --> files[B: New IMDb files 13-16]
    files --> facets[D: Facets 41-44]
    facets --> edges[E: Edge semantics 59-62]
    edges --> constructs[F: New constructs 69-72]
    constructs --> analytics[G: Analytics 89-91]
```

Start with A1–A3 (they change what every chart says), then B13/B14/B16 (new raw
data unlocks half the list), then pick constructs from F by taste.
