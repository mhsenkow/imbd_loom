"""Construct: Men in horror."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, make_manifest, rows_to_stages


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")

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
          AND list_contains(string_split(COALESCE(t.genres, ''), ','), 'Horror')
          AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries')
          AND ({ge}) = 'male'
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.tconst) >= 3
        ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges = coappearance_edges(
        con, person_sql, construct="men_horror", top_n=top_n, min_shared=2
    )

    # Stages across all horror cast (not just men) so the alluvial shows gender flow
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
            AND list_contains(string_split(COALESCE(t.genres, ''), ','), 'Horror')
            AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries')
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
        "Population: male-coded cast (TMDB gender=male, else IMDb category=actor) "
        "credited on Horror movies/series with ≥3 horror titles. "
        "Alluvial includes all genders to reveal imbalance. "
        "Edges = shared Horror titles (≥2)."
    )
    manifest = make_manifest(
        con,
        construct_id="men_horror",
        title="Men in Horror",
        subtitle="gender → role prominence → title profile",
        key_variable="gender",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        extra={"top_n": top_n, "min_shared": 2},
    )
    return {"nodes": nodes, "edges": edges, "stages": stages, "manifest": manifest}
