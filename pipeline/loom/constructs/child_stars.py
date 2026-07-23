"""Construct: Child stars — debut before age 12."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import adult_exclusion_sql, genre_contains_sql, title_type_sql, vote_floor_sql
from loom.membership import rank_prominence_sql


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    prom = rank_prominence_sql("r")
    anim = genre_contains_sql("t", "Animation")

    person_sql = f"""
        WITH career AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            COALESCE(n.birthYear, w.birth_year_wd) AS birth_year,
            MIN(t.startYear) AS year_min,
            MIN(CASE WHEN NOT {anim} THEN t.startYear END) AS live_debut_year,
            MAX(t.startYear) AS year_max,
            COUNT(DISTINCT p.tconst) AS title_count,
            COUNT(DISTINCT CASE WHEN NOT {anim} THEN p.tconst END) AS live_title_count,
            {prom} AS prominence
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN wikidata_people w ON w.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND COALESCE(n.birthYear, w.birth_year_wd) IS NOT NULL
            AND t.startYear IS NOT NULL
            AND {types}
            AND {adult}
            AND {votes}
          GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category,
                   COALESCE(n.birthYear, w.birth_year_wd)
        ),
        scored AS (
          SELECT
            nconst,
            label,
            gender,
            birth_year,
            -- Prefer live-action debut when it still qualifies as a child role
            CASE
              WHEN live_debut_year IS NOT NULL
                   AND live_debut_year - birth_year < 12
                   AND live_debut_year - birth_year >= 0
                THEN live_debut_year
              ELSE year_min
            END AS debut_year,
            year_min,
            year_max,
            title_count,
            live_title_count,
            prominence,
            CASE WHEN year_max - birth_year >= 25 THEN TRUE ELSE FALSE END AS worked_past_25
          FROM career
          WHERE title_count >= 3
            AND live_title_count >= 1
        )
        SELECT
          nconst, label, gender, birth_year, debut_year AS year_min, year_max,
          title_count, prominence,
          debut_year - birth_year AS debut_age,
          worked_past_25
        FROM scored
        WHERE debut_year - birth_year < 12
          AND debut_year - birth_year >= 0
        ORDER BY prominence DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="child_stars",
        top_n=top_n,
        min_shared=2,
        cap_by="blend",
        enrichment_mode="imdb_wikidata_birth",
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'worked_past_25',
          gender,
          CASE WHEN worked_past_25 THEN 'worked past 25' ELSE 'stopped by 25' END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        UNION ALL
        SELECT 'worked_past_25', 'debut_band',
          CASE WHEN worked_past_25 THEN 'worked past 25' ELSE 'stopped by 25' END,
          CASE
            WHEN debut_age < 6 THEN 'infant–5'
            WHEN debut_age < 9 THEN '6–8'
            ELSE '9–11'
          END,
          COUNT(*)
        FROM _people GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    method = (
        "Population: actors with birth year from IMDb or Wikidata (COALESCE) whose "
        "first credited title year minus birth year is <12. Prefer live-action debut "
        "(non-Animation) when present (Adult excluded, numVotes ≥50, ≥3 titles). Cap by blend."
    )
    return finalize_payload(
        con,
        construct_id="child_stars",
        title="Child Stars",
        subtitle="debut before age 12 → what happened next",
        key_variable="worked_past_25",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "max_debut_age": 11},
    )
