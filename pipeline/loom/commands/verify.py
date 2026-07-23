"""Verify construct JSON invariants after build."""

from __future__ import annotations

import json
import math
from collections import defaultdict

from rich.console import Console

from loom import OUT

console = Console()

REQUIRED = ("nodes", "edges", "stages", "manifest")


def _check_construct(cid: str) -> list[str]:
    errors: list[str] = []
    d = OUT / cid
    for name in REQUIRED:
        p = d / f"{name}.json"
        if not p.exists():
            errors.append(f"{cid}: missing {name}.json")
            return errors

    nodes = json.loads((d / "nodes.json").read_text(encoding="utf-8"))
    edges = json.loads((d / "edges.json").read_text(encoding="utf-8"))
    stages = json.loads((d / "stages.json").read_text(encoding="utf-8"))
    manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))

    if not nodes:
        note = (manifest.get("method_note") or "").strip()
        mode = (manifest.get("build_stats") or {}).get("enrichment_mode")
        if note.startswith("EMPTY:") or mode == "empty":
            return []
        errors.append(f"{cid}: empty nodes")
    if len(nodes) > 300:
        errors.append(f"{cid}: density budget exceeded ({len(nodes)} > 300)")

    for n in nodes[:8]:
        for k in ("id", "label", "type", "degree"):
            if k not in n:
                errors.append(f"{cid}: node missing {k}")
                break

    ids = {n["id"] for n in nodes}
    neighbors: dict[str, set[str]] = defaultdict(set)
    strength: dict[str, float] = defaultdict(float)
    for e in edges:
        a, b = e.get("source"), e.get("target")
        w = float(e.get("weight") or 0)
        if a in ids and b in ids and a != b:
            neighbors[a].add(b)
            neighbors[b].add(a)
            strength[a] += w
            strength[b] += w
        for k in ("source", "target", "weight", "construct"):
            if k not in e:
                errors.append(f"{cid}: edge missing {k}")
                break
        span = e.get("reunion_span")
        if span is not None and span < 0:
            errors.append(f"{cid}: reunion_span < 0")
        j = e.get("edge_genre_jaccard")
        if j is not None and not (0 <= float(j) <= 1):
            errors.append(f"{cid}: edge_genre_jaccard out of [0,1]")

    # Recompute neighbor counts / strength for a sample of nodes
    sample = nodes if len(nodes) <= 40 else nodes[:: max(1, len(nodes) // 40)][:40]
    for n in sample:
        nid = n["id"]
        deg = int(n.get("degree") or 0)
        got = len(neighbors.get(nid, ()))
        if n.get("strength") is not None and deg > got + 1:
            # allow ±1 from isolates filtered differently
            pass
        if n.get("strength") is not None and got and abs(deg - got) > 0:
            errors.append(f"{cid}: {nid} degree {deg} ≠ neighbors {got}")
        if n.get("strength") is not None:
            s = float(n["strength"])
            if s + 1e-6 < deg:
                errors.append(f"{cid}: {nid} strength {s} < degree {deg}")
            expected = strength.get(nid, 0.0)
            if expected and abs(s - expected) > 1.5:
                errors.append(f"{cid}: {nid} strength {s} ≠ recomputed {expected:.1f}")
        for pct_key in ("degree_pct", "strength_pct", "prominence_pct"):
            p = n.get(pct_key)
            if p is not None and not (0 <= float(p) <= 100):
                errors.append(f"{cid}: {nid} {pct_key}={p} out of [0,100]")

    for s in stages[:5]:
        for k in ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"):
            if k not in s:
                errors.append(f"{cid}: stage missing {k}")
                break

    if manifest.get("id") != cid:
        errors.append(f"{cid}: manifest.id mismatch")
    if not (manifest.get("method_note") or "").strip():
        errors.append(f"{cid}: empty method_note")
    if not (manifest.get("data_credit") or "").strip():
        errors.append(f"{cid}: empty data_credit")

    mv = manifest.get("metrics_version")
    if mv is not None and str(mv) not in ("1", "2"):
        errors.append(f"{cid}: unexpected metrics_version {mv}")

    # Soft sanity: correlations finite when present
    corr = manifest.get("correlations") or {}
    for k, v in corr.items():
        r = v.get("r") if isinstance(v, dict) else None
        if r is not None and (not isinstance(r, (int, float)) or not math.isfinite(r)):
            errors.append(f"{cid}: bad correlation {k}")

    return errors


def verify_all() -> int:
    index_path = OUT / "index.json"
    if not index_path.exists():
        console.print("[red]FAIL:[/red] data/out/index.json missing — run `loom build`")
        return 1

    index = json.loads(index_path.read_text(encoding="utf-8"))
    console.print(f"Verifying {len(index)} constructs…")
    all_errors: list[str] = []
    for m in index:
        cid = m["id"]
        errs = _check_construct(cid)
        if errs:
            all_errors.extend(errs)
            console.print(f"  [red]✗[/red] {cid}")
        else:
            n = m.get("node_count", "?")
            e = m.get("edge_count", "?")
            console.print(f"  [green]✓[/green] {cid}: {n} nodes, {e} edges")

    if all_errors:
        console.print("\n[red]Failures:[/red]")
        for e in all_errors[:40]:
            console.print(f"  {e}")
        if len(all_errors) > 40:
            console.print(f"  … and {len(all_errors) - 40} more")
        return 1

    console.print("\n[green]All checks passed.[/green]")
    return 0
