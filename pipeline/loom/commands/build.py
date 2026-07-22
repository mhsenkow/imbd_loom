"""Build construct JSON into data/out/."""

from __future__ import annotations

import json
from collections import defaultdict

from rich.console import Console

from loom import OUT
from loom.constructs import get_constructs
from loom.constructs.emit import write_construct
from loom.db import connect, ensure_dirs, register_base_tables

console = Console()


def build_one(construct_id: str, *, top_n: int = 200) -> dict:
    constructs = get_constructs()
    if construct_id not in constructs:
        console.print(f"[red]Unknown construct:[/red] {construct_id}")
        console.print("Available: " + ", ".join(constructs))
        raise SystemExit(1)

    ensure_dirs()
    con = connect()
    register_base_tables(con)

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
    return payload


def _index_entry(manifest: dict, payload: dict | None = None) -> dict:
    """Enrich index card with thumbnail stats for the gallery."""
    entry = {
        "id": manifest["id"],
        "title": manifest["title"],
        "subtitle": manifest.get("subtitle"),
        "key_variable": manifest.get("key_variable"),
        "node_count": manifest.get("node_count"),
        "edge_count": manifest.get("edge_count"),
        "built_at": manifest.get("built_at"),
        "method_note": manifest.get("method_note"),
        "data_credit": manifest.get("data_credit"),
        "clustering_coefficient": manifest.get("clustering_coefficient"),
        "avg_path_length": manifest.get("avg_path_length"),
        "community_count": manifest.get("community_count"),
    }
    summary = manifest.get("summary") or {}
    entry["top_name"] = summary.get("top_name")
    entry["era_histogram"] = summary.get("era_histogram")
    entry["gender_mix"] = summary.get("gender_mix")
    if payload and payload.get("quality"):
        entry["quality"] = payload["quality"]
    # Era span from summary histogram keys
    eras = list((summary.get("era_histogram") or {}).keys())
    if eras:
        entry["era_span"] = f"{eras[0]}–{eras[-1]}"
    featured = manifest.get("featured_path")
    if featured:
        entry["featured_path_labels"] = [p.get("label") for p in featured]
    return entry


def write_people_index(construct_ids: list[str]) -> None:
    """Cross-construct person index: nconst → constructs + label."""
    people: dict[str, dict] = {}
    for cid in construct_ids:
        path = OUT / cid / "nodes.json"
        if not path.exists():
            continue
        with open(path, encoding="utf-8") as f:
            nodes = json.load(f)
        for n in nodes:
            nid = n["id"]
            rec = people.setdefault(
                nid,
                {"id": nid, "label": n.get("label"), "constructs": []},
            )
            if cid not in rec["constructs"]:
                rec["constructs"].append(cid)
            if n.get("label") and not rec.get("label"):
                rec["label"] = n["label"]
    out = OUT / "people.json"
    # Sort by number of constructs desc
    ordered = sorted(people.values(), key=lambda r: (-len(r["constructs"]), r.get("label") or ""))
    with open(out, "w", encoding="utf-8") as f:
        json.dump(ordered, f, indent=2, ensure_ascii=False)
    console.print(f"[green]✓[/green] Wrote {out} ({len(ordered):,} people)")


def write_quality_rollup(construct_ids: list[str]) -> None:
    rollup = []
    for cid in construct_ids:
        path = OUT / cid / "quality.json"
        if path.exists():
            with open(path, encoding="utf-8") as f:
                q = json.load(f)
            q["id"] = cid
            rollup.append(q)
    path = OUT / "quality.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rollup, f, indent=2)
    console.print(f"[green]✓[/green] Wrote {path}")


def build_all(*, top_n: int = 200) -> None:
    constructs = get_constructs()
    index = []
    ids = []
    for cid in constructs:
        payload = build_one(cid, top_n=top_n)
        ids.append(cid)
        manifest_path = OUT / cid / "manifest.json"
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
        index.append(_index_entry(manifest, payload))

    index_path = OUT / "index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)
    console.print(f"[green]✓[/green] Wrote {index_path} ({len(index)} constructs)")

    write_people_index(ids)
    write_quality_rollup(ids)
