"""TMDB gender + Wikidata voice-actor enrichment with local Parquet cache."""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from loom import CACHE, OUT, ROOT
from loom.db import connect, ensure_dirs, parquet_path, register_base_tables

console = Console()

GENDER_MAP = {0: "unknown", 1: "female", 2: "male", 3: "nonbinary"}


class EnrichmentError(RuntimeError):
    """Raised when a required enrichment step fails loudly."""


def enrich_all(
    *,
    skip_tmdb: bool = False,
    skip_wikidata: bool = False,
    skip_bechdel: bool = False,
    skip_extra: bool = False,
    only_extra: bool = False,
    limit: int | None = None,
    require_wikidata_people: bool = False,
) -> dict[str, Any]:
    ensure_dirs()
    load_dotenv(ROOT / "pipeline" / ".env")

    con = connect()
    register_base_tables(con)
    report: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "skips": [],
        "rows": {},
        "errors": [],
    }

    candidates = _enrich_candidates(con, limit=limit)
    console.print(f"[bold]Enrichment candidates:[/bold] {len(candidates):,}")
    report["candidate_count"] = len(candidates)

    if only_extra:
        skip_tmdb = skip_wikidata = skip_bechdel = True

    if not skip_tmdb:
        report["rows"]["gender"] = _enrich_tmdb(con, candidates)
    else:
        console.print("[dim]Skipping TMDB[/dim]")
        report["skips"].append("tmdb")

    if not skip_wikidata:
        report["rows"]["voice"] = _enrich_wikidata(con, candidates)
    else:
        console.print("[dim]Skipping Wikidata voice[/dim]")
        report["skips"].append("wikidata_voice")

    if not skip_bechdel:
        report["rows"]["bechdel"] = _enrich_bechdel()
    else:
        console.print("[dim]Skipping Bechdel[/dim]")
        report["skips"].append("bechdel")

    if not skip_extra:
        try:
            from loom.commands.enrich_extra import (
                enrich_movielens_tags,
                enrich_pageviews_stub,
                enrich_wikidata_people,
            )

            nconsts = [n for n, _ in candidates]
            wd_n = enrich_wikidata_people(nconsts=nconsts, limit=min(8000, max(500, len(nconsts))))
            report["rows"]["wikidata_people"] = wd_n
            if require_wikidata_people and wd_n <= 0:
                raise EnrichmentError("wikidata_people cache write failed or empty")
            enrich_movielens_tags()
            top_names = [name for _, name in candidates[:80] if name]
            enrich_pageviews_stub(top_names, limit=40)
        except EnrichmentError:
            raise
        except Exception as exc:  # noqa: BLE001
            msg = f"Extra enrichment failed: {exc}"
            console.print(f"[red]{msg}[/red]")
            report["errors"].append(msg)
            if require_wikidata_people:
                raise EnrichmentError(msg) from exc
    else:
        report["skips"].append("extra")

    # Voice true-flag summary
    voice_path = parquet_path("voice_cache")
    if voice_path.exists():
        true_n = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{voice_path}') WHERE is_voice_actor"
        ).fetchone()[0]
        report["rows"]["voice_true_flags"] = int(true_n)
        console.print(f"  voice true flags: {true_n:,}")

    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    _write_enrich_report(report)
    console.print("[green]✓[/green] Enrichment complete")
    return report


def _construct_nconsts() -> list[str]:
    """People already shipped in construct node JSON (the app-visible set)."""
    ids: set[str] = set()
    if not OUT.exists():
        return []
    for path in OUT.glob("*/nodes.json"):
        try:
            nodes = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not isinstance(nodes, list):
            continue
        for node in nodes:
            if not isinstance(node, dict):
                continue
            nid = node.get("id") or node.get("nconst")
            if isinstance(nid, str) and nid.startswith("nm"):
                ids.add(nid)
    return sorted(ids)


