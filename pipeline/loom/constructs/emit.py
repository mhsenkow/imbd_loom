"""Shared emission helpers: co-appearance edges, stage tables, JSON write."""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb
from rich.console import Console

from loom import BUILD_SEED, METRICS_VERSION, OUT
from loom.analytics import (
    attach_analytics,
    decade_edge_slices,
    enrich_edge_metrics,
    simple_layout_2d,
)
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


def recompute_degree_strength(nodes: list[dict], edges: list[dict]) -> None:
    """Set degree = neighbor count and strength = Σ weights on the given edge list."""
    ids = {n["id"] for n in nodes}
    neighbors: dict[str, set[str]] = {i: set() for i in ids}
    strength: dict[str, float] = {i: 0.0 for i in ids}
    for e in edges:
        a, b = e["source"], e["target"]
        if a not in ids or b not in ids or a == b:
            continue
        neighbors[a].add(b)
        neighbors[b].add(a)
        w = float(e.get("weight") or 0)
        strength[a] += w
        strength[b] += w
    for n in nodes:
        nid = n["id"]
        n["degree"] = len(neighbors.get(nid, ()))
        n["strength"] = int(round(strength.get(nid, 0)))


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
        for key in ("degree", "strength"):
            v = n.get(key)
            if v is not None and isinstance(v, float) and math.isnan(v):
                warnings.append(f"NaN {key} on {n.get('id')}")
        deg = n.get("degree")
        strength = n.get("strength")
        if isinstance(deg, (int, float)) and isinstance(strength, (int, float)):
            if strength + 1e-9 < deg and deg > 0:
                # strength is weighted sum; with min weight 1, strength >= degree
                if strength < deg:
                    warnings.append(f"strength < degree on {n.get('id')}")
                    break
        for pk in (
            "degree_pct",
            "strength_pct",
            "prominence_pct",
            "pagerank_pct",
            "prominence_pct_construct",
        ):
            pv = n.get(pk)
            if isinstance(pv, (int, float)) and (pv < 0 or pv > 100):
                warnings.append(f"{pk} out of range on {n.get('id')}: {pv}")
                break
    for e in edges:
        if e.get("source") not in ids or e.get("target") not in ids:
            warnings.append(f"edge endpoint missing: {e.get('source')}–{e.get('target')}")
            break
        w = e.get("weight")
        if w is None or (isinstance(w, (int, float)) and w < 1):
            warnings.append(f"edge weight < 1: {e.get('source')}–{e.get('target')}")
            break
        rs = e.get("reunion_span")
        if isinstance(rs, (int, float)) and rs < 0:
            warnings.append(f"reunion_span < 0: {e.get('source')}–{e.get('target')}")
            break
        j = e.get("edge_genre_jaccard")
        if isinstance(j, (int, float)) and (j < 0 or j > 1):
            warnings.append(f"edge_genre_jaccard out of range: {e.get('source')}–{e.get('target')}")
            break
    return warnings


