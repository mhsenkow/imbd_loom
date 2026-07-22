"""Construct: One-role wonders — people whose filmography is ≥90% one genre."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import attach_prominent_roles, make_manifest, rows_to_stages


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")

    # Explode genres, compute concentration per person
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _credits AS
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          UNNEST(string_split(t.genres, ',')) AS genre,
          p.tconst
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
        WHERE p.category IN ('actor', 'actress')
          AND t.genres IS NOT NULL
          AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries')
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _conc AS
        WITH per_genre AS (
          SELECT nconst, label, gender, genre, COUNT(DISTINCT tconst) AS g_count
          FROM _credits GROUP BY 1, 2, 3, 4
        ),
        totals AS (
          SELECT nconst, SUM(g_count) AS total FROM per_genre GROUP BY 1
        ),
        ranked AS (
          SELECT pg.*, t.total,
                 pg.g_count * 1.0 / t.total AS share,
                 ROW_NUMBER() OVER (PARTITION BY pg.nconst ORDER BY pg.g_count DESC) AS rk
          FROM per_genre pg
          JOIN totals t ON t.nconst = pg.nconst
          WHERE t.total >= 8
        )
        SELECT nconst, label, gender, genre AS dominant_genre, g_count, total, share
        FROM ranked
        WHERE rk = 1 AND share >= 0.90
        ORDER BY total DESC
        """
    )

    people_rows = con.execute(
        f"SELECT * FROM _conc ORDER BY total DESC LIMIT {int(top_n)}"
    ).fetchall()
    people_cols = [d[0] for d in con.description]

    nodes = []
    for row in people_rows:
        rec = dict(zip(people_cols, row))
        nodes.append(
            {
                "id": rec["nconst"],
                "label": rec["label"],
                "type": "person",
                "gender": rec["gender"],
                "degree": int(rec["total"]),
                "dominant_genre": rec["dominant_genre"],
                "concentration": round(float(rec["share"]), 3),
                "title_count": int(rec["total"]),
            }
        )

    # Career years for timeline view
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
            """
            SELECT p.nconst,
                   MIN(t.startYear) AS year_min,
                   MAX(t.startYear) AS year_max,
                   CAST(ROUND(AVG(t.startYear)) AS INTEGER) AS year_peak
            FROM title_principals p
            JOIN _keep k ON k.nconst = p.nconst
            JOIN title_basics t ON t.tconst = p.tconst
            WHERE p.category IN ('actor', 'actress')
              AND t.startYear IS NOT NULL
              AND t.startYear BETWEEN 1920 AND 2030
            GROUP BY 1
            """
        ).fetchall()
        years = {r[0]: {"year_min": r[1], "year_max": r[2], "year_peak": r[3]} for r in year_rows}
        for n in nodes:
            if n["id"] in years:
                n.update(years[n["id"]])

    # Edges: people who share dominant genre (soft link by genre co-membership weight)
    # For hero chord: connect people in same dominant genre with weight = min(degrees)
    keep = {n["id"] for n in nodes}
    genre_groups: dict[str, list[dict]] = {}
    for n in nodes:
        genre_groups.setdefault(n["dominant_genre"], []).append(n)

    edges = []
    for genre, group in genre_groups.items():
        # Cap clique explosion: link top people within genre as a star + ring
        group = sorted(group, key=lambda x: -x["degree"])[:30]
        for i, a in enumerate(group):
            for b in group[i + 1 : i + 4]:  # sparse: connect to next 3
                # Approximate edge year as midpoint of career overlap
                ya = a.get("year_peak") or a.get("year_min")
                yb = b.get("year_peak") or b.get("year_min")
                year = int((ya + yb) / 2) if ya and yb else None
                edge = {
                    "source": a["id"],
                    "target": b["id"],
                    "weight": 1,
                    "construct": "one_role",
                    "genre": genre,
                }
                if year:
                    edge["year"] = year
                edges.append(edge)

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

    method = (
        "Population: actors/actresses with ≥8 title-genre credits whose single "
        "largest genre accounts for ≥90% of those credits. "
        "Hero links connect people who share the same dominant genre "
        "(genre co-membership — not co-appearances on the same title)."
    )
    manifest = make_manifest(
        con,
        construct_id="one_role",
        title="One-Role Wonders",
        subtitle="person → genre concentration (≥90%)",
        key_variable="dominant_genre",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        extra={
            "concentration_threshold": 0.90,
            "min_credits": 8,
            "top_n": top_n,
            "edge_kind": "genre_comembership",
        },
    )
    return {"nodes": nodes, "edges": edges, "stages": stages, "manifest": manifest}
