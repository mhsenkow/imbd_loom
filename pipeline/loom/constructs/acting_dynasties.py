"""Acting dynasties from Wikidata family relations (when cache present)."""

from __future__ import annotations

import json

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def _has_wd(con: duckdb.DuckDBPyConnection) -> bool:
    try:
        n = con.execute(
            "SELECT COUNT(*) FROM wikidata_people WHERE family_json IS NOT NULL"
        ).fetchone()[0]
        return int(n) > 10
    except Exception:
        return False


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)

    if _has_wd(con):
        # People who appear in family_json of someone else or have family links
        person_sql = f"""
            WITH fam AS (
              SELECT nconst, family_json FROM wikidata_people
              WHERE family_json IS NOT NULL AND family_json != '{{}}'
            ),
            linked AS (
              SELECT DISTINCT nconst FROM fam
              UNION
              SELECT DISTINCT UNNEST(from_json(family_json, '{{"spouse":["VARCHAR"],"child":["VARCHAR"],"sibling":["VARCHAR"]}}')).spouse
              FROM fam WHERE family_json LIKE '%nm%'
            )
            SELECT
              p.nconst,
              n.primaryName AS label,
              {ge} AS gender,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence
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
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """
        # Simpler fallback if JSON unwrap fails — just people with family_json
        try:
            nodes, edges, stats = coappearance_edges(
                con, person_sql, construct="acting_dynasties", top_n=top_n, min_shared=1
            )
        except Exception:
            person_sql = f"""
                SELECT
                  p.nconst,
                  n.primaryName AS label,
                  {ge} AS gender,
                  COUNT(DISTINCT p.tconst) AS title_count,
                  SUM(COALESCE(r.numVotes, 0)) AS prominence
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
                ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
                LIMIT {int(top_n * 3)}
            """
            nodes, edges, stats = coappearance_edges(
                con, person_sql, construct="acting_dynasties", top_n=top_n, min_shared=1
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
    else:
        # Fallback: prolific multi-word-name actors (weak dynasty proxy without Wikidata)
        person_sql = f"""
            SELECT
              p.nconst,
              n.primaryName AS label,
              {ge} AS gender,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence
            FROM title_principals p
            JOIN name_basics n ON n.nconst = p.nconst
            JOIN title_basics t ON t.tconst = p.tconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
            WHERE p.category IN ('actor', 'actress')
              AND {types} AND {adult} AND {votes}
              AND length(n.primaryName) - length(replace(n.primaryName, ' ', '')) >= 1
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
            HAVING COUNT(DISTINCT p.tconst) >= 8
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 4)}
        """
        nodes, edges, stats = coappearance_edges(
            con, person_sql, construct="acting_dynasties", top_n=top_n, min_shared=2
        )
        stats["family_source"] = "coappearance_fallback"

    stages = rows_to_stages([], ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"))
    return finalize_payload(
        con,
        construct_id="acting_dynasties",
        title="Acting Dynasties",
        subtitle="family trees woven with co-appearance",
        key_variable="family",
        method_note=(
            "Population: people with Wikidata family links (spouse/child/sibling) when cache "
            "is present; otherwise high-volume multi-name careers as a weak surname proxy. "
            "Edges = co-appearance plus typed family links when available."
        ),
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n},
    )
