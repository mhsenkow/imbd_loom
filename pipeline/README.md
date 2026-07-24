# Pipeline

DuckDB over IMDb Parquet + enrichment caches → construct JSON in `data/out/`.

## Rebuild recipe

```bash
cd pipeline

# Optional: TMDB gender (required for non-proxy gender)
# echo 'TMDB_API_KEY=...' > .env

# Enrichment: TMDB gender, Wikidata voice, Bechdel, Wikidata people facets
uv run loom enrich
# Iterative extras only:
# uv run loom enrich --only-extra --require-wikidata-people

# Full construct build (also refreshes people.json + quality.json)
uv run loom build --construct all

# Canaries + invariants
uv run loom validate

# Sync into the Vite app
bash ../scripts/sync-public-data.sh
```

## Caches (`data/cache/`)

| File | Source |
|------|--------|
| `gender.parquet` | TMDB (skipped if no API key — **no empty marker**) |
| `voice_actors.parquet` | Wikidata voice occupation + `(voice)` + Animation proxy |
| `wikidata_people.parquet` | Citizenship, occupations, awards, family, education |
| `bechdel.parquet` | bechdeltest.com / TidyTuesday mirror |

Cold Wikidata-dependent constructs (`athletes_actors`, `drama_schools`, `acting_dynasties`, `award_cohorts`) emit **empty** graphs rather than silent Action/Drama proxies.

## Episode policy

`coappearance_edges` includes `tvEpisode` when `title_episode` exists and collapses credits to `parentTconst` so series co-appearance is counted once.
