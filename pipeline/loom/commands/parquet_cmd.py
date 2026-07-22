"""Convert gzipped IMDb TSVs to Parquet."""

from __future__ import annotations

from rich.console import Console

from loom import RAW
from loom.db import connect, ensure_dirs, parquet_path

console = Console()

# Read as auto-detected TSV; IMDb uses \N for nulls
READ = (
    "read_csv_auto('{src}', delim='\\t', header=true, quote='', "
    "nullstr='\\N', sample_size=-1, ignore_errors=true, parallel=true)"
)

TABLES = [
    (
        "name.basics.tsv.gz",
        "name_basics",
        """
        SELECT
          nconst,
          primaryName,
          TRY_CAST(birthYear AS INTEGER) AS birthYear,
          TRY_CAST(deathYear AS INTEGER) AS deathYear,
          primaryProfession,
          knownForTitles
        FROM {read}
        """,
    ),
    (
        "title.basics.tsv.gz",
        "title_basics",
        """
        SELECT
          tconst,
          titleType,
          primaryTitle,
          originalTitle,
          TRY_CAST(isAdult AS INTEGER) AS isAdult,
          TRY_CAST(startYear AS INTEGER) AS startYear,
          TRY_CAST(endYear AS INTEGER) AS endYear,
          TRY_CAST(runtimeMinutes AS INTEGER) AS runtimeMinutes,
          genres,
          CASE
            WHEN TRY_CAST(startYear AS INTEGER) IS NULL THEN NULL
            ELSE CAST((TRY_CAST(startYear AS INTEGER) / 10) * 10 AS INTEGER)
          END AS decade
        FROM {read}
        """,
    ),
    (
        "title.principals.tsv.gz",
        "title_principals",
        """
        SELECT
          tconst,
          TRY_CAST(ordering AS INTEGER) AS ordering,
          nconst,
          category,
          job,
          characters
        FROM {read}
        """,
    ),
    (
        "title.ratings.tsv.gz",
        "title_ratings",
        """
        SELECT
          tconst,
          TRY_CAST(averageRating AS DOUBLE) AS averageRating,
          TRY_CAST(numVotes AS INTEGER) AS numVotes
        FROM {read}
        """,
    ),
    (
        "title.crew.tsv.gz",
        "title_crew",
        """
        SELECT
          tconst,
          directors,
          writers
        FROM {read}
        """,
    ),
    (
        "title.episode.tsv.gz",
        "title_episode",
        """
        SELECT
          tconst,
          parentTconst,
          TRY_CAST(seasonNumber AS INTEGER) AS seasonNumber,
          TRY_CAST(episodeNumber AS INTEGER) AS episodeNumber
        FROM {read}
        """,
    ),
    (
        "title.akas.tsv.gz",
        "title_akas",
        """
        SELECT
          titleId AS tconst,
          TRY_CAST(ordering AS INTEGER) AS ordering,
          title,
          region,
          language,
          types,
          attributes,
          TRY_CAST(isOriginalTitle AS INTEGER) AS isOriginalTitle
        FROM {read}
        """,
    ),
]


def convert_to_parquet(*, only: list[str] | None = None) -> None:
    ensure_dirs()
    con = connect()
    for tsv_name, logical, sql_template in TABLES:
        if only and logical not in only and tsv_name not in only:
            continue
        src = RAW / tsv_name
        if not src.exists():
            console.print(f"[yellow]skip[/yellow] {tsv_name} (missing — run `loom download`)")
            continue
        dest = parquet_path(logical)
        console.print(f"[bold]{tsv_name}[/bold] → {dest.name} …")
        src_lit = str(src).replace("'", "''")
        dest_lit = str(dest).replace("'", "''")
        read = READ.format(src=src_lit)
        sql = sql_template.format(read=read)
        con.execute(
            f"COPY ({sql}) TO '{dest_lit}' (FORMAT PARQUET, COMPRESSION ZSTD)"
        )
        rows = con.execute(f"SELECT COUNT(*) FROM read_parquet('{dest_lit}')").fetchone()[0]
        size_mb = dest.stat().st_size / 1e6
        console.print(f"  [green]✓[/green] {rows:,} rows, {size_mb:.1f} MB")
    console.print("[green]✓[/green] Parquet conversion complete")
