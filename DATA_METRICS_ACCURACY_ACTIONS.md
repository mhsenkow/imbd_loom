# IMDb Loom — Data Accuracy & Derived Metrics Action Plan

A 100-step checklist to (1) fix accuracy/semantic bugs, (2) reconcile inconsistent math,
(3) add new "numbers in the network" — centrality, correlations, structural stats — from
data we already have, and (4) surface them. Ordered so correctness lands before new metrics
build on it.

## Context: what the holistic pass found (read first)

Verified against the shipped JSON (`data/out/*`), not assumed:

- **`degree` is mislabeled.** The stored/rendered `degree` is **summed edge weight
  (strength)**, not neighbor count. Kana Hanazawa: stored `degree` **2477** but only **74**
  actual neighbors; Mayumi Tanaka **1708** vs **33**. The UI colors/sorts by "degree" and
  calls it degree. Source: node degree = Σ incident edge weight (`emit.py:305–314`), weight
  = `ROUND(Σ ln(votes+1))` (`emit.py:276–280`).
- **Prominence uses a different vote transform than edges.** `prominence = Σ votes/max(billing,1)`
  over the whole career (`facets.py:156–161`) — **raw** votes; edges use **log** votes.
  On voice_cartoons prominence is min 4,364 / median 45,013 / max 1,096,054, mean/median = **1.9**
  (heavily skewed, dominated by a few).
- **A few dirty derived values.** e.g. Akemi Okamura has an implausible `debut_age`
  (birth-year vs earliest-title mismatch); no sanity clamp exists (`facets.py:143–146`).
- **Redundant axes.** `character_count × title_count` r=**0.88**; one is near-duplicate.
- **The interesting low correlations** are the product opportunity: `degree × prominence`
  r=**0.42** (network position ≠ fame), `title_rating_median × prominence` r=**0.34**
  (acclaim ≠ popularity), `degree × collaborator_loyalty` r=**−0.23** (hubs spread thin).
- **Backbone is trustworthy**: deterministic joins, `seed=42`, episode roll-up, recomputed
  counts match. Enriched signals (gender proxy without TMDB, heuristic voice flags, averaged
  edge year) are the soft spots.

Nodes already carry ~50 computed fields; edges carry `weight, shared_count, year,
first/last_worked_together, genres, shared`. All new metrics below derive from these — no
new data sources.

---

## Phase 0 — Baseline & decisions (steps 1–7)

- [ ] 1. Snapshot current outputs: copy `data/out` to `data/out.baseline` so every metric change is diffable.
- [ ] 2. Write a one-off `scripts/metrics_report.py` that prints distributions + Pearson r across node fields per construct (reuse the analysis already run) as the regression baseline.
- [ ] 3. Decide the vote-transform policy: pick ONE canonical transform (recommend `ln(votes+1)`) for both edge weight and prominence, OR keep raw prominence but rename it `prominence_raw` and add `prominence_log`. Document the choice.
- [ ] 4. Decide degree naming: introduce `degree` = neighbor count and `strength` = weighted, and choose which drives color/sort by default (recommend `strength` for hubs, but label it honestly).
- [ ] 5. Confirm which fields the frontend actually reads (`encode.ts`, `statsMarks.ts`, `DetailPanel.tsx`) so renames are done with a compatibility shim, not a break.
- [ ] 6. Add `pytest` fixtures for a tiny synthetic graph so new metric formulas are unit-tested independently of IMDb data.
- [ ] 7. Create branch `feat/metrics-accuracy`.

## Phase 1 — Correctness & reconciliation fixes (steps 8–22)

