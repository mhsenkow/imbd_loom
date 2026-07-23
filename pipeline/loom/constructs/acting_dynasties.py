"""Acting dynasties from Wikidata family relations (when cache present)."""

from __future__ import annotations

import json

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import (
    coappearance_edges,
    finalize_payload,
    recompute_degree_strength,
    rows_to_stages,
)
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql
from loom.membership import empty_payload_stats, rank_prominence_sql, wikidata_warm


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    prom = rank_prominence_sql("r")

    if not wikidata_warm(con, column="family_json"):
        return finalize_payload(
            con,
            construct_id="acting_dynasties",
            title="Acting Dynasties",
            subtitle="family trees woven with co-appearance",
            key_variable="family",
            method_note=(
                "EMPTY: Wikidata family_json cache is cold — no dynasty population. "
                "Re-run loom enrich so family links are populated."
            ),
            nodes=[],
            edges=[],
            stages=[],
            build_stats=empty_payload_stats(
                reason="wikidata_family_json_cold", enrichment_mode="empty"
            ),
            extra={"top_n": top_n},
        )

    person_sql = f"""
        WITH fam AS (
          SELECT nconst, family_json FROM wikidata_people
          WHERE family_json IS NOT NULL AND family_json != '{{}}'
        )
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          COUNT(DISTINCT p.tconst) AS title_count,
          {prom} AS prominence
        FROM title_principals p
        JOIN name_basics n ON n.nconst = p.nconst
        JOIN fam f ON f.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        JOIN title_basics t ON t.tconst = p.tconst
        WHERE p.category IN ('actor', 'actress')
          AND {types} AND {adult} AND {votes}
        GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
        HAVING COUNT(DISTINCT p.tconst) >= 3
        ORDER BY {prom} DESC
        LIMIT {int(top_n * 3)}
    """

    try:
        nodes, edges, stats = coappearance_edges(
            con,
            person_sql,
            construct="acting_dynasties",
            top_n=top_n,
            min_shared=1,
            cap_by="blend",
            enrichment_mode="wikidata_family",
        )
    except Exception:
        person_sql = f"""
            SELECT
              p.nconst,
              n.primaryName AS label,
              {ge} AS gender,
              COUNT(DISTINCT p.tconst) AS title_count,
              {prom} AS prominence
            FROM title_principals p
            JOIN name_basics n ON n.nconst = p.nconst
            JOIN wikidata_people w ON w.nconst = p.nconst
            JOIN title_basics t ON t.tconst = p.tconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
            WHERE p.category IN ('actor', 'actress')
              AND w.family_json IS NOT NULL
              AND {types} AND {adult} AND {votes}
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
            HAVING COUNT(DISTINCT p.tconst) >= 3
            ORDER BY {prom} DESC
            LIMIT {int(top_n * 3)}
        """
        nodes, edges, stats = coappearance_edges(
            con,
            person_sql,
            construct="acting_dynasties",
            top_n=top_n,
            min_shared=1,
            cap_by="blend",
            enrichment_mode="wikidata_family",
        )

    # Overlay typed family edges
    try:
        fam_rows = con.execute(
            "SELECT nconst, family_json FROM wikidata_people WHERE family_json IS NOT NULL"
        ).fetchall()
        keep = {n["id"] for n in nodes}
        for nconst, raw in fam_rows:
            if nconst not in keep or not raw:
                continue
            try:
                fam = json.loads(raw)
            except Exception:
                continue
            for kind, others in fam.items():
                for other in others or []:
                    if other in keep and other != nconst:
                        a, b = sorted([nconst, other])
                        edges.append(
                            {
                                "source": a,
                                "target": b,
                                "weight": 1,
                                "construct": "acting_dynasties",
                                "family": kind,
                                "edge_kind": "family",
                            }
                        )
    except Exception:
        pass
    recompute_degree_strength(nodes, edges)
    stats.pop("analytics", None)

    stages = rows_to_stages([], ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"))
    return finalize_payload(
        con,
        construct_id="acting_dynasties",
        title="Acting Dynasties",
        subtitle="family trees woven with co-appearance",
        key_variable="family",
        method_note=(
            "Population: people with Wikidata family links (spouse/child/sibling). "
            "No surname/volume proxy when cache is cold. "
            "Edges = co-appearance plus typed family links. Cap by blend."
        ),
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n},
    )
