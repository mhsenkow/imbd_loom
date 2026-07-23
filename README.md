# IMDb Loom

A printable network/alluvial illustration of actors woven across "complex
constructs" — voice actors in cartoons, men in horror, and other identity ×
genre × role cross-sections.

One app owns the whole pipeline: IMDb datasets → DuckDB → D3 poster (mm-sized
SVG) → print PDF. No Illustrator, Gephi, or RAWGraphs.

## Quick start

```bash
# 1. Data pipeline (downloads ~1.3GB of IMDb TSVs on first run)
cd pipeline
uv sync
uv run loom download
uv run loom parquet
uv run loom enrich          # Wikidata + IMDb voice heuristics; optional TMDB_API_KEY in .env
uv run loom build           # → data/out/<construct>/{nodes,edges,stages,manifest}.json
#    density: --top-n (default 200, hard max 300)

# 2. Authoring app
cd ../app
npm install
npm run dev                 # http://127.0.0.1:5173

# 3. Export print PDF (dev server must be running on 127.0.0.1:5173)
npm run export -- --size a1 --construct voice_cartoons --hero timeline
# Writes export/output/loom-{construct}-{size}.pdf
# Or click Export PDF in the UI (captures current filters into the print URL)
```

Or from the repo root: `./scripts/loom.sh {download|parquet|enrich|build|spike|verify|dev|export}`

## GitHub Pages

The interactive explorer deploys from `master` via `.github/workflows/pages.yml`.

- Site: `https://<user>.github.io/imbd_loom/`
- Construct JSON is committed under `data/out/` and copied into the static build
- PDF export is local-only (needs Puppeteer + the Vite API)

After the first push, enable **Settings → Pages → Source: GitHub Actions** if GitHub doesn’t auto-enable it.

## Explorer tips

- **Trust the data** — `?view=methodology` (sources, math, per-construct quality report, IMDb spot-check)
- **Find** — search movie / character / person; **Highlight** dims the rest, **Isolate** keeps only the matched web
- **Years** hero — career lanes + co-appearance arcs; flip axes under Hero form
- **Theme / Palette** — Page accordion: light / dark / auto theme + swatch picker (`loom`, `ink`, `dusk`, `okabe`, `contrast`). Palette is stored in the share URL; theme persists in localStorage. Styleguide at `?view=styleguide`
- **Insight** — analytical observation of the current cut lives in the Inspect panel
- **Links** — co-appearances (same IMDb title), except **One-role wonders** (genre co-membership)
- Density knobs (Top N, min edge weight, min titles) mirror the pipeline budget (~150–300 people)

## Layout

| Path | Role |
|---|---|
| `pipeline/` | Python + DuckDB: download, enrich, build constructs → JSON |
| `data/` | Raw TSVs, Parquet, enrichment cache, construct JSON outs |
| `app/` | Vite + TypeScript + D3 poster authoring UI (local atelier) |
| `export/` | Puppeteer RGB PDF exporter → `export/output/` |

## Constructs

1. **Voice actors in cartoons** — Animation titles + voice roles
2. **Men in horror** — Male-coded cast in Horror titles
3. **Women in horror** — Female-coded cast in Horror titles
4. **The scream-queen web** — Actresses recurring across horror
5. **The Bechdel web** — Cast across films that pass bechdeltest.com (rating=3)
6. **Comedy × Horror** — Crossover careers in both genres
7. **Genre bridges** — Careers spanning two+ genres (not one-role)
8. **One-role wonders** — People whose filmography is ≥90% one genre
9. **Long careers** — 35+ year credited spans
10. **The dubbing multiverse** — Voice actors playing many characters

### Data accuracy (read this)

| Signal | Accuracy | Notes |
|---|---|---|
| Co-appearances | High | Same IMDb title in `title.principals` (top-billed cast only — not full credits) |
| Edge `shared` samples | High | Top shared titles by votes (attached at build) for Inspect / hover |
| Character + film in Inspect | High when present | Parsed from IMDb `characters`; some credits lack names |
| Years / career span | Medium-high | Uses title `startYear` (release), not filming dates |
| Gender | Medium without TMDB | Falls back to IMDb `actor`/`actress` (binary, imperfect). Add `TMDB_API_KEY` for better data |
| Voice roles | Medium | Wikidata may be blocked; falls back to `(voice)` character / job heuristics |
| Bechdel | As good as the source | Community ratings on bechdeltest.com; not every film is scored |
| Genres | Medium | IMDb allows ≤3 genres per title; multi-genre titles inflate bridges |
| One-role edges | Synthetic | Same dominant genre — not co-appearances |

IMDb Non-Commercial Datasets — fine for a personal poster, not for resale.
See [BRIEF.md](BRIEF.md) for the full product & engineering design.
