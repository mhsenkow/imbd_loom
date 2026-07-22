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


def _load_constructs() -> dict[str, Construct]:
    from loom.constructs.acting_dynasties import build as acting_dynasties
    from loom.constructs.athletes_actors import build as athletes_actors
    from loom.constructs.award_cohorts import build as award_cohorts
    from loom.constructs.b_movie import build as b_movie
    from loom.constructs.bechdel import build as bechdel
    from loom.constructs.blockbuster import build as blockbuster
    from loom.constructs.cartoons import build as cartoons
    from loom.constructs.child_stars import build as child_stars
    from loom.constructs.comeback import build as comeback
    from loom.constructs.comedy_horror import build as comedy_horror
    from loom.constructs.director_muses import build as director_muses
    from loom.constructs.documentary_selves import build as documentary_selves
    from loom.constructs.drama_schools import build as drama_schools
    from loom.constructs.dubbing import build as dubbing
    from loom.constructs.franchise_nomads import build as franchise_nomads
    from loom.constructs.genre_bridge import build as genre_bridge
    from loom.constructs.genre_drift import build as genre_drift
    from loom.constructs.horror_bloodlines import build as horror_bloodlines
    from loom.constructs.hyphenates import build as hyphenates
    from loom.constructs.long_careers import build as long_careers
    from loom.constructs.men_horror import build as men_horror
    from loom.constructs.national_bridges import build as national_bridges
    from loom.constructs.one_role import build as one_role
    from loom.constructs.repertory import build as repertory
    from loom.constructs.reunions import build as reunions
    from loom.constructs.same_character import build as same_character
    from loom.constructs.scream_queen import build as scream_queen
    from loom.constructs.silent_sound import build as silent_sound
    from loom.constructs.typecast import build as typecast
    from loom.constructs.voice_face import build as voice_face
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
        Construct(
            id="repertory",
            title="The Repertory Companies",
            subtitle="tight multi-person troupes (≥3 shared titles)",
            key_variable="troupe_partners",
            build=repertory,
        ),
        Construct(
            id="child_stars",
            title="Child Stars",
            subtitle="debut before age 12 → what happened next",
            key_variable="worked_past_25",
            build=child_stars,
        ),
        Construct(
            id="same_character",
            title="The Same Character Club",
            subtitle="Batmans, Bonds, Draculas — roles with 3+ faces",
            key_variable="top_shared_character",
            build=same_character,
        ),
        Construct(
            id="director_muses",
            title="Director's Muses",
            subtitle="actors with ≥4 titles under the same director",
            key_variable="top_director",
            build=director_muses,
        ),
        Construct(
            id="reunions",
            title="The Reunion Map",
            subtitle="pairs who reunited after ≥20 years apart",
            key_variable="max_reunion_gap",
            build=reunions,
        ),
        Construct(
            id="genre_drift",
            title="Genre Drift",
            subtitle="early vs late career genre change",
            key_variable="drift",
            build=genre_drift,
        ),
        Construct(
            id="comeback",
            title="The Comeback Trail",
            subtitle="≥8-year hiatus then ≥5 credits after",
            key_variable="max_gap",
            build=comeback,
        ),
        Construct(
            id="blockbuster",
            title="The Blockbuster Ensemble",
            subtitle="careers ≥50% in top-decile-votes titles",
            key_variable="blockbuster_share",
            build=blockbuster,
        ),
        Construct(
            id="b_movie",
            title="The B-Movie Loyalists",
            subtitle="careers ≥70% below-median-votes titles",
            key_variable="b_movie_share",
            build=b_movie,
        ),
        Construct(
            id="national_bridges",
            title="National Cinema Bridges",
            subtitle="actors credited across ≥2 production regions",
            key_variable="region_count",
            build=national_bridges,
        ),
        Construct(
            id="voice_face",
            title="Voice ↔ Face",
            subtitle="animation voice + live-action movie careers",
            key_variable="voice_ratio",
            build=voice_face,
        ),
        Construct(
            id="hyphenates",
            title="The Hyphenates",
            subtitle="actor-directors and actor-writers",
            key_variable="hyphenate_kind",
            build=hyphenates,
        ),
        Construct(
            id="franchise_nomads",
            title="Franchise Nomads",
            subtitle="people in ≥3 distinct series / IP groups",
            key_variable="franchise_count",
            build=franchise_nomads,
        ),
        Construct(
            id="documentary_selves",
            title="Documentary Selves",
            subtitle="Self / Documentary credit ecosystems",
            key_variable="self_count",
            build=documentary_selves,
        ),
        Construct(
            id="typecast",
            title="The Typecast Index",
            subtitle="careers defined by a repeated character name",
            key_variable="typecast_character",
            build=typecast,
        ),
        Construct(
            id="silent_sound",
            title="Silent → Sound Survivors",
            subtitle="careers spanning the 1927–1929 transition",
            key_variable="sound_count",
            build=silent_sound,
        ),
        Construct(
            id="horror_bloodlines",
            title="Horror Royalty Bloodlines",
            subtitle="horror regulars (men + women, ≥4 titles)",
            key_variable="gender",
            build=horror_bloodlines,
        ),
        Construct(
            id="acting_dynasties",
            title="Acting Dynasties",
            subtitle="family trees woven with co-appearance",
            key_variable="family",
            build=acting_dynasties,
        ),
        Construct(
            id="athletes_actors",
            title="Athletes to Actors",
            subtitle="wrestlers, martial artists, athletes who crossed over",
            key_variable="prior_occupation",
            build=athletes_actors,
        ),
        Construct(
            id="drama_schools",
            title="The Drama School Webs",
            subtitle="RADA, Juilliard, and stage-school clusters",
            key_variable="drama_school",
            build=drama_schools,
        ),
        Construct(
            id="award_cohorts",
            title="Award Season Cohorts",
            subtitle="award-linked careers woven by shared titles",
            key_variable="award_wins",
            build=award_cohorts,
        ),
    ]
    return {c.id: c for c in items}


CONSTRUCTS: dict[str, Construct] = {}


def get_constructs() -> dict[str, Construct]:
    global CONSTRUCTS
    if not CONSTRUCTS:
        CONSTRUCTS = _load_constructs()
    return CONSTRUCTS
