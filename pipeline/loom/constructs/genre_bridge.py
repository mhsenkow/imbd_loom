"""Construct: Genre bridges — people with substantial credits in 2+ distinct genres."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, make_manifest, rows_to_stages


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")

    # People whose 2nd genre is still ≥25% of credits and top genre < 70%
    # → not one-role wonders, but real cross-genre careers
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _bridge_people AS
        WITH credits AS (
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
        ),
        per AS (
          SELECT nconst, label, gender, genre, COUNT(DISTINCT tconst) AS g_count
          FROM credits GROUP BY 1, 2, 3, 4
        ),
        tot AS (
          SELECT nconst, SUM(g_count) AS total FROM per GROUP BY 1 HAVING SUM(g_count) >= 12
        ),
        ranked AS (
          SELECT p.*, t.total,
                 p.g_count * 1.0 / t.total AS share,
                 ROW_NUMBER() OVER (PARTITION BY p.nconst ORDER BY p.g_count DESC) AS rk
          FROM per p JOIN tot t ON t.nconst = p.nconst
        ),
        top2 AS (
          SELECT
            nconst,
            MAX(CASE WHEN rk = 1 THEN genre END) AS genre_a,
            MAX(CASE WHEN rk = 2 THEN genre END) AS genre_b,
            MAX(CASE WHEN rk = 1 THEN share END) AS share_a,
            MAX(CASE WHEN rk = 2 THEN share END) AS share_b,
            MAX(label) AS label,
            MAX(gender) AS gender,
            MAX(total) AS total
          FROM ranked
          WHERE rk <= 2
          GROUP BY nconst
        )
        SELECT *
        FROM top2
        WHERE genre_b IS NOT NULL
          AND share_a < 0.70
          AND share_b >= 0.20
        """
    )

    person_sql = f"""
        SELECT
          nconst,
          label,
          gender,
          total AS title_count,
          genre_a || ' / ' || genre_b AS bridge,
          share_a,
          share_b
        FROM _bridge_people
        ORDER BY total DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges = coappearance_edges(
        con, person_sql, construct="genre_bridge", top_n=top_n, min_shared=2
    )

    stage_rows = con.execute(
        """
        SELECT 'gender', 'bridge', gender, genre_a || ' ↔ ' || genre_b, COUNT(*)
        FROM _bridge_people GROUP BY 3, 4
        UNION ALL
        SELECT 'bridge', 'balance', genre_a || ' ↔ ' || genre_b,
          CASE WHEN share_b >= 0.35 THEN 'even split'
               WHEN share_b >= 0.25 THEN 'strong second'
               ELSE 'leaning bridge' END,
          COUNT(*)
        FROM _bridge_people GROUP BY 3, 4
        """
    ).fetchall()
    # Cap noisy bridge labels in stages — keep top pairs by count
    # (already limited via people set size)
    stages = rows_to_stages(
        stage_rows, ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value")
    )
    # Trim stage categories for readability
    stages = _cap_stage_categories(stages, 16)

    method = (
        "Population: actors/actresses with ≥12 title-genre credits whose largest genre "
        "is <70% and second genre is ≥20% — careers that meaningfully span genres. "
        "Hero = co-appearance; node.bridge shows top two genres."
    )
    manifest = make_manifest(
        con,
        construct_id="genre_bridge",
        title="Genre Bridges",
        subtitle="careers spanning two (or more) genres",
        key_variable="bridge",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=stages,
        extra={"top_n": top_n, "min_shared": 2},
    )
    return {"nodes": nodes, "edges": edges, "stages": stages, "manifest": manifest}


def _cap_stage_categories(stages: list[dict], max_cats: int) -> list[dict]:
    from collections import defaultdict

    # Keep highest-value categoryFrom/To pairs per stage hop
    by_hop: dict[tuple, list] = defaultdict(list)
    for s in stages:
        by_hop[(s["stageFrom"], s["stageTo"])].append(s)
    out = []
    for hop, rows in by_hop.items():
        # rank categories by total value
        cat_val: dict[str, int] = defaultdict(int)
        for r in rows:
            cat_val[r["categoryFrom"]] += int(r["value"])
            cat_val[r["categoryTo"]] += int(r["value"])
        keep = {
            c
            for c, _ in sorted(cat_val.items(), key=lambda x: -x[1])[:max_cats]
        }
        for r in rows:
            if r["categoryFrom"] in keep and r["categoryTo"] in keep:
                out.append(r)
    return out