def _enrich_candidates(con, *, limit: int | None) -> list[tuple]:
    """Full cast pool for every construct (~500k+), not just shipped top_n nodes.

    Floor: ≥2 non-adult credits and ≥50 total votes — matches “could appear in a loom”
    without the 3M+ one-off extras. Ordered by prominence; construct nodes boosted first.
    Resumes via gender.parquet (cached nconsts skipped).
    """
    construct_ids = _construct_nconsts()
    if construct_ids:
        con.execute("CREATE OR REPLACE TEMP TABLE enrich_construct_ids (nconst VARCHAR)")
        con.executemany(
            "INSERT INTO enrich_construct_ids VALUES (?)",
            [(n,) for n in construct_ids],
        )
        console.print(
            f"  [dim]boosting {len(construct_ids):,} people already in construct nodes[/dim]"
        )
        boost_sql = "LEFT JOIN enrich_construct_ids ci ON ci.nconst = c.nconst"
        boost_order = "CASE WHEN ci.nconst IS NOT NULL THEN 0 ELSE 1 END ASC,"
    else:
        boost_sql = ""
        boost_order = ""

    rows = con.execute(
        f"""
        WITH credited AS (
          SELECT
            p.nconst,
            SUM(LN(COALESCE(r.numVotes, 0) + 1)) AS prom,
            COUNT(DISTINCT p.tconst) AS titles,
            SUM(COALESCE(r.numVotes, 0)) AS vote_sum
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          WHERE p.category IN ('actor', 'actress')
            AND t.titleType IN (
              'movie', 'tvSeries', 'tvMovie', 'tvMiniSeries',
              'short', 'video', 'tvSpecial'
            )
            AND COALESCE(t.isAdult, 0) = 0
          GROUP BY p.nconst
          HAVING COUNT(DISTINCT p.tconst) >= 2
             AND SUM(COALESCE(r.numVotes, 0)) >= 50
        )
        SELECT c.nconst, n.primaryName
        FROM credited c
        JOIN name_basics n ON n.nconst = c.nconst
        {boost_sql}
        ORDER BY {boost_order} c.prom DESC, c.titles DESC
        """
    ).fetchall()
    if limit:
        rows = rows[:limit]
    return rows


