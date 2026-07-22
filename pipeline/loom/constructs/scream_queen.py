"""Construct: The scream-queen web — actresses recurring across horror."""

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
          AND ({ge}) = 'female'
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.tconst) >= 3
        ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges = coappearance_edges(
        con, person_sql, construct="scream_queen", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        f"""
        WITH base AS (
          SELECT
            n.primaryName AS actress,
            CASE
              WHEN t.startYear < 1980 THEN 'classic'
              WHEN t.startYear < 2000 THEN 'slasher era'
              WHEN t.startYear < 2015 THEN 'remake era'
              ELSE 'elevated'
            END AS era,
            CASE
              WHEN p.ordering <= 2 THEN 'final girl / lead'
              WHEN p.ordering <= 5 THEN 'featured'
              ELSE 'ensemble'
            END AS role_band
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND list_contains(string_split(COALESCE(t.genres, ''), ','), 'Horror')
            AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries')
            AND ({ge}) = 'female'
            AND t.startYear IS NOT NULL
            AND p.nconst IN (SELECT nconst FROM _people)
        ),
        top_actresses AS (
          SELECT actress FROM base GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 40
        )
        SELECT 'actress', 'era', b.actress, b.era, COUNT(*)
        FROM base b JOIN top_actresses t ON t.actress = b.actress
        GROUP BY 3, 4
        UNION ALL
        SELECT 'era', 'role_band', era, role_band, COUNT(*)
        FROM base GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: female-coded cast with ≥3 Horror credits. "
        "Hero = co-appearance web (shared horror titles ≥2). "
        "Alluvial: top actresses → era → role band."
    )
    manifest = make_manifest(
        con,
        construct_id="scream_queen",
        title="The Scream-Queen Web",
        subtitle="actress ↔ actress co-appearance in horror",
        key_variable="coappearance",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        extra={"top_n": top_n, "min_shared": 2},
    )
    return {"nodes": nodes, "edges": edges, "stages": stages, "manifest": manifest}
