"""Unit tests for construct builders against a tiny fixture DuckDB."""

from __future__ import annotations

import duckdb
import pytest

from loom.analytics import betweenness_centrality, louvain_communities
from loom.constructs.emit import validate_construct
from loom.filters import adult_exclusion_sql, vote_floor_sql
from loom.textnorm import ascii_fold, normalize_character


def _fixture_con() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    con.execute(
        """
        CREATE TABLE name_basics AS SELECT * FROM (VALUES
          ('nm1', 'Ada Actor', 1980, NULL, 'actress', 'tt1,tt2'),
          ('nm2', 'Bob Actor', 1975, NULL, 'actor', 'tt1,tt3'),
          ('nm3', 'Cara Voice', 1990, NULL, 'actress', 'tt2')
        ) AS t(nconst, primaryName, birthYear, deathYear, primaryProfession, knownForTitles)
        """
    )
    con.execute(
        """
        CREATE TABLE title_basics AS SELECT * FROM (VALUES
          ('tt1', 'movie', 'Horror One', 'Horror One', 0, 2000, NULL, 90, 'Horror', 2000),
          ('tt2', 'movie', 'Horror Two', 'Horror Two', 0, 2001, NULL, 95, 'Horror', 2000),
          ('tt3', 'movie', 'Drama One', 'Drama One', 0, 2002, NULL, 100, 'Drama', 2000),
          ('tt4', 'movie', 'Adult X', 'Adult X', 1, 2003, NULL, 80, 'Adult', 2000)
        ) AS t(tconst, titleType, primaryTitle, originalTitle, isAdult, startYear, endYear, runtimeMinutes, genres, decade)
        """
    )
    con.execute(
        """
        CREATE TABLE title_principals AS SELECT * FROM (VALUES
          ('tt1', 1, 'nm1', 'actress', NULL, '["Final Girl"]'),
          ('tt1', 2, 'nm2', 'actor', NULL, '["Killer"]'),
          ('tt2', 1, 'nm1', 'actress', NULL, '["Final Girl"]'),
          ('tt2', 2, 'nm3', 'actress', NULL, '["Neighbor (voice)]'),
          ('tt3', 1, 'nm2', 'actor', NULL, '["Lead"]'),
          ('tt4', 1, 'nm2', 'actor', NULL, '["X"]')
        ) AS t(tconst, ordering, nconst, category, job, characters)
        """
    )
    con.execute(
        """
        CREATE TABLE title_ratings AS SELECT * FROM (VALUES
          ('tt1', 6.5, 5000),
          ('tt2', 7.0, 8000),
          ('tt3', 8.0, 12000),
          ('tt4', 3.0, 100)
        ) AS t(tconst, averageRating, numVotes)
        """
    )
    con.execute(
        """
        CREATE VIEW gender_enrich AS
        SELECT CAST(NULL AS VARCHAR) AS nconst, CAST(NULL AS INTEGER) AS tmdb_gender,
               CAST(NULL AS VARCHAR) AS source WHERE FALSE
        """
    )
    return con


def test_ascii_fold():
    assert "Ryunoseke" in ascii_fold("Ryūnosuke") or ascii_fold("Ryūnosuke").startswith("Ryu")


def test_normalize_character():
    assert normalize_character('["The Joker"]') == "joker"
    assert normalize_character('["Final Girl (voice)"]') == "final girl"


def test_filters_sql():
    assert "isAdult" in adult_exclusion_sql("t")
    assert "numVotes" in vote_floor_sql("r", min_votes=50)


def test_validate_construct():
    nodes = [{"id": "a", "label": "A", "degree": 1}, {"id": "b", "label": "B", "degree": 1}]
    edges = [{"source": "a", "target": "b", "weight": 2}]
    assert validate_construct(nodes, edges) == []
    bad = validate_construct(nodes, [{"source": "a", "target": "z", "weight": 1}])
    assert bad


def test_analytics_tiny():
    nodes = [{"id": "a", "label": "A"}, {"id": "b", "label": "B"}, {"id": "c", "label": "C"}]
    edges = [
        {"source": "a", "target": "b", "weight": 1},
        {"source": "b", "target": "c", "weight": 1},
    ]
    bc = betweenness_centrality(nodes, edges)
    assert bc["b"] >= bc["a"]
    comm = louvain_communities(nodes, edges)
    assert set(comm.keys()) == {"a", "b", "c"}


def test_method_notes_nonempty_in_out():
    """Trust page must never render blank method_note / data_credit."""
    from pathlib import Path

    from loom import OUT

    if not OUT.exists():
        pytest.skip("data/out not present")
    missing = []
    for mpath in OUT.glob("*/manifest.json"):
        import json

        m = json.loads(mpath.read_text(encoding="utf-8"))
        if not (m.get("method_note") or "").strip():
            missing.append(f"{mpath.parent.name}:method_note")
        if not (m.get("data_credit") or "").strip():
            missing.append(f"{mpath.parent.name}:data_credit")
    assert not missing, missing


