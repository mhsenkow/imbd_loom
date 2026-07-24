"""Construct: Director's muses — actors with ≥4 titles under the same director."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql
from loom.membership import empty_payload_stats


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

    if not _has_table(con, "title_crew"):
        return finalize_payload(
            con,
            construct_id="director_muses",
            title="Director's Muses",
            subtitle="actors with ≥4 titles under the same director",
            key_variable="top_director",
            method_note=(
                "EMPTY: title_crew missing — muse detection requires director credits. "
                "Install title.crew.parquet. No prolific-actor proxy."
            ),
            nodes=[],
            edges=[],
            stages=[],
            build_stats=empty_payload_stats(
                reason="title_crew_missing", enrichment_mode="empty"
            ),
            extra={"top_n": top_n, "min_shared": 2},
        )

    person_sql = f"""
        WITH exploded AS (
          SELECT
            p.nconst,
            UNNEST(string_split(c.directors, ',')) AS dconst,
            p.tconst,
            COALESCE(r.numVotes, 0) AS votes,
            LN(COALESCE(r.numVotes, 0) + 1) AS vote_w
          FROM title_principals p
          JOIN title_crew c ON c.tconst = p.tconst
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          WHERE p.category IN ('actor', 'actress')
            AND c.directors IS NOT NULL AND c.directors != ''
            AND {types} AND {adult} AND {votes}
        ),
        per_dir AS (
          SELECT
            nconst,
            dconst,
            COUNT(DISTINCT tconst) AS muse_titles,
            SUM(vote_w) AS prominence
          FROM exploded
          WHERE dconst IS NOT NULL AND dconst != ''
          GROUP BY 1, 2
          HAVING COUNT(DISTINCT tconst) >= 4
        ),
        best AS (
          SELECT *,
            muse_titles * prominence AS muse_score,
            ROW_NUMBER() OVER (
              PARTITION BY nconst
              ORDER BY muse_titles * prominence DESC, muse_titles DESC, prominence DESC
            ) AS rk
          FROM per_dir
        ),
        gender_pick AS (
          SELECT
            p.nconst,
            {ge} AS gender,
            ROW_NUMBER() OVER (
              PARTITION BY p.nconst
              ORDER BY CASE p.category WHEN 'actress' THEN 0 WHEN 'actor' THEN 1 ELSE 2 END
            ) AS rk
          FROM title_principals p
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND p.nconst IN (SELECT nconst FROM best WHERE rk = 1)
        )
        SELECT
          b.nconst,
          n.primaryName AS label,
          COALESCE(gp.gender, 'unknown') AS gender,
          b.muse_titles,
          b.prominence,
          b.muse_score,
          dn.primaryName AS top_director,
          b.dconst AS top_director_id
        FROM best b
        JOIN name_basics n ON n.nconst = b.nconst
        LEFT JOIN name_basics dn ON dn.nconst = b.dconst
        LEFT JOIN gender_pick gp ON gp.nconst = b.nconst AND gp.rk = 1
        WHERE b.rk = 1
        ORDER BY b.muse_score DESC, b.muse_titles DESC, b.prominence DESC
        LIMIT {int(top_n * 3)}
    """
    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="director_muses",
        top_n=top_n,
        min_shared=2,
        cap_by="blend",
        enrichment_mode="title_crew",
    )

    method = (
        "Population: actors with ≥4 titles under the same director "
        "(via title_crew; Adult excluded, numVotes ≥50 on muse titles). "
        "Ranked by muse_titles × prominence. No prolific fallback when crew missing. "
        "Hero = co-appearance among muse actors. Cap by blend."
    )
    return finalize_payload(
        con,
        construct_id="director_muses",
        title="Director's Muses",
        subtitle="actors with ≥4 titles under the same director",
        key_variable="top_director",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=[],
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_muse_titles": 4},
    )
