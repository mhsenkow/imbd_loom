"""Construct: Hyphenates — actor-directors / actor-writers."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import (
    coappearance_edges,
    finalize_payload,
    recompute_degree_strength,
)
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

    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          n.primaryProfession AS professions,
          COUNT(DISTINCT p.tconst) AS title_count,
          SUM(COALESCE(r.numVotes, 0)) AS prominence,
          CASE
            WHEN n.primaryProfession ILIKE '%director%'
             AND n.primaryProfession ILIKE '%writer%' THEN 'actor-director-writer'
            WHEN n.primaryProfession ILIKE '%director%' THEN 'actor-director'
            WHEN n.primaryProfession ILIKE '%writer%' THEN 'actor-writer'
            ELSE 'hyphenate'
          END AS hyphenate_kind
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND (
            n.primaryProfession ILIKE '%actor%'
            OR n.primaryProfession ILIKE '%actress%'
          )
          AND (
            n.primaryProfession ILIKE '%director%'
            OR n.primaryProfession ILIKE '%writer%'
          )
          AND {types} AND {adult} AND {votes}
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category,
                 n.primaryProfession
        HAVING COUNT(DISTINCT p.tconst) >= 5
        ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="hyphenates", top_n=top_n, min_shared=2
    )

    # Add directed-self edges when title_crew available
    if _has_table(con, "title_crew") and nodes:
        ids = [n["id"] for n in nodes]
        con.execute(
            "CREATE OR REPLACE TEMP TABLE _hyp AS SELECT * FROM UNNEST(?::VARCHAR[]) AS t(nconst)",
            [ids],
        )
        self_dir = con.execute(
            f"""
            SELECT DISTINCT
              p.nconst AS source,
              p.nconst AS target,
              COUNT(DISTINCT p.tconst) AS weight,
              CAST(ROUND(AVG(t.startYear)) AS INTEGER) AS year
            FROM title_principals p
            JOIN _hyp h ON h.nconst = p.nconst
            JOIN title_crew c ON c.tconst = p.tconst
            JOIN title_basics t ON t.tconst = p.tconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            WHERE p.category IN ('actor', 'actress')
              AND list_contains(string_split(COALESCE(c.directors, ''), ','), p.nconst)
              AND {types} AND {adult} AND {votes}
            GROUP BY p.nconst
            HAVING COUNT(DISTINCT p.tconst) >= 1
            """
        ).fetchall()
        # Self-loops are awkward for undirected graphs — instead link hyphenates
        # who directed titles that another hyphenate acted in under that director.
        dir_actor = con.execute(
            f"""
            SELECT
              LEAST(d.nconst, a.nconst) AS source,
              GREATEST(d.nconst, a.nconst) AS target,
              COUNT(DISTINCT a.tconst) AS weight,
              CAST(ROUND(AVG(t.startYear)) AS INTEGER) AS year
            FROM title_crew c
            JOIN title_principals a
              ON a.tconst = c.tconst AND a.category IN ('actor', 'actress')
            JOIN _hyp ah ON ah.nconst = a.nconst
            JOIN UNNEST(string_split(c.directors, ',')) AS d(nconst) ON TRUE
            JOIN _hyp dh ON dh.nconst = d.nconst
            JOIN title_basics t ON t.tconst = a.tconst
            LEFT JOIN title_ratings r ON r.tconst = a.tconst
            WHERE d.nconst != a.nconst
              AND {types} AND {adult} AND {votes}
            GROUP BY 1, 2
            HAVING COUNT(DISTINCT a.tconst) >= 1
            """
        ).fetchall()
        keep = {n["id"] for n in nodes}
        existing = {(e["source"], e["target"]) for e in edges}
        for s, t, w, yr in dir_actor:
            if s not in keep or t not in keep:
                continue
            key = (s, t)
            if key in existing:
                continue
            edge = {
                "source": s,
                "target": t,
                "weight": max(int(w or 1), 1),
                "construct": "hyphenates",
                "edge_kind": "director_actor",
            }
            if yr is not None:
                edge["year"] = int(yr)
            edges.append(edge)
            existing.add(key)
        stats["director_actor_edges"] = len(dir_actor)
        _ = self_dir  # reserved for future self-directed facet

        # Tag nodes with self-directed count
        self_map = {r[0]: int(r[2]) for r in self_dir}
        for n in nodes:
            if n["id"] in self_map:
                n["self_directed_titles"] = self_map[n["id"]]

        recompute_degree_strength(nodes, edges)
        stats.pop("analytics", None)

    method = (
        "Population: people whose primaryProfession includes actor/actress and "
        "director or writer (Adult excluded, numVotes ≥50, ≥5 acting credits). "
        "Edges = co-appearance plus director→actor links among hyphenates "
        "when title_crew is available."
    )
    return finalize_payload(
        con,
        construct_id="hyphenates",
        title="The Hyphenates",
        subtitle="actor-directors and actor-writers",
        key_variable="hyphenate_kind",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=[],
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2},
    )
