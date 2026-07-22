"""Construct: Documentary selves — Self / Documentary ecosystem."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql(
        "t",
        types=("movie", "tvSeries", "tvMovie", "tvMiniSeries", "tvSpecial", "video"),
    )
    votes = vote_floor_sql("r", min_votes=50)

    person_sql = f"""
        WITH credits AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            p.category,
            p.tconst,
            t.genres,
            COALESCE(r.numVotes, 0) AS votes
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress', 'self')
            AND {types} AND {adult} AND {votes}
        )
        SELECT
          nconst,
          MAX(label) AS label,
          MAX(gender) AS gender,
          COUNT(DISTINCT CASE WHEN category = 'self' THEN tconst END) AS self_count,
          COUNT(DISTINCT CASE
            WHEN list_contains(string_split(COALESCE(genres, ''), ','), 'Documentary')
            THEN tconst END) AS documentary_count,
          COUNT(DISTINCT tconst) AS title_count,
          SUM(votes) AS prominence
        FROM credits
        GROUP BY nconst
        HAVING (
          COUNT(DISTINCT CASE WHEN category = 'self' THEN tconst END) >= 8
          OR COUNT(DISTINCT CASE
                WHEN list_contains(string_split(COALESCE(genres, ''), ','), 'Documentary')
                THEN tconst END) >= 8
        )
        ORDER BY
          GREATEST(
            COUNT(DISTINCT CASE WHEN category = 'self' THEN tconst END),
            COUNT(DISTINCT CASE
              WHEN list_contains(string_split(COALESCE(genres, ''), ','), 'Documentary')
              THEN tconst END)
          ) DESC,
          SUM(votes) DESC
        LIMIT {int(top_n * 3)}
    """

    # coappearance_edges filters to actor/actress only in credits — expand via custom
    # path: still use it but population may include self-heavy people who also act.
    # For pure-self people, temporarily rely on actor credits they also have.
    # Override: build a looser person set that coappearance can still join on actor rows.
    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="documentary_selves",
        top_n=top_n,
        min_shared=2,
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'lane', gender,
          CASE
            WHEN self_count >= 8 AND documentary_count >= 8 THEN 'self + doc'
            WHEN self_count >= 8 THEN 'self'
            ELSE 'documentary'
          END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        UNION ALL
        SELECT 'lane', 'volume',
          CASE
            WHEN self_count >= 8 AND documentary_count >= 8 THEN 'self + doc'
            WHEN self_count >= 8 THEN 'self'
            ELSE 'documentary'
          END,
          CASE WHEN title_count >= 40 THEN '40+ credits'
               WHEN title_count >= 20 THEN '20–39'
               ELSE '8–19' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: people with ≥8 category=self credits OR ≥8 Documentary-genre "
        "credits (Adult excluded, numVotes ≥50). "
        "Hero = co-appearance among the documentary / talk-show ecosystem (min_shared=2)."
    )
    return finalize_payload(
        con,
        construct_id="documentary_selves",
        title="Documentary Selves",
        subtitle="Self / Documentary credit ecosystems",
        key_variable="self_count",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_credits": 8},
    )
