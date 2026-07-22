"""Construct: Blockbuster ensemble — careers concentrated in top-decile vote titles."""

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
          SELECT quantile_cont(r.numVotes, 0.9) AS top_decile
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
            COUNT(DISTINCT CASE WHEN r.numVotes >= th.top_decile THEN p.tconst END)
              AS blockbuster_count,
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
          HAVING COUNT(DISTINCT p.tconst) >= 8
        )
        SELECT
          nconst, label, gender, title_count, blockbuster_count, prominence,
          blockbuster_count * 1.0 / title_count AS blockbuster_share
        FROM person
        WHERE blockbuster_count * 1.0 / title_count >= 0.50
        ORDER BY blockbuster_share DESC, prominence DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="blockbuster", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'share_band', gender,
          CASE WHEN blockbuster_share >= 0.80 THEN '≥80% blockbuster'
               WHEN blockbuster_share >= 0.65 THEN '65–79%'
               ELSE '50–64%' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        UNION ALL
        SELECT 'share_band', 'volume',
          CASE WHEN blockbuster_share >= 0.80 THEN '≥80% blockbuster'
               WHEN blockbuster_share >= 0.65 THEN '65–79%'
               ELSE '50–64%' END,
          CASE WHEN title_count >= 30 THEN '30+ titles'
               WHEN title_count >= 15 THEN '15–29'
               ELSE '8–14' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: actors with ≥8 credits where ≥50% of titles are in the global "
        "top decile of numVotes (Adult excluded, vote floor ≥50). "
        "Hero = co-appearance among blockbuster-heavy careers."
    )
    return finalize_payload(
        con,
        construct_id="blockbuster",
        title="The Blockbuster Ensemble",
        subtitle="careers ≥50% in top-decile-votes titles",
        key_variable="blockbuster_share",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_share": 0.50},
    )
