"""Construct: Reunion map — pairs who reunited after ≥20 years apart."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, recompute_degree_strength
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)

    # Broad pool of long-span collaborators; filter to reunion edges after
    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          MIN(t.startYear) AS year_min,
          MAX(t.startYear) AS year_max,
          SUM(COALESCE(r.numVotes, 0)) AS prominence
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND {types} AND {adult} AND {votes}
          AND t.startYear IS NOT NULL
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.tconst) >= 8
           AND MAX(t.startYear) - MIN(t.startYear) >= 20
        ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
        LIMIT {int(top_n * 5)}
    """

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="reunions",
        top_n=min(top_n * 3, 600),
        min_shared=2,
    )

    reunion_edges = [e for e in edges if e.get("reunion")]

    # Prefer highest reunion_gap, then weight
    reunion_edges.sort(
        key=lambda e: (-(e.get("reunion_gap") or 0), -(e.get("weight") or 0))
    )
    # Cap people via edges involving top-gap pairs
    selected: set[str] = set()
    final_edges = []
    for e in reunion_edges:
        if len(selected) >= top_n and (
            e["source"] not in selected or e["target"] not in selected
        ):
            if e["source"] not in selected and e["target"] not in selected:
                continue
        selected.add(e["source"])
        selected.add(e["target"])
        final_edges.append(e)
        if len(selected) >= top_n and len(final_edges) >= top_n:
            break

    if len(selected) > top_n:
        # Trim to top_n by strength on reunion edges
        strength: dict[str, int] = {n: 0 for n in selected}
        for e in final_edges:
            if e["source"] in strength:
                strength[e["source"]] += e["weight"]
            if e["target"] in strength:
                strength[e["target"]] += e["weight"]
        keep_ids = {
            n for n, _ in sorted(strength.items(), key=lambda x: -x[1])[:top_n]
        }
        final_edges = [
            e
            for e in final_edges
            if e["source"] in keep_ids and e["target"] in keep_ids
        ]
        selected = keep_ids

    nodes = [n for n in nodes if n["id"] in selected]
    recompute_degree_strength(nodes, final_edges)
    for n in nodes:
        gaps = [
            e.get("reunion_gap", 0)
            for e in final_edges
            if e["source"] == n["id"] or e["target"] == n["id"]
        ]
        if gaps:
            n["max_reunion_gap"] = max(gaps)

    # Stale analytics were computed on the pre-reunion graph — force recompute
    stats.pop("analytics", None)
    stats["reunion_edges"] = len(final_edges)
    stats["after_reunion_filter"] = len(nodes)

    method = (
        "Population: actors with ≥8 credits spanning ≥20 years "
        "(Adult excluded, numVotes ≥50). "
        "Edges kept only when first/last co-appearance gap ≥20 years (reunions)."
    )
    return finalize_payload(
        con,
        construct_id="reunions",
        title="The Reunion Map",
        subtitle="pairs who reunited after ≥20 years apart",
        key_variable="max_reunion_gap",
        method_note=method,
        nodes=nodes,
        edges=final_edges,
        stages=[],
        build_stats=stats,
        extra={"top_n": top_n, "min_reunion_gap": 20},
    )
