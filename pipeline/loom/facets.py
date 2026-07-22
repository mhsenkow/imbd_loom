"""Person-level facet attachment (prominence, entropy, career phases, etc.)."""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from typing import Any

import duckdb

from loom.filters import DEFAULT_MIN_VOTES, adult_exclusion_sql, title_type_sql
from loom.textnorm import ascii_fold, display_character, normalize_character


def attach_person_facets(
    con: duckdb.DuckDBPyConnection,
    nodes: list[dict],
    *,
    min_votes: int = DEFAULT_MIN_VOTES,
) -> dict[str, Any]:
    """Enrich nodes in-place with career facets. Returns build_stats counters."""
    if not nodes:
        return {}

    ids = [n["id"] for n in nodes]
    con.execute(
        """
        CREATE OR REPLACE TEMP TABLE _facet_people AS
        SELECT * FROM UNNEST(?::VARCHAR[]) AS t(nconst)
        """,
        [ids],
    )

    adult = adult_exclusion_sql("t")
    types = title_type_sql("t")

    # Core credit rows
    rows = con.execute(
        f"""
        SELECT
          p.nconst,
          p.tconst,
          p.ordering,
          p.characters,
          p.category,
          t.startYear,
          t.endYear,
          t.titleType,
          t.runtimeMinutes,
          t.genres,
          t.primaryTitle,
          COALESCE(r.numVotes, 0) AS votes,
          COALESCE(r.averageRating, 0) AS rating,
          n.birthYear,
          n.deathYear,
          n.primaryProfession,
          n.knownForTitles
        FROM title_principals p
        JOIN _facet_people fp ON fp.nconst = p.nconst
        JOIN title_basics t ON t.tconst = p.tconst
        JOIN name_basics n ON n.nconst = p.nconst
        LEFT JOIN title_ratings r ON r.tconst = p.tconst
        WHERE p.category IN ('actor', 'actress', 'self')
          AND {types}
          AND {adult}
        """
    ).fetchall()

    by: dict[str, list[tuple]] = defaultdict(list)
    for r in rows:
        by[r[0]].append(r)

    # Directors per title (optional)
    directors: dict[str, list[str]] = defaultdict(list)
    try:
        drows = con.execute(
            """
            SELECT tconst, UNNEST(string_split(directors, ',')) AS dconst
            FROM title_crew
            WHERE directors IS NOT NULL AND directors != ''
            """
        ).fetchall()
        for tconst, dconst in drows:
            if dconst:
                directors[tconst].append(dconst)
    except Exception:
        pass

    # Regions per title from akas (optional)
    regions: dict[str, set[str]] = defaultdict(set)
    try:
        arows = con.execute(
            """
            SELECT tconst, region FROM title_akas
            WHERE region IS NOT NULL AND region != '' AND isOriginalTitle = 0
            """
        ).fetchall()
        for tconst, region in arows:
            regions[tconst].add(region)
    except Exception:
        pass

    # Vote percentile for blockbuster detection
    all_votes = [r[11] for r in rows if r[11]]
    all_votes.sort()
    def vote_pct(v: int) -> float:
        if not all_votes:
            return 0.0
        # binary search rank
        lo, hi = 0, len(all_votes)
        while lo < hi:
            mid = (lo + hi) // 2
            if all_votes[mid] < v:
                lo = mid + 1
            else:
                hi = mid
        return lo / max(len(all_votes) - 1, 1)

    stats = {"people_faceted": 0}

    for n in nodes:
        credits = by.get(n["id"], [])
        if not credits:
            continue
        stats["people_faceted"] += 1

        birth = credits[0][13]
        death = credits[0][14]
        profession = credits[0][15] or ""
        known_for_raw = credits[0][16] or ""

        n["birth_year"] = int(birth) if birth else None
        n["death_year"] = int(death) if death else None
        n["label_ascii"] = ascii_fold(n.get("label") or "")
        n["professions"] = [p for p in profession.split(",") if p]

        years = sorted({int(c[5]) for c in credits if c[5]})
        if years:
            n["year_min"] = n.get("year_min") or years[0]
            n["year_max"] = n.get("year_max") or years[-1]
            if birth:
                n["debut_age"] = years[0] - int(birth)
                n["retirement_age"] = years[-1] - int(birth)
                peak = int(n.get("year_peak") or years[len(years) // 2])
                n["age_at_peak"] = peak - int(birth)
            if death:
                n["posthumous_credits"] = sum(1 for c in credits if c[5] and int(c[5]) > int(death))
                n["worked_posthumously"] = n["posthumous_credits"] > 0

            # Gap years
            gaps = [years[i + 1] - years[i] for i in range(len(years) - 1)]
            n["gap_years"] = max(gaps) if gaps else 0

        # Prominence
        prom = 0.0
        for c in credits:
            votes, ordering = c[11], c[2]
            billing = max(int(ordering or 10), 1)
            prom += votes / billing
        n["prominence"] = round(prom, 1)

        # Genre distribution + entropy
        genre_counts: Counter[str] = Counter()
        for c in credits:
            genres = (c[9] or "").split(",")
            for g in genres:
                g = g.strip()
                if g:
                    genre_counts[g] += 1
        total_g = sum(genre_counts.values()) or 1
        entropy = 0.0
        for cnt in genre_counts.values():
            p = cnt / total_g
            entropy -= p * math.log(p + 1e-12, 2)
        n["genre_entropy"] = round(entropy, 3)
        if genre_counts:
            top = genre_counts.most_common(1)[0]
            n["dominant_genre"] = n.get("dominant_genre") or top[0]
            n["concentration"] = n.get("concentration") or round(top[1] / total_g, 3)

        # Career phases (early / peak / late by year thirds)
        if years and len(years) >= 3:
            lo, hi = years[0], years[-1]
            span = max(hi - lo, 1)
            phases = {"early": Counter(), "peak": Counter(), "late": Counter()}
            for c in credits:
                y = c[5]
                if not y:
                    continue
                t = (int(y) - lo) / span
                phase = "early" if t < 0.33 else ("late" if t > 0.66 else "peak")
                for g in (c[9] or "").split(","):
                    g = g.strip()
                    if g:
                        phases[phase][g] += 1
            n["career_phases"] = {
                ph: (pc.most_common(1)[0][0] if pc else None) for ph, pc in phases.items()
            }
            # Genre drift: Jaccard distance early vs late
            e_set = set(phases["early"].keys())
            l_set = set(phases["late"].keys())
            if e_set or l_set:
                jacc = len(e_set & l_set) / max(len(e_set | l_set), 1)
                n["genre_drift"] = round(1 - jacc, 3)
            first_y = min((c[5], c[9]) for c in credits if c[5] and c[9])
            last_y = max((c[5], c[9]) for c in credits if c[5] and c[9])
            n["genre_first"] = (first_y[1] or "").split(",")[0] or None
            n["genre_last"] = (last_y[1] or "").split(",")[0] or None

        # Typecast character
        chars: Counter[str] = Counter()
        char_display: dict[str, str] = {}
        for c in credits:
            key = normalize_character(c[3])
            if key and len(key) > 1:
                chars[key] += 1
                char_display[key] = display_character(c[3]) or key
        if chars:
            top_c, top_n = chars.most_common(1)[0]
            n["typecast_character"] = char_display.get(top_c, top_c)
            n["typecast_count"] = top_n

        # Billing trajectory (simple slope of ordering vs year)
        pairs = [(c[5], c[2]) for c in credits if c[5] and c[2] is not None]
        if len(pairs) >= 4:
            pairs.sort()
            xs = [p[0] for p in pairs]
            ys = [float(p[1]) for p in pairs]
            mx = sum(xs) / len(xs)
            my = sum(ys) / len(ys)
            num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
            den = sum((x - mx) ** 2 for x in xs) or 1
            # Negative slope = rising star (billing number decreases)
            n["billing_trajectory"] = round(-num / den, 4)

        billings = [c[2] for c in credits if c[2] is not None]
        if billings:
            billings_sorted = sorted(billings)
            n["median_billing"] = billings_sorted[len(billings_sorted) // 2]

        # Minutes / medium mix
        minutes = sum(int(c[8] or 0) for c in credits)
        n["minutes_credited"] = minutes
        type_counts = Counter(c[7] for c in credits if c[7])
        total_t = sum(type_counts.values()) or 1
        n["medium_mix"] = {k: round(v / total_t, 3) for k, v in type_counts.items()}
        shorts = type_counts.get("short", 0)
        features = type_counts.get("movie", 0)
        n["short_to_feature_ratio"] = round(shorts / max(features, 1), 3)

        # TV↔movie crossover year
        movie_years = [c[5] for c in credits if c[7] == "movie" and c[5]]
        tv_years = [c[5] for c in credits if c[7] in ("tvSeries", "tvMovie", "tvMiniSeries") and c[5]]
        if movie_years and tv_years:
            if min(tv_years) < min(movie_years):
                n["tv_movie_crossover_year"] = min(movie_years)
            else:
                n["tv_movie_crossover_year"] = min(tv_years)

        # Ratings
        rated = [c[12] for c in credits if c[12]]
        if rated:
            n["title_rating_median"] = round(sorted(rated)[len(rated) // 2], 2)
            n["title_rating_max"] = round(max(rated), 2)

        # Ensemble size proxy: use ordering max as weak signal; better computed separately
        # Blockbuster share: % credits in top-decile votes among this person's titles
        if credits:
            top_dec = sum(1 for c in credits if vote_pct(c[11]) >= 0.9)
            n["blockbuster_share"] = round(top_dec / len(credits), 3)
            # one-scene wonder: high votes + late billing
            late_hi = sum(1 for c in credits if c[11] >= 50000 and (c[2] or 99) >= 8)
            n["one_scene_wonder"] = late_hi >= 3 and (n.get("median_billing") or 0) >= 6

        # Known for
        if known_for_raw:
            n["known_for"] = [t for t in known_for_raw.split(",") if t][:4]

        # Same director repeat
        dir_counts: Counter[str] = Counter()
        for c in credits:
            for d in directors.get(c[1], []):
                dir_counts[d] += 1
        if dir_counts:
            n["same_director_repeat"] = dir_counts.most_common(1)[0][1]
            n["top_director"] = dir_counts.most_common(1)[0][0]

        # Regions / national cinema
        regs: set[str] = set()
        for c in credits:
            regs |= regions.get(c[1], set())
        if regs:
            n["regions"] = sorted(regs)[:12]
            n["region_count"] = len(regs)

        # Decade tags on career
        if years:
            n["decades"] = sorted({f"{(y // 10) * 10}s" for y in years})

    # Collaborator loyalty (needs edges-like self join — compute pairwise among facet people)
    _attach_collaborator_loyalty(con, nodes)
    return stats


def _attach_collaborator_loyalty(con: duckdb.DuckDBPyConnection, nodes: list[dict]) -> None:
    if len(nodes) < 2:
        return
    try:
        rows = con.execute(
            """
            SELECT a.nconst, b.nconst, COUNT(DISTINCT a.tconst) AS shared
            FROM title_principals a
            JOIN _facet_people fa ON fa.nconst = a.nconst
            JOIN title_principals b
              ON b.tconst = a.tconst AND a.nconst < b.nconst
             AND b.category IN ('actor', 'actress')
            JOIN _facet_people fb ON fb.nconst = b.nconst
            WHERE a.category IN ('actor', 'actress')
            GROUP BY 1, 2
            HAVING COUNT(DISTINCT a.tconst) >= 2
            """
        ).fetchall()
    except Exception:
        return

    best: dict[str, tuple[str, int]] = {}
    totals: dict[str, int] = defaultdict(int)
    for a, b, shared in rows:
        shared = int(shared)
        totals[a] += shared
        totals[b] += shared
        if a not in best or shared > best[a][1]:
            best[a] = (b, shared)
        if b not in best or shared > best[b][1]:
            best[b] = (a, shared)

    labels = {n["id"]: n["label"] for n in nodes}
    for n in nodes:
        nid = n["id"]
        if nid in best and totals[nid]:
            partner, shared = best[nid]
            n["top_collaborator"] = labels.get(partner, partner)
            n["top_collaborator_id"] = partner
            n["collaborator_loyalty"] = round(shared / totals[nid], 3)


def attach_known_for_titles(con: duckdb.DuckDBPyConnection, nodes: list[dict]) -> None:
    """Resolve known_for tconsts to titles."""
    tconsts = []
    for n in nodes:
        for t in n.get("known_for") or []:
            tconsts.append(t)
    if not tconsts:
        return
    uniq = list(set(tconsts))
    con.execute(
        "CREATE OR REPLACE TEMP TABLE _kf AS SELECT * FROM UNNEST(?::VARCHAR[]) AS t(tconst)",
        [uniq],
    )
    rows = con.execute(
        """
        SELECT t.tconst, t.primaryTitle, t.startYear
        FROM title_basics t JOIN _kf k ON k.tconst = t.tconst
        """
    ).fetchall()
    titles = {r[0]: {"tconst": r[0], "title": r[1], "year": r[2]} for r in rows}
    for n in nodes:
        raw = n.get("known_for") or []
        if raw and isinstance(raw[0], str):
            n["known_for"] = [titles[t] for t in raw if t in titles]
