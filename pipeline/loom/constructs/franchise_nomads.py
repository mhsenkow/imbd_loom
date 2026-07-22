"""Construct: Franchise nomads — people spanning ≥3 parent series / name prefixes."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def _has_table(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    try:
        con.execute(f"SELECT 1 FROM {name} LIMIT 1")
        return True
    except Exception:
        return False


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)

    if _has_table(con, "title_episode"):
        person_sql = f"""
            WITH series_hits AS (
              SELECT
                p.nconst,
                COALESCE(ep.parentTconst, p.tconst) AS series_key,
                t.primaryTitle,
                COALESCE(r.numVotes, 0) AS votes
              FROM title_principals p
              JOIN title_basics t ON t.tconst = p.tconst
              LEFT JOIN title_episode ep ON ep.tconst = p.tconst
              LEFT JOIN title_ratings r ON r.tconst = COALESCE(ep.parentTconst, p.tconst)
              WHERE p.category IN ('actor', 'actress')
                AND {types} AND {adult}
                AND COALESCE(r.numVotes, 0) >= 50
            ),
            -- Also group movie franchises by leading title token (before ':')
            prefix_hits AS (
              SELECT
                p.nconst,
                CASE
                  WHEN POSITION(':' IN t.primaryTitle) > 0
                    THEN TRIM(SPLIT_PART(t.primaryTitle, ':', 1))
                  WHEN POSITION(' - ' IN t.primaryTitle) > 0
                    THEN TRIM(SPLIT_PART(t.primaryTitle, ' - ', 1))
                  ELSE NULL
                END AS franchise_key,
                COALESCE(r.numVotes, 0) AS votes
              FROM title_principals p
              JOIN title_basics t ON t.tconst = p.tconst
              LEFT JOIN title_ratings r ON r.tconst = p.tconst
              WHERE p.category IN ('actor', 'actress')
                AND t.titleType = 'movie'
                AND {adult} AND {votes}
            ),
            franchises AS (
              SELECT nconst, series_key AS franchise_id FROM series_hits
              WHERE series_key IS NOT NULL
              UNION
              SELECT nconst, franchise_key AS franchise_id FROM prefix_hits
              WHERE franchise_key IS NOT NULL AND LENGTH(franchise_key) >= 4
            ),
            counted AS (
              SELECT nconst, COUNT(DISTINCT franchise_id) AS franchise_count
              FROM franchises
              GROUP BY 1
              HAVING COUNT(DISTINCT franchise_id) >= 3
            )
            SELECT
              c.nconst,
              n.primaryName AS label,
              MAX({ge}) AS gender,
              c.franchise_count,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence
            FROM counted c
            JOIN title_principals p ON p.nconst = c.nconst
              AND p.category IN ('actor', 'actress')
            JOIN title_basics t ON t.tconst = p.tconst
            JOIN name_basics n ON n.nconst = c.nconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = c.nconst
            WHERE {types} AND {adult} AND {votes}
            GROUP BY c.nconst, n.primaryName, c.franchise_count
            ORDER BY c.franchise_count DESC, SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """
    else:
        # Prefix-only fallback
        person_sql = f"""
            WITH prefix_hits AS (
              SELECT
                p.nconst,
                CASE
                  WHEN POSITION(':' IN t.primaryTitle) > 0
                    THEN TRIM(SPLIT_PART(t.primaryTitle, ':', 1))
                  WHEN POSITION(' - ' IN t.primaryTitle) > 0
                    THEN TRIM(SPLIT_PART(t.primaryTitle, ' - ', 1))
                  ELSE NULL
                END AS franchise_key,
                COALESCE(r.numVotes, 0) AS votes
              FROM title_principals p
              JOIN title_basics t ON t.tconst = p.tconst
              LEFT JOIN title_ratings r ON r.tconst = p.tconst
              WHERE p.category IN ('actor', 'actress')
                AND {types} AND {adult} AND {votes}
            ),
            counted AS (
              SELECT nconst, COUNT(DISTINCT franchise_key) AS franchise_count
              FROM prefix_hits
              WHERE franchise_key IS NOT NULL AND LENGTH(franchise_key) >= 4
              GROUP BY 1
              HAVING COUNT(DISTINCT franchise_key) >= 3
            )
            SELECT
              c.nconst,
              n.primaryName AS label,
              MAX({ge}) AS gender,
              c.franchise_count,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence
            FROM counted c
            JOIN title_principals p ON p.nconst = c.nconst
              AND p.category IN ('actor', 'actress')
            JOIN title_basics t ON t.tconst = p.tconst
            JOIN name_basics n ON n.nconst = c.nconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = c.nconst
            WHERE {types} AND {adult} AND {votes}
            GROUP BY c.nconst, n.primaryName, c.franchise_count
            ORDER BY c.franchise_count DESC, SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="franchise_nomads", top_n=top_n, min_shared=2
    )
    if not _has_table(con, "title_episode"):
        stats["fallback"] = "title_episode_missing_prefix_only"

    method = (
        "Population: actors in ≥3 distinct franchises — parent series via "
        "title_episode and/or shared title-name prefixes (Adult excluded, "
        "numVotes ≥50). Hero = co-appearance among franchise hoppers."
    )
    return finalize_payload(
        con,
        construct_id="franchise_nomads",
        title="Franchise Nomads",
        subtitle="people in ≥3 distinct series / IP groups",
        key_variable="franchise_count",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=[],
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_franchises": 3},
    )
