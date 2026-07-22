"""Construct: Comeback trail — long hiatus then return."""

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

    # Find longest gap between consecutive credit years; require ≥5 credits after gap
    person_sql = f"""
        WITH years AS (
          SELECT DISTINCT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            t.startYear AS yr,
            COALESCE(r.numVotes, 0) AS votes
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND t.startYear IS NOT NULL
            AND {types} AND {adult} AND {votes}
        ),
        ordered AS (
          SELECT
            nconst, label, gender, yr, votes,
            LAG(yr) OVER (PARTITION BY nconst ORDER BY yr) AS prev_yr
          FROM years
        ),
        gaps AS (
          SELECT
            nconst, label, gender,
            yr - prev_yr AS gap,
            prev_yr AS gap_start,
            yr AS gap_end
          FROM ordered
          WHERE prev_yr IS NOT NULL AND yr - prev_yr >= 8
        ),
        best_gap AS (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY nconst ORDER BY gap DESC) AS rk
          FROM gaps
        ),
        after_gap AS (
          SELECT
            g.nconst,
            COUNT(DISTINCT y.yr) AS credits_after
          FROM best_gap g
          JOIN years y ON y.nconst = g.nconst AND y.yr >= g.gap_end
          WHERE g.rk = 1
          GROUP BY 1
        )
        SELECT
          g.nconst,
          g.label,
          g.gender,
          g.gap AS max_gap,
          g.gap_start,
          g.gap_end,
          a.credits_after,
          COUNT(DISTINCT y.yr) AS year_count,
          SUM(y.votes) AS prominence
        FROM best_gap g
        JOIN after_gap a ON a.nconst = g.nconst
        JOIN years y ON y.nconst = g.nconst
        WHERE g.rk = 1 AND a.credits_after >= 5
        GROUP BY g.nconst, g.label, g.gender, g.gap, g.gap_start, g.gap_end, a.credits_after
        ORDER BY g.gap DESC, SUM(y.votes) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="comeback", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'gap_band', gender,
          CASE WHEN max_gap >= 20 THEN '20+ years'
               WHEN max_gap >= 12 THEN '12–19'
               ELSE '8–11' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        UNION ALL
        SELECT 'gap_band', 'return',
          CASE WHEN max_gap >= 20 THEN '20+ years'
               WHEN max_gap >= 12 THEN '12–19'
               ELSE '8–11' END,
          CASE WHEN credits_after >= 15 THEN 'strong return (15+)'
               WHEN credits_after >= 8 THEN 'solid return'
               ELSE 'modest return (5–7)' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: careers with a ≥8-year gap between consecutive credit years, "
        "then ≥5 distinct credit-years after the return "
        "(Adult excluded, numVotes ≥50). Hero = co-appearance among comeback peers."
    )
    return finalize_payload(
        con,
        construct_id="comeback",
        title="The Comeback Trail",
        subtitle="≥8-year hiatus then ≥5 credits after",
        key_variable="max_gap",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_gap": 8, "min_after": 5},
    )
