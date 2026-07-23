"""Construct: National cinema bridges — credits across ≥2 production regions."""

from __future__ import annotations

import duckdb

from loom.constructs import gender_expr
from loom.constructs.emit import coappearance_edges, finalize_payload
from loom.filters import adult_exclusion_sql, genre_contains_sql, title_type_sql, vote_floor_sql
from loom.membership import empty_payload_stats, rank_prominence_sql, wikidata_warm

# Production-region allowlist — exclude dub-market spam codes (XWW, XEU, …).
REGION_ALLOWLIST = (
    "US",
    "GB",
    "FR",
    "IN",
    "JP",
    "DE",
    "IT",
    "ES",
    "KR",
    "CN",
    "HK",
    "TW",
    "BR",
    "MX",
    "AU",
    "CA",
    "SE",
    "DK",
    "NO",
    "FI",
    "NL",
    "BE",
    "AT",
    "CH",
    "IE",
    "NZ",
    "PT",
    "PL",
    "CZ",
    "HU",
    "RO",
    "RU",
    "TR",
    "AR",
    "CL",
    "CO",
    "PH",
    "TH",
    "ID",
    "MY",
    "SG",
    "ZA",
    "NG",
    "EG",
    "IL",
    "IR",
    "GR",
)


def _has_table(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    try:
        con.execute(f"SELECT 1 FROM {name} LIMIT 1")
        return True
    except Exception:
        return False


def build(con: duckdb.DuckDBPyConnection, top_n: int = 200) -> dict:
    ge = gender_expr("p")
    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")
    votes = vote_floor_sql("r", min_votes=50)
    prom = rank_prominence_sql("r")
    anim = genre_contains_sql("t", "Animation")
    allow = ", ".join(f"'{r}'" for r in REGION_ALLOWLIST)
    wd_nat = wikidata_warm(con, column="nationality")

    if not _has_table(con, "title_akas"):
        return finalize_payload(
            con,
            construct_id="national_bridges",
            title="National Cinema Bridges",
            subtitle="actors credited across ≥2 production regions",
            key_variable="region_count",
            method_note=(
                "EMPTY: title_akas missing — no production-region bridge population. "
                "No prolific-actor proxy."
            ),
            nodes=[],
            edges=[],
            stages=[],
            build_stats=empty_payload_stats(
                reason="title_akas_missing", enrichment_mode="empty"
            ),
            extra={"top_n": top_n},
        )

    wd_join = ""
    wd_select = "CAST(NULL AS VARCHAR) AS nationality,"
    wd_where = ""
    enrichment_mode = "akas_original_allowlist"
    if wd_nat:
        wd_join = "JOIN wikidata_people w ON w.nconst = p.nconst"
        wd_select = "MAX(w.nationality) AS nationality,"
        wd_where = (
            "AND w.nationality IS NOT NULL AND CAST(w.nationality AS VARCHAR) != ''"
        )
        enrichment_mode = "wikidata_nationality_plus_akas"

    # isOriginalTitle rows have null region — map original title text to an allowlist
    # region row for the same tconst, then keep one production region per title.
    person_sql = f"""
        WITH orig AS (
          SELECT tconst, title
          FROM title_akas
          WHERE COALESCE(isOriginalTitle, 0) = 1
        ),
        title_region AS (
          SELECT tconst, region
          FROM (
            SELECT
              a.tconst,
              a.region,
              ROW_NUMBER() OVER (
                PARTITION BY a.tconst
                ORDER BY a.ordering ASC NULLS LAST, a.region
              ) AS rk
            FROM title_akas a
            JOIN orig o ON o.tconst = a.tconst AND a.title = o.title
            WHERE a.region IS NOT NULL AND a.region != ''
              AND a.region IN ({allow})
          ) x
          WHERE rk = 1
        ),
        regions AS (
          SELECT
            p.nconst,
            n.primaryName AS label,
            {ge} AS gender,
            {wd_select}
            COUNT(DISTINCT p.tconst) AS title_count,
            COUNT(DISTINCT tr.region) AS region_count,
            STRING_AGG(DISTINCT tr.region, ',') AS regions,
            {prom} AS prominence,
            AVG(CASE WHEN {anim} THEN 1.0 ELSE 0.0 END) AS animation_share
          FROM title_principals p
          JOIN title_basics t ON t.tconst = p.tconst
          JOIN name_basics n ON n.nconst = p.nconst
          JOIN title_region tr ON tr.tconst = p.tconst
          {wd_join}
          LEFT JOIN title_ratings r ON r.tconst = p.tconst
          LEFT JOIN gender_enrich ge ON ge.nconst = p.nconst
          WHERE p.category IN ('actor', 'actress')
            {wd_where}
            AND {types} AND {adult} AND {votes}
          GROUP BY p.nconst, n.primaryName, ge.tmdb_gender, p.category
          HAVING COUNT(DISTINCT tr.region) >= 2
             AND COUNT(DISTINCT p.tconst) >= 5
             AND AVG(CASE WHEN {anim} THEN 1.0 ELSE 0.0 END) <= 0.7
        )
        SELECT * FROM regions
        ORDER BY region_count DESC, prominence DESC
        LIMIT {int(top_n * 3)}
    """

    nodes, edges, stats = coappearance_edges(
        con,
        person_sql,
        construct="national_bridges",
        top_n=top_n,
        min_shared=2,
        cap_by="blend",
        enrichment_mode=enrichment_mode,
    )

    method = (
        "Population: actors with credits on titles spanning ≥2 distinct production "
        "regions (original-title text → allowlist region; Adult excluded, numVotes ≥50, "
        "animation share ≤0.7). When Wikidata nationality is warm, require a non-empty "
        "nationality. Cap by blend."
    )
    return finalize_payload(
        con,
        construct_id="national_bridges",
        title="National Cinema Bridges",
        subtitle="actors credited across ≥2 production regions",
        key_variable="region_count",
        method_note=method,
        nodes=nodes,
        edges=edges,
        stages=[],
        build_stats=stats,
        extra={"top_n": top_n, "min_shared": 2, "min_regions": 2},
    )
