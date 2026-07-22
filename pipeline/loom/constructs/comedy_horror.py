"""Construct: Comedy × Horror crossover — people credited in both genres."""

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
    comedy = genre_contains_sql("t", "Comedy")

    person_sql = f"""
        WITH tagged AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            MAX(CASE WHEN {horror} THEN 1 ELSE 0 END) AS did_horror,
            MAX(CASE WHEN {comedy} THEN 1 ELSE 0 END) AS did_comedy,
            COUNT(DISTINCT CASE WHEN {horror} THEN p.tconst END) AS horror_count,
            COUNT(DISTINCT CASE WHEN {comedy} THEN p.tconst END) AS comedy_count,
            COUNT(DISTINCT p.tconst) AS title_count
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {types}
            AND {adult}
            AND {votes}
          GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        )
        SELECT nconst, label, gender, title_count, horror_count, comedy_count,
               horror_count + comedy_count AS crossover_weight
        FROM tagged
        WHERE did_horror = 1 AND did_comedy = 1
          AND horror_count >= 2 AND comedy_count >= 2
        ORDER BY crossover_weight DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="comedy_horror", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        f"""
        WITH base AS (
          SELECT
            {ge} AS gender,
            CASE
              WHEN {horror} AND {comedy} THEN 'horror-comedy'
              WHEN {horror} THEN 'horror'
              WHEN {comedy} THEN 'comedy'
              ELSE 'other'
            END AS lane,
            CASE
              WHEN p.ordering <= 2 THEN 'lead'
              WHEN p.ordering <= 6 THEN 'supporting'
              ELSE 'ensemble'
            END AS prominence
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {types}
            AND {adult}
            AND {votes}
            AND p.nconst IN (SELECT nconst FROM _people)
            AND ({horror} OR {comedy})
        )
        SELECT 'gender', 'lane', gender, lane, COUNT(*) FROM base GROUP BY 3, 4
        UNION ALL
        SELECT 'lane', 'prominence', lane, prominence, COUNT(*) FROM base GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: people with ≥2 Horror and ≥2 Comedy title credits "
        "(Adult excluded, numVotes ≥50). "
        "Hero = co-appearance among crossover performers. "
        "Alluvial: gender → horror/comedy/horror-comedy lane → billing band."
    )
    return finalize_payload(
        con,
        construct_id="comedy_horror",
        title="Comedy × Horror",
        subtitle="crossover careers between laughs and screams",
        key_variable="crossover_weight",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2},
    )
