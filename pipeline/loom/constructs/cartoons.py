"""Construct: Voice actors in cartoons."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, genre_contains_sql, title_type_sql, vote_floor_sql
from loom.membership import rank_prominence_sql, voice_boost_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql(
        "t", types=("movie", "tvSeries", "tvMovie", "tvMiniSeries", "short", "video")
    )
    votes = vote_floor_sql("r", min_votes=50)
    anim = genre_contains_sql("t", "Animation")
    prom = rank_prominence_sql("r")
    boost = voice_boost_sql()

    # Soft membership + force-seed high-vote Animation celebrities so Genie-class
    # careers survive the densest VO co-appearance clique.
    person_sql = f"""
        WITH base AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            COUNT(DISTINCT p.tconst) AS title_count,
            COUNT(DISTINCT p.characters) AS character_count,
            {prom} AS prominence,
            {boost} AS voice_boost,
            MAX(CASE WHEN COALESCE(r.numVotes, 0) >= 50000 THEN 1 ELSE 0 END) AS celebrity_anim,
            MAX(COALESCE(r.numVotes, 0)) AS peak_votes
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          LEFT JOIN voice_enrich ve ON ve.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {anim}
            AND {types}
            AND {adult}
            AND {votes}
          GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
          HAVING COUNT(DISTINCT p.tconst) >= 3
        ),
        celebs AS (
          SELECT * FROM base WHERE celebrity_anim = 1
          ORDER BY peak_votes DESC, prominence DESC
          LIMIT {int(max(60, top_n // 3))}
        ),
        volume AS (
          SELECT * FROM base
          ORDER BY voice_boost DESC, prominence DESC
          LIMIT {int(top_n * 5)}
        ),
        seeds AS (
          SELECT * FROM base
          WHERE nconst IN (
            'nm0000245','nm0000158','nm0000305','nm0919798',
            'nm0152839','nm0000434','nm0000552'
          )
        )
        SELECT * FROM celebs
        UNION
        SELECT * FROM volume
        UNION
        SELECT * FROM seeds
    """

    # Story canaries — must survive densest VO clique when in the Animation pool
    force_ids = [
        "nm0000245",  # Robin Williams
        "nm0000158",  # Tom Hanks
        "nm0000305",  # Mel Blanc
        "nm0919798",  # Frank Welker
        "nm0152839",  # Tara Strong
        "nm0000434",  # Mark Hamill
        "nm0000552",  # Eddie Murphy
    ]

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="voice_cartoons",
        top_n=top_n,
        min_shared=2,
        cap_by="prominence",
        enrichment_mode="animation_cast",
        force_ids=force_ids,
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
              WHEN p.ordering <= 3 THEN 'lead'
              WHEN p.ordering <= 8 THEN 'supporting'
              ELSE 'ensemble'
            END AS prominence
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {anim}
            AND {types}
            AND {adult}
            AND {votes}
            AND t.startYear IS NOT NULL
        )
        SELECT 'gender' AS stageFrom, 'era' AS stageTo, gender AS categoryFrom, era AS categoryTo, COUNT(*) AS value
        FROM base GROUP BY gender, era
        UNION ALL
        SELECT 'era', 'prominence', era, prominence, COUNT(*)
        FROM base GROUP BY era, prominence
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: cast credited on Animation titles (Adult excluded, numVotes ≥50, "
        "≥3 distinct titles). Voice signals (Wikidata / '(voice)' / job) boost ranking "
        "but are not required — celebrity Animation roles (e.g. Genie) qualify. "
        "Edges = shared Animation titles (≥2). Cap by blend of graph strength + prominence."
    )
    return finalize_payload(
        con,
        construct_id="voice_cartoons",
        title="Voice Actors in Cartoons",
        subtitle="actor → show → character reuse",
        key_variable="degree",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"min_shared_titles": 2, "top_n": top_n},
    )
