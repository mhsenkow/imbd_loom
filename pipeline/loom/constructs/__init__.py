"""Construct registry and shared helpers for graph/stage emission."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import duckdb


@dataclass(frozen=True)
class Construct:
    id: str
    title: str
    subtitle: str
    key_variable: str  # what color encodes
    build: Callable[[duckdb.DuckDBPyConnection, int], dict]


def gender_expr(alias: str = "p") -> str:
    """SQL expression: TMDB gender with actor/actress fallback → 'male'|'female'|'nonbinary'|'unknown'."""
    return f"""
    CASE
      WHEN ge.tmdb_gender = 1 THEN 'female'
      WHEN ge.tmdb_gender = 2 THEN 'male'
      WHEN ge.tmdb_gender = 3 THEN 'nonbinary'
      WHEN {alias}.category = 'actress' THEN 'female'
      WHEN {alias}.category = 'actor' THEN 'male'
      ELSE 'unknown'
    END
    """


def gender_source_flags(con: duckdb.DuckDBPyConnection) -> dict:
    """Report whether TMDB enrichment was used."""
    try:
        n = con.execute(
            "SELECT COUNT(*) FROM gender_enrich WHERE tmdb_gender IS NOT NULL"
        ).fetchone()[0]
    except Exception:
        n = 0
    return {
        "tmdb_gender_rows": int(n),
        "gender_method": "tmdb+imdb_fallback" if n > 0 else "imdb_actor_actress_proxy",
    }


# Import construct builders lazily to avoid circular imports
def _load_constructs() -> dict[str, Construct]:
    from loom.constructs.bechdel import build as bechdel
    from loom.constructs.cartoons import build as cartoons
    from loom.constructs.comedy_horror import build as comedy_horror
    from loom.constructs.dubbing import build as dubbing
    from loom.constructs.genre_bridge import build as genre_bridge
    from loom.constructs.long_careers import build as long_careers
    from loom.constructs.men_horror import build as men_horror
    from loom.constructs.one_role import build as one_role
    from loom.constructs.scream_queen import build as scream_queen
    from loom.constructs.women_horror import build as women_horror

    items = [
        Construct(
            id="voice_cartoons",
            title="Voice Actors in Cartoons",
            subtitle="actor → show → character reuse",
            key_variable="degree",
            build=cartoons,
        ),
        Construct(
            id="men_horror",
            title="Men in Horror",
            subtitle="gender → role prominence → genre",
            key_variable="gender",
            build=men_horror,
        ),
        Construct(
            id="women_horror",
            title="Women in Horror",
            subtitle="gender → role prominence → genre",
            key_variable="gender",
            build=women_horror,
        ),
        Construct(
            id="scream_queen",
            title="The Scream-Queen Web",
            subtitle="actress ↔ actress co-appearance in horror",
            key_variable="coappearance",
            build=scream_queen,
        ),
        Construct(
            id="bechdel",
            title="The Bechdel Web",
            subtitle="cast across films that pass the Bechdel test",
            key_variable="gender",
            build=bechdel,
        ),
        Construct(
            id="comedy_horror",
            title="Comedy × Horror",
            subtitle="crossover careers between laughs and screams",
            key_variable="crossover_weight",
            build=comedy_horror,
        ),
        Construct(
            id="genre_bridge",
            title="Genre Bridges",
            subtitle="careers spanning two (or more) genres",
            key_variable="bridge",
            build=genre_bridge,
        ),
        Construct(
            id="one_role",
            title="One-Role Wonders",
            subtitle="person → genre concentration (≥90%)",
            key_variable="dominant_genre",
            build=one_role,
        ),
        Construct(
            id="long_careers",
            title="Long Careers",
            subtitle="35+ year credited spans",
            key_variable="career_span",
            build=long_careers,
        ),
        Construct(
            id="dubbing",
            title="The Dubbing Multiverse",
            subtitle="voice actor → character fan-out",
            key_variable="character_count",
            build=dubbing,
        ),
    ]
    return {c.id: c for c in items}


CONSTRUCTS: dict[str, Construct] = {}


def get_constructs() -> dict[str, Construct]:
    global CONSTRUCTS
    if not CONSTRUCTS:
        CONSTRUCTS = _load_constructs()
    return CONSTRUCTS
