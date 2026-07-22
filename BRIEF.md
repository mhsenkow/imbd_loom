# IMDb Loom — Product & Engineering Design Brief

*A printable network/alluvial illustration of actors & actresses woven across
"complex constructs" — voice actors in cartoons, men in horror, and other
identity × genre × role cross-sections.*

---

## 1. Concept

**The core idea.** Most film-network visualizations show *who worked with whom*.
Loom adds a second axis: it shows *who a person is* (gender, role-type,
voice vs. on-camera) flowing into *what kind of work they do* (genre, medium,
era). The interesting story lives in the imbalances and clusters that appear
when you cut the data by a "construct."

**"Construct" = a lens.** Each construct is a saved query + a visual treatment:

| Construct | Population | Flow it reveals |
|---|---|---|
| Voice actors in cartoons | People with voice roles in Animation titles | actor → show → recurring-character reuse |
| Men in horror | Male-coded cast in Horror titles | gender → role prominence → title profile |
| Women in horror | Female-coded cast in Horror titles | gender → role prominence → title profile |
| The scream-queen web | Actresses recurring across horror | actress ↔ actress co-appearance |
| The Bechdel web | Cast across films that pass Bechdel (rating=3) | collaboration across “pass” titles |
| Comedy × Horror | Careers in both Comedy and Horror | crossover co-appearance |
| Genre bridges | Careers spanning two+ genres | multi-genre collaboration |
| One-role wonders | Filmography ≥90% one genre | person → genre concentration (links = genre co-membership) |
| Long careers | 35+ year credited spans | longevity × collaboration |
| The dubbing multiverse | Voice actors playing many characters | actor → character fan-out |

*(Shipped set is ten lenses; the original brief listed five core stories — the rest are expansions of the same loom.)*

**The "loom" metaphor drives the aesthetic.** The hero image is a single woven
structure (chord / edge-bundle / career timeline), and each construct is a *sub-view*
— a smaller alluvial "thread" pulled out of the same master fabric.

---

## 2. Product Design Brief

