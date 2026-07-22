"""Construct: Voice actors in cartoons."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, make_manifest, rows_to_stages


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")

    # Prefer voice_enrich flag; also accept characters containing (voice)
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
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        LEFT JOIN voice_enrich ve ON ve.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND list_contains(string_split(COALESCE(t.genres, ''), ','), 'Animation')
          AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries', 'short', 'video')
          AND (
            COALESCE(ve.is_voice_actor, FALSE) = TRUE
            OR p.characters ILIKE '%(voice)%'
            OR p.job ILIKE '%voice%'
            OR n.primaryProfession ILIKE '%soundtrack%'
          )
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.tconst) >= 3
        ORDER BY COUNT(DISTINCT p.tconst) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges = coappearance_edges(
        con, person_sql, construct="voice_cartoons", top_n=top_n, min_shared=2
    )

    # Alluvial stages: gender → era → prominence band
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
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          LEFT JOIN voice_enrich ve ON ve.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND list_contains(string_split(COALESCE(t.genres, ''), ','), 'Animation')
            AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries', 'short', 'video')
            AND t.startYear IS NOT NULL
            AND (
              COALESCE(ve.is_voice_actor, FALSE) = TRUE
              OR p.characters ILIKE '%(voice)%'
              OR p.job ILIKE '%voice%'
            )
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
        "Population: cast credited on Animation titles with a voice signal "
        "(Wikidata occupation 'voice actor', IMDb characters containing '(voice)', "
        "or voice job string). Edges = shared Animation titles (≥2). "
        "Gender via TMDB when enriched, else IMDb actor/actress category."
    )
    manifest = make_manifest(
        con,
        construct_id="voice_cartoons",
        title="Voice Actors in Cartoons",
        subtitle="actor → show → character reuse",
        key_variable="degree",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        extra={"min_shared_titles": 2, "top_n": top_n},
    )
    return {"nodes": nodes, "edges": edges, "stages": stages, "manifest": manifest}
