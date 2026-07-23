"""Construct: Silent → sound survivors — careers spanning 1927/1929."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    # Lower vote floor for silent era (many titles unrated / low votes)
    votes = vote_floor_sql("r", min_votes=20, allow_missing=True)

    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          COUNT(DISTINCT CASE WHEN t.startYear <= 1927 THEN p.tconst END) AS silent_count,
          COUNT(DISTINCT CASE WHEN t.startYear >= 1929 THEN p.tconst END) AS sound_count,
          MIN(t.startYear) AS year_min,
          MAX(t.startYear) AS year_max,
          SUM(COALESCE(r.numVotes, 0)) AS prominence
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND t.startYear IS NOT NULL
          AND {types} AND {adult} AND {votes}
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT CASE WHEN t.startYear <= 1927 THEN p.tconst END) >= 3
           AND COUNT(DISTINCT CASE WHEN t.startYear >= 1929 THEN p.tconst END) >= 3
           AND (
             AVG(p.ordering) <= 8
             OR SUM(COALESCE(r.numVotes, 0)) >= 5000
           )
        ORDER BY
          LEAST(
            COUNT(DISTINCT CASE WHEN t.startYear <= 1927 THEN p.tconst END),
            COUNT(DISTINCT CASE WHEN t.startYear >= 1929 THEN p.tconst END)
          ) DESC,
          SUM(COALESCE(r.numVotes, 0)) DESC
        LIMIT {int(top_n * 5)}
    """

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="silent_sound",
        top_n=top_n,
        min_shared=2,
        min_votes=20,
        cap_by="blend",
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'bridge', gender,
          CASE
            WHEN silent_count >= 10 AND sound_count >= 10 THEN 'deep both sides'
            WHEN sound_count >= silent_count * 2 THEN 'sound-dominant'
            WHEN silent_count >= sound_count * 2 THEN 'silent-dominant'
            ELSE 'balanced transition'
          END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        UNION ALL
        SELECT 'bridge', 'span',
          CASE
            WHEN silent_count >= 10 AND sound_count >= 10 THEN 'deep both sides'
            WHEN sound_count >= silent_count * 2 THEN 'sound-dominant'
            WHEN silent_count >= sound_count * 2 THEN 'silent-dominant'
            ELSE 'balanced transition'
          END,
          CASE WHEN year_max - year_min >= 30 THEN '30+ year span'
               WHEN year_max - year_min >= 15 THEN '15–29'
               ELSE 'under 15' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: actors with ≥1 credit in ≤1927 and ≥1 credit in ≥1929 "
        "(Adult excluded; vote floor relaxed to ≥20 or missing for silent-era coverage). "
        "Hero = co-appearance among transition survivors."
    )
    return finalize_payload(
        con,
        construct_id="silent_sound",
        title="Silent → Sound Survivors",
        subtitle="careers spanning the 1927–1929 transition",
        key_variable="sound_count",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "silent_cutoff": 1927, "sound_start": 1929},
    )
