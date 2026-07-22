"""Award-season cohorts from Wikidata awards (when cache present)."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=100)

    use_wd = False
    try:
        n = con.execute(
            "SELECT COUNT(*) FROM wikidata_people WHERE COALESCE(award_wins, 0) > 0"
        ).fetchone()[0]
        use_wd = int(n) >= 10
    except Exception:
        use_wd = False

    if use_wd:
        person_sql = f"""
            SELECT
              p.nconst,
              n.primaryName AS label,
              {ge} AS gender,
              w.award_wins,
              w.award_noms,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence
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
            ORDER BY COALESCE(w.award_wins, 0) DESC, SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """
    else:
        # Fallback: high-rated prolific careers as "award-adjacent" proxy
        person_sql = f"""
            SELECT
              p.nconst,
              n.primaryName AS label,
              {ge} AS gender,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence,
              AVG(COALESCE(r.averageRating, 0)) AS avg_rating
            FROM title_principals p
            JOIN name_basics n ON n.nconst = p.nconst
            JOIN title_basics t ON t.tconst = p.tconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
            WHERE p.category IN ('actor', 'actress')
              AND {types} AND {adult} AND {votes}
              AND COALESCE(r.averageRating, 0) >= 7.5
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
            HAVING COUNT(DISTINCT p.tconst) >= 5
               AND AVG(COALESCE(r.averageRating, 0)) >= 7.2
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="award_cohorts", top_n=top_n, min_shared=2
    )
    stages = rows_to_stages([], ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"))
    return finalize_payload(
        con,
        construct_id="award_cohorts",
        title="Award Season Cohorts",
        subtitle="award-linked careers woven by shared titles",
        key_variable="award_wins",
        method_note=(
            "Population: Wikidata P166 award recipients when cache exists; otherwise "
            "actors with median title rating ≥7.5 as a soft quality cohort. "
            "Edges = shared titles (≥2)."
        ),
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n},
    )
