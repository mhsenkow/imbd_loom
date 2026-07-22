"""TMDB gender + Wikidata voice-actor enrichment with local Parquet cache."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn

from loom import CACHE, ROOT
from loom.db import connect, ensure_dirs, parquet_path, register_base_tables

console = Console()

GENDER_MAP = {0: "unknown", 1: "female", 2: "male", 3: "nonbinary"}


def enrich_all(
    *,
    skip_tmdb: bool = False,
    skip_wikidata: bool = False,
    skip_bechdel: bool = False,
    skip_extra: bool = False,
    limit: int | None = None,
) -> None:
    ensure_dirs()
    load_dotenv(ROOT / "pipeline" / ".env")

    con = connect()
    register_base_tables(con)

    # Candidates = people who appear in Animation or Horror with actor/actress roles
    # (the constructs we care about). Keeps enrichment to thousands, not 14M.
    candidates = con.execute(
        """
        SELECT DISTINCT p.nconst, n.primaryName
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND (
            list_contains(string_split(COALESCE(t.genres, ''), ','), 'Animation')
            OR list_contains(string_split(COALESCE(t.genres, ''), ','), 'Horror')
          )
          AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries', 'short')
        ORDER BY p.nconst
        """
    ).fetchall()

    if limit:
        candidates = candidates[:limit]

    console.print(f"[bold]Enrichment candidates:[/bold] {len(candidates):,}")

    if not skip_tmdb:
        _enrich_tmdb(con, candidates)
    else:
        console.print("[dim]Skipping TMDB[/dim]")

    if not skip_wikidata:
        _enrich_wikidata(con, candidates)
    else:
        console.print("[dim]Skipping Wikidata[/dim]")

    if not skip_bechdel:
        _enrich_bechdel()
    else:
        console.print("[dim]Skipping Bechdel[/dim]")

    if not skip_extra:
        try:
            from loom.commands.enrich_extra import (
                enrich_movielens_tags,
                enrich_pageviews_stub,
                enrich_wikidata_people,
            )

            enrich_wikidata_people(limit=5000)
            enrich_movielens_tags()
            top_names = [name for _, name in candidates[:80] if name]
            enrich_pageviews_stub(top_names, limit=40)
        except Exception as exc:  # noqa: BLE001
            console.print(f"[yellow]Extra enrichment skipped:[/yellow] {exc}")

    console.print("[green]✓[/green] Enrichment complete")


def _load_existing_gender() -> dict[str, dict[str, Any]]:
    path = parquet_path("gender_cache")
    if not path.exists():
        return {}
    con = connect()
    rows = con.execute(f"SELECT * FROM read_parquet('{path}')").fetchall()
    cols = [d[0] for d in con.description]
    return {r[0]: dict(zip(cols, r)) for r in rows}


def _enrich_tmdb(con, candidates: list[tuple]) -> None:
    api_key = os.getenv("TMDB_API_KEY", "").strip()
    existing = _load_existing_gender()
    todo = [(n, name) for n, name in candidates if n not in existing]

    if not api_key:
        console.print(
            "[yellow]No TMDB_API_KEY in pipeline/.env[/yellow] — "
            "writing empty gender cache; build will fall back to actor/actress proxy."
        )
        # Keep any existing cache; if none, write empty marker
        if not parquet_path("gender_cache").exists():
            _save_gender([])
        return

    if not todo:
        console.print(f"  [dim]TMDB cache warm ({len(existing):,} people)[/dim]")
        return

    console.print(f"  TMDB lookup for {len(todo):,} people (rate-limited)…")
    results = list(existing.values())

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
                    results.append(row)
                except Exception as exc:  # noqa: BLE001
                    results.append(
                        {
                            "nconst": nconst,
                            "tmdb_gender": None,
                            "tmdb_id": None,
                            "source": f"error:{type(exc).__name__}",
                            "primaryName": name,
                        }
                    )
                # ~40 req/s soft limit; be polite
                if i % 10 == 9:
                    time.sleep(0.25)
                # Periodic checkpoint
                if i > 0 and i % 200 == 0:
                    _save_gender(results)

    _save_gender(results)


def _tmdb_find_person(client: httpx.Client, nconst: str, name: str) -> dict[str, Any]:
    # Prefer find-by-external-id (IMDb nconst)
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
    # Detail fetch for birthplace / aka / bio
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


def _save_gender(rows: list[dict[str, Any]]) -> None:
    path = parquet_path("gender_cache")
    CACHE.mkdir(parents=True, exist_ok=True)
    con = connect()
    con.execute(
        """
        CREATE TEMP TABLE g (
          nconst VARCHAR,
          tmdb_gender INTEGER,
          tmdb_id INTEGER,
          source VARCHAR,
          primaryName VARCHAR,
          place_of_birth VARCHAR,
          birth_country VARCHAR,
          popularity DOUBLE,
          biography_len INTEGER,
          also_known_as VARCHAR
        )
        """
    )
    if rows:
        con.executemany(
            "INSERT INTO g VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    r["nconst"],
                    r.get("tmdb_gender"),
                    r.get("tmdb_id"),
                    r.get("source", "tmdb"),
                    r.get("primaryName"),
                    r.get("place_of_birth"),
                    r.get("birth_country"),
                    r.get("popularity"),
                    r.get("biography_len"),
                    r.get("also_known_as"),
                )
                for r in rows
            ],
        )
    con.execute(f"COPY g TO '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    console.print(f"  cached {len(rows):,} gender rows → {path.name}")


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


def _enrich_wikidata(con, candidates: list[tuple]) -> None:
    """Bulk SPARQL: people with occupation voice actor (Q2405480) who have IMDb ID."""
    existing = _load_existing_voice()
    # Also seed from IMDb profession heuristic so we always have something
    console.print("  Wikidata SPARQL for voice actors + IMDb profession heuristic…")

    # Profession heuristic from name.basics (fast, always available)
    prof_rows = con.execute(
        """
        SELECT nconst, primaryName,
               (primaryProfession ILIKE '%actor%' AND (
                  primaryProfession ILIKE '%soundtrack%'
                  OR list_contains(string_split(COALESCE(primaryProfession,''), ','), 'actor')
               )) AS maybe
        FROM name_basics
        WHERE primaryProfession ILIKE '%soundtrack%'
           OR primaryProfession ILIKE '%music_department%'
        """
    ).fetchall()
    # Better heuristic: characters containing "(voice)" in principals among candidates
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

    # Wikidata bulk query — get IMDb IDs of voice actors
    wd_ids = _wikidata_voice_imdb_ids()
    voice_set |= wd_ids

    results: list[dict[str, Any]] = []
    seen = set()
    for nconst, name in candidates:
        if nconst in seen:
            continue
        seen.add(nconst)
        is_va = nconst in voice_set
        source = "wikidata" if nconst in wd_ids else ("imdb_chars" if is_va else "none")
        if nconst in existing and existing[nconst].get("is_voice_actor"):
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

    # Also keep known voice actors outside candidate set from WD
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


def _wikidata_voice_imdb_ids() -> set[str]:
    """Query Wikidata for people with occupation voice actor who have an IMDb ID."""
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
        "User-Agent": "IMDbLoom/0.1 (personal research poster; contact: local)",
        "Accept": "application/sparql-results+json",
    }
    try:
        with httpx.Client(timeout=120.0, headers=headers) as client:
            # POST is less likely to be blocked than long GET URLs
            r = client.post(url, data={"query": query, "format": "json"})
            r.raise_for_status()
            bindings = r.json()["results"]["bindings"]
            ids = {b["imdb"]["value"] for b in bindings}
            console.print(f"  Wikidata returned {len(ids):,} voice-actor IMDb ids")
            return ids
    except Exception as exc:  # noqa: BLE001
        console.print(f"[yellow]Wikidata query failed:[/yellow] {exc}")
        console.print("  Falling back to IMDb character '(voice)' heuristic only.")
        return set()

def _enrich_bechdel() -> None:
    """Cache Bechdel ratings: try live API, fall back to TidyTuesday CSV mirror."""
    path = parquet_path("bechdel")
    if path.exists() and path.stat().st_size > 0:
        age_days = (time.time() - path.stat().st_mtime) / 86400
        if age_days < 30:
            con = connect()
            n = con.execute(f"SELECT COUNT(*) FROM read_parquet('{path}')").fetchone()[0]
            console.print(f"  [dim]Bechdel cache warm ({n:,} titles, {age_days:.0f}d old)[/dim]")
            return

    movies: list[dict[str, Any]] = []
    source = ""

    console.print("  Downloading Bechdel Test movie list…")
    try:
        with httpx.Client(
            timeout=120.0,
            headers={"User-Agent": "IMDbLoom/0.1 (personal research poster)"},
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
            csv_url = (
                "https://raw.githubusercontent.com/rfordatascience/tidytuesday/"
                "main/data/2021/2021-03-09/raw_bechdel.csv"
            )
            with httpx.Client(timeout=120.0, follow_redirects=True) as client:
                r = client.get(csv_url)
                r.raise_for_status()
                text = r.text
            # parse CSV without pandas
            import csv
            from io import StringIO

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
                return
            console.print("  Bechdel construct will be unavailable until this succeeds.")
            return

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
