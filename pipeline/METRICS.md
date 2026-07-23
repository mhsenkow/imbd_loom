# Metrics data dictionary (metrics_version 2)

Canonical definitions for construct JSON. See also [METRICS_DECISIONS.md](METRICS_DECISIONS.md).

## Node fields

| Field | Formula / meaning | Range |
|---|---|---|
| `degree` | Neighbor count | ≥ 0 |
| `strength` | Σ incident edge `weight` | ≥ degree (when min weight ≥ 1) |
| `prominence` | Σ ln(votes+1) / max(billing,1) | ≥ 0 |
| `prominence_raw` | Σ votes / max(billing,1) | ≥ 0 |
| `pagerank` | Weighted PageRank, d=0.85 | sums to 1 |
| `eigen_centrality` | Power-iteration eigenvector | unit norm |
| `clustering_local` | Local clustering coefficient | [0,1] |
| `kcore` | k-core shell index | ≥ 0 |
| `acclaim_gap` | z(rating_median) − z(prominence) | ≈ [-3,3] |
| `role_diversity` | distinct characters / titles | [0,1+] |
| `hub_vs_loyal` | degree − scaled(collaborator_loyalty) | signed |
| `career_velocity` | titles / active years | ≥ 0 |
| `peak_sharpness` | share of top-decile-vote credits | [0,1] |
| `prominence_per_year` | prominence / active years | ≥ 0 |
| `rating_stdev` | stdev of title ratings | ≥ 0 |
| `medium_focus` | max share in medium_mix | [0,1] |
| `*_pct` / `*_z` | construct percentile / z-score | pct ∈ [0,100] |
| `birth_year_suspect` | age fields out of [0,90] | bool |

`character_count` and `title_count` are near-collinear (r≈0.88) — keep both but avoid as independent axes.

## Edge fields

| Field | Meaning |
|---|---|
| `weight` / `collab_strength` | ROUND(Σ ln(votes+1)) |
| `shared_count` / `collab_count` | Distinct shared titles |
| `year` | Mean shared-title year |
| `year_min` / `year_max` | Span of shared titles |
| `reunion_span` | last − first worked together |
| `recency` | years since last collaboration |
| `loyalty_ab` / `loyalty_ba` | shared / partner's total shared |
| `shared_votes_max` | Max votes among shared titles |
| `tenure_overlap` | Active-year overlap / union |
| `edge_genre_jaccard` | Genre set Jaccard |
| `cross_generational` | \|birth_year gap\| ≥ 20 |
| `shared_sample_cap` | Cap on shared[] sample (3) |

## Manifest.summary / correlations

Structural: `degree_gini`, `strength_gini`, `assortativity`, `density`, `modularity`, `community_sizes`, `giant_component_share`, `degree_hist`, `scatter_strength_prominence`, `gender_homophily`, `era_homophily`, `outliers`.

`correlations`: Pearson r + Spearman ρ per pair; null when n&lt;8 or constant.

Avg path: exact when N&lt;600, else sampled (`avg_path_length_sampled`).
