"""Shared emission helpers: co-appearance edges, stage tables, JSON write."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
from rich.console import Console

from loom import OUT
from loom.constructs import gender_source_flags

console = Console()


def write_construct(construct_id: str, payload: dict[str, Any]) -> Path:
    dest = OUT / construct_id
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("nodes", "edges", "stages", "manifest"):
        path = dest / f"{name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload[name], f, indent=2, ensure_ascii=False)
        console.print(f"  wrote {path.relative_to(OUT.parent.parent)} ({_size(path)})")
    return dest


def _size(path: Path) -> str:
    n = path.stat().st_size
    if n < 1024:
        return f"{n} B"
    if n < 1e6:
        return f"{n / 1024:.1f} KB"
    return f"{n / 1e6:.1f} MB"


def make_manifest(
    con: duckdb.DuckDBPyConnection,
    *,
    construct_id: str,
    title: str,
    subtitle: str,
    key_variable: str,
    method_note: str,
    nodes: list,
    edges: list,
    stages: list,
    extra: dict | None = None,
) -> dict:
    flags = gender_source_flags(con)
    m = {
        "id": construct_id,
        "title": title,
        "subtitle": subtitle,
        "key_variable": key_variable,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "stage_row_count": len(stages),
        "method_note": method_note,
        "data_credit": "IMDb Non-Commercial Datasets (datasets.imdbws.com); gender enrichment via TMDB where available; voice flags via Wikidata + IMDb character heuristics.",
        **flags,
    }
    if extra:
        m.update(extra)
    return m


def coappearance_edges(
    con: duckdb.DuckDBPyConnection,
    person_filter_sql: str,
    *,
    construct: str,
    top_n: int = 200,
    min_shared: int = 2,
) -> tuple[list[dict], list[dict]]:
    """
    Build undirected co-appearance edges among people matching person_filter_sql.

    person_filter_sql must be a SELECT returning (nconst, label, gender, ...extra cols)
    already limited / ranked — we further cap to top_n by degree after edge build.
    """
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _people AS
        {person_filter_sql}
        """
    )
    # Career year spans per person (from titles they appear in with anyone in set)
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _years AS
        SELECT
          p.nconst,
          MIN(t.startYear) AS year_min,
          MAX(t.startYear) AS year_max,
          CAST(ROUND(AVG(t.startYear)) AS INTEGER) AS year_peak
        FROM title_principals p
        JOIN _people pe ON pe.nconst = p.nconst
        JOIN title_basics t ON t.tconst = p.tconst
        WHERE p.category IN ('actor', 'actress')
          AND t.startYear IS NOT NULL
          AND t.startYear BETWEEN 1920 AND 2030
        GROUP BY 1
        """
    )
    # Shared titles between pairs + average collaboration year
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _edges AS
        SELECT
          LEAST(a.nconst, b.nconst) AS source,
          GREATEST(a.nconst, b.nconst) AS target,
          COUNT(DISTINCT a.tconst) AS weight,
          CAST(ROUND(AVG(a.startYear)) AS INTEGER) AS year
        FROM (
          SELECT p.tconst, p.nconst, t.startYear
          FROM title_principals p
          JOIN _people pe ON pe.nconst = p.nconst
          JOIN title_basics t ON t.tconst = p.tconst
          WHERE p.category IN ('actor', 'actress')
            AND t.startYear IS NOT NULL
        ) a
        JOIN (
          SELECT p.tconst, p.nconst
          FROM title_principals p
          JOIN _people pe ON pe.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
        ) b ON a.tconst = b.tconst AND a.nconst < b.nconst
        GROUP BY 1, 2
        HAVING COUNT(DISTINCT a.tconst) >= ?
        """,
        [min_shared],
    )
    # Degree for ranking
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _deg AS
        SELECT nconst, SUM(w) AS degree FROM (
          SELECT source AS nconst, weight AS w FROM _edges
          UNION ALL
          SELECT target AS nconst, weight AS w FROM _edges
        ) GROUP BY 1
        """
    )
    top_rows = con.execute(
        f"""
        SELECT pe.*, COALESCE(d.degree, 0) AS degree,
               y.year_min, y.year_max, y.year_peak
        FROM _people pe
        LEFT JOIN _deg d ON d.nconst = pe.nconst
        LEFT JOIN _years y ON y.nconst = pe.nconst
        ORDER BY COALESCE(d.degree, 0) DESC
        LIMIT {int(top_n)}
        """
    ).fetchall()
    top_cols = [d[0] for d in con.description]

    keep = {r[top_cols.index("nconst")] for r in top_rows}
    edge_rows = con.execute(
        "SELECT source, target, weight, year FROM _edges"
    ).fetchall()
    edges = [
        {
            "source": s,
            "target": t,
            "weight": int(w),
            "construct": construct,
            **({"year": int(yr)} if yr is not None else {}),
        }
        for s, t, w, yr in edge_rows
        if s in keep and t in keep
    ]

    attach_shared_titles(con, edges, limit=3)

    # Recompute degree within kept set
    deg: dict[str, int] = {n: 0 for n in keep}
    for e in edges:
        deg[e["source"]] += e["weight"]
        deg[e["target"]] += e["weight"]

    nodes = []
    for row in top_rows:
        rec = dict(zip(top_cols, row))
        nconst = rec["nconst"]
        if nconst not in keep:
            continue
        node = {
            "id": nconst,
            "label": rec["label"],
            "type": "person",
            "gender": rec.get("gender") or "unknown",
            "degree": deg.get(nconst, 0),
        }
        for col, val in rec.items():
            if col in ("nconst", "label", "gender", "degree"):
                continue
            if val is None:
                continue
            if isinstance(val, float):
                node[col] = round(val, 3)
            else:
                node[col] = int(val) if col.startswith("year") else val
        nodes.append(node)

    attach_prominent_roles(con, nodes, limit=6)
    return nodes, edges


def _parse_character(raw: str | None) -> str | None:
    """IMDb characters look like [\"Name\"] or [\"Name (voice)\"]."""
    if not raw:
        return None
    import re

    m = re.findall(r'"([^"]+)"', raw)
    if not m:
        # bare string fallback
        s = raw.strip().strip("[]")
        return s or None
    name = m[0]
    name = re.sub(r"\s*\(voice\)\s*", "", name, flags=re.I).strip()
    return name or None


def attach_shared_titles(
    con: duckdb.DuckDBPyConnection,
    edges: list[dict],
    *,
    limit: int = 3,
) -> None:
    """Attach example shared titles to each edge so charts can explain the link."""
    if not edges:
        return
    pairs = [(e["source"], e["target"]) for e in edges]
    con.execute("CREATE OR REPLACE TEMP TABLE _edge_pairs (source VARCHAR, target VARCHAR)")
    con.executemany("INSERT INTO _edge_pairs VALUES (?, ?)", pairs)

    rows = con.execute(
        f"""
        WITH shared_titles AS (
          SELECT DISTINCT
            ep.source,
            ep.target,
            t.tconst,
            t.primaryTitle AS title,
            t.startYear AS year,
            COALESCE(r.numVotes, 0) AS votes
          FROM _edge_pairs ep
          JOIN title_principals a
            ON a.nconst = ep.source AND a.category IN ('actor', 'actress')
          JOIN title_principals b
            ON b.nconst = ep.target AND b.tconst = a.tconst
           AND b.category IN ('actor', 'actress')
          JOIN title_basics t ON t.tconst = a.tconst
          LEFT JOIN title_ratings r ON r.tconst = a.tconst
        ),
        ranked AS (
          SELECT *,
            ROW_NUMBER() OVER (
              PARTITION BY source, target
              ORDER BY votes DESC, year DESC NULLS LAST
            ) AS rk
          FROM shared_titles
        )
        SELECT source, target, title, year, tconst, votes
        FROM ranked
        WHERE rk <= {int(limit)}
        ORDER BY source, target, rk
        """
    ).fetchall()

    by_pair: dict[tuple[str, str], list[dict]] = {}
    for source, target, title, year, tconst, votes in rows:
        by_pair.setdefault((source, target), []).append(
            {
                "title": title,
                "year": int(year) if year is not None else None,
                "tconst": tconst,
                "votes": int(votes) if votes is not None else 0,
            }
        )
    for e in edges:
        e["shared"] = by_pair.get((e["source"], e["target"]), [])


def attach_prominent_roles(
    con: duckdb.DuckDBPyConnection,
    nodes: list[dict],
    *,
    limit: int = 6,
) -> None:
    """Attach top billed roles (character + title + year) to each node in-place."""
    if not nodes:
        return
    ids = [n["id"] for n in nodes]
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _role_people AS
        SELECT * FROM UNNEST(?::VARCHAR[]) AS t(nconst)
        """,
        [ids],
    )
    # Rank by billing order (lower = more prominent), prefer named characters,
    # then by title votes as a soft prominence signal.
    rows = con.execute(
        f"""
        WITH ranked AS (
          SELECT
            p.nconst,
            t.primaryTitle AS title,
            t.startYear AS year,
            t.tconst,
            p.ordering,
            p.characters,
            COALESCE(r.numVotes, 0) AS votes,
            ROW_NUMBER() OVER (
              PARTITION BY p.nconst
              ORDER BY
                CASE WHEN p.characters IS NOT NULL AND p.characters != '' THEN 0 ELSE 1 END,
                p.ordering ASC NULLS LAST,
                COALESCE(r.numVotes, 0) DESC
            ) AS rk
          FROM title_principals p
          JOIN _role_people rp ON rp.nconst = p.nconst
          JOIN title_basics t ON t.tconst = p.tconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          WHERE p.category IN ('actor', 'actress')
            AND t.titleType IN ('movie', 'tvSeries', 'tvMovie', 'tvMiniSeries', 'short', 'video')
        )
        SELECT nconst, title, year, ordering, characters, votes, tconst
        FROM ranked
        WHERE rk <= {int(limit)}
        ORDER BY nconst, rk
        """
    ).fetchall()

    by_person: dict[str, list[dict]] = {}
    for nconst, title, year, ordering, characters, votes, tconst in rows:
        char = _parse_character(characters)
        role = {
            "title": title,
            "character": char,
            "year": int(year) if year is not None else None,
            "billing": int(ordering) if ordering is not None else None,
            "tconst": tconst,
            "votes": int(votes) if votes is not None else 0,
        }
        by_person.setdefault(nconst, []).append(role)

    for n in nodes:
        n["roles"] = by_person.get(n["id"], [])


def rows_to_stages(rows: list[tuple], cols: tuple[str, ...]) -> list[dict]:
    return [dict(zip(cols, r)) for r in rows]
