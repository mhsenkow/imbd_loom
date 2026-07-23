"""Construct: Typecast index — most-repeated character name ≥4 times."""

from __future__ import annotations

from collections import defaultdict

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import (
    coappearance_edges,
    finalize_payload,
    recompute_degree_strength,
)
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql
from loom.membership import (
    character_blocklist_sql,
    character_norm_sql,
    empty_payload_stats,
)


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    char_norm = character_norm_sql("char_name")
    blocklist = character_blocklist_sql("char_norm")

    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _tc_raw AS
        SELECT
          p.nconst,
          n.primaryName AS label,
          {ge} AS gender,
          {char_norm} AS char_norm,
          TRIM(REGEXP_REPLACE(char_name, '\\s*\\(voice\\)\\s*', '', 'i')) AS char_display,
          COALESCE(r.numVotes, 0) AS votes,
          LN(COALESCE(r.numVotes, 0) + 1) AS vote_w
        FROM title_principals p
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst,
        UNNEST(regexp_extract_all(COALESCE(p.characters, ''), '"([^"]+)"')) AS u(char_name)
        WHERE p.category IN ('actor', 'actress')
          AND p.characters IS NOT NULL AND p.characters != ''
          AND {types} AND {adult} AND {votes}
        """
    )

    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _tc_clean AS
        SELECT
          nconst, label, gender, votes, vote_w,
          CASE WHEN char_norm LIKE 'the %' THEN SUBSTRING(char_norm, 5) ELSE char_norm END
            AS char_norm,
          char_display
        FROM _tc_raw
        WHERE {blocklist}
          AND LENGTH(char_norm) >= 2
        """
    )

    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _typecast_seed AS
        WITH counts AS (
          SELECT
            nconst, label, gender, char_norm,
            COUNT(*) AS typecast_count,
            SUM(vote_w) AS prominence,
            MAX(char_display) AS typecast_character
          FROM _tc_clean
          GROUP BY 1, 2, 3, 4
        ),
        best AS (
          SELECT *,
            ROW_NUMBER() OVER (
              PARTITION BY nconst ORDER BY typecast_count DESC, prominence DESC, char_norm
            ) AS rk
          FROM counts
        )
        SELECT
          nconst, label, gender,
          typecast_character, char_norm AS typecast_norm,
          typecast_count,
          prominence
        FROM best
        WHERE rk = 1 AND typecast_count >= 4
        ORDER BY prominence DESC, typecast_count DESC
        LIMIT {int(top_n * 3)}
        """
    )

    n_seed = con.execute("SELECT COUNT(*) FROM _typecast_seed").fetchone()[0]
    if not n_seed:
        return finalize_payload(
            con,
            construct_id="typecast",
            title="The Typecast Index",
            subtitle="careers defined by a repeated character name",
            key_variable="typecast_character",
            method_note="No people with a character name repeated ≥4 times under filters.",
            nodes=[],
            edges=[],
            stages=[],
            build_stats=empty_payload_stats(
                reason="no_typecast_repeats", enrichment_mode="empty"
            ),
            extra={"top_n": top_n},
        )

    person_sql = """
        SELECT * FROM _typecast_seed
        ORDER BY prominence DESC, typecast_count DESC
    """
    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="typecast",
        top_n=top_n,
        min_shared=2,
        cap_by="blend",
        enrichment_mode="character_norm",
    )

    by_arch: dict[str, list[str]] = defaultdict(list)
    display: dict[str, str] = {}
    for n in nodes:
        arch = n.get("typecast_norm")
        if arch:
            by_arch[str(arch)].append(n["id"])
            if n.get("typecast_character"):
                display[str(arch)] = n["typecast_character"]

    existing = {(e["source"], e["target"]) for e in edges}
    for arch, ids in by_arch.items():
        if len(ids) < 2:
            continue
        ids = sorted(ids)
        for i, a in enumerate(ids):
            for b in ids[i + 1 : i + 4]:
                if (a, b) in existing:
                    continue
                edges.append(
                    {
                        "source": a,
                        "target": b,
                        "weight": 2,
                        "construct": "typecast",
                        "edge_kind": "shared_archetype",
                        "character": display.get(arch, arch),
                    }
                )
                existing.add((a, b))

    recompute_degree_strength(nodes, edges)
    stats.pop("analytics", None)

    method = (
        "Population: actors whose most common normalized character name appears "
        "≥4 times (Adult excluded, numVotes ≥50; shared character_norm + blocklist). "
        "Edges = co-appearance plus shared typecast archetype links. Cap by blend."
    )
    return finalize_payload(
        con,
        construct_id="typecast",
        title="The Typecast Index",
        subtitle="careers defined by a repeated character name",
        key_variable="typecast_character",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=[],
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_character_repeats": 4},
    )
