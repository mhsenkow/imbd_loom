"""Shared SQL filters: vote floors, Adult exclusion, title-type defaults."""

from __future__ import annotations

# Pipeline-wide defaults — constructs may override via kwargs.
EXCLUDED_GENRES: frozenset[str] = frozenset({"Adult"})
DEFAULT_MIN_VOTES: int = 50
DEFAULT_TITLE_TYPES: tuple[str, ...] = (
    "movie",
    "tvSeries",
    "tvMovie",
    "tvMiniSeries",
)

# Genre tags that are noise for concentration/bridge stories when ranking.
LOW_SIGNAL_GENRES: frozenset[str] = frozenset({"Adult", "News", "Talk-Show", "Game-Show", "Reality-TV"})


def title_type_sql(alias: str = "t", types: tuple[str, ...] | None = None) -> str:
    ts = types or DEFAULT_TITLE_TYPES
    quoted = ", ".join(f"'{t}'" for t in ts)
    return f"{alias}.titleType IN ({quoted})"


def adult_exclusion_sql(alias: str = "t", *, also_genre: bool = True) -> str:
    """Prefer isAdult flag; also drop Adult genre tags when also_genre=True."""
    parts = [f"COALESCE({alias}.isAdult, 0) = 0"]
    if also_genre:
        parts.append(
            f"NOT list_contains(string_split(COALESCE({alias}.genres, ''), ','), 'Adult')"
        )
    return " AND ".join(parts)


def vote_floor_sql(
    ratings_alias: str = "r",
    *,
    min_votes: int = DEFAULT_MIN_VOTES,
    allow_missing: bool = False,
) -> str:
    """Require numVotes ≥ floor. When allow_missing, unrated titles pass."""
    if allow_missing:
        return f"(COALESCE({ratings_alias}.numVotes, 0) >= {int(min_votes)} OR {ratings_alias}.numVotes IS NULL)"
    return f"COALESCE({ratings_alias}.numVotes, 0) >= {int(min_votes)}"


def genre_contains_sql(alias: str, genre: str) -> str:
    return f"list_contains(string_split(COALESCE({alias}.genres, ''), ','), '{genre}')"


def excluded_genres_sql(alias: str = "t", excluded: frozenset[str] | None = None) -> str:
    xs = excluded if excluded is not None else EXCLUDED_GENRES
    if not xs:
        return "TRUE"
    clauses = [
        f"NOT list_contains(string_split(COALESCE({alias}.genres, ''), ','), '{g}')"
        for g in sorted(xs)
    ]
    return " AND ".join(clauses)
