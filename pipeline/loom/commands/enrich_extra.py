"""Extra enrichment: Wikidata people facets, MovieLens tags, pageviews stubs."""

from __future__ import annotations

import csv
import io
import json
import time
from typing import Any

import httpx
from rich.console import Console

from loom import CACHE
from loom.db import connect, parquet_path

console = Console()

UA = {"User-Agent": "IMDbLoom/0.2 (research poster pipeline; local)"}


def enrich_wikidata_people(nconsts: list[str] | None = None, *, limit: int = 8000) -> int:
    """
    SPARQL pull for nationality, occupations, awards, family, education, height, birth.
    Chunked by IMDb nconst batches when provided. Returns rows written (0 on failure).
    """
    path = parquet_path("wikidata_people")
    if path.exists() and path.stat().st_size > 1000:
        age = (time.time() - path.stat().st_mtime) / 86400
        if age < 14:
            con = connect()
            n = con.execute(f"SELECT COUNT(*) FROM read_parquet('{path}')").fetchone()[0]
            console.print(f"  [dim]Wikidata people cache warm ({n:,} rows, {age:.0f}d)[/dim]")
            return int(n)

    console.print("  Wikidata SPARQL: citizenship / occupations / awards / family…")
    ids = list(dict.fromkeys(nconsts or []))[:limit]
    agg: dict[str, dict[str, Any]] = {}

    if ids:
        chunk_size = 80
        for i in range(0, len(ids), chunk_size):
            chunk = ids[i : i + chunk_size]
            _sparql_chunk(chunk, agg)
            time.sleep(0.4)
            console.print(f"    chunk {i // chunk_size + 1}: {len(agg):,} people so far")
    else:
        # Open query fallback (smaller limit) when no candidate list
        try:
            bindings = _sparql_open(limit=min(limit, 3000))
            _ingest_bindings(bindings, agg)
        except Exception as exc:  # noqa: BLE001
            console.print(f"[red]Wikidata people query failed:[/red] {exc}")
            _write_failure_sidecar(str(exc))
            return 0

    if not agg:
        console.print("[red]Wikidata people returned 0 rows[/red]")
        _write_failure_sidecar("empty_result")
        return 0

    rows = []
    for rec in agg.values():
        awards = rec["awards"]
        family = {
            "spouse": sorted(rec["spouses"]),
            "child": sorted(rec["children"]),
            "sibling": sorted(rec["siblings"]),
        }
        rows.append(
            (
                rec["nconst"],
                ",".join(sorted(rec["nationalities"])) or None,
                ",".join(sorted(rec["occupations"])) or None,
                len(awards),
                None,
                ",".join(sorted(rec["educated"])) or None,
                rec["height_m"],
                rec["birth_year_wd"],
                json.dumps(family),
            )
        )

    CACHE.mkdir(parents=True, exist_ok=True)
    con = connect()
    con.execute(
        """
        CREATE TEMP TABLE wd (
          nconst VARCHAR,
          nationality VARCHAR,
          occupations VARCHAR,
          award_wins INTEGER,
          award_noms INTEGER,
          educated_at VARCHAR,
          height_m DOUBLE,
          birth_year_wd INTEGER,
          family_json VARCHAR
        )
        """
    )
    con.executemany("INSERT INTO wd VALUES (?,?,?,?,?,?,?,?,?)", rows)
    con.execute(f"COPY wd TO '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    console.print(f"  cached {len(rows):,} Wikidata people → {path.name}")
    return len(rows)


def _write_failure_sidecar(reason: str) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / "wikidata_people.failed.json").write_text(
        json.dumps({"status": "failed", "reason": reason, "at": time.time()}, indent=2),
        encoding="utf-8",
    )