def quality_report(
    nodes: list[dict],
    edges: list[dict],
    *,
    gender_method: str | None = None,
    tmdb_gender_rows: int | None = None,
    validation_warnings: list[str] | None = None,
    imdb_snapshot_as_of: str | None = None,
    construct_id: str | None = None,
) -> dict:
    n = max(len(nodes), 1)
    missing_birth = sum(1 for x in nodes if not x.get("birth_year"))
    unknown_gender = sum(1 for x in nodes if (x.get("gender") or "unknown") == "unknown")
    with_votes = sum(1 for x in nodes if (x.get("prominence") or 0) > 0)
    edges_with_year = sum(1 for e in edges if e.get("year") is not None)
    # Enrichment coverage proxies from node facets when present
    with_tmdb_signal = sum(
        1
        for x in nodes
        if x.get("tmdb_id") is not None
        or (x.get("gender") and (x.get("gender") or "unknown") != "unknown" and gender_method and "tmdb" in gender_method)
    )
    voice_flagged = sum(1 for x in nodes if x.get("is_voice") or x.get("voice_role"))
    bechdel_matched = sum(
        1 for x in nodes if x.get("bechdel_pass") is not None or x.get("bechdel_titles")
    )
    report: dict = {
        "node_count": len(nodes),
        "edge_count": len(edges),
        "missing_birth_year_pct": round(100 * missing_birth / n, 1),
        "gender_unknown_pct": round(100 * unknown_gender / n, 1),
        "prominence_coverage_pct": round(100 * with_votes / n, 1),
        "edges_with_year_pct": round(100 * edges_with_year / max(len(edges), 1), 1),
    }
    if gender_method:
        report["gender_method"] = gender_method
    if tmdb_gender_rows is not None:
        report["tmdb_gender_rows"] = tmdb_gender_rows
        report["tmdb_coverage_pct"] = round(100 * min(tmdb_gender_rows, n) / n, 1) if n else 0.0
    elif with_tmdb_signal:
        report["tmdb_coverage_pct"] = round(100 * with_tmdb_signal / n, 1)
    if voice_flagged:
        report["voice_flag_source"] = "wikidata_or_heuristic"
        report["voice_flagged_pct"] = round(100 * voice_flagged / n, 1)
    if construct_id == "bechdel" or bechdel_matched:
        report["bechdel_matched_pct"] = round(100 * bechdel_matched / n, 1) if bechdel_matched else 0.0
    if validation_warnings is not None:
        report["validation_warnings"] = list(validation_warnings)
    if imdb_snapshot_as_of:
        report["imdb_snapshot_as_of"] = imdb_snapshot_as_of
    return report


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
        "metrics_version": METRICS_VERSION,
        **dataset_snapshot_meta(),
        **flags,
    }
    if build_stats:
        m["build_stats"] = build_stats
    if analytics:
        for k in (
            "clustering_coefficient",
            "avg_path_length",
            "avg_path_sample_n",
            "avg_path_length_sampled",
            "community_count",
            "featured_path",
            "summary",
            "correlations",
            "insight",
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
    cap_by: str = "blend",
    enrichment_mode: str = "imdb",
    fallback_used: bool = False,
    force_ids: list[str] | None = None,
) -> tuple[list[dict], list[dict], dict]:
    """
    Build undirected co-appearance edges among people matching person_filter_sql.

    cap_by: 'strength' | 'prominence' | 'blend' — how the final top_n keep-set is chosen.
    force_ids: nconsts that must survive the final cap when present in the pool.
    Returns (nodes, edges, build_stats).
    """
    if cap_by not in ("strength", "prominence", "blend"):
        raise ValueError(f"cap_by must be strength|prominence|blend, got {cap_by!r}")

    build_stats: dict[str, Any] = {
        "min_votes": min_votes,
        "min_shared": min_shared,
        "cap_by": cap_by,
        "enrichment_mode": enrichment_mode,
        "fallback_used": bool(fallback_used),
    }

    con.execute(f"CREATE OR REPLACE TEMP TABLE _people AS {person_filter_sql}")
    pop0 = con.execute("SELECT COUNT(*) FROM _people").fetchone()[0]
    build_stats["population_sql"] = int(pop0)
    build_stats["pool_size"] = int(pop0)

    adult = adult_exclusion_sql("t")
    # When collapsing episodes, include tvEpisode so parent rollup actually fires.
    if collapse_episodes and _has_table(con, "title_episode"):
        types = title_type_sql(
            "t",
            types=("movie", "tvSeries", "tvMovie", "tvMiniSeries", "tvEpisode", "short", "video"),
        )
    else:
        types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=min_votes)

    # Credit grain: collapse episodes → parent series when episode table exists
    has_ep = collapse_episodes and _has_table(con, "title_episode")
    build_stats["collapse_episodes"] = bool(has_ep)
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
          MIN(a.startYear) AS year_min,
          MAX(a.startYear) AS year_max,
          MIN(a.startYear) AS first_worked_together,
          MAX(a.startYear) AS last_worked_together,
          MAX(a.votes) AS shared_votes_max,
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
        SELECT
          nconst,
          SUM(w) AS strength,
          COUNT(*) AS degree
        FROM (
          SELECT source AS nconst, weight AS w FROM _edges
          UNION ALL
          SELECT target AS nconst, weight AS w FROM _edges
        ) GROUP BY 1
        """
    )
    # Person prominence from credit vote mass (independent of graph strength).
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _prom AS
        SELECT nconst, SUM(vote_w) AS prominence
        FROM _credits
        GROUP BY 1
        """
    )
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _ranked AS
        SELECT
          pe.*,
          COALESCE(d.strength, 0) AS strength,
          COALESCE(d.degree, 0) AS degree,
          y.year_min,
          y.year_max,
          y.year_peak,
          COALESCE(pr.prominence, 0) AS _cap_prominence,
          RANK() OVER (ORDER BY COALESCE(d.strength, 0) DESC) AS rk_strength,
          RANK() OVER (ORDER BY COALESCE(pr.prominence, 0) DESC) AS rk_prominence
        FROM _people pe
        LEFT JOIN _deg d ON d.nconst = pe.nconst
        LEFT JOIN _years y ON y.nconst = pe.nconst
        LEFT JOIN _prom pr ON pr.nconst = pe.nconst
        """
    )
    if cap_by == "strength":
        order_sql = "strength DESC, nconst"
    elif cap_by == "prominence":
        order_sql = "_cap_prominence DESC, strength DESC, nconst"
    else:
        order_sql = "(rk_strength + rk_prominence) ASC, strength DESC, nconst"
    top_rows = con.execute(
        f"""
        SELECT * FROM _ranked
        ORDER BY {order_sql}
        LIMIT {int(top_n)}
        """
    ).fetchall()
    top_cols = [d[0] for d in con.description]
    keep = {r[top_cols.index("nconst")] for r in top_rows}
    # Force-seed canaries / reserved ids that are in the pool but fell out of the cap
    if force_ids:
        forced = [fid for fid in force_ids if fid]
        if forced:
            in_pool = {
                r[0]
                for r in con.execute(
                    "SELECT nconst FROM _people WHERE nconst IN (SELECT * FROM UNNEST(?::VARCHAR[]))",
                    [forced],
                ).fetchall()
            }
            missing = [fid for fid in forced if fid in in_pool and fid not in keep]
            if missing:
                # Drop lowest-ranked keep members to make room
                ordered = [r[top_cols.index("nconst")] for r in top_rows]
                for fid in missing:
                    if len(keep) >= top_n and ordered:
                        drop = ordered.pop()
                        keep.discard(drop)
                    keep.add(fid)
                # Rebuild top_rows from keep
                top_rows = con.execute(
                    """
                    SELECT * FROM _ranked
                    WHERE nconst IN (SELECT * FROM UNNEST(?::VARCHAR[]))
                    """,
                    [list(keep)],
                ).fetchall()
                top_cols = [d[0] for d in con.description]
                build_stats["force_ids_applied"] = len(missing)
    build_stats["after_degree_cap"] = len(keep)
    build_stats["after_cap"] = len(keep)

    from datetime import datetime as _dt

    current_year = _dt.now().year
    edge_rows = con.execute(
        """
        SELECT source, target, weight, shared_count, year, year_min, year_max,
               first_worked_together, last_worked_together, shared_votes_max, genre_blob
        FROM _edges
        """
    ).fetchall()

    edges: list[dict] = []
    for s, t, w, shared, yr, ymin, ymax, first, last, votes_max, genre_blob in edge_rows:
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
        weight = max(int(w or 1), 1)
        shared_n = int(shared or 0)
        edge = {
            "source": s,
            "target": t,
            "weight": weight,
            "shared_count": shared_n,
            "collab_count": shared_n,
            "collab_strength": weight,
            "construct": construct,
            "shared_sample_cap": 3,
        }
        if yr is not None:
            edge["year"] = int(yr)
        if ymin is not None:
            edge["year_min"] = int(ymin)
        if ymax is not None:
            edge["year_max"] = int(ymax)
        if first is not None:
            edge["first_worked_together"] = int(first)
        if last is not None:
            edge["last_worked_together"] = int(last)
            edge["recency"] = max(0, current_year - int(last))
        if first is not None and last is not None:
            span = int(last) - int(first)
            edge["reunion_span"] = span
            if span >= 20:
                edge["reunion"] = True
                edge["reunion_gap"] = span
        if votes_max is not None:
            edge["shared_votes_max"] = int(votes_max)
        if genres:
            edge["genres"] = genres[:8]
        edges.append(edge)

    attach_shared_titles(con, edges, limit=3)

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
            "degree": 0,
            "strength": 0,
        }
        for col, val in rec.items():
            if col in ("nconst", "label", "gender", "degree", "strength"):
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

    # Recompute degree (neighbor count) and strength (weighted) on kept edges
    recompute_degree_strength(nodes, edges)

    attach_prominent_roles(con, nodes, limit=6)

    analytics: dict = {}
    if attach_facets:
        facet_stats = attach_person_facets(con, nodes, min_votes=min_votes)
        attach_known_for_titles(con, nodes)
        build_stats.update(facet_stats)
    enrich_edge_metrics(nodes, edges)
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
    stats = dict(build_stats or {})
    note = method_note
    if stats.get("fallback_used"):
        if not note.startswith("PROXY:"):
            note = f"PROXY: {note}"
        warnings = list(stats.get("validation_warnings") or [])
        warnings.append("fallback_used: construct population is a proxy — not the semantic ideal")
        stats["validation_warnings"] = warnings
    if not stages and nodes:
        stages = stages_from_nodes(nodes)
        stats["stages_source"] = "default_from_nodes"

    analytics = stats.pop("analytics", None) or {}
    if not analytics and nodes and edges:
        analytics = attach_analytics(nodes, edges)
        simple_layout_2d(nodes, edges, seed=BUILD_SEED)

    manifest = make_manifest(
        con,
        construct_id=construct_id,
        title=title,
        subtitle=subtitle,
        key_variable=key_variable,
        method_note=note,
        nodes=nodes,
        edges=edges,
        stages=stages,
        extra=extra,
        build_stats={k: v for k, v in stats.items() if k != "analytics"},
        analytics=analytics,
    )
    snap_files = manifest.get("imdb_snapshot_files") or {}
    oldest_snap = min(snap_files.values()) if snap_files else None
    warnings = list(stats.get("validation_warnings") or [])
    quality = quality_report(
        nodes,
        edges,
        gender_method=manifest.get("gender_method"),
        tmdb_gender_rows=manifest.get("tmdb_gender_rows"),
        validation_warnings=warnings or None,
        imdb_snapshot_as_of=oldest_snap,
        construct_id=construct_id,
    )
    if stats.get("fallback_used"):
        quality["fallback_used"] = True
    if stats.get("enrichment_mode"):
        quality["enrichment_mode"] = stats["enrichment_mode"]
    payload = {
        "nodes": nodes,
        "edges": edges,
        "stages": stages,
        "manifest": manifest,
        "summary": analytics.get("summary") or {},
        "quality": quality,
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
