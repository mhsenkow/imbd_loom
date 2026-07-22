"""Construct: Long careers — people whose credited span covers decades."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)

    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          MIN(t.startYear) AS year_min,
          MAX(t.startYear) AS year_max,
          MAX(t.startYear) - MIN(t.startYear) AS career_span
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND {types}
          AND {adult}
          AND {votes}
          AND t.startYear IS NOT NULL
          AND t.startYear BETWEEN 1920 AND 2030
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.tconst) >= 15
           AND MAX(t.startYear) - MIN(t.startYear) >= 35
        ORDER BY (MAX(t.startYear) - MIN(t.startYear)) DESC, COUNT(DISTINCT p.tconst) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="long_careers", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        f"""
        WITH base AS (
          SELECT
            {ge} AS gender,
            CASE
              WHEN MAX(t.startYear) - MIN(t.startYear) >= 50 THEN '50+ years'
              WHEN MAX(t.startYear) - MIN(t.startYear) >= 40 THEN '40–49'
              ELSE '35–39'
            END AS span_band,
            CASE
              WHEN MIN(t.startYear) < 1960 THEN 'started pre-1960'
              WHEN MIN(t.startYear) < 1980 THEN 'started 1960–79'
              WHEN MIN(t.startYear) < 2000 THEN 'started 1980–99'
              ELSE 'started 2000+'
            END AS cohort
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {types}
            AND {adult}
            AND {votes}
            AND t.startYear IS NOT NULL
            AND t.startYear BETWEEN 1920 AND 2030
            AND p.nconst IN (SELECT nconst FROM _people)
          GROUP BY p.nconst, ge.tmdb_gender, p.category
        )
        SELECT 'gender', 'span_band', gender, span_band, COUNT(*) FROM base GROUP BY 3, 4
        UNION ALL
        SELECT 'span_band', 'cohort', span_band, cohort, COUNT(*) FROM base GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: actors/actresses with ≥15 credits whose earliest and latest "
        "title years span ≥35 years (Adult excluded, numVotes ≥50). "
        "Hero = co-appearance among long-career peers."
    )
    return finalize_payload(
        con,
        construct_id="long_careers",
        title="Long Careers",
        subtitle="35+ year credited spans",
        key_variable="career_span",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"min_span_years": 35, "min_titles": 15, "top_n": top_n, "min_shared": 2},
    )