### 2.1 Audience & use
- **Primary artifact:** a large-format **printed poster** (A1/A0 or 24×36").
- **Secondary:** an interactive web explorer used *to author* the poster
  (pick a construct, tune filters, freeze a frame, export vector).
- Viewer should grasp the headline in 5 seconds and reward 5 minutes of study.

### 2.2 Information architecture of the poster
- **Hero band (top 60%):** one master weave — a chord diagram or hierarchical
  edge bundle of actor↔actor collaboration, colored by the active construct.
- **Sub-view strip (bottom 40%):** 3–5 small-multiple **alluvial/Sankey**
  panels, each a construct, sharing one color language.
- **Marginalia:** a legend, a one-paragraph method note, data-source credit,
  and 2–3 "callout" annotations pointing at the juiciest nodes.

### 2.3 Choosing the visual form (this is the key decision)

| Form | Best for | Print quality | Verdict |
|---|---|---|---|
| **Sankey / Alluvial** | Categorical *flow* (identity → genre → role) | Excellent, reads clean | **Use for sub-views** |
| **Chord diagram** | Symmetric co-occurrence (actor↔actor) | Beautiful, dense, "woven" | **Use for hero** |
| **Hierarchical edge bundling** | Many-to-many with grouping | Gorgeous, very "loom" | Hero alternative |
| Force-directed network | Exploration, organic clusters | Hairball at scale; hard to print | Author-time only, not final poster |
| Arc diagram | Linear ordering of one axis | Clean but low density | Optional inset |

**Recommendation:** **Alluvial sub-views + a chord/edge-bundle hero.** Alluvial
is unbeatable for "compare a population across a construct" and it prints
razor-sharp. Reserve force-directed layouts for *finding* the story, not
*showing* it — hairballs photograph badly and don't survive 300 DPI scrutiny.

### 2.4 Visual system
- **Vector-first, always.** Everything that can be a path is a path. Photos of
  actors only if you truly want them, and only at ≥300 DPI at final size.
- **Color = the construct's key variable** (e.g. gender), not decoration.
  Diverging or 2-color categorical for gender; sequential for magnitude.
  Design in RGB, soft-proof to CMYK, avoid pure 100% saturation (muddies in
  print). Keep ≤6 categorical hues.
- **Type:** one humanist sans for labels, a mono or condensed sans for data
  ticks. Embed/outline all fonts before sending to print.
- **Density budget:** cap the hero at ~150–300 visible nodes. Beyond that,
  aggregate (top-N by degree) and label only hubs.

---

## 3. Data Brief

### 3.1 Recommended datasets (all free)

1. **IMDb Non-Commercial Datasets — the backbone.**
   `https://datasets.imdbws.com/` — bulk gzipped TSV, no API key, refreshed daily.
   - `name.basics.tsv.gz` — person id, name, birth/death year, professions, knownForTitles
   - `title.basics.tsv.gz` — title id, type, primary title, **genres**, year, runtime
   - `title.principals.tsv.gz` — title↔person, **category** (`actor`/`actress`/`self`…), `job`, **characters**
   - `title.ratings.tsv.gz` — ratings (use for "prominence"/weighting)
   - *License: personal & non-commercial only — fine for a personal poster, not for sale.*

2. **TMDB API — enrichment (get a free key).**
   `https://developer.themoviedb.org/` — adds a real **`gender`** field
   (0 unknown / 1 female / 2 male / 3 non-binary), plus billing order and images.
   Use this for "men in horror" rather than the imperfect actor/actress proxy.

3. **Wikidata (SPARQL) — the precise constructs.**
   `https://query.wikidata.org/` — has occupation `voice actor` (Q2405480) and
   `cast member` (P161) with a **`voice actor` qualifier**, so it's the cleanest
   source for "voice acting" specifically. Great for the cartoon construct.

### 3.2 Deriving each construct from the data
- **Gender:** TMDB `gender` (best) → fallback to IMDb `actor` vs `actress`
  category (free, but binary and imperfect — note this in the method box).
- **"Cartoon":** `title.basics.genres` contains `Animation` (and/or titleType).
- **"Voice role":** hardest signal in raw IMDb. Options, in order of quality:
  Wikidata voice-actor qualifier > TMDB job strings/character `(voice)` >
  IMDb `characters` heuristic. Be explicit about method.
- **"Prominence":** billing order (TMDB `order`), or IMDb `ordering` in
  `title.principals`, or title rating × votes.

### 3.3 The graph model you export
Boil everything down to two files the visualization consumes:
- `nodes.json` — `{id, label, type: person|title|genre|role, gender, degree, ...}`
- `edges.json` — `{source, target, weight, construct}`
For alluvial you'll instead emit **stage tables**:
`{stageFrom, stageTo, categoryFrom, categoryTo, value}`.

---

## 4. Engineering Brief

### 4.1 Stack recommendation (opinionated) — fully self-contained, no external finishing

> **Constraint: the app owns the whole pipeline through to the printable PDF.**
> No Illustrator/Inkscape/Gephi/RAWGraphs. Every mark, label, crop mark, and the
> final press file are produced programmatically.

| Layer | Choice | Why |
|---|---|---|
| Data crunch | **DuckDB** (+ a little Python) | Reads the gzipped TSVs directly, joins the ~1GB `principals` table on a laptop in seconds, outputs clean JSON. Far less pain than pandas here. |
| Enrichment | Python `requests` → TMDB, cached to local Parquet | Rate-limit friendly, resumable |
| Layout math | **D3 modules** (`d3-sankey`, `d3-chord`, `d3-hierarchy`) | These are **pure coordinate math** — they run headless with no DOM. This is what lets the app own layout without a designer. |
| Compose + render | **D3 + a single sized SVG** in a **Vite** app | The *entire poster* — hero, sub-view strip, legend, annotations, crop marks, bleed — is laid out in **one SVG sized in real mm**, not touched up by hand. |
| **Export to print** | **Headless Chromium (Puppeteer) → PDF** at exact physical page size | Fonts embedded automatically, fully vector, one button. Leaner modern alternatives: **`resvg`** (Rust SVG→PDF, no browser) or **Typst** (embed the SVG, press-quality typographic PDF). |

**Alternatives considered (and why not):**
- **Vega / Vega-Lite** — declarative grammar built *on* D3; superb for standard
  charts/dashboards, but **no first-class Sankey/chord/edge-bundling** and awkward
  for mm-precise poster composition. Use **Observable Plot** (concise D3 layer) for
  *exploration*; keep D3 for the final art.
- **Polars** — excellent Rust DataFrame lib; strong alternative to DuckDB, but this
  work is join-heavy and DuckDB's SQL + direct TSV/Parquet reads are cleaner.
- **DuckDB is the modern-correct pick.** Tip: convert TSVs → **Parquet** once, then
  query Parquet for much faster repeat runs.

**CMYK decision (pick one, both stay in-app):**

- **Default — ship RGB PDF via Chromium (Puppeteer).** Done: Vite atelier +
  `export/export-pdf.ts` → `export/output/`. Soft-proof CMYK externally if needed.
- **Press-perfect — CMYK / PDF-X entirely in code.** *Future / not shipped.* Browsers are RGB-only, so
  for true CMYK: run the D3 layout modules headless to get coordinates, then
  draw those coordinates into a PDF with a **CMYK-capable PDF library**
  (e.g. Python **`reportlab`**). More work, zero external apps, exact ink control.

### 4.2 Pipeline (nothing leaves the app)
```
download IMDb TSVs ─┐
                    ├─► DuckDB: filter (genre/role) + join + aggregate ─► nodes/edges/stages.json
TMDB gender enrich ─┘                                                          │
                                                                               ▼
                                     D3 lays out hero + sub-views + legend + crop marks
                                     into ONE SVG sized in mm (bleed included)
                                                                               │
                                          ┌────────────────────────────────────┤
                                          ▼                                    ▼
                              Chromium → RGB print PDF          reportlab → CMYK PDF/X
                                     (default, 1 click)          (press-perfect, in-code)
```

### 4.3 Milestones
1. **M0 – Spike (½ day):** one construct (e.g. voice actors in cartoons) through
   RAWGraphs to prove the story is visually interesting. *Fail fast here.*
2. **M1 – Data pipeline:** DuckDB script → clean `nodes/edges/stages.json`.
3. **M2 – TMDB/Wikidata enrichment** for gender + voice flags, cached.
4. **M3 – D3 app:** alluvial component + chord/bundle hero, construct switcher.
5. **M4 – Poster comp:** hero + sub-view strip + legend/annotations.
6. **M5 – Print prep:** vector cleanup, CMYK soft-proof, bleed/margins, PDF/X.

---

## 5. Print Production — all produced by the app, in code
Everything below is set once as constants in the layout/export code; there is no
manual print-prep step.
- **Size:** define the SVG `viewBox`/page in **mm** — A1 (594×841 mm) is a strong,
  affordable poster; A0 / 24×36" for impact.
- **Bleed 3 mm** drawn into the artboard; **crop marks** rendered programmatically
  at the four corners. Keep text ≥ 10 mm from trim (a coded safe-margin guide).
- **Vector everywhere;** any raster (actor photos) embedded ≥ **300 DPI at final size**.
- **Color:** RGB export by default; if using the reportlab path, define the palette
  in **CMYK** and avoid 4×100% "rich black" on fine lines.
- **Fonts:** Chromium embeds them automatically; reportlab embeds via `registerFont`.
  No outlining-by-hand needed.
- **Output:** **PDF** (RGB) from Chromium, or **PDF/X** (CMYK) from reportlab.
- Still worth a **tabloid (11×17") test print** from the same PDF before large format.

---

## 6. Recommended Path (TL;DR) — one app, end to end
1. Build the **DuckDB → JSON** pipeline over IMDb datasets; enrich gender via **TMDB**.
2. Render in **D3** (alluvial sub-views + chord/edge-bundle hero) into **one mm-sized SVG**
   with legend, annotations, bleed, and crop marks all drawn in code.
3. Export straight to **print PDF** from the app — Chromium (RGB, default) or
   reportlab (CMYK/PDF-X). No external editor at any point.
4. Test print, then run at **A1**.

## 7. Risks & Gotchas
- IMDb datasets are **non-commercial** — fine for a personal poster, not for resale.
- "Voice role" is **not cleanly labeled** in raw IMDb — lean on Wikidata/TMDB and disclose method.
- Gender via actor/actress is **binary & imperfect** — prefer TMDB's field, annotate limits.
- `title.principals` is large — use **DuckDB**, not naive pandas/CSV in memory.
- Force-directed **hairballs don't print** — aggregate to top-N hubs for the final art.
