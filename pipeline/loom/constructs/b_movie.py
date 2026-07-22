"""Construct: B-movie loyalists — careers concentrated below median votes."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)

    person_sql = f"""
        WITH thresh AS (
          SELECT quantile_cont(r.numVotes, 0.5) AS med
          FROM title_basics t
          JOIN title_ratings r ON r.tconst = t.tconst
          WHERE {types} AND {adult} AND {votes}
        ),
        person AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            COUNT(DISTINCT p.tconst) AS title_count,
            COUNT(DISTINCT CASE WHEN r.numVotes < th.med THEN p.tconst END)
              AS below_median_count,
            SUM(COALESCE(r.numVotes, 0)) AS prominence
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          CROSS JOIN thresh th
          WHERE p.category IN ('actor', 'actress')
            AND {types} AND {adult} AND {votes}
          GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
          HAVING COUNT(DISTINCT p.tconst) >= 10
        )
        SELECT
          nconst, label, gender, title_count, below_median_count, prominence,
          below_median_count * 1.0 / title_count AS b_movie_share
        FROM person
        WHERE below_median_count * 1.0 / title_count >= 0.70
        ORDER BY b_movie_share DESC, title_count DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="b_movie", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'share_band', gender,
          CASE WHEN b_movie_share >= 0.90 THEN '≥90% below median'
               WHEN b_movie_share >= 0.80 THEN '80–89%'
               ELSE '70–79%' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        UNION ALL
        SELECT 'share_band', 'volume',
          CASE WHEN b_movie_share >= 0.90 THEN '≥90% below median'
               WHEN b_movie_share >= 0.80 THEN '80–89%'
               ELSE '70–79%' END,
          CASE WHEN title_count >= 40 THEN '40+ titles'
               WHEN title_count >= 20 THEN '20–39'
               ELSE '10–19' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: actors with ≥10 credits where ≥70% of titles are below the "
        "global median of numVotes (Adult excluded, vote floor ≥50). "
        "Hero = co-appearance among B-movie-loyal careers."
    )
    return finalize_payload(
        con,
        construct_id="b_movie",
        title="The B-Movie Loyalists",
        subtitle="careers ≥70% below-median-votes titles",
        key_variable="b_movie_share",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_share": 0.70, "min_titles": 10},
    )
