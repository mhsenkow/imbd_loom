"""Shared membership / ranking SQL helpers for construct builders."""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable

# Generic / noise character strings — used by typecast + same_character.
CHARACTER_BLOCKLIST: frozenset[str] = frozenset(
    {
        "self",
        "himself",
        "herself",
        "themselves",
        "host",
        "announcer",
        "additional voices",
        "additional voice",
        "various",
        "extra",
        "uncredited",
        "voice",
        "voices",
        "dad",
        "mom",
        "mother",
        "father",
        "newscaster",
        "warden",
        "narrator",
        "reporter",
        "doctor",
        "nurse",
        "policeman",
        "police officer",
        "officer",
        "soldier",
        "guard",
        "man",
        "woman",
        "boy",
        "girl",
        "kid",
        "child",
        "baby",
        "landlady",
        "landlord",
        "waitress",
        "waiter",
        "bartender",
        "driver",
        "pilot",
        "captain",
        "king",
        "queen",
        "prince",
        "princess",
    }
)

# Famous shared-role seeds that must survive same_character filters.
SAME_CHARACTER_SEEDS: tuple[str, ...] = (
    "batman",
    "bruce wayne",
    "james bond",
    "007",
    "dracula",
    "count dracula",
    "sherlock holmes",
    "spider-man",
    "spiderman",
    "peter parker",
    "superman",
    "clark kent",
    "hamlet",
    "romeo",
    "juliet",
    "frankenstein",
    "joker",
    "harley quinn",
)

DRAMA_SCHOOL_HINTS: tuple[str, ...] = (
    "rada",
    "royal academy of dramatic art",
    "juilliard",
    "yale school of drama",
    "yale drama",
    "national theatre school",
    "lamda",
    "guildhall",
    "nyu tisch",
    "tisch school",
    "stella adler",
    "actors studio",
    "calarts",
    "central school of speech",
    "bristol old vic",
)


def rank_prominence_sql(ratings_alias: str = "r") -> str:
    """Person-level prominence expression for ORDER BY / SELECT."""
    return f"SUM(LN(COALESCE({ratings_alias}.numVotes, 0) + 1))"


def voice_signal_sql(
    *,
    principals_alias: str = "p",
    name_alias: str = "n",
    voice_alias: str = "ve",
    soft: bool = False,
) -> str:
    """
    Voice-signal predicate.

    soft=False → hard gate (legacy dubbing-style).
    soft=True  → always TRUE (Animation cast membership is enough; signal is boost-only).
    """
    if soft:
        return "TRUE"
    p, n, ve = principals_alias, name_alias, voice_alias
    return f"""(
      COALESCE({ve}.is_voice_actor, FALSE) = TRUE
      OR {p}.characters ILIKE '%(voice)%'
      OR {p}.job ILIKE '%voice%'
    )"""


def voice_boost_sql(
    *,
    principals_alias: str = "p",
    voice_alias: str = "ve",
) -> str:
    """0/1 boost for ranking when membership is soft."""
    p, ve = principals_alias, voice_alias
    return f"""MAX(CASE
      WHEN COALESCE({ve}.is_voice_actor, FALSE) = TRUE THEN 1
      WHEN {p}.characters ILIKE '%(voice)%' THEN 1
      WHEN {p}.job ILIKE '%voice%' THEN 1
      ELSE 0
    END)"""


def character_norm_sql(expr: str = "char_name") -> str:
    """Normalize a character display string for grouping."""
    return f"""lower(trim(regexp_replace(
      regexp_replace({expr}, '\\s*\\(voice\\)\\s*', '', 'i'),
      '\\s+', ' ', 'g'
    )))"""


def character_blocklist_sql(norm_expr: str = "char_norm") -> str:
    quoted = ", ".join(f"'{c}'" for c in sorted(CHARACTER_BLOCKLIST))
    return f"{norm_expr} NOT IN ({quoted})"


def same_character_seed_sql(norm_expr: str = "char_norm") -> str:
    """True when normalized name matches a curated franchise role."""
    parts = []
    for seed in SAME_CHARACTER_SEEDS:
        parts.append(f"{norm_expr} = '{seed}'")
        parts.append(f"{norm_expr} LIKE '%{seed}%'")
    return "(" + " OR ".join(parts) + ")"


def drama_school_match_sql(educated_expr: str = "w.educated_at") -> str:
    likes = " OR ".join(
        f"lower(COALESCE({educated_expr}, '')) LIKE '%{h}%'" for h in DRAMA_SCHOOL_HINTS
    )
    return f"({likes})"


def wikidata_warm(con: Any, *, min_rows: int = 10, column: str | None = None) -> bool:
    """True when wikidata_people has enough usable rows."""
    try:
        if column:
            n = con.execute(
                f"SELECT COUNT(*) FROM wikidata_people WHERE {column} IS NOT NULL "
                f"AND CAST({column} AS VARCHAR) != ''"
            ).fetchone()[0]
        else:
            n = con.execute("SELECT COUNT(*) FROM wikidata_people").fetchone()[0]
        return int(n) >= min_rows
    except Exception:
        return False


def stratify_ids(
    rows: Iterable[dict[str, Any]],
    *,
    id_key: str = "id",
    bucket_key: str,
    top_n: int,
    max_share: float = 0.4,
) -> list[dict[str, Any]]:
    """
    Greedy take from a prominence-sorted list, capping any single bucket to max_share.
    rows must already be sorted best-first.
    """
    cap = max(1, int(top_n * max_share))
    counts: dict[str, int] = defaultdict(int)
    out: list[dict[str, Any]] = []
    for row in rows:
        if len(out) >= top_n:
            break
        bucket = str(row.get(bucket_key) or "unknown")
        if counts[bucket] >= cap and len(out) + (top_n - len(out)) > 0:
            # still allow if we would otherwise underfill — fill remainder later
            continue
        out.append(row)
        counts[bucket] += 1
    if len(out) < top_n:
        seen = {r[id_key] for r in out}
        for row in rows:
            if len(out) >= top_n:
                break
            if row[id_key] in seen:
                continue
            out.append(row)
            seen.add(row[id_key])
    return out[:top_n]


def empty_payload_stats(*, reason: str, enrichment_mode: str = "empty") -> dict[str, Any]:
    return {
        "population_sql": 0,
        "credit_rows": 0,
        "after_degree_cap": 0,
        "enrichment_mode": enrichment_mode,
        "fallback_used": False,
        "empty_reason": reason,
    }
