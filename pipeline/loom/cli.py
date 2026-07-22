"""CLI entrypoint for the Loom pipeline."""

from __future__ import annotations

import typer
from rich.console import Console

from loom.commands.build import build_all, build_one
from loom.commands.download import download_imdb
from loom.commands.enrich import enrich_all
from loom.commands.parquet_cmd import convert_to_parquet
from loom.commands.spike import run_spike

app = typer.Typer(
    name="loom",
    help="IMDb Loom data pipeline",
    no_args_is_help=True,
)
console = Console()


@app.command()
def download(force: bool = typer.Option(False, help="Re-download even if fresh")) -> None:
    """Download IMDb non-commercial TSV datasets."""
    download_imdb(force=force)


@app.command()
def parquet() -> None:
    """Convert gzipped TSVs to Parquet for fast repeated queries."""
    convert_to_parquet()


@app.command()
def enrich(
    skip_tmdb: bool = typer.Option(False, help="Skip TMDB gender enrichment"),
    skip_wikidata: bool = typer.Option(False, help="Skip Wikidata voice enrichment"),
    skip_bechdel: bool = typer.Option(False, help="Skip Bechdel test movie list download"),
    limit: int = typer.Option(0, help="Cap people to enrich (0 = all candidates)"),
) -> None:
    """Enrich people with TMDB gender + Wikidata voice-actor flags + Bechdel titles."""
    enrich_all(
        skip_tmdb=skip_tmdb,
        skip_wikidata=skip_wikidata,
        skip_bechdel=skip_bechdel,
        limit=limit or None,
    )


@app.command()
def build(
    construct: str = typer.Option(
        "all",
        help="Construct id or 'all'",
    ),
    top_n: int | None = typer.Option(None, help="Max people nodes for hero density"),
) -> None:
    """Build construct JSON (nodes/edges/stages/manifest) into data/out/."""
    from loom import DEFAULT_TOP_N, MAX_HERO_NODES

    n = DEFAULT_TOP_N if top_n is None else top_n
    if n > MAX_HERO_NODES:
        console.print(
            f"[yellow]Clamping top_n {n} → {MAX_HERO_NODES} (MAX_HERO_NODES)[/yellow]"
        )
        n = MAX_HERO_NODES
    if construct == "all":
        build_all(top_n=n)
    else:
        build_one(construct, top_n=n)


@app.command()
def spike() -> None:
    """M0 fail-fast: voice-actors-in-cartoons → static HTML sketch."""
    run_spike()


@app.command("list-constructs")
def list_constructs() -> None:
    """List available construct ids."""
    from loom.constructs import get_constructs

    for c in get_constructs().values():
        console.print(f"[bold]{c.id}[/bold]  —  {c.title}")


if __name__ == "__main__":
    app()
