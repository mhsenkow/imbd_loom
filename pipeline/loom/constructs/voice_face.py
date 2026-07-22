"""Construct: Voice ↔ Face — Animation voice plus on-camera movie careers."""

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
    anim = genre_contains_sql("t", "Animation")

    person_sql = f"""
        WITH tagged AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            COUNT(DISTINCT CASE WHEN {anim} THEN p.tconst END) AS animation_count,
            COUNT(DISTINCT CASE
              WHEN NOT {anim} AND t.titleType = 'movie' THEN p.tconst
            END) AS live_action_movie_count,
            COUNT(DISTINCT p.tconst) AS title_count,
            SUM(COALESCE(r.numVotes, 0)) AS prominence
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND {types} AND {adult} AND {votes}
          GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        )
        SELECT
          nconst, label, gender, title_count,
          animation_count, live_action_movie_count, prominence,
          animation_count * 1.0 / NULLIF(animation_count + live_action_movie_count, 0)
            AS voice_ratio
        FROM tagged
        WHERE animation_count >= 3 AND live_action_movie_count >= 3
        ORDER BY LEAST(animation_count, live_action_movie_count) DESC, prominence DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="voice_face", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'balance', gender,
          CASE
            WHEN voice_ratio >= 0.65 THEN 'voice-heavy'
            WHEN voice_ratio <= 0.35 THEN 'face-heavy'
            ELSE 'balanced'
          END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        UNION ALL
        SELECT 'balance', 'volume',
          CASE
            WHEN voice_ratio >= 0.65 THEN 'voice-heavy'
            WHEN voice_ratio <= 0.35 THEN 'face-heavy'
            ELSE 'balanced'
          END,
          CASE WHEN title_count >= 40 THEN '40+ titles'
               WHEN title_count >= 20 THEN '20–39'
               ELSE 'under 20' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: people with ≥3 Animation credits and ≥3 non-Animation movie "
        "credits (Adult excluded, numVotes ≥50). "
        "Node.voice_ratio colors voice vs face balance. Hero = co-appearance."
    )
    return finalize_payload(
        con,
        construct_id="voice_face",
        title="Voice ↔ Face",
        subtitle="animation voice + live-action movie careers",
        key_variable="voice_ratio",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_each": 3},
    )
