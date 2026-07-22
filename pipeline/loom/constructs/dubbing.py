"""Construct: The dubbing multiverse — voice actors → many characters."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql(
        "t", types=("movie", "tvSeries", "tvMovie", "tvMiniSeries", "short", "video")
    )
    votes = vote_floor_sql("r", min_votes=50)

    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          COUNT(DISTINCT p.characters) AS character_count
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        LEFT JOIN voice_enrich ve ON ve.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND p.characters IS NOT NULL
          AND {types}
          AND {adult}
          AND {votes}
          AND (
            COALESCE(ve.is_voice_actor, FALSE) = TRUE
            OR p.characters ILIKE '%(voice)%'
            OR p.job ILIKE '%voice%'
          )
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.characters) >= 5
        ORDER BY COUNT(DISTINCT p.characters) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="dubbing", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        f"""
        WITH base AS (
          SELECT
            n.primaryName AS actor,
            CASE
              WHEN t.titleType IN ('tvSeries', 'tvMiniSeries', 'tvMovie') THEN 'television'
              WHEN t.titleType IN ('movie', 'video') THEN 'film'
              WHEN t.titleType = 'short' THEN 'short'
              ELSE 'other'
            END AS medium,
            p.nconst
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN voice_enrich ve ON ve.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND p.characters IS NOT NULL
            AND {types}
            AND {adult}
            AND {votes}
            AND (
              COALESCE(ve.is_voice_actor, FALSE) = TRUE
              OR p.characters ILIKE '%(voice)%'
              OR p.job ILIKE '%voice%'
            )
            AND p.nconst IN (SELECT nconst FROM _people)
        ),
        counts AS (
          SELECT nconst, COUNT(*) AS roles
          FROM base GROUP BY 1
        ),
        banded AS (
          SELECT b.actor, b.medium,
            CASE
              WHEN c.roles >= 40 THEN '40+ roles'
              WHEN c.roles >= 20 THEN '20–39'
              WHEN c.roles >= 10 THEN '10–19'
              ELSE '5–9'
            END AS role_band
          FROM base b
          JOIN counts c ON c.nconst = b.nconst
        ),
        top_actors AS (
          SELECT actor FROM banded GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 35
        )
        SELECT 'actor', 'medium', b.actor, b.medium, COUNT(*)
        FROM banded b JOIN top_actors t ON t.actor = b.actor
        GROUP BY 3, 4
        UNION ALL
        SELECT 'medium', 'role_band', medium, role_band, COUNT(*)
        FROM banded GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: people with a voice signal and ≥5 distinct character credits "
        "(Adult excluded, numVotes ≥50). "
        "Hero = co-appearance among prolific voice performers. "
        "Alluvial: top actors → medium → role-count band."
    )
    return finalize_payload(
        con,
        construct_id="dubbing",
        title="The Dubbing Multiverse",
        subtitle="voice actor → character fan-out",
        key_variable="character_count",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2},
    )
