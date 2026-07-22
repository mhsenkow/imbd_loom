"""Athletes / wrestlers / martial artists who crossed into acting (Wikidata occupations)."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql

ATHLETE_HINTS = (
    "athlete",
    "wrestler",
    "martial artist",
    "football",
    "basketball",
    "boxer",
    "olymp",
    "sportsperson",
    "kickboxer",
    "judoka",
    "swimmer",
    "tennis",
)


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    like = " OR ".join(f"lower(w.occupations) LIKE '%{h}%'" for h in ATHLETE_HINTS)

    use_wd = False
    try:
        n = con.execute(
            f"SELECT COUNT(*) FROM wikidata_people w WHERE w.occupations IS NOT NULL AND ({like})"
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
              w.occupations AS prior_occupation,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence
            FROM title_principals p
            JOIN name_basics n ON n.nconst = p.nconst
            JOIN wikidata_people w ON w.nconst = p.nconst
            JOIN title_basics t ON t.tconst = p.tconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
            WHERE p.category IN ('actor', 'actress')
              AND w.occupations IS NOT NULL
              AND ({like})
              AND {types} AND {adult} AND {votes}
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category, w.occupations
            HAVING COUNT(DISTINCT p.tconst) >= 3
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """
    else:
        # Fallback: Action careers with many titles (athletic-adjacent without Wikidata)
        person_sql = f"""
            SELECT
              p.nconst,
              n.primaryName AS label,
              {ge} AS gender,
              COUNT(DISTINCT p.tconst) AS title_count,
              SUM(COALESCE(r.numVotes, 0)) AS prominence,
              AVG(p.ordering) AS avg_billing
            FROM title_principals p
            JOIN name_basics n ON n.nconst = p.nconst
            JOIN title_basics t ON t.tconst = p.tconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
            WHERE p.category IN ('actor', 'actress')
              AND list_contains(string_split(COALESCE(t.genres,''), ','), 'Action')
              AND {types} AND {adult} AND {votes}
            GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
            HAVING COUNT(DISTINCT p.tconst) >= 8
            ORDER BY SUM(COALESCE(r.numVotes, 0)) DESC
            LIMIT {int(top_n * 3)}
        """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="athletes_actors", top_n=top_n, min_shared=2
    )
    stages = rows_to_stages([], ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"))
    return finalize_payload(
        con,
        construct_id="athletes_actors",
        title="Athletes to Actors",
        subtitle="wrestlers, martial artists, athletes who crossed over",
        key_variable="prior_occupation",
        method_note=(
            "Population: Wikidata occupations matching athlete/wrestler/martial-artist "
            "when cache is warm; otherwise prolific Action-genre careers (≥8 titles) "
            "as a physical-performance proxy. Edges = shared titles (≥2)."
        ),
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n},
    )
