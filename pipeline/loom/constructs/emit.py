"""Shared emission helpers: co-appearance edges, stage tables, JSON write."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
from rich.console import Console

from loom import BUILD_SEED, OUT
from loom.analytics import attach_analytics, decade_edge_slices, simple_layout_2d
from loom.constructs import gender_source_flags
from loom.db import dataset_snapshot_meta
from loom.facets import attach_known_for_titles, attach_person_facets
from loom.filters import (
    DEFAULT_MIN_VOTES,
    adult_exclusion_sql,
    title_type_sql,
    vote_floor_sql,
)
from loom.stages_default import stages_from_nodes
from loom.textnorm import ascii_fold, display_character

console = Console()


def write_construct(construct_id: str, payload: dict[str, Any]) -> Path:
    dest = OUT / construct_id
    dest.mkdir(parents=True, exist_ok=True)

    def _json_default(o: Any) -> Any:
        from decimal import Decimal

        if isinstance(o, Decimal):
            return float(o)
        if hasattr(o, "item"):
            try:
                return o.item()
            except Exception:
                pass
        raise TypeError(f"Object of type {o.__class__.__name__} is not JSON serializable")

    # Deterministic key order for stable diffs
    for name in ("nodes", "edges", "stages", "manifest", "summary", "quality", "era_slices"):
        if name not in payload:
            continue
        path = dest / f"{name}.json"
        data = payload[name]
        if name == "nodes":
            data = sorted(data, key=lambda n: (-(n.get("degree") or 0), n.get("id") or ""))
        elif name == "edges":
            data = sorted(
                data,
                key=lambda e: (
                    e.get("source") or "",
                    e.get("target") or "",
                    -(e.get("weight") or 0),
                ),
            )
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                data,
                f,
                indent=2,
                ensure_ascii=False,
                sort_keys=name == "manifest",
                default=_json_default,
            )
        console.print(f"  wrote {path.relative_to(OUT.parent.parent)} ({_size(path)})")
    return dest


def _size(path: Path) -> str:
    n = path.stat().st_size
    if n < 1024:
        return f"{n} B"
    if n < 1e6:
        return f"{n / 1024:.1f} KB"
    return f"{n / 1e6:.1f} MB"


def validate_construct(nodes: list[dict], edges: list[dict]) -> list[str]:
    """Schema / integrity checks. Returns list of warnings (empty = ok)."""
    warnings: list[str] = []
    ids = {n.get("id") for n in nodes}
    for n in nodes:
        if not n.get("id") or not n.get("label"):
            warnings.append("node missing id/label")
            break
        if n.get("degree") is not None and (
            isinstance(n["degree"], float) and math.isnan(n["degree"])
        ):
            warnings.append(f"NaN degree on {n.get('id')}")
    for e in edges:
        if e.get("source") not in ids or e.get("target") not in ids:
            warnings.append(f"edge endpoint missing: {e.get('source')}–{e.get('target')}")
            break
        w = e.get("weight")
        if w is None or (isinstance(w, (int, float)) and w < 1):
            warnings.append(f"edge weight < 1: {e.get('source')}–{e.get('target')}")
            break
    return warnings


def quality_report(nodes: list[dict], edges: list[dict]) -> dict:
    n = max(len(nodes), 1)
    missing_birth = sum(1 for x in nodes if not x.get("birth_year"))
    unknown_gender = sum(1 for x in nodes if (x.get("gender") or "unknown") == "unknown")
    with_votes = sum(1 for x in nodes if (x.get("prominence") or 0) > 0)
    edges_with_year = sum(1 for e in edges if e.get("year") is not None)
    return {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "missing_birth_year_pct": round(100 * missing_birth / n, 1),
        "gender_unknown_pct": round(100 * unknown_gender / n, 1),
        "prominence_coverage_pct": round(100 * with_votes / n, 1),
        "edges_with_year_pct": round(100 * edges_with_year / max(len(edges), 1), 1),
    }


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
    build_stats: dict | None = None,
    analytics: dict | None = None,
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
        "data_credit": (
            "IMDb Non-Commercial Datasets (datasets.imdbws.com); "
            "gender enrichment via TMDB where available; "
            "voice flags via Wikidata + IMDb character heuristics; "
            "Bechdel ratings where matched."
        ),
        "build_seed": BUILD_SEED,
        **dataset_snapshot_meta(),
        **flags,
    }
    if build_stats:
        m["build_stats"] = build_stats
    if analytics:
        for k in (
            "clustering_coefficient",
            "avg_path_length",
            "community_count",
            "featured_path",
            "summary",
        ):
            if k in analytics:
                m[k] = analytics[k]
    if extra:
        m.update(extra)
    return m


def _has_table(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    try:
        con.execute(f"SELECT 1 FROM {name} LIMIT 1")
        return True
    except Exception:
        return False


def coappearance_edges(
    con: duckdb.DuckDBPyConnection,
    person_filter_sql: str,
    *,
    construct: str,
    top_n: int = 200,
    min_shared: int = 2,
    min_votes: int = DEFAULT_MIN_VOTES,
    prominence_weight: bool = True,
    attach_facets: bool = True,
    attach_graph_analytics: bool = True,
    collapse_episodes: bool = True,
) -> tuple[list[dict], list[dict], dict]:
    """
    Build undirected co-appearance edges among people matching person_filter_sql.

    Returns (nodes, edges, build_stats).
    """
    build_stats: dict[str, Any] = {"min_votes": min_votes, "min_shared": min_shared}

    con.execute(f"CREATE OR REPLACE TEMP TABLE _people AS {person_filter_sql}")
    pop0 = con.execute("SELECT COUNT(*) FROM _people").fetchone()[0]
    build_stats["population_sql"] = int(pop0)

    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=min_votes)

    # Credit grain: collapse episodes → parent series when episode table exists
    has_ep = collapse_episodes and _has_table(con, "title_episode")
    if has_ep:
        credit_sql = f"""
        CREATE OR REPLACE TEMP TABLE _credits AS
        SELECT DISTINCT
          p.nconst,
          COALESCE(ep.parentTconst, p.tconst) AS title_key,
          p.tconst AS raw_tconst,
          t.startYear,
          t.genres,
          COALESCE(r.numVotes, 0) AS votes,
          LN(COALESCE(r.numVotes, 0) + 1) AS vote_w
        FROM title_principals p
        JOIN _people pe ON pe.nconst = p.nconst
        JOIN title_basics t ON t.tconst = p.tconst
        LEFT JOIN title_episode ep ON ep.tconst = p.tconst
        LEFT JOIN title_ratings r ON r.tconst = COALESCE(ep.parentTconst, p.tconst)
        WHERE p.category IN ('actor', 'actress')
          AND {types}
          AND {adult}
          AND {votes}
          AND t.startYear IS NOT NULL
        """
    else:
        credit_sql = f"""
        CREATE OR REPLACE TEMP TABLE _credits AS
        SELECT DISTINCT
          p.nconst,
          p.tconst AS title_key,
          p.tconst AS raw_tconst,
          t.startYear,
          t.genres,
          COALESCE(r.numVotes, 0) AS votes,
          LN(COALESCE(r.numVotes, 0) + 1) AS vote_w
        FROM title_principals p
        JOIN _people pe ON pe.nconst = p.nconst
        JOIN title_basics t ON t.tconst = p.tconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        WHERE p.category IN ('actor', 'actress')
          AND {types}
          AND {adult}
          AND {votes}
          AND t.startYear IS NOT NULL
        """
    con.execute(credit_sql)
    build_stats["credit_rows"] = int(con.execute("SELECT COUNT(*) FROM _credits").fetchone()[0])

    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _years AS
        SELECT
          nconst,
          MIN(startYear) AS year_min,
          MAX(startYear) AS year_max,
          CAST(ROUND(AVG(startYear)) AS INTEGER) AS year_peak
        FROM _credits
        WHERE startYear BETWEEN 1920 AND 2030
        GROUP BY 1
        """
    )

    weight_expr = (
        "CAST(ROUND(SUM(LN(a.votes + 1))) AS INTEGER)"
        if prominence_weight
        else "COUNT(DISTINCT a.title_key)"
    )
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _edges AS
        SELECT
          LEAST(a.nconst, b.nconst) AS source,
          GREATEST(a.nconst, b.nconst) AS target,
          COUNT(DISTINCT a.title_key) AS shared_count,
          {weight_expr} AS weight,
          CAST(ROUND(AVG(a.startYear)) AS INTEGER) AS year,
          MIN(a.startYear) AS first_worked_together,
          MAX(a.startYear) AS last_worked_together,
          STRING_AGG(DISTINCT a.genres, '|') AS genre_blob
        FROM (
          SELECT DISTINCT nconst, title_key, startYear, votes, genres FROM _credits
        ) a
        JOIN (
          SELECT DISTINCT nconst, title_key FROM _credits
        ) b ON a.title_key = b.title_key AND a.nconst < b.nconst
        GROUP BY 1, 2
        HAVING COUNT(DISTINCT a.title_key) >= ?
        """,
        [min_shared],
    )

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
        ORDER BY COALESCE(d.degree, 0) DESC, pe.nconst
        LIMIT {int(top_n)}
        """
    ).fetchall()
    top_cols = [d[0] for d in con.description]
    keep = {r[top_cols.index("nconst")] for r in top_rows}
    build_stats["after_degree_cap"] = len(keep)

    edge_rows = con.execute(
        """
        SELECT source, target, weight, shared_count, year,
               first_worked_together, last_worked_together, genre_blob
        FROM _edges
        """
    ).fetchall()

    edges: list[dict] = []
    for s, t, w, shared, yr, first, last, genre_blob in edge_rows:
        if s not in keep or t not in keep:
            continue
        genres: list[str] = []
        if genre_blob:
            seen = set()
            for part in str(genre_blob).replace("|", ",").split(","):
                g = part.strip()
                if g and g not in seen:
                    seen.add(g)
                    genres.append(g)
        edge = {
            "source": s,
            "target": t,
            "weight": max(int(w or 1), 1),
            "shared_count": int(shared or 0),
            "construct": construct,
        }
        if yr is not None:
            edge["year"] = int(yr)
        if first is not None:
            edge["first_worked_together"] = int(first)
        if last is not None:
            edge["last_worked_together"] = int(last)
        if first is not None and last is not None and int(last) - int(first) >= 20:
            edge["reunion"] = True
            edge["reunion_gap"] = int(last) - int(first)
        if genres:
            edge["genres"] = genres[:8]
        edges.append(edge)

    attach_shared_titles(con, edges, limit=3)

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
            "label_ascii": ascii_fold(rec["label"]),
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
            elif col.startswith("year"):
                node[col] = int(val)
            else:
                node[col] = val
        nodes.append(node)

    attach_prominent_roles(con, nodes, limit=6)

    analytics: dict = {}
    if attach_facets:
        facet_stats = attach_person_facets(con, nodes, min_votes=min_votes)
        attach_known_for_titles(con, nodes)
        build_stats.update(facet_stats)
    if attach_graph_analytics and nodes and edges:
        analytics = attach_analytics(nodes, edges)
        simple_layout_2d(nodes, edges, seed=BUILD_SEED)
        build_stats["era_slices"] = len(decade_edge_slices(edges))

    warnings = validate_construct(nodes, edges)
    if warnings:
        build_stats["validation_warnings"] = warnings
        for w in warnings[:3]:
            console.print(f"  [yellow]validate[/yellow] {w}")

    build_stats["analytics"] = analytics
    return nodes, edges, build_stats


