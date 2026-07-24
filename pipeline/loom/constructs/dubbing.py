"""Construct: The dubbing multiverse — voice actors → many characters."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql
from loom.membership import rank_prominence_sql, voice_boost_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql(
        "t", types=("movie", "tvSeries", "tvMovie", "tvMiniSeries", "short", "video")
    )
    votes = vote_floor_sql("r", min_votes=50)
    prom = rank_prominence_sql("r")
    boost = voice_boost_sql()

    # Soft voice gate: prefer signal but allow Animation-heavy multi-character careers.
    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          COUNT(DISTINCT p.characters) AS character_count,
          {prom} AS prominence,
          {boost} AS voice_boost
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
            OR list_contains(string_split(COALESCE(t.genres, ''), ','), 'Animation')
          )
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.characters) >= 5
        ORDER BY voice_boost DESC, character_count * prominence DESC
        LIMIT {int(top_n * 5)}
    """

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="dubbing",
        top_n=top_n,
        min_shared=2,
        cap_by="prominence",
        enrichment_mode="voice_or_animation",
        force_ids=[
            "nm0000305",  # Mel Blanc
            "nm0919798",  # Frank Welker
            "nm0152839",  # Tara Strong
            "nm0004813",  # Nancy Cartwright
        ],
    )

    stage_rows = con.execute(
        f"""
        WITH base AS (
          SELECT
            {ge} AS gender,
            CASE
              WHEN t.startYear < 1980 THEN 'pre-1980'
              WHEN t.startYear < 2000 THEN '1980–1999'
              WHEN t.startYear < 2015 THEN '2000–2014'
              ELSE '2015+'
            END AS era,
            CASE
              WHEN COUNT(DISTINCT p.characters) OVER (PARTITION BY p.nconst) >= 40 THEN '40+ chars'
              WHEN COUNT(DISTINCT p.characters) OVER (PARTITION BY p.nconst) >= 15 THEN '15–39'
              ELSE '5–14'
            END AS band
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          LEFT JOIN voice_enrich ve ON ve.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND p.characters IS NOT NULL
            AND {types} AND {adult} AND {votes}
            AND (
              COALESCE(ve.is_voice_actor, FALSE) = TRUE
              OR p.characters ILIKE '%(voice)%'
              OR p.job ILIKE '%voice%'
              OR list_contains(string_split(COALESCE(t.genres, ''), ','), 'Animation')
            )
            AND t.startYear IS NOT NULL
        )
        SELECT 'gender', 'era', gender, era, COUNT(*) FROM base GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: people with ≥5 distinct character credits on titles that are "
        "Animation and/or carry a voice signal (Wikidata / '(voice)' / job). "
        "Adult excluded, numVotes ≥50. Ranked by character fan-out × prominence."
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