def _sparql_chunk(nconsts: list[str], agg: dict[str, dict[str, Any]]) -> None:
    values = " ".join(f'"{n}"' for n in nconsts)
    query = f"""
    SELECT ?imdb ?nationalityLabel ?occupationLabel ?educatedLabel ?height ?birthYear
           ?spouseImdb ?childImdb ?siblingImdb ?awardLabel
    WHERE {{
      VALUES ?imdb {{ {values} }}
      ?person wdt:P345 ?imdb .
      OPTIONAL {{ ?person wdt:P27 ?nationality . }}
      OPTIONAL {{ ?person wdt:P106 ?occupation . }}
      OPTIONAL {{ ?person wdt:P69 ?educated . }}
      OPTIONAL {{ ?person wdt:P2048 ?height . }}
      OPTIONAL {{
        ?person wdt:P569 ?birth .
        BIND(YEAR(?birth) AS ?birthYear)
      }}
      OPTIONAL {{
        ?person wdt:P26 ?spouse .
        ?spouse wdt:P345 ?spouseImdb .
      }}
      OPTIONAL {{
        ?person wdt:P40 ?child .
        ?child wdt:P345 ?childImdb .
      }}
      OPTIONAL {{
        ?person wdt:P3373 ?sib .
        ?sib wdt:P345 ?siblingImdb .
      }}
      OPTIONAL {{ ?person wdt:P166 ?award . }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    """
    try:
        bindings = _post_sparql(query)
        _ingest_bindings(bindings, agg)
    except Exception as exc:  # noqa: BLE001
        console.print(f"  [yellow]chunk failed:[/yellow] {exc}")


def _sparql_open(*, limit: int) -> list[dict]:
    query = f"""
    SELECT ?imdb ?nationalityLabel ?occupationLabel ?educatedLabel ?height ?birthYear
           ?spouseImdb ?childImdb ?siblingImdb ?awardLabel
    WHERE {{
      ?person wdt:P345 ?imdb .
      FILTER(STRSTARTS(?imdb, "nm"))
      OPTIONAL {{ ?person wdt:P27 ?nationality . }}
      OPTIONAL {{ ?person wdt:P106 ?occupation . }}
      OPTIONAL {{ ?person wdt:P69 ?educated . }}
      OPTIONAL {{ ?person wdt:P2048 ?height . }}
      OPTIONAL {{
        ?person wdt:P569 ?birth .
        BIND(YEAR(?birth) AS ?birthYear)
      }}
      OPTIONAL {{
        ?person wdt:P26 ?spouse .
        ?spouse wdt:P345 ?spouseImdb .
      }}
      OPTIONAL {{
        ?person wdt:P40 ?child .
        ?child wdt:P345 ?childImdb .
      }}
      OPTIONAL {{
        ?person wdt:P3373 ?sib .
        ?sib wdt:P345 ?siblingImdb .
      }}
      OPTIONAL {{ ?person wdt:P166 ?award . }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }}
    LIMIT {int(limit)}
    """
    return _post_sparql(query)


def _post_sparql(query: str) -> list[dict]:
    with httpx.Client(
        timeout=180.0, headers={**UA, "Accept": "application/sparql-results+json"}
    ) as client:
        r = client.post(
            "https://query.wikidata.org/sparql",
            data={"query": query, "format": "json"},
        )
        r.raise_for_status()
        return r.json()["results"]["bindings"]


def _ingest_bindings(bindings: list[dict], agg: dict[str, dict[str, Any]]) -> None:
    for b in bindings:
        imdb = b.get("imdb", {}).get("value")
        if not imdb:
            continue
        rec = agg.setdefault(
            imdb,
            {
                "nconst": imdb,
                "nationalities": set(),
                "occupations": set(),
                "educated": set(),
                "awards": set(),
                "spouses": set(),
                "children": set(),
                "siblings": set(),
                "height_m": None,
                "birth_year_wd": None,
            },
        )
        if "nationalityLabel" in b:
            rec["nationalities"].add(b["nationalityLabel"]["value"])
        if "occupationLabel" in b:
            rec["occupations"].add(b["occupationLabel"]["value"])
        if "educatedLabel" in b:
            rec["educated"].add(b["educatedLabel"]["value"])
        if "awardLabel" in b:
            rec["awards"].add(b["awardLabel"]["value"])
        if "spouseImdb" in b:
            rec["spouses"].add(b["spouseImdb"]["value"])
        if "childImdb" in b:
            rec["children"].add(b["childImdb"]["value"])
        if "siblingImdb" in b:
            rec["siblings"].add(b["siblingImdb"]["value"])
        if "height" in b and rec["height_m"] is None:
            try:
                rec["height_m"] = float(b["height"]["value"])
            except ValueError:
                pass
        if "birthYear" in b and rec["birth_year_wd"] is None:
            try:
                rec["birth_year_wd"] = int(float(b["birthYear"]["value"]))
            except ValueError:
                pass


