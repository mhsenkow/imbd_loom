"""Construct: National cinema bridges — credits across ≥2 aka regions."""

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

    if not _has_table(con, "title_akas"):
        person_sql = f"""
            SELECT
              p.nconst,
              n.primaryName AS label,
              {ge} AS gender,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence,
              0 AS region_count
            FROM title_principals p
            JOIN title_basics t ON t.tconst = p.tconst
            JOIN name_basics n ON n.nconst = p.nconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
            WHERE p.category IN ('actor', 'actress')
              AND {types} AND {adult} AND {votes}
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
            HAVING COUNT(DISTINCT p.tconst) >= 15
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """
        nodes, edges, stats = coappearance_edges(
            con, person_sql, construct="national_bridges", top_n=top_n, min_shared=2
        )
        stats["fallback"] = "title_akas_missing"
        return finalize_payload(
            con,
            construct_id="national_bridges",
            title="National Cinema Bridges",
            subtitle="actors credited across ≥2 production regions",
            key_variable="region_count",
            method_note=(
                "Fallback (title_akas missing): prolific actors. "
                "Install title.akas.parquet for region bridging."
            ),
            nodes=nodes,
            edges=edges,
            stages=[],
            build_stats=stats,
            extra={"top_n": top_n, "fallback": True},
        )

    person_sql = f"""
        WITH regions AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            COUNT(DISTINCT p.tconst) AS title_count,
            COUNT(DISTINCT a.region) AS region_count,
            STRING_AGG(DISTINCT a.region, ',') AS regions,
            SUM(COALESCE(r.numVotes, 0)) AS prominence
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          JOIN title_akas a ON a.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND a.region IS NOT NULL AND a.region != ''
            AND a.region NOT IN ('XWW', 'XEU', 'SUHH', 'XYU')
            AND {types} AND {adult} AND {votes}
          GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
          HAVING COUNT(DISTINCT a.region) >= 2
             AND COUNT(DISTINCT p.tconst) >= 5
        )
        SELECT * FROM regions
        ORDER BY region_count DESC, prominence DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="national_bridges", top_n=top_n, min_shared=2
    )

    method = (
        "Population: actors with credits on titles appearing in ≥2 distinct "
        "title_akas regions (Adult excluded, numVotes ≥50). "
        "Hero = co-appearance among cross-regional careers."
    )
    return finalize_payload(
        con,
        construct_id="national_bridges",
        title="National Cinema Bridges",
        subtitle="actors credited across ≥2 production regions",
        key_variable="region_count",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=[],
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_regions": 2},
    )
