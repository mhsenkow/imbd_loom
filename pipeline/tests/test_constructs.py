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


def test_fixture_tables():
    con = _fixture_con()
    n = con.execute("SELECT COUNT(*) FROM title_principals").fetchone()[0]
    assert n == 6
