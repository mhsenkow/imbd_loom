"""IMDb Loom data pipeline."""

from pathlib import Path

# Repo root = pipeline/../
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
PARQUET = DATA / "parquet"
CACHE = DATA / "cache"
OUT = DATA / "out"

IMDB_BASE = "https://datasets.imdbws.com"
IMDB_FILES = [
    "name.basics.tsv.gz",
    "title.basics.tsv.gz",
    "title.principals.tsv.gz",
    "title.ratings.tsv.gz",
    "title.crew.tsv.gz",
    "title.episode.tsv.gz",
    "title.akas.tsv.gz",
]

# Density budget for hero visualizations
DEFAULT_TOP_N = 200
MAX_HERO_NODES = 300

# Deterministic build seed (stable JSON ordering)
BUILD_SEED = 42

# Schema / semantic version for node+edge metrics (frontend detects changes)
METRICS_VERSION = "2"