def _write_enrich_report(report: dict[str, Any]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "enrich_report.json"
    path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    # Merge into sources.json when present
    sources_path = OUT / "sources.json"
    try:
        sources = json.loads(sources_path.read_text(encoding="utf-8")) if sources_path.exists() else {}
    except Exception:
        sources = {}
    if not isinstance(sources, dict):
        sources = {"prior": sources}
    sources["enrich"] = report
    sources_path.write_text(json.dumps(sources, indent=2), encoding="utf-8")
    console.print(f"  enrich report → {path.name}")


def _load_existing_gender() -> dict[str, dict[str, Any]]:
    path = parquet_path("gender_cache")
    if not path.exists() or path.stat().st_size < 500:
        return {}
    con = connect()
    try:
        rows = con.execute(f"SELECT * FROM read_parquet('{path}')").fetchall()
    except Exception:
        return {}
    cols = [d[0] for d in con.description]
    return {r[0]: dict(zip(cols, r)) for r in rows}


def _enrich_tmdb(con, candidates: list[tuple]) -> int:
    api_key = os.getenv("TMDB_API_KEY", "").strip()
    existing = _load_existing_gender()
    todo = [(n, name) for n, name in candidates if n not in existing]

    if not api_key:
        console.print(
            "[yellow]No TMDB_API_KEY in pipeline/.env[/yellow] — "
            "leaving gender cache unchanged (no empty marker written)."
        )
        sidecar = CACHE / "gender.skipped.json"
        CACHE.mkdir(parents=True, exist_ok=True)
        sidecar.write_text(
            json.dumps(
                {
                    "status": "skipped",
                    "reason": "missing_TMDB_API_KEY",
                    "at": datetime.now(timezone.utc).isoformat(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return len(existing)

    if not todo:
        console.print(f"  [dim]TMDB cache warm ({len(existing):,} people)[/dim]")
        return len(existing)

    console.print(f"  TMDB lookup for {len(todo):,} people (rate-limited)…")
    # Keep a dict for O(1) upserts; rewrite Parquet from values() on flush.
    cache = dict(existing)
    flush_every = 500
    transient_errors = 0

    with httpx.Client(
        base_url="https://api.themoviedb.org/3",
        params={"api_key": api_key},
        timeout=30.0,
    ) as client:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            console=console,
        ) as progress:
            task = progress.add_task("tmdb", total=len(todo))
            for i, (nconst, name) in enumerate(todo):
                progress.update(task, description=f"TMDB {name[:40]}", advance=1)
                try:
                    row = _tmdb_find_person(client, nconst, name)
                    cache[nconst] = row
                except Exception as exc:  # noqa: BLE001
                    # Do not persist transient failures — resume will retry.
                    transient_errors += 1
                    if transient_errors <= 5 or transient_errors % 50 == 0:
                        console.print(
                            f"  [yellow]transient[/yellow] {type(exc).__name__} on {nconst} "
                            f"({transient_errors} so far)"
                        )
                if i % 10 == 9:
                    time.sleep(0.2)
                if i > 0 and i % flush_every == 0:
                    _save_gender(list(cache.values()))

    _save_gender(list(cache.values()))
    if transient_errors:
        console.print(
            f"  [yellow]{transient_errors} transient API errors not cached — will retry on next run[/yellow]"
        )
    return len(cache)


def _tmdb_find_person(client: httpx.Client, nconst: str, name: str) -> dict[str, Any]:
    r = client.get(f"/find/{nconst}", params={"external_source": "imdb_id"})
    r.raise_for_status()
    data = r.json()
    people = data.get("person_results") or []
    p = people[0] if people else None
    source = "tmdb_find"
    if not p:
        r = client.get("/search/person", params={"query": name})
        r.raise_for_status()
        results = r.json().get("results") or []
        p = results[0] if results else None
        source = "tmdb_search"
    if not p:
        return {
            "nconst": nconst,
            "tmdb_gender": None,
            "tmdb_id": None,
            "source": "tmdb_miss",
            "primaryName": name,
            "place_of_birth": None,
            "birth_country": None,
            "popularity": None,
            "biography_len": None,
            "also_known_as": None,
        }

    row: dict[str, Any] = {
        "nconst": nconst,
        "tmdb_gender": p.get("gender"),
        "tmdb_id": p.get("id"),
        "source": source,
        "primaryName": name,
        "place_of_birth": None,
        "birth_country": None,
        "popularity": p.get("popularity"),
        "biography_len": None,
        "also_known_as": None,
    }
    tid = p.get("id")
    if tid:
        try:
            d = client.get(f"/person/{tid}")
            d.raise_for_status()
            det = d.json()
            row["place_of_birth"] = det.get("place_of_birth")
            if det.get("place_of_birth") and "," in det["place_of_birth"]:
                row["birth_country"] = det["place_of_birth"].split(",")[-1].strip()
            bio = det.get("biography") or ""
            row["biography_len"] = len(bio)
            aka = det.get("also_known_as") or []
            row["also_known_as"] = "|".join(aka[:8]) if aka else None
            if det.get("popularity") is not None:
                row["popularity"] = det.get("popularity")
            if det.get("gender") is not None:
                row["tmdb_gender"] = det.get("gender")
            row["source"] = source + "+detail"
        except Exception:
            pass
    return row


_GENDER_COLUMNS = [
    "nconst",
    "tmdb_gender",
    "tmdb_id",
    "source",
    "primaryName",
    "place_of_birth",
    "birth_country",
    "popularity",
    "biography_len",
    "also_known_as",
]


def _save_gender(rows: list[dict[str, Any]]) -> None:
    """Fast Parquet rewrite via PyArrow (DuckDB executemany was OOM/killing long runs)."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    path = parquet_path("gender_cache")
    CACHE.mkdir(parents=True, exist_ok=True)
    # Drop transient API failures so the next resume retries them.
    persistable = [
        r
        for r in rows
        if not str(r.get("source") or "").startswith("error:")
    ]
    table = pa.table(
        {
            col: [r.get(col) if col != "source" else r.get(col, "tmdb") for r in persistable]
            for col in _GENDER_COLUMNS
        }
    )
    tmp = path.with_suffix(".parquet.tmp")
    pq.write_table(table, tmp, compression="zstd")
    tmp.replace(path)
    console.print(f"  cached {len(persistable):,} gender rows → {path.name}")


def _load_existing_voice() -> dict[str, dict[str, Any]]:
    path = parquet_path("voice_cache")
    if not path.exists():
        return {}
    con = connect()
    rows = con.execute(f"SELECT * FROM read_parquet('{path}')").fetchall()
    cols = ["nconst", "is_voice_actor", "source", "primaryName"]
    return {r[0]: dict(zip(cols, r)) for r in rows}


def _save_voice(rows: list[dict[str, Any]]) -> None:
    path = parquet_path("voice_cache")
    CACHE.mkdir(parents=True, exist_ok=True)
    con = connect()
    con.execute(
        "CREATE TEMP TABLE v (nconst VARCHAR, is_voice_actor BOOLEAN, source VARCHAR, primaryName VARCHAR)"
    )
    con.executemany(
        "INSERT INTO v VALUES (?, ?, ?, ?)",
        [
            (r["nconst"], r["is_voice_actor"], r.get("source", "wikidata"), r.get("primaryName"))
            for r in rows
        ],
    )
    con.execute(f"COPY v TO '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    console.print(f"  cached {len(rows):,} voice rows → {path.name}")


def _enrich_wikidata(con, candidates: list[tuple]) -> int:
    """Voice flags: Wikidata occupation + (voice) chars + Animation proxy for candidates."""
    existing = _load_existing_voice()
    console.print("  Wikidata SPARQL for voice actors + IMDb / Animation heuristics…")

    voice_char = con.execute(
        """
        SELECT DISTINCT p.nconst, n.primaryName
        FROM title_principals p
        JOIN name_basics n ON n.nconst = p.nconst
        WHERE p.characters ILIKE '%(voice)%'
           OR p.job ILIKE '%voice%'
        """
    ).fetchall()
    voice_set = {n for n, _ in voice_char}
    char_set = set(voice_set)

    # Animation-genre actor credits among candidates → soft voice_proxy
    anim_proxy = con.execute(
        """
        SELECT DISTINCT p.nconst
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        WHERE p.category IN ('actor', 'actress')
          AND list_contains(string_split(COALESCE(t.genres, ''), ','), 'Animation')
          AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries', 'short', 'video')
        """
    ).fetchall()
    anim_set = {r[0] for r in anim_proxy}

    wd_ids = _wikidata_voice_imdb_ids()
    voice_set |= wd_ids
    voice_set |= anim_set  # proxy: Animation cast counts as voice-capable

    results: list[dict[str, Any]] = []
    seen = set()
    for nconst, name in candidates:
        if nconst in seen:
            continue
        seen.add(nconst)
        is_va = nconst in voice_set
        if nconst in wd_ids:
            source = "wikidata"
        elif nconst in char_set:
            source = "imdb_chars"
        elif nconst in anim_set:
            source = "animation_proxy"
        else:
            source = "none"
        if nconst in existing and existing[nconst].get("is_voice_actor") and source == "none":
            results.append(existing[nconst])
        else:
            results.append(
                {
                    "nconst": nconst,
                    "is_voice_actor": is_va,
                    "source": source,
                    "primaryName": name,
                }
            )

    for nconst in wd_ids:
        if nconst not in seen:
            results.append(
                {
                    "nconst": nconst,
                    "is_voice_actor": True,
                    "source": "wikidata",
                    "primaryName": None,
                }
            )

    _save_voice(results)
    return len(results)


def _wikidata_voice_imdb_ids() -> set[str]:
    query = """
    SELECT ?imdb WHERE {
      ?person wdt:P106 wd:Q2405480 .
      ?person wdt:P345 ?imdb .
      FILTER(STRSTARTS(?imdb, "nm"))
    }
    LIMIT 50000
    """
    url = "https://query.wikidata.org/sparql"
    headers = {
        "User-Agent": "IMDbLoom/0.2 (personal research poster; contact: local)",
        "Accept": "application/sparql-results+json",
    }
    try:
        with httpx.Client(timeout=120.0, headers=headers) as client:
            r = client.post(url, data={"query": query, "format": "json"})
            r.raise_for_status()
            bindings = r.json()["results"]["bindings"]
            ids = {b["imdb"]["value"] for b in bindings}
            console.print(f"  Wikidata returned {len(ids):,} voice-actor IMDb ids")
            return ids
    except Exception as exc:  # noqa: BLE001
        console.print(f"[yellow]Wikidata voice query failed:[/yellow] {exc}")
        console.print("  Falling back to IMDb character '(voice)' + Animation proxy.")
        return set()


def _enrich_bechdel() -> int:
    path = parquet_path("bechdel")
    if path.exists() and path.stat().st_size > 0:
        age_days = (time.time() - path.stat().st_mtime) / 86400
        if age_days < 30:
            con = connect()
            n = con.execute(f"SELECT COUNT(*) FROM read_parquet('{path}')").fetchone()[0]
            console.print(f"  [dim]Bechdel cache warm ({n:,} titles, {age_days:.0f}d old)[/dim]")
            return int(n)

    movies: list[dict[str, Any]] = []
    source = ""

    console.print("  Downloading Bechdel Test movie list…")
    try:
        with httpx.Client(
            timeout=120.0,
            headers={"User-Agent": "IMDbLoom/0.2 (personal research poster)"},
            follow_redirects=True,
        ) as client:
            r = client.get("https://bechdeltest.com/api/v1/getAllMovies")
            r.raise_for_status()
            movies = r.json()
            source = "bechdeltest.com API"
    except Exception as exc:  # noqa: BLE001
        console.print(f"[yellow]Live Bechdel API unavailable:[/yellow] {exc}")
        console.print("  Falling back to TidyTuesday Bechdel CSV mirror…")
        try:
            import csv
            from io import StringIO

            csv_url = (
                "https://raw.githubusercontent.com/rfordatascience/tidytuesday/"
                "main/data/2021/2021-03-09/raw_bechdel.csv"
            )
            with httpx.Client(timeout=120.0, follow_redirects=True) as client:
                r = client.get(csv_url)
                r.raise_for_status()
                text = r.text
            reader = csv.DictReader(StringIO(text))
            for row in reader:
                movies.append(
                    {
                        "id": int(row["id"]) if row.get("id") else None,
                        "imdbid": row.get("imdb_id") or "",
                        "title": row.get("title"),
                        "year": int(row["year"]) if row.get("year") else None,
                        "rating": int(row["rating"]) if row.get("rating") not in (None, "") else None,
                    }
                )
            source = "TidyTuesday raw_bechdel.csv mirror"
        except Exception as exc2:  # noqa: BLE001
            console.print(f"[yellow]Bechdel mirror failed:[/yellow] {exc2}")
            if path.exists():
                console.print("  Keeping existing cache.")
                con = connect()
                return int(con.execute(f"SELECT COUNT(*) FROM read_parquet('{path}')").fetchone()[0])
            return 0

    CACHE.mkdir(parents=True, exist_ok=True)
    con = connect()
    con.execute(
        """
        CREATE TEMP TABLE bech (
          id INTEGER,
          imdbid VARCHAR,
          title VARCHAR,
          year INTEGER,
          rating INTEGER
        )
        """
    )
    rows = [
        (
            m.get("id"),
            str(m.get("imdbid") or m.get("imdbId") or ""),
            m.get("title"),
            m.get("year"),
            m.get("rating"),
        )
        for m in movies
    ]
    if rows:
        con.executemany("INSERT INTO bech VALUES (?, ?, ?, ?, ?)", rows)
    con.execute(f"COPY bech TO '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    console.print(f"  cached {len(rows):,} Bechdel titles from {source} → {path.name}")
    return len(rows)