def enrich_movielens_tags() -> None:
    path = parquet_path("movielens_tags")
    if path.exists() and path.stat().st_size > 1000:
        console.print("  [dim]MovieLens tags cache warm[/dim]")
        return

    console.print("  Downloading MovieLens ml-latest-small…")
    url = "https://files.grouplens.org/datasets/movielens/ml-latest-small.zip"
    try:
        import zipfile

        with httpx.Client(timeout=120.0, follow_redirects=True, headers=UA) as client:
            r = client.get(url)
            r.raise_for_status()
            zf = zipfile.ZipFile(io.BytesIO(r.content))
            links = zf.read("ml-latest-small/links.csv").decode("utf-8")
            tags = zf.read("ml-latest-small/tags.csv").decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        console.print(f"[yellow]MovieLens download failed:[/yellow] {exc}")
        return

    id_map: dict[str, str] = {}
    for row in csv.DictReader(io.StringIO(links)):
        mid = row.get("movieId")
        imdb = (row.get("imdbId") or "").zfill(7)
        if mid and imdb:
            id_map[mid] = f"tt{imdb}"

    tag_counts: dict[str, dict[str, int]] = {}
    for row in csv.DictReader(io.StringIO(tags)):
        mid = row.get("movieId")
        tag = (row.get("tag") or "").strip().lower()
        tconst = id_map.get(mid or "")
        if not tconst or not tag:
            continue
        tag_counts.setdefault(tconst, {})
        tag_counts[tconst][tag] = tag_counts[tconst].get(tag, 0) + 1

    rows = []
    for tconst, tags_d in tag_counts.items():
        top = sorted(tags_d.items(), key=lambda x: -x[1])[:12]
        rows.append((tconst, ",".join(t for t, _ in top), json.dumps(dict(top))))

    CACHE.mkdir(parents=True, exist_ok=True)
    con = connect()
    con.execute("CREATE TEMP TABLE ml (tconst VARCHAR, tags VARCHAR, tag_json VARCHAR)")
    if rows:
        con.executemany("INSERT INTO ml VALUES (?,?,?)", rows)
    con.execute(f"COPY ml TO '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    console.print(f"  cached {len(rows):,} MovieLens-tagged titles → {path.name}")


def enrich_pageviews_stub(names: list[str], *, limit: int = 50) -> None:
    path = parquet_path("pageviews")
    rows = []
    console.print(f"  Wikipedia pageviews sample (up to {limit})…")
    try:
        with httpx.Client(timeout=30.0, headers=UA, follow_redirects=True) as client:
            for name in names[:limit]:
                title = name.replace(" ", "_")
                url = (
                    "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
                    f"en.wikipedia/all-access/user/{title}/monthly/20240101/20241231"
                )
                try:
                    r = client.get(url)
                    if r.status_code != 200:
                        continue
                    items = r.json().get("items") or []
                    total = sum(i.get("views", 0) for i in items)
                    rows.append((name, int(total)))
                except Exception:
                    continue
                time.sleep(0.05)
    except Exception as exc:  # noqa: BLE001
        console.print(f"[yellow]Pageviews failed:[/yellow] {exc}")
        return

    if not rows:
        console.print("  [dim]No pageviews rows[/dim]")
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    con = connect()
    con.execute("CREATE TEMP TABLE pv (primaryName VARCHAR, pageviews INTEGER)")
    con.executemany("INSERT INTO pv VALUES (?,?)", rows)
    con.execute(f"COPY pv TO '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    console.print(f"  cached {len(rows):,} pageview rows → {path.name}")
