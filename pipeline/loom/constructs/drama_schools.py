"""Drama-school clusters from Wikidata educated_at (when cache present)."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql
from loom.membership import (
    drama_school_match_sql,
    empty_payload_stats,
    rank_prominence_sql,
    wikidata_warm,
)


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    school_match = drama_school_match_sql("w.educated_at")
    prom = rank_prominence_sql("r")

    if not wikidata_warm(con, column="educated_at"):
        return finalize_payload(
            con,
            construct_id="drama_schools",
            title="The Drama School Webs",
            subtitle="RADA, Juilliard, and stage-school clusters",
            key_variable="drama_school",
            method_note=(
                "EMPTY: Wikidata educated_at cache is cold — no drama-school population. "
                "Re-run loom enrich so educated_at is populated."
            ),
            nodes=[],
            edges=[],
            stages=[],
            build_stats=empty_payload_stats(
                reason="wikidata_educated_at_cold", enrichment_mode="empty"
            ),
            extra={"top_n": top_n},
        )

    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          w.educated_at AS drama_school,
          COUNT(DISTINCT p.tconst) AS title_count,
          {prom} AS prominence
        FROM title_principals p
        JOIN name_basics n ON n.nconst = p.nconst
        JOIN wikidata_people w ON w.nconst = p.nconst
        JOIN title_basics t ON t.tconst = p.tconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND w.educated_at IS NOT NULL
          AND {school_match}
          AND {types} AND {adult} AND {votes}
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category, w.educated_at
        HAVING COUNT(DISTINCT p.tconst) >= 3
        ORDER BY {prom} DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="drama_schools",
        top_n=top_n,
        min_shared=2,
        cap_by="blend",
        enrichment_mode="wikidata_educated_at",
    )
    stages = rows_to_stages([], ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"))
    return finalize_payload(
        con,
        construct_id="drama_schools",
        title="The Drama School Webs",
        subtitle="RADA, Juilliard, and stage-school clusters",
        key_variable="drama_school",
        method_note=(
            "Population: Wikidata educated-at matching known drama schools "
            "(no Drama-genre volume proxy). Edges = shared titles (≥2). Cap by blend."
        ),
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n},
    )
