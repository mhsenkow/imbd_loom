"""Construct: Repertory companies — tight multi-person troupes."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql
from loom.membership import rank_prominence_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    prom = rank_prominence_sql("r")

    # People with ≥3 partners who share ≥3 titles each
    person_sql = f"""
        WITH credits AS (
          SELECT DISTINCT p.nconst, p.tconst
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          WHERE p.category IN ('actor', 'actress')
            AND {types}
            AND {adult}
            AND {votes}
        ),
        pairs AS (
          SELECT
            LEAST(a.nconst, b.nconst) AS source,
            GREATEST(a.nconst, b.nconst) AS target,
            COUNT(DISTINCT a.tconst) AS shared
          FROM credits a
          JOIN credits b ON a.tconst = b.tconst AND a.nconst < b.nconst
          GROUP BY 1, 2
          HAVING COUNT(DISTINCT a.tconst) >= 3
        ),
        partners AS (
          SELECT nconst, COUNT(*) AS troupe_partners
          FROM (
            SELECT source AS nconst FROM pairs
            UNION ALL
            SELECT target AS nconst FROM pairs
          )
          GROUP BY 1
          HAVING COUNT(*) >= 3
        )
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          MAX(pr.troupe_partners) AS troupe_partners,
          {prom} AS prominence
        FROM title_principals p
        JOIN partners pr ON pr.nconst = p.nconst
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND {types}
          AND {adult}
          AND {votes}
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        ORDER BY {prom} DESC, MAX(pr.troupe_partners) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="repertory",
        top_n=top_n,
        min_shared=3,
        cap_by="blend",
        enrichment_mode="imdb",
    )

    method = (
        "Population: actors with ≥3 co-appearance partners who each share ≥3 titles "
        "(Adult excluded, numVotes ≥50) — repertory / troupe careers. "
        "Edges require ≥3 shared titles. Cap by blend."
    )
    return finalize_payload(
        con,
        construct_id="repertory",
        title="The Repertory Companies",
        subtitle="tight multi-person troupes (≥3 shared titles)",
        key_variable="troupe_partners",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=[],
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 3, "min_partners": 3},
    )