- [ ] 8. In `emit.py`, compute and emit **`degree`** = count of distinct neighbors (graph degree) as a NEW field.
- [ ] 9. Rename the existing weighted sum to **`strength`** (keep `degree` as an alias temporarily for the frontend shim).
- [ ] 10. Emit **`strength_log`** vs **`strength_count`** if both weight modes are useful, so the weight transform is explicit.
- [ ] 11. Reconcile prominence to the canonical transform from step 3 (`facets.py:156–161`); if switching to log, recompute `prominence_pct` accordingly.
- [ ] 12. Add **`prominence_pct_construct`** — prominence percentile *within the construct's node set*, not career-wide, so it's comparable across cuts.
- [ ] 13. Clamp/validate `debut_age`, `retirement_age`, `age_at_peak`: drop or flag values <0 or >90 and emit a `birth_year_suspect` boolean (`facets.py:143–146`).
- [ ] 14. Guard `billing = max(int(ordering or 10), 1)` — confirm `ordering` NULL handling; log how many credits fell back to the default 10 (it silently downweights unknown-billing credits).
- [ ] 15. Make `gap_years` ignore leading/trailing gaps only between real credits (it already does) but exclude single-credit people from the metric (currently 0, ambiguous with "no gaps").
- [ ] 16. Fix `genre_drift` edge cases: when early or late set is empty (short careers), emit `null` not `1.0` so it isn't read as "total drift" (`facets.py:200–205`).
- [ ] 17. Make `dominant_genre` deterministic on ties (currently `most_common(1)` is order-dependent) — break ties alphabetically (`facets.py:177–180`).
- [ ] 18. Verify `edges_with_year_pct` and the averaged edge `year`: add `year_min`/`year_max` per edge alongside the average so multi-decade partnerships aren't misrepresented (`emit.py:289`).
- [ ] 19. Recompute `quality.json` after the above and diff against `out.baseline` to confirm only intended shifts.
- [ ] 20. Add a `metrics_version` field to the manifest so the frontend can detect schema/semantic changes.
- [ ] 21. Ensure `validate_construct` (`emit.py:86–106`) now checks new invariants: `degree ≤ neighbor_count_max`, `strength ≥ degree`, percentiles in [0,100].
- [ ] 22. Run the full `uv run loom build` and confirm no construct regresses node/edge counts unexpectedly.

## Phase 2 — New node-level metrics (steps 23–40)

- [ ] 23. Add **PageRank** to `analytics.py` (weighted, damping 0.85, deterministic iteration) — fame-independent influence; store `pagerank` + `pagerank_pct`.
- [ ] 24. Add **eigenvector centrality** (power iteration) as `eigen_centrality` for "connected to the well-connected."
- [ ] 25. Add **weighted local clustering** per node (currently only the graph average exists at `analytics.py:118–132`) as `clustering_local`.
- [ ] 26. Add **k-core number** per node (`kcore`) — how deep in the dense core a person sits.
- [ ] 27. Add **acclaim–popularity gap** = `z(title_rating_median) − z(prominence_pct_construct)`, stored as `acclaim_gap` (surfaces under-appreciated vs over-exposed).
- [ ] 28. Add **role diversity** = distinct normalized characters / title_count (complements `genre_entropy`), stored as `role_diversity`.
- [ ] 29. Add **hub-vs-loyal index** = `degree − scaled(collaborator_loyalty)` to formalize the −0.23 correlation into a single readable axis.
- [ ] 30. Add **career velocity** = titles per active year = `title_count / max(year_max − year_min, 1)`.
- [ ] 31. Add **peak sharpness** = share of prominence concentrated in the top-decile-vote titles (reuse `blockbuster_share` machinery, `facets.py:269–271`).
- [ ] 32. Add **longevity-adjusted prominence** = `prominence / active_years` so long careers don't dominate purely by accumulation.
- [ ] 33. Add **first-vs-last-genre distance** as a categorical drift complement to `genre_drift` (already have `genre_first`/`genre_last`).
- [ ] 34. Add **collaborator reach** = number of distinct co-stars across ALL credits (not just in-construct neighbors) to distinguish in-cut vs career connectivity.
- [ ] 35. Add **rating consistency** = stdev of the person's title ratings (have median/max; add spread) as `rating_stdev`.
- [ ] 36. Add **medium specialization** = max share in `medium_mix` (already computed) surfaced as a scalar `medium_focus`.
- [ ] 37. Drop or merge one of `character_count`/`title_count` given r=0.88, OR keep both but document that they're near-collinear so they aren't used as independent axes.
- [ ] 38. Emit z-scored versions of the key scalars (`*_z`) so the frontend can build diverging color scales without recomputing.
- [ ] 39. Emit percentile ranks (`*_pct`) consistently for every headline metric (degree, strength, pagerank, prominence, acclaim_gap).
- [ ] 40. Document each new field in a `pipeline/METRICS.md` data dictionary (name, formula, range, source line).

## Phase 3 — New edge-level metrics (steps 41–52)

