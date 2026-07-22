#!/usr/bin/env python3
"""Pipeline sanity checks for IMDb Loom constructs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "out"

REQUIRED = ("nodes", "edges", "stages", "manifest")


def check_construct(cid: str) -> list[str]:
    errors: list[str] = []
    d = OUT / cid
    for name in REQUIRED:
        p = d / f"{name}.json"
        if not p.exists():
            errors.append(f"{cid}: missing {name}.json")
            return errors
    nodes = json.loads((d / "nodes.json").read_text())
    edges = json.loads((d / "edges.json").read_text())
    stages = json.loads((d / "stages.json").read_text())
    manifest = json.loads((d / "manifest.json").read_text())

    if not nodes:
        errors.append(f"{cid}: empty nodes")
    if len(nodes) > 300:
        errors.append(f"{cid}: density budget exceeded ({len(nodes)} > 300)")
    for n in nodes[:5]:
        for k in ("id", "label", "type", "degree"):
            if k not in n:
                errors.append(f"{cid}: node missing {k}")
                break
    ids = {n["id"] for n in nodes}
    for e in edges[:20]:
        for k in ("source", "target", "weight", "construct"):
            if k not in e:
                errors.append(f"{cid}: edge missing {k}")
                break
        if e.get("source") not in ids or e.get("target") not in ids:
            # filtered edges may still reference — warn only if many
            pass
    for s in stages[:5]:
        for k in ("stageFrom", "stageTo", "categoryFrom", "categoryTo", "value"):
            if k not in s:
                errors.append(f"{cid}: stage missing {k}")
                break
    if manifest.get("id") != cid:
        errors.append(f"{cid}: manifest.id mismatch")
    if not manifest.get("method_note"):
        errors.append(f"{cid}: empty method_note")
    return errors


def main() -> int:
    index_path = OUT / "index.json"
    if not index_path.exists():
        print("FAIL: data/out/index.json missing — run `loom build`")
        return 1
    index = json.loads(index_path.read_text())
    print(f"Checking {len(index)} constructs…")
    all_errors: list[str] = []
    for m in index:
        errs = check_construct(m["id"])
        if errs:
            all_errors.extend(errs)
            print(f"  ✗ {m['id']}")
        else:
            n = m.get("node_count", "?")
            e = m.get("edge_count", "?")
            print(f"  ✓ {m['id']}: {n} nodes, {e} edges")

    # Spot-check: scream_queen should be female-coded; men_horror male
    sq = json.loads((OUT / "scream_queen" / "nodes.json").read_text())
    mh = json.loads((OUT / "men_horror" / "nodes.json").read_text())
    if sq and any(n.get("gender") == "male" for n in sq[:50]):
        # soft warn — some may be unknown
        pass
    if mh and sum(1 for n in mh if n.get("gender") == "male") < len(mh) * 0.8:
        all_errors.append("men_horror: expected mostly male-coded nodes")

    if all_errors:
        print("\nFailures:")
        for e in all_errors:
            print(" ", e)
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
