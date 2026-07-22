"""Construct: Women in horror — female-coded cast co-appearance."""

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
          SUM(COALESCE(r.numVotes, 0)) AS prominence
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
        HAVING COUNT(DISTINCT p.tconst) >= 3
           AND ({ge}) = 'female'
        ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="women_horror", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        f"""
        WITH base AS (
          SELECT
            {ge} AS gender,
            CASE
              WHEN p.ordering <= 2 THEN 'lead'
              WHEN p.ordering <= 6 THEN 'supporting'
              ELSE 'bit'
            END AS prominence,
            CASE
              WHEN COALESCE(r.numVotes, 0) >= 50000 THEN 'high-profile'
              WHEN COALESCE(r.numVotes, 0) >= 5000 THEN 'mid-profile'
              ELSE 'cult/low'
            END AS title_profile
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {horror}
            AND {types}
            AND {adult}
            AND {votes}
        )
        SELECT 'gender', 'prominence', gender, prominence, COUNT(*) FROM base GROUP BY 3, 4
        UNION ALL
        SELECT 'prominence', 'title_profile', prominence, title_profile, COUNT(*) FROM base GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: female-coded cast (TMDB gender=female, else IMDb category=actress) "
        "with ≥3 Horror credits (Adult excluded, numVotes ≥50). "
        "Hero = co-appearance on shared Horror titles (≥2). "
        "Alluvial includes all genders to show imbalance."
    )
    return finalize_payload(
        con,
        construct_id="women_horror",
        title="Women in Horror",
        subtitle="gender → role prominence → title profile",
        key_variable="gender",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2},
    )
