"""Paths and DuckDB connection helpers."""

from __future__ import annotations

from pathlib import Path

import duckdb

from loom import CACHE, OUT, PARQUET, RAW


def ensure_dirs() -> None:
    for p in (RAW, PARQUET, CACHE, OUT):
        p.mkdir(parents=True, exist_ok=True)


def connect(*, read_only: bool = False) -> duckdb.DuckDBPyConnection:
    """In-memory DuckDB with helpful settings for large joins."""
    con = duckdb.connect(database=":memory:", read_only=read_only)
    con.execute("SET threads TO 4")
    con.execute("SET memory_limit = '6GB'")
    return con


def parquet_path(name: str) -> Path:
    """Map logical table name → parquet file."""
    mapping = {
        "name_basics": PARQUET / "name_basics.parquet",
        "title_basics": PARQUET / "title_basics.parquet",
        "title_principals": PARQUET / "title_principals.parquet",
        "title_ratings": PARQUET / "title_ratings.parquet",
        "title_crew": PARQUET / "title_crew.parquet",
        "title_episode": PARQUET / "title_episode.parquet",
        "title_akas": PARQUET / "title_akas.parquet",
        "gender_cache": CACHE / "gender.parquet",
        "voice_cache": CACHE / "voice_actors.parquet",
        "bechdel": CACHE / "bechdel.parquet",
        "wikidata_people": CACHE / "wikidata_people.parquet",
        "movielens_tags": CACHE / "movielens_tags.parquet",
        "pageviews": CACHE / "pageviews.parquet",
    }
    return mapping[name]


def register_base_tables(con: duckdb.DuckDBPyConnection) -> None:
    """Register Parquet files as views if they exist."""
    for name in (
        "name_basics",
        "title_basics",
        "title_principals",
        "title_ratings",
        "title_crew",
        "title_episode",
        "title_akas",
    ):
        path = parquet_path(name)
        if path.exists():
            con.execute(
                f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_parquet('{path}')"
            )

    # Enriched views — empty stubs when missing so JOINs don't fail
    _register_or_empty(
        con,
        "gender_enrich",
        parquet_path("gender_cache"),
        """
        SELECT CAST(NULL AS VARCHAR) AS nconst,
               CAST(NULL AS INTEGER) AS tmdb_gender,
               CAST(NULL AS VARCHAR) AS place_of_birth,
               CAST(NULL AS VARCHAR) AS birth_country,
               CAST(NULL AS DOUBLE) AS popularity,
               CAST(NULL AS INTEGER) AS biography_len,
               CAST(NULL AS VARCHAR) AS also_known_as,
               CAST(NULL AS VARCHAR) AS source
        WHERE FALSE
        """,
    )
    _register_or_empty(
        con,
        "voice_enrich",
        parquet_path("voice_cache"),
        """
        SELECT CAST(NULL AS VARCHAR) AS nconst,
               CAST(NULL AS BOOLEAN) AS is_voice_actor,
               CAST(NULL AS VARCHAR) AS source
        WHERE FALSE
        """,
    )
    _register_or_empty(
        con,
        "wikidata_people",
        parquet_path("wikidata_people"),
        """
        SELECT CAST(NULL AS VARCHAR) AS nconst,
               CAST(NULL AS VARCHAR) AS nationality,
               CAST(NULL AS VARCHAR) AS occupations,
               CAST(NULL AS INTEGER) AS award_wins,
               CAST(NULL AS INTEGER) AS award_noms,
               CAST(NULL AS VARCHAR) AS educated_at,
               CAST(NULL AS DOUBLE) AS height_m,
               CAST(NULL AS INTEGER) AS birth_year_wd,
               CAST(NULL AS VARCHAR) AS family_json
        WHERE FALSE
        """,
    )


def _register_or_empty(con: duckdb.DuckDBPyConnection, view: str, path: Path, empty_sql: str) -> None:
    if path.exists():
        con.execute(
            f"CREATE OR REPLACE VIEW {view} AS SELECT * FROM read_parquet('{path}')"
        )
    else:
        con.execute(f"CREATE OR REPLACE VIEW {view} AS {empty_sql}")


def dataset_snapshot_meta() -> dict:
    """IMDb raw file mtimes for provenance."""
    from datetime import datetime, timezone

    files = {}
    if RAW.exists():
        for p in sorted(RAW.glob("*.tsv.gz")):
            files[p.name] = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).isoformat()
    return {"imdb_snapshot_files": files}