- [ ] 41. Emit **`reunion_span`** = `last_worked_together − first_worked_together` as a first-class edge number (you already flag `reunion`).
- [ ] 42. Emit **`collab_count`** (distinct shared titles = `shared_count`) and **`collab_strength`** (log-vote weight) side by side so their ratio is inspectable.
- [ ] 43. Add **loyalty asymmetry**: for edge A–B, emit `loyalty_ab = shared/total_shared(A)` and `loyalty_ba` — one partner may be devoted, the other incidental.
- [ ] 44. Add **edge fame** = mean/max votes of the shared titles, stored as `shared_votes_max` (lets arcs be colored by how big the shared hit was).
- [ ] 45. Add **tenure overlap** = overlap of the two people's active-year ranges vs the collaboration span (are they lifelong peers or one-off?).
- [ ] 46. Add **same-era flag** vs **cross-generational flag** (age gap of the pair) using `birth_year`.
- [ ] 47. Add **genre agreement** = Jaccard of the two nodes' genre sets, stored as `edge_genre_jaccard`.
- [ ] 48. Add **directorial glue** = whether the pair shares a `top_director` (reuse `same_director_repeat` data).
- [ ] 49. Emit an edge **`recency`** (years since `last_worked_together`) for the recency thickness mode already in the UI (`encode.ts:95–101`) instead of recomputing client-side.
- [ ] 50. Validate every new edge field survives the Top-N prune (`emit.py:315–341`) without dangling references.
- [ ] 51. Cap `shared` sample size consistently (currently top-3 by votes, `emit.py:481–538`) and note the cap in the payload.
- [ ] 52. Add edge fields to `validate_construct` invariants (`reunion_span ≥ 0`, jaccard in [0,1]).

## Phase 4 — Network-structural metrics (steps 53–66)

- [ ] 53. Compute **degree Gini** (inequality of connectivity) per construct → manifest `summary.degree_gini` (DATA_IDEAS.md already wants a Gini callout).
- [ ] 54. Compute **strength Gini** separately so weighted vs unweighted inequality both show.
- [ ] 55. Compute **degree assortativity** (do hubs connect to hubs?) → `summary.assortativity`.
- [ ] 56. Compute **graph density** = `2E / N(N−1)` → `summary.density`.
- [ ] 57. Compute **modularity score** of the detected communities (not just the count at `analytics.py:61–115`) → `summary.modularity`.
- [ ] 58. Emit **community sizes** (list) and the **largest-community share** → `summary.community_sizes`.
- [ ] 59. Compute **number of connected components** and **giant-component share** (how fragmented is the cut).
- [ ] 60. Upgrade **avg path length** from the ≤40-source sample to exact for small graphs (N<600), else keep sampled but emit `avg_path_length_sampled: true` + sample N (`analytics.py:135–158`).
- [ ] 61. Compute **diameter / effective diameter** (90th-percentile path length) for small graphs.
- [ ] 62. Compute the **degree distribution histogram** (binned) → `summary.degree_hist` for the stats rail.
- [ ] 63. Compute **gender homophily** (share of edges within same gender vs expected) → `summary.gender_homophily`.
- [ ] 64. Compute **era homophily** (do people collaborate within their era?) using edge `year` and node eras.
- [ ] 65. Emit a per-construct **`correlations`** block: precomputed Pearson r for the key field pairs (degree×prominence, rating×prominence, entropy×degree, …) so the frontend shows them without loading all nodes.
- [ ] 66. Add all structural stats to `pipeline/METRICS.md` with formulas and the small-graph/approximation caveats.

## Phase 5 — Correlation & distribution engine (steps 67–76)

- [ ] 67. Add a reusable `analytics.correlations(nodes, pairs)` returning `{pair: {r, n}}` with the same Pearson impl used in the baseline script.
- [ ] 68. Flag **spurious/degenerate correlations** (n<8 or one variable near-constant) as `null` rather than emitting noise.
- [ ] 69. Emit **Spearman rank correlation** alongside Pearson for skewed fields (prominence) where rank is more honest than linear r.
- [ ] 70. Precompute **scatter-ready sampled points** for the top pairs (id, x, y) so the frontend can render the degree×prominence scatter directly.
- [ ] 71. Emit **binned distributions** (histograms) for degree, strength, prominence, acclaim_gap for stat overlays.
- [ ] 72. Detect and emit the **most/least correlated pair** per construct as a headline "insight" string (feeds the existing insight system).
- [ ] 73. Emit **outlier nodes** per metric (>2σ) as candidate callouts for the stat-mark layer.
- [ ] 74. Ensure correlation/distribution computation is deterministic (sorted inputs, fixed sampling stride).
- [ ] 75. Keep the correlations payload small (a few KB) — it must be loadable by the trust/methodology page and the stats rail without pulling `nodes.json`.
- [ ] 76. Unit-test the correlation engine against known inputs (perfect +1, perfect −1, zero, constant).