def test_quality_report_includes_warnings():
    from loom.constructs.emit import quality_report

    nodes = [{"id": "a", "label": "A", "gender": "unknown", "prominence": 1}]
    edges = [{"source": "a", "target": "a", "weight": 1, "year": 2000}]
    q = quality_report(
        nodes,
        edges,
        gender_method="imdb_actor_actress_proxy",
        validation_warnings=["edge endpoint missing"],
        imdb_snapshot_as_of="2024-01-01T00:00:00+00:00",
    )
    assert q["validation_warnings"] == ["edge endpoint missing"]
    assert q["gender_method"] == "imdb_actor_actress_proxy"
    assert q["imdb_snapshot_as_of"].startswith("2024")


def test_avg_path_returns_sample_n():
    from loom.analytics import average_path_length

    nodes = [{"id": x} for x in "abcdef"]
    edges = [
        {"source": "a", "target": "b"},
        {"source": "b", "target": "c"},
        {"source": "c", "target": "d"},
        {"source": "d", "target": "e"},
        {"source": "e", "target": "f"},
    ]
    val, n, sampled = average_path_length(nodes, edges, sample=40)
    assert val is not None
    assert n == 6  # exact for small graphs
    assert sampled is False


def test_pearson_engine():
    from loom.analytics import pearson

    assert pearson([1, 2, 3, 4], [1, 2, 3, 4]) == 1.0
    assert pearson([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0
    assert pearson([1, 1, 1, 1], [1, 2, 3, 4]) is None


def test_spearman_and_correlations():
    from loom.analytics import correlations, spearman

    assert spearman([1, 2, 3, 4], [1, 2, 3, 4]) == 1.0
    assert spearman([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0
    # n < 8 → null r
    nodes = [
        {"id": f"n{i}", "degree": i, "strength": i * 2, "prominence": i * 3}
        for i in range(5)
    ]
    c = correlations(nodes)
    assert c["degree×strength"]["r"] is None
    assert c["degree×strength"]["n"] == 5
    # constant → null
    big = [
        {"id": f"n{i}", "degree": 1, "strength": 10, "prominence": float(i)}
        for i in range(10)
    ]
    c2 = correlations(big)
    assert c2["degree×prominence"]["r"] is None


def test_enrich_edge_loyalty():
    from loom.analytics import enrich_edge_metrics

    nodes = [
        {
            "id": "a",
            "year_min": 2000,
            "year_max": 2010,
            "birth_year": 1970,
            "dominant_genre": "Horror",
            "top_director": "D1",
        },
        {
            "id": "b",
            "year_min": 2005,
            "year_max": 2015,
            "birth_year": 1995,
            "dominant_genre": "Horror",
            "top_director": "D1",
        },
    ]
    edges = [
        {
            "source": "a",
            "target": "b",
            "shared_count": 4,
            "genres": ["Horror"],
            "first_worked_together": 2005,
            "last_worked_together": 2008,
        }
    ]
    enrich_edge_metrics(nodes, edges)
    e = edges[0]
    assert e["loyalty_ab"] == 1.0
    assert e["loyalty_ba"] == 1.0
    assert e["cross_generational"] is True
    assert e["directorial_glue"] is True
    assert 0 <= e["edge_genre_jaccard"] <= 1


def test_degree_strength_validate():
    from loom.constructs.emit import validate_construct

    nodes = [
        {"id": "a", "label": "A", "degree": 1, "strength": 5},
        {"id": "b", "label": "B", "degree": 1, "strength": 5},
    ]
    edges = [{"source": "a", "target": "b", "weight": 5, "reunion_span": 0}]
    assert validate_construct(nodes, edges) == []



def test_gender_method_flags_consistent():
    from loom.constructs import gender_source_flags
    from loom.db import connect, register_base_tables

    con = connect()
    register_base_tables(con)
    flags = gender_source_flags(con)
    assert "gender_method" in flags
    assert flags["tmdb_gender_rows"] >= 0
    if flags["tmdb_gender_rows"] > 0:
        assert "tmdb" in flags["gender_method"]
    else:
        assert "proxy" in flags["gender_method"] or flags["gender_method"].startswith("imdb")


def test_voice_membership_soft_true():
    from loom.membership import voice_signal_sql

    assert voice_signal_sql(soft=True) == "TRUE"
    hard = voice_signal_sql(soft=False)
    assert "is_voice_actor" in hard
    assert "(voice)" in hard


def test_character_blocklist_excludes_newscaster():
    from loom.membership import CHARACTER_BLOCKLIST

    assert "newscaster" in CHARACTER_BLOCKLIST
    assert "warden" in CHARACTER_BLOCKLIST
