"""Construct: Bechdel passers — cast web across films that fully pass the Bechdel test."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.db import parquet_path
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    bechdel_path = parquet_path("bechdel")
    if not bechdel_path.exists():
        raise SystemExit(
            "Bechdel cache missing — run `uv run loom enrich` (downloads bechdeltest.com)"
        )

    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _bechdel AS
        SELECT * FROM read_parquet('{bechdel_path}')
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _pass AS
        SELECT
          CASE
            WHEN imdbid LIKE 'tt%' THEN imdbid
            ELSE 'tt' || lpad(CAST(imdbid AS VARCHAR), 7, '0')
          END AS tconst,
          rating AS bechdel_rating,
          year AS bechdel_year
        FROM _bechdel
        WHERE rating = 3
          AND imdbid IS NOT NULL
          AND CAST(imdbid AS VARCHAR) != ''
        """
    )

    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t", types=("movie", "tvMovie"))
    votes = vote_floor_sql("r", min_votes=50)

    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          AVG(p.ordering) AS avg_billing
        FROM title_principals p
        JOIN _pass b ON b.tconst = p.tconst
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND {types}
          AND {adult}
          AND {votes}
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.tconst) >= 3
        ORDER BY COUNT(DISTINCT p.tconst) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="bechdel", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        f"""
        WITH scored AS (
          SELECT
            CASE
              WHEN b.rating = 3 THEN 'pass (3)'
              WHEN b.rating = 2 THEN 'talk about men (2)'
              WHEN b.rating = 1 THEN 'no talk (1)'
              ELSE 'fail (0)'
            END AS bechdel_band,
            {ge} AS gender,
            CASE
              WHEN t.startYear < 1980 THEN 'pre-1980'
              WHEN t.startYear < 2000 THEN '1980–1999'
              WHEN t.startYear < 2015 THEN '2000–2014'
              ELSE '2015+'
            END AS era
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN (
            SELECT
              CASE WHEN imdbid LIKE 'tt%' THEN imdbid
                   ELSE 'tt' || lpad(CAST(imdbid AS VARCHAR), 7, '0') END AS tconst,
              rating
            FROM _bechdel
            WHERE imdbid IS NOT NULL AND CAST(imdbid AS VARCHAR) != ''
          ) b ON b.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {types}
            AND {adult}
            AND {votes}
            AND t.startYear IS NOT NULL
        )
        SELECT 'gender', 'bechdel_band', gender, bechdel_band, COUNT(*) FROM scored GROUP BY 3, 4
        UNION ALL
        SELECT 'bechdel_band', 'era', bechdel_band, era, COUNT(*) FROM scored GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    n_pass = con.execute("SELECT COUNT(*) FROM _pass").fetchone()[0]
    method = (
        f"Population: cast credited on movies that fully pass the Bechdel test "
        f"(rating=3 on bechdeltest.com; {n_pass:,} titles in cache). "
        "Adult excluded, numVotes ≥50. "
        "Hero = co-appearance among people with ≥3 pass-film credits. "
        "Alluvial: gender → Bechdel band (0–3) → era across all rated titles."
    )
    return finalize_payload(
        con,
        construct_id="bechdel",
        title="The Bechdel Web",
        subtitle="cast across films that pass the Bechdel test",
        key_variable="gender",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "bechdel_pass_titles": int(n_pass)},
    )
