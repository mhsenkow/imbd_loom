"""Construct: Director's muses — actors with ≥4 titles under the same director."""

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

    if not _has_table(con, "title_crew"):
        # Fallback: prolific actors (no director data)
        person_sql = f"""
            SELECT
              p.nconst,
              n.primaryName AS label,
              {ge} AS gender,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence,
              NULL AS top_director,
              NULL AS muse_titles
            FROM title_principals p
            JOIN title_basics t ON t.tconst = p.tconst
            JOIN name_basics n ON n.nconst = p.nconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
            WHERE p.category IN ('actor', 'actress')
              AND {types} AND {adult} AND {votes}
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
            HAVING COUNT(DISTINCT p.tconst) >= 20
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """
        nodes, edges, stats = coappearance_edges(
            con, person_sql, construct="director_muses", top_n=top_n, min_shared=2
        )
        stats["fallback"] = "title_crew_missing"
        method = (
            "Fallback (title_crew missing): prolific actors with ≥20 credits. "
            "Install title.crew.parquet for muse detection."
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
            extra={"top_n": top_n, "min_shared": 2, "fallback": True},
        )

    person_sql = f"""
        WITH exploded AS (
          SELECT
            p.nconst,
            UNNEST(string_split(c.directors, ',')) AS dconst,
            p.tconst,
            COALESCE(r.numVotes, 0) AS votes
          FROM title_principals p
          JOIN title_crew c ON c.tconst = p.tconst
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          WHERE p.category IN ('actor', 'actress')
            AND c.directors IS NOT NULL AND c.directors != ''
            AND {types} AND {adult} AND {votes}
        ),
        per_dir AS (
          SELECT nconst, dconst, COUNT(DISTINCT tconst) AS muse_titles,
                 SUM(votes) AS prominence
          FROM exploded
          WHERE dconst IS NOT NULL AND dconst != ''
          GROUP BY 1, 2
          HAVING COUNT(DISTINCT tconst) >= 4
        ),
        best AS (
          SELECT *,
            ROW_NUMBER() OVER (
              PARTITION BY nconst ORDER BY muse_titles DESC, prominence DESC
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
          dn.primaryName AS top_director,
          b.dconst AS top_director_id
        FROM best b
        JOIN name_basics n ON n.nconst = b.nconst
        LEFT JOIN name_basics dn ON dn.nconst = b.dconst
        LEFT JOIN gender_pick gp ON gp.nconst = b.nconst AND gp.rk = 1
        WHERE b.rk = 1
        ORDER BY b.muse_titles DESC, b.prominence DESC
        LIMIT {int(top_n * 3)}
    """
    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="director_muses", top_n=top_n, min_shared=2
    )

    method = (
        "Population: actors with ≥4 titles under the same director "
        "(via title_crew; Adult excluded, numVotes ≥50). "
        "Node.top_director is their most-repeated director. "
        "Hero = co-appearance among muse actors."
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
