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
    con.execute("SET memory_limit = '4GB'")
    return con


def parquet_path(name: str) -> Path:
    """Map logical table name → parquet file."""
    mapping = {
        "name_basics": PARQUET / "name_basics.parquet",
        "title_basics": PARQUET / "title_basics.parquet",
        "title_principals": PARQUET / "title_principals.parquet",
        "title_ratings": PARQUET / "title_ratings.parquet",
        "gender_cache": CACHE / "gender.parquet",
        "voice_cache": CACHE / "voice_actors.parquet",
        "bechdel": CACHE / "bechdel.parquet",
    }
    return mapping[name]


def register_base_tables(con: duckdb.DuckDBPyConnection) -> None:
    """Register Parquet files as views if they exist."""
    for name in ("name_basics", "title_basics", "title_principals", "title_ratings"):
        path = parquet_path(name)
        if path.exists():
            con.execute(
                f"CREATE OR REPLACE VIEW {name} AS SELECT * FROM read_parquet('{path}')"
            )

    gender = parquet_path("gender_cache")
    if gender.exists():
        con.execute(
            f"CREATE OR REPLACE VIEW gender_enrich AS SELECT * FROM read_parquet('{gender}')"
        )
    else:
        con.execute(
            """
            CREATE OR REPLACE VIEW gender_enrich AS
            SELECT CAST(NULL AS VARCHAR) AS nconst,
                   CAST(NULL AS INTEGER) AS tmdb_gender,
                   CAST(NULL AS VARCHAR) AS source
            WHERE FALSE
            """
        )

    voice = parquet_path("voice_cache")
    if voice.exists():
        con.execute(
            f"CREATE OR REPLACE VIEW voice_enrich AS SELECT * FROM read_parquet('{voice}')"
        )
    else:
        con.execute(
            """
            CREATE OR REPLACE VIEW voice_enrich AS
            SELECT CAST(NULL AS VARCHAR) AS nconst,
                   CAST(NULL AS BOOLEAN) AS is_voice_actor,
                   CAST(NULL AS VARCHAR) AS source
            WHERE FALSE
            """
        )
