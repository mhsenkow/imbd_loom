"""Drama-school clusters from Wikidata educated_at (when cache present)."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql

SCHOOL_HINTS = (
    "rada",
    "juilliard",
    "yale school of drama",
    "lamda",
    "actors studio",
    "beijing film",
    "national theatre",
    "drama centre",
    "nyu tisch",
    "central school of speech",
)


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    like = " OR ".join(f"lower(w.educated_at) LIKE '%{h}%'" for h in SCHOOL_HINTS)

    use_wd = False
    try:
        n = con.execute(
            f"SELECT COUNT(*) FROM wikidata_people w WHERE w.educated_at IS NOT NULL AND ({like})"
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
              w.educated_at AS drama_school,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence
            FROM title_principals p
            JOIN name_basics n ON n.nconst = p.nconst
            JOIN wikidata_people w ON w.nconst = p.nconst
            JOIN title_basics t ON t.tconst = p.tconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
            WHERE p.category IN ('actor', 'actress')
              AND w.educated_at IS NOT NULL
              AND ({like})
              AND {types} AND {adult} AND {votes}
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category, w.educated_at
            HAVING COUNT(DISTINCT p.tconst) >= 3
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """
    else:
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
              AND list_contains(string_split(COALESCE(t.genres,''), ','), 'Drama')
              AND {types} AND {adult} AND {votes}
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
            HAVING COUNT(DISTINCT p.tconst) >= 10
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="drama_schools", top_n=top_n, min_shared=2
    )
    stages = rows_to_stages([], ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"))
    return finalize_payload(
        con,
        construct_id="drama_schools",
        title="The Drama School Webs",
        subtitle="RADA, Juilliard, and stage-school clusters",
        key_variable="drama_school",
        method_note=(
            "Population: Wikidata educated-at matching known drama schools when cache "
            "exists; otherwise prolific Drama-genre careers as a weak proxy. "
            "Edges = shared titles (≥2)."
        ),
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n},
    )