## Phase 6 — "Numbers in the weave" construct + stats rail (steps 77–86)

- [ ] 77. Spec a meta-construct / view mode where the same network carries a live **stats rail** (degree histogram, degree×prominence scatter, Gini, assortativity, community count).
- [ ] 78. Add a `StatsRail` component that reads the manifest `summary` + `correlations` blocks (no heavy node load).
- [ ] 79. Make each stat **cross-highlight** the graph: hovering a scatter point or histogram bin highlights those nodes in the hero (reuse the existing selection/highlight system).
- [ ] 80. Add a two-axis scatter (degree/strength × prominence) as a first-class hero form option, since their r=0.42 makes it genuinely informative.
- [ ] 81. Wire the new node metrics into the existing `ColorBy`/`SizeBy` encodings (`encode.ts`) — add `pagerank`, `acclaim_gap`, `strength` as color/size options.
- [ ] 82. Add `acclaim_gap` as a **diverging** color scale (reuse the diverging scale from the theming pass) — above/below the acclaim=popularity line.
- [ ] 83. Extend the stat-mark system (`statsMarks.ts`, `StatMarkDecor.tsx`) with marks for the new structural stats (Gini callout, assortativity, giant-component ghost).
- [ ] 84. Surface the per-construct `correlations` on the methodology/trust page as an interactive matrix.
- [ ] 85. Add a legend explaining that `degree`/`strength`/`prominence` are distinct axes, with the honest definitions.
- [ ] 86. Add an insight line auto-generated from the strongest correlation ("In this cut, fame and connectivity barely track — r=0.42").

## Phase 7 — Accuracy self-checks, validation & tests (steps 87–94)

- [ ] 87. Add a `loom verify` command that recomputes node/edge counts, neighbor sets, and `quality.json` metrics from the emitted JSON and asserts they match the manifest.
- [ ] 88. Add a cross-field sanity suite: `strength ≥ degree`, percentiles in range, no NaN/Inf, `debut_age` plausible, jaccard in [0,1].
- [ ] 89. Add a golden-file test per construct: hash of key metric columns, so pipeline changes surface as reviewable diffs.
- [ ] 90. Add a test asserting the vote-transform is consistent between edges and prominence (guards the step-3 reconciliation).
- [ ] 91. Add a test that every manifest carries non-empty `method_note`, `data_credit`, `metrics_version`, and the new `summary`/`correlations` blocks.
- [ ] 92. Add coverage reporting: emit `tmdb_coverage_pct`, `voice_flag_source`, `bechdel_matched_pct` into `quality.json` so softness is measurable (also feeds the trust page).
- [ ] 93. Add a CI step running `loom verify` + the metric tests on the committed `data/out` fixtures.
- [ ] 94. Log a per-build metrics summary (counts, ranges, r values) to the console so regressions are visible during `build`.

## Phase 8 — Types, frontend surfacing & docs (steps 95–100)

- [ ] 95. Widen the `Node` and `Edge` interfaces in `app/src/lib/types.ts` to type all new fields (or add a `Metrics` sub-interface) — replace reliance on the index signature.
- [ ] 96. Add a compatibility shim so the frontend reads `strength` but falls back to legacy `degree` until all constructs are rebuilt.
- [ ] 97. Update `DetailPanel.tsx` to show the richer, correctly-named numbers (degree vs strength vs prominence vs pagerank vs acclaim_gap) with tooltips defining each.
- [ ] 98. Update the methodology/trust page's math section to document every new metric (pulls from `pipeline/METRICS.md`).
- [ ] 99. Update `DATA_IDEAS.md` (mark Gini/structural stats done), `README.md` accuracy table (add degree-vs-strength note), and `pipeline/METRICS.md` as the canonical data dictionary.
- [ ] 100. Open the PR from `feat/metrics-accuracy` with the before/after correlation report, the degree-vs-strength fix called out, and the list of new node/edge/structural metrics now available.

---

### The single highest-value item

**Step 8–9 (split `degree` into neighbor-count `degree` + weighted `strength`).** Today the
app's headline number is mislabeled and the fix unlocks honest centrality, correct
correlations, and the two-axis scatter that makes this a "network *and* numbers" tool.
Everything in Phases 2–6 assumes it.
