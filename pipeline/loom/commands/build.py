"""Build construct JSON into data/out/."""

from __future__ import annotations

import json

from rich.console import Console

from loom import OUT
from loom.constructs import get_constructs
from loom.constructs.emit import write_construct
from loom.db import connect, ensure_dirs, register_base_tables

console = Console()


def build_one(construct_id: str, *, top_n: int = 200) -> None:
    constructs = get_constructs()
    if construct_id not in constructs:
        console.print(f"[red]Unknown construct:[/red] {construct_id}")
        console.print("Available: " + ", ".join(constructs))
        raise SystemExit(1)

    ensure_dirs()
    con = connect()
    register_base_tables(con)

    # Sanity: parquet must exist
    try:
        con.execute("SELECT 1 FROM title_principals LIMIT 1")
    except Exception:
        console.print("[red]Base tables missing — run `loom download` then `loom parquet`[/red]")
        raise SystemExit(1)

    c = constructs[construct_id]
    console.print(f"[bold]Building[/bold] {c.id} — {c.title} (top_n={top_n})")
    payload = c.build(con, top_n)
    write_construct(c.id, payload)
    console.print(
        f"[green]✓[/green] {c.id}: {len(payload['nodes'])} nodes, "
        f"{len(payload['edges'])} edges, {len(payload['stages'])} stage rows"
    )


def build_all(*, top_n: int = 200) -> None:
    constructs = get_constructs()
    index = []
    for cid in constructs:
        build_one(cid, top_n=top_n)
        manifest_path = OUT / cid / "manifest.json"
        with open(manifest_path, encoding="utf-8") as f:
            index.append(json.load(f))
    # Write index for the app
    index_path = OUT / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)
    console.print(f"[green]✓[/green] Wrote {index_path}")