def finalize_payload(
    con: duckdb.DuckDBPyConnection,
    *,
    construct_id: str,
    title: str,
    subtitle: str,
    key_variable: str,
    method_note: str,
    nodes: list[dict],
    edges: list[dict],
    stages: list[dict],
    build_stats: dict | None = None,
    extra: dict | None = None,
) -> dict:
    """Package construct with analytics / quality / era slices."""
    if not stages and nodes:
        stages = stages_from_nodes(nodes)
        if build_stats is not None:
            build_stats["stages_source"] = "default_from_nodes"

    analytics = (build_stats or {}).pop("analytics", None) or {}
    if not analytics and nodes and edges:
        analytics = attach_analytics(nodes, edges)
        simple_layout_2d(nodes, edges, seed=BUILD_SEED)

    manifest = make_manifest(
        con,
        construct_id=construct_id,
        title=title,
        subtitle=subtitle,
        key_variable=key_variable,
        method_note=method_note,
        nodes=nodes,
        edges=edges,
        stages=stages,
        extra=extra,
        build_stats={k: v for k, v in (build_stats or {}).items() if k != "analytics"},
        analytics=analytics,
    )
    payload = {
        "nodes": nodes,
        "edges": edges,
        "stages": stages,
        "manifest": manifest,
        "summary": analytics.get("summary") or {},
        "quality": quality_report(nodes, edges),
        "era_slices": decade_edge_slices(edges),
    }
    return payload


def _parse_character(raw: str | None) -> str | None:
    return display_character(raw)


def attach_shared_titles(
    con: duckdb.DuckDBPyConnection,
    edges: list[dict],
    *,
    limit: int = 3,
) -> None:
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
            AND COALESCE(t.isAdult, 0) = 0
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
        # Parse ALL characters from the JSON-ish array
        chars_all = []
        if characters:
            import re

            chars_all = re.findall(r'"([^"]+)"', characters)
        role = {
            "title": title,
            "character": char,
            "characters": chars_all or ([char] if char else []),
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
