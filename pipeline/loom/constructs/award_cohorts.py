"""Award-season cohorts from Wikidata awards (when cache present)."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql
from loom.membership import empty_payload_stats, rank_prominence_sql, wikidata_warm


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=100)
    prom = rank_prominence_sql("r")

    # Prefer award_wins column warmth; fall back to any WD rows only if wins populated.
    if not wikidata_warm(con, column="award_wins"):
        return finalize_payload(
            con,
            construct_id="award_cohorts",
            title="Award Season Cohorts",
            subtitle="award-linked careers woven by shared titles",
            key_variable="awards_p166",
            method_note=(
                "EMPTY: Wikidata awards cache is cold — no award-cohort population. "
                "Prefer empty over a high-rating proxy that looks like Oscars. "
                "Re-run loom enrich so award_wins / award_noms are populated."
            ),
            nodes=[],
            edges=[],
            stages=[],
            build_stats=empty_payload_stats(
                reason="wikidata_awards_cold", enrichment_mode="empty"
            ),
            extra={"top_n": top_n},
        )

    person_sql = f"""
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          w.award_wins,
          w.award_noms,
          COUNT(DISTINCT p.tconst) AS title_count,
          {prom} AS prominence
        FROM title_principals p
        JOIN name_basics n ON n.nconst = p.nconst
        JOIN wikidata_people w ON w.nconst = p.nconst
        JOIN title_basics t ON t.tconst = p.tconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND COALESCE(w.award_wins, 0) + COALESCE(w.award_noms, 0) >= 1
          AND {types} AND {adult} AND {votes}
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category, w.award_wins, w.award_noms
        HAVING COUNT(DISTINCT p.tconst) >= 3
        ORDER BY COALESCE(w.award_wins, 0) DESC, {prom} DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="award_cohorts",
        top_n=top_n,
        min_shared=2,
        cap_by="blend",
        enrichment_mode="wikidata_awards",
    )
    stages = rows_to_stages([], ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"))
    return finalize_payload(
        con,
        construct_id="award_cohorts",
        title="Award Season Cohorts",
        subtitle="award-linked careers woven by shared titles",
        key_variable="awards_p166",
        method_note=(
            "Population: Wikidata P166 award recipients (award_wins / award_noms). "
            "No high-rating proxy when cache is cold. Edges = shared titles (≥2). Cap by blend."
        ),
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n},
    )
