"""Construct: One-role wonders — people whose filmography is ≥90% one genre."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import (
    attach_prominent_roles,
    finalize_payload,
    rows_to_stages,
)
from loom.filters import (
    LOW_SIGNAL_GENRES,
    adult_exclusion_sql,
    title_type_sql,
    vote_floor_sql,
)
from loom.textnorm import ascii_fold


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    low = ", ".join(f"'{g}'" for g in sorted(LOW_SIGNAL_GENRES))
    per_genre_cap = max(int(top_n // 10), 6)
    min_genre_people = 3


    # Explode genres with prominence (votes / billing)
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _credits AS
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          UNNEST(string_split(t.genres, ',')) AS genre,
          p.tconst,
          COALESCE(r.numVotes, 0) AS votes,
          COALESCE(r.numVotes, 0) * 1.0 / GREATEST(COALESCE(p.ordering, 10), 1) AS prominence_piece
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND t.genres IS NOT NULL
          AND {types}
          AND {adult}
          AND {votes}
        """
    )
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _conc AS
        WITH per_genre AS (
          SELECT
            nconst, label, gender, genre,
            COUNT(DISTINCT tconst) AS g_count,
            SUM(prominence_piece) AS g_prominence
          FROM _credits
          WHERE genre NOT IN ({low})
          GROUP BY 1, 2, 3, 4
        ),
        totals AS (
          SELECT
            nconst,
            SUM(g_count) AS total,
            SUM(g_prominence) AS prominence
          FROM per_genre
          GROUP BY 1
        ),
        ranked AS (
          SELECT
            pg.*,
            t.total,
            t.prominence,
            pg.g_count * 1.0 / t.total AS share,
            ROW_NUMBER() OVER (
              PARTITION BY pg.nconst ORDER BY pg.g_count DESC, pg.g_prominence DESC
            ) AS rk
          FROM per_genre pg
          JOIN totals t ON t.nconst = pg.nconst
          WHERE t.total >= 8
        ),
        concentrated AS (
          SELECT
            nconst, label, gender,
            genre AS dominant_genre,
            g_count, total, share, prominence
          FROM ranked
          WHERE rk = 1 AND share >= 0.90
        ),
        genre_sizes AS (
          SELECT dominant_genre, COUNT(*) AS n_people
          FROM concentrated
          GROUP BY 1
          HAVING COUNT(*) >= {min_genre_people}
        ),
        stratified AS (
          SELECT
            c.*,
            ROW_NUMBER() OVER (
              PARTITION BY c.dominant_genre
              ORDER BY c.prominence DESC, c.total DESC, c.nconst
            ) AS genre_rank
          FROM concentrated c
          JOIN genre_sizes g ON g.dominant_genre = c.dominant_genre
        )
        SELECT *
        FROM stratified
        WHERE genre_rank <= {per_genre_cap}
        ORDER BY prominence DESC
        """
    )

    people_rows = con.execute(
        f"SELECT * FROM _conc ORDER BY prominence DESC LIMIT {int(top_n)}"
    ).fetchall()
    people_cols = [d[0] for d in con.description]

    nodes = []
    for row in people_rows:
        rec = dict(zip(people_cols, row))
        nodes.append(
            {
                "id": rec["nconst"],
                "label": rec["label"],
                "label_ascii": ascii_fold(rec["label"]),
                "type": "person",
                "gender": rec["gender"],
                "degree": int(rec["total"]),
                "dominant_genre": rec["dominant_genre"],
                "concentration": round(float(rec["share"]), 3),
                "title_count": int(rec["total"]),
                "prominence": round(float(rec["prominence"] or 0), 1),
            }
        )

    keep_ids = [n["id"] for n in nodes]
    if keep_ids:
        con.execute(
            """
            CREATE OR REPLACE TEMP TABLE _keep AS
            SELECT * FROM UNNEST(?::VARCHAR[]) AS t(nconst)
            """,
            [keep_ids],
        )
        year_rows = con.execute(
            f"""
            SELECT p.nconst,
                   MIN(t.startYear) AS year_min,
                   MAX(t.startYear) AS year_max,
                   CAST(ROUND(AVG(t.startYear)) AS INTEGER) AS year_peak
            FROM title_principals p
            JOIN _keep k ON k.nconst = p.nconst
            JOIN title_basics t ON t.tconst = p.tconst
            LEFT JOIN title_ratings r ON r.tconst = p.tconst
            WHERE p.category IN ('actor', 'actress')
              AND {types}
              AND {adult}
              AND {votes}
              AND t.startYear IS NOT NULL
              AND t.startYear BETWEEN 1920 AND 2030
            GROUP BY 1
            """
        ).fetchall()
        years = {
            r[0]: {"year_min": r[1], "year_max": r[2], "year_peak": r[3]}
            for r in year_rows
        }
        for n in nodes:
            if n["id"] in years:
                n.update(years[n["id"]])

    genre_groups: dict[str, list[dict]] = {}
    for n in nodes:
        genre_groups.setdefault(n["dominant_genre"], []).append(n)

    edges = []
    for genre, group in genre_groups.items():
        group = sorted(group, key=lambda x: -(x.get("prominence") or 0))[:30]
        for i, a in enumerate(group):
            for b in group[i + 1 : i + 4]:
                ya = a.get("year_peak") or a.get("year_min")
                yb = b.get("year_peak") or b.get("year_min")
                year = int((ya + yb) / 2) if ya and yb else None
                weight = max(
                    1,
                    int(min(a.get("prominence") or 1, b.get("prominence") or 1)),
                )
                edge = {
                    "source": a["id"],
                    "target": b["id"],
                    "weight": weight,
                    "construct": "one_role",
                    "genre": genre,
                }
                if year:
                    edge["year"] = year
                edges.append(edge)

    # Recompute degree from edge weights
    deg = {n["id"]: 0 for n in nodes}
    for e in edges:
        deg[e["source"]] += e["weight"]
        deg[e["target"]] += e["weight"]
    for n in nodes:
        n["degree"] = deg.get(n["id"], 0)

    stage_rows = con.execute(
        """
        SELECT 'gender', 'dominant_genre', gender, dominant_genre, COUNT(*)
        FROM _conc GROUP BY 3, 4
        UNION ALL
        SELECT 'dominant_genre', 'band', dominant_genre,
          CASE WHEN share >= 0.97 THEN 'pure (≥97%)'
               WHEN share >= 0.93 THEN 'near-pure'
               ELSE 'concentrated (90–93%)' END,
          COUNT(*)
        FROM _conc GROUP BY 3, 4
        """
    ).fetchall()
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )

    attach_prominent_roles(con, nodes, limit=6)

    build_stats = {
        "population_sql": int(
            con.execute("SELECT COUNT(*) FROM _conc").fetchone()[0]
        ),
        "after_degree_cap": len(nodes),
        "per_genre_cap": per_genre_cap,
        "min_votes": 50,
    }

    method = (
        "Population: actors/actresses with ≥8 title-genre credits (Adult excluded, "
        "numVotes ≥50) whose single largest genre accounts for ≥90% of those credits. "
        "Stratified: top N/8 people per dominant genre (genres with enough people), "
        "ranked by prominence (Σ votes/billing) rather than raw title count. "
        "Hero links connect people who share the same dominant genre; "
        "edge weight = min(prominence)."
    )
    return finalize_payload(
        con,
        construct_id="one_role",
        title="One-Role Wonders",
        subtitle="person → genre concentration (≥90%)",
        key_variable="dominant_genre",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        build_stats=build_stats,
        extra={
            "concentration_threshold": 0.90,
            "min_credits": 8,
            "top_n": top_n,
            "per_genre_cap": per_genre_cap,
            "edge_kind": "genre_comembership",
        },
    )
