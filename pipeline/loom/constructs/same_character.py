"""Construct: Same-character club — characters played by 3+ distinct actors."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import (
    attach_prominent_roles,
    finalize_payload,
    recompute_degree_strength,
)
from loom.filters import adult_exclusion_sql, title_type_sql, vote_floor_sql
from loom.membership import (
    character_blocklist_sql,
    character_norm_sql,
    empty_payload_stats,
    same_character_keep_sql,
    same_character_seed_sql,
)
from loom.textnorm import ascii_fold


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    # Stricter vote floor — character matching is expensive; stay in popular titles
    votes = vote_floor_sql("r", min_votes=500)
    char_norm = character_norm_sql(
        "regexp_extract(COALESCE(p.characters, ''), '\"([^\"]+)\"', 1)"
    )
    blocklist = character_blocklist_sql("char_norm")
    seed_match = same_character_seed_sql("char_norm")
    keep_name = same_character_keep_sql("char_norm")

    # First character only (not full array explode) on high-vote titles
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _char_clean AS
        WITH raw AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            COALESCE(r.numVotes, 0) AS votes,
            LN(COALESCE(r.numVotes, 0) + 1) AS vote_w,
            {char_norm} AS char_norm,
            TRIM(REGEXP_REPLACE(
              regexp_extract(COALESCE(p.characters, ''), '"([^"]+)"', 1),
              '\\s*\\(voice\\)\\s*', '', 'i'
            )) AS char_display
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            AND p.characters IS NOT NULL AND p.characters LIKE '%"%'
            AND {types} AND {adult} AND {votes}
            AND t.titleType IN ('movie', 'tvMovie', 'tvMiniSeries', 'tvSeries')
        ),
        stripped AS (
          SELECT
            nconst, label, gender, votes, vote_w, char_display,
            CASE WHEN char_norm LIKE 'the %' THEN SUBSTRING(char_norm, 5) ELSE char_norm END
              AS char_norm
          FROM raw
          WHERE LENGTH(char_norm) BETWEEN 3 AND 40
            AND (
              {blocklist}
              OR {seed_match}
            )
        )
        SELECT *
        FROM stripped
        WHERE {keep_name}
        """
    )

    # Recompute seed match after "the " strip
    seed_match_clean = same_character_seed_sql("char_norm")
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE _multi AS
        WITH counts AS (
          SELECT
            char_norm,
            COUNT(DISTINCT nconst) AS actor_count,
            MAX(char_display) AS sample_display,
            MAX(CASE WHEN {seed_match_clean} THEN 1 ELSE 0 END) AS is_seed
          FROM _char_clean
          GROUP BY 1
        )
        SELECT char_norm, actor_count, sample_display, is_seed
        FROM counts
        WHERE (actor_count BETWEEN 3 AND 80)
           OR (is_seed = 1 AND actor_count >= 2)
        ORDER BY is_seed DESC, actor_count DESC
        LIMIT 400
        """
    )

    person_rows = con.execute(
        f"""
        WITH scored AS (
          SELECT
            c.nconst,
            ANY_VALUE(c.label) AS label,
            ANY_VALUE(c.gender) AS gender,
            COUNT(DISTINCT c.char_norm) AS shared_character_count,
            SUM(c.vote_w) AS prominence,
            ARG_MAX(m.sample_display, m.actor_count + 1000 * m.is_seed)
              AS top_shared_character
          FROM _char_clean c
          JOIN _multi m ON m.char_norm = c.char_norm
          GROUP BY c.nconst
        ),
        ranked AS (
          SELECT *,
            RANK() OVER (ORDER BY shared_character_count DESC) AS rk_chars,
            RANK() OVER (ORDER BY prominence DESC) AS rk_prom
          FROM scored
        )
        SELECT
          nconst, label, gender, shared_character_count, prominence,
          top_shared_character, (rk_chars + rk_prom) AS blend_rank
        FROM ranked
        ORDER BY (rk_chars + rk_prom) ASC, prominence DESC
        LIMIT {int(top_n * 3)}
        """
    ).fetchall()

    if not person_rows:
        return finalize_payload(
            con,
            construct_id="same_character",
            title="The Same Character Club",
            subtitle="Franchise roles & multi-word names worn by 3+ faces",
            key_variable="top_shared_character",
            method_note="No multi-cast characters found under filters.",
            nodes=[],
            edges=[],
            stages=[],
            build_stats=empty_payload_stats(
                reason="no_multi_cast_characters", enrichment_mode="empty"
            ),
            extra={"top_n": top_n},
        )

    # Cap by blend: already ordered by blend_rank
    ranked = person_rows[:top_n]
    keep = {r[0] for r in ranked}
    con.execute(
        "CREATE OR REPLACE TEMP TABLE _keep AS SELECT * FROM UNNEST(?::VARCHAR[]) AS t(nconst)",
        [list(keep)],
    )

    edge_rows = con.execute(
        """
        SELECT
          LEAST(a.nconst, b.nconst) AS source,
          GREATEST(a.nconst, b.nconst) AS target,
          COUNT(*) AS weight,
          ARG_MAX(m.sample_display, m.actor_count + 1000 * m.is_seed) AS character
        FROM (
          SELECT DISTINCT c.nconst, c.char_norm
          FROM _char_clean c
          JOIN _keep k ON k.nconst = c.nconst
          JOIN _multi m ON m.char_norm = c.char_norm
        ) a
        JOIN (
          SELECT DISTINCT c.nconst, c.char_norm
          FROM _char_clean c
          JOIN _keep k ON k.nconst = c.nconst
          JOIN _multi m ON m.char_norm = c.char_norm
        ) b ON a.char_norm = b.char_norm AND a.nconst < b.nconst
        JOIN _multi m ON m.char_norm = a.char_norm
        GROUP BY 1, 2
        """
    ).fetchall()

    edges = []
    for s, t, w, character in edge_rows:
        shared_names = max(int(w or 1), 1)
        edges.append(
            {
                "source": s,
                "target": t,
                # Weight = count of distinct shared character_norms (not log-vote score).
                "weight": shared_names,
                "shared_count": shared_names,
                "construct": "same_character",
                "character": character or "shared role",
            }
        )

    nodes = []
    for nconst, label, gender, scount, prominence, top_char, _blend in ranked:
        nodes.append(
            {
                "id": nconst,
                "label": label,
                "label_ascii": ascii_fold(label),
                "type": "person",
                "gender": gender or "unknown",
                "degree": 0,
                "strength": 0,
                "shared_character_count": int(scount or 0),
                "top_shared_character": top_char,
                "prominence": float(prominence or 0),
            }
        )
    recompute_degree_strength(nodes, edges)

    attach_prominent_roles(con, nodes, limit=6)
    multi_n = con.execute("SELECT COUNT(*) FROM _multi").fetchone()[0]

    return finalize_payload(
        con,
        construct_id="same_character",
        title="The Same Character Club",
        subtitle="Franchise roles & multi-word names worn by 3+ faces",
        key_variable="top_shared_character",
        method_note=(
            "Population: actors who share a normalized primary character name played by "
            "3–80 distinct people on titles with ≥500 votes (Adult excluded). "
            "Keeps curated franchise seeds (Batman, Bond, Holmes…) and multi-word names "
            "(Sherlock Holmes, Santa Claus…); drops single common given-name collisions "
            "(Ginger, Louie…). Matching is still string identity, not a canonical character graph. "
            "Edge weight = number of shared character_norms. "
            "Top_n capped by blend of shared-character count + prominence ranks."
        ),
        nodes=nodes,
        edges=edges,
        stages=[],
        build_stats={
            "multi_cast_characters": int(multi_n),
            "population_sql": len(person_rows),
            "after_degree_cap": len(nodes),
            "cap_by": "blend",
            "enrichment_mode": "character_norm",
            "fallback_used": False,
        },
        extra={"top_n": top_n, "min_actors_per_character": 3},
    )
