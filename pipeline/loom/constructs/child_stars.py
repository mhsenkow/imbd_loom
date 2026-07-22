"""Construct: Child stars — debut before age 12."""

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
        WITH career AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            n.birthYear,
            MIN(t.startYear) AS year_min,
            MAX(t.startYear) AS year_max,
            COUNT(DISTINCT p.tconst) AS title_count,
            SUM(COALESCE(r.numVotes, 0)) AS prominence
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND n.birthYear IS NOT NULL
            AND t.startYear IS NOT NULL
            AND {types}
            AND {adult}
            AND {votes}
          GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category, n.birthYear
        )
        SELECT
          nconst,
          label,
          gender,
          birthYear AS birth_year,
          year_min,
          year_max,
          title_count,
          prominence,
          year_min - birthYear AS debut_age,
          CASE WHEN year_max - birthYear >= 25 THEN TRUE ELSE FALSE END AS worked_past_25
        FROM career
        WHERE year_min - birthYear < 12
          AND year_min - birthYear >= 0
          AND title_count >= 3
        ORDER BY prominence DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="child_stars", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'worked_past_25',
          gender,
          CASE WHEN worked_past_25 THEN 'worked past 25' ELSE 'stopped by 25' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        UNION ALL
        SELECT 'worked_past_25', 'debut_band',
          CASE WHEN worked_past_25 THEN 'worked past 25' ELSE 'stopped by 25' END,
          CASE
            WHEN debut_age < 6 THEN 'infant–5'
            WHEN debut_age < 9 THEN '6–8'
            ELSE '9–11'
          END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: actors with known birthYear whose first credited title year "
        "minus birthYear is <12 (Adult excluded, numVotes ≥50, ≥3 titles). "
        "Node color key: worked_past_25 (career continues to age ≥25)."
    )
    return finalize_payload(
        con,
        construct_id="child_stars",
        title="Child Stars",
        subtitle="debut before age 12 → what happened next",
        key_variable="worked_past_25",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "max_debut_age": 11},
    )
