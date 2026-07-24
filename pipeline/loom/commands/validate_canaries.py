"""Validate canary people appear in the right construct node lists."""

from __future__ import annotations

import json
from pathlib import Path

from rich.console import Console

from loom import OUT, ROOT

console = Console()


def canaries_path() -> Path:
    return ROOT / "data" / "fixtures" / "canaries.json"


def validate_canaries() -> int:
    path = canaries_path()
    if not path.exists():
        console.print(f"[yellow]No canaries file at {path}[/yellow]")
        return 0
    data = json.loads(path.read_text(encoding="utf-8"))
    errors = 0
    for entry in data.get("people", []):
        constructs = entry.get("constructs") or []
        if not constructs:
            continue
        label = entry["label"]
        nconst = entry.get("nconst")
        for cid in constructs:
            nodes_path = OUT / cid / "nodes.json"
            if not nodes_path.exists():
                console.print(f"[red]MISSING[/red] {cid}/nodes.json (need {label})")
                errors += 1
                continue
            nodes = json.loads(nodes_path.read_text(encoding="utf-8"))
            if not nodes:
                # Empty-on-cold enrichment — skip canary
                man = json.loads((OUT / cid / "manifest.json").read_text(encoding="utf-8"))
                if (man.get("method_note") or "").startswith("EMPTY:"):
                    console.print(f"[dim]skip[/dim] {label} ∈ {cid} (EMPTY enrichment)")
                    continue
            labels = {n.get("label") for n in nodes}
            ids = {n.get("id") for n in nodes}
            ascii_labels = {n.get("label_ascii") for n in nodes}
            ok = label in labels or label in ascii_labels or (nconst and nconst in ids)
            if not ok:
                console.print(f"[red]CANARY[/red] {label} not in {cid} ({len(nodes)} nodes)")
                errors += 1
            else:
                console.print(f"[green]ok[/green] {label} ∈ {cid}")

    # Role seeds in same_character
    roles = data.get("same_character_roles") or []
    sc_path = OUT / "same_character" / "nodes.json"
    if roles and sc_path.exists():
        nodes = json.loads(sc_path.read_text(encoding="utf-8"))
        blob = " ".join(
            (n.get("top_shared_character") or "").lower() for n in nodes
        )
        for role in roles:
            if role.lower() in blob:
                console.print(f"[green]ok[/green] role seed “{role}” in same_character")
            else:
                console.print(f"[red]CANARY[/red] role seed “{role}” missing from same_character")
                errors += 1

    if errors:
        console.print(f"[red]{errors} canary failure(s)[/red]")
    else:
        console.print("[green]All canaries present[/green]")
    return 1 if errors else 0
