"""Construct: Genre drift — early vs late career genre change."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload, rows_to_stages
from loom.filters import (
    LOW_SIGNAL_GENRES,
    adult_exclusion_sql,
    title_type_sql,
    vote_floor_sql,
)


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    low = ", ".join(f"'{g}'" for g in sorted(LOW_SIGNAL_GENRES))

    # Year-third genre mix: early vs late; score = 1 - Jaccard of top genres
    person_sql = f"""
        WITH credits AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            t.startYear,
            UNNEST(string_split(t.genres, ',')) AS genre,
            p.tconst,
            COALESCE(r.numVotes, 0) AS votes
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND t.genres IS NOT NULL
            AND t.startYear IS NOT NULL
            AND {types} AND {adult} AND {votes}
        ),
        filtered AS (
          SELECT * FROM credits WHERE genre NOT IN ({low})
        ),
        bounds AS (
          SELECT
            nconst, label, gender,
            MIN(startYear) AS y0,
            MAX(startYear) AS y1,
            COUNT(DISTINCT tconst) AS title_count,
            SUM(votes) AS prominence
          FROM filtered
          GROUP BY 1, 2, 3
          HAVING COUNT(DISTINCT tconst) >= 15
             AND MAX(startYear) > MIN(startYear)
        ),
        phased AS (
          SELECT
            f.nconst, f.genre, f.tconst,
            CASE
              WHEN f.startYear <= b.y0 + (b.y1 - b.y0) / 3.0 THEN 'early'
              WHEN f.startYear >= b.y1 - (b.y1 - b.y0) / 3.0 THEN 'late'
              ELSE 'mid'
            END AS phase
          FROM filtered f
          JOIN bounds b ON b.nconst = f.nconst
        ),
        phase_genre AS (
          SELECT nconst, phase, genre, COUNT(DISTINCT tconst) AS g_count
          FROM phased
          WHERE phase IN ('early', 'late')
          GROUP BY 1, 2, 3
        ),
        top_phase AS (
          SELECT *,
            ROW_NUMBER() OVER (
              PARTITION BY nconst, phase ORDER BY g_count DESC
            ) AS rk
          FROM phase_genre
        ),
        early_g AS (
          SELECT nconst, genre AS early_genre FROM top_phase
          WHERE phase = 'early' AND rk = 1
        ),
        late_g AS (
          SELECT nconst, genre AS late_genre FROM top_phase
          WHERE phase = 'late' AND rk = 1
        )
        SELECT
          b.nconst,
          b.label,
          b.gender,
          b.title_count,
          b.prominence,
          e.early_genre,
          l.late_genre,
          e.early_genre || ' → ' || l.late_genre AS drift,
          CASE
            WHEN e.early_genre IS DISTINCT FROM l.late_genre THEN 1.0
            ELSE 0.3
          END AS drift_score
        FROM bounds b
        JOIN early_g e ON e.nconst = b.nconst
        JOIN late_g l ON l.nconst = b.nconst
        WHERE e.early_genre IS DISTINCT FROM l.late_genre
        ORDER BY b.prominence DESC
        LIMIT {int(top_n * 3)}
    """
    nodes, edges, stats = coappearance_edges(
        con, person_sql, construct="genre_drift", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'drift', gender, early_genre || ' → ' || late_genre, COUNT(*)
        FROM _people
        WHERE early_genre IS NOT NULL AND late_genre IS NOT NULL
        GROUP BY 3, 4
        UNION ALL
        SELECT 'drift', 'band', early_genre || ' → ' || late_genre,
          CASE WHEN early_genre IS DISTINCT FROM late_genre THEN 'changed'
               ELSE 'stable top' END,
          COUNT(*)
        FROM _people
        WHERE early_genre IS NOT NULL AND late_genre IS NOT NULL
        GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )
    # Cap noisy drift labels
    from collections import defaultdict

    by_hop: dict[tuple, list] = defaultdict(list)
    for s in stages:
        by_hop[(s["stageFrom"], s["stageTo"])].append(s)
    capped = []
    for rows in by_hop.values():
        rows = sorted(rows, key=lambda r: -int(r["value"]))[:20]
        capped.extend(rows)
    stages = capped

    method = (
        "Population: actors with ≥15 credits (Adult excluded, numVotes ≥50) "
        "whose dominant early-career genre (first third of years) differs from "
        "late-career genre (last third). Hero = co-appearance among drifters."
    )
    return finalize_payload(
        con,
        construct_id="genre_drift",
        title="Genre Drift",
        subtitle="early vs late career genre change",
        key_variable="drift",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_titles": 15},
    )
