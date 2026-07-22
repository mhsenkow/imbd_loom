"""Construct: Horror bloodlines — men+women horror regulars (min 4 titles)."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, genre_contains_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    horror = genre_contains_sql("t", "Horror")

    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          AVG(p.ordering) AS avg_billing,
          SUM(COALESCE(r.numVotes, 0)) AS prominence,
          MIN(t.startYear) AS year_min,
          MAX(t.startYear) AS year_max
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND {horror}
          AND {types}
          AND {adult}
          AND {votes}
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.tconst) >= 4
        ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="horror_bloodlines", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        f"""
        WITH base AS (
          SELECT
            {ge} AS gender,
            CASE
              WHEN t.startYear < 1980 THEN 'classic'
              WHEN t.startYear < 2000 THEN 'slasher era'
              WHEN t.startYear < 2015 THEN 'remake era'
              ELSE 'elevated'
            END AS era,
            CASE
              WHEN p.ordering <= 2 THEN 'lead'
              WHEN p.ordering <= 5 THEN 'featured'
              ELSE 'ensemble'
            END AS role_band
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {horror}
            AND {types}
            AND {adult}
            AND {votes}
            AND t.startYear IS NOT NULL
            AND p.nconst IN (SELECT nconst FROM _people)
        )
        SELECT 'gender', 'era', gender, era, COUNT(*) FROM base GROUP BY 3, 4
        UNION ALL
        SELECT 'era', 'role_band', era, role_band, COUNT(*) FROM base GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: male- and female-coded cast with ≥4 Horror credits "
        "(Adult excluded, numVotes ≥50) — scream-queen web extended across genders. "
        "Family edges skipped (no Wikidata relations in this build). "
        "Hero = co-appearance on shared Horror titles (≥2)."
    )
    return finalize_payload(
        con,
        construct_id="horror_bloodlines",
        title="Horror Royalty Bloodlines",
        subtitle="horror regulars (men + women, ≥4 titles)",
        key_variable="gender",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_horror_titles": 4},
    )
