#!/usr/bin/env python3
"""Print per-construct field distributions + Pearson r (metrics regression baseline)."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "out"

PAIR_DEFAULT = [
    ("degree", "prominence"),
    ("degree", "strength"),
    ("strength", "prominence"),
    ("title_rating_median", "prominence"),
    ("title_count", "character_count"),
    ("genre_entropy", "degree"),
]


def pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx < 1e-12 or dy < 1e-12:
        return None
    return round(num / (dx * dy), 4)


def dist(vals: list[float]) -> dict:
    if not vals:
        return {"n": 0}
    s = sorted(vals)
    return {
        "n": len(s),
        "min": round(s[0], 3),
        "median": round(statistics.median(s), 3),
        "max": round(s[-1], 3),
        "mean": round(statistics.fmean(s), 3),
    }


def load_nodes(cid: str, root: Path) -> list[dict]:
    path = root / cid / "nodes.json"
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8"))


def report_construct(cid: str, root: Path, fields: list[str], pairs: list[tuple[str, str]]) -> dict:
    nodes = load_nodes(cid, root)
    out: dict = {"id": cid, "node_count": len(nodes), "distributions": {}, "correlations": {}}
    for f in fields:
        vals = [float(n[f]) for n in nodes if isinstance(n.get(f), (int, float))]
        out["distributions"][f] = dist(vals)
    for a, b in pairs:
        xs, ys = [], []
        for n in nodes:
            if isinstance(n.get(a), (int, float)) and isinstance(n.get(b), (int, float)):
                xs.append(float(n[a]))
                ys.append(float(n[b]))
        r = pearson(xs, ys)
        out["correlations"][f"{a}×{b}"] = {"r": r, "n": len(xs)}
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", type=Path, default=OUT)
    ap.add_argument(
        "--fields",
        default="degree,strength,prominence,title_count,character_count,title_rating_median,genre_entropy,collaborator_loyalty",
    )
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    fields = [f.strip() for f in args.fields.split(",") if f.strip()]
    ids = sorted(p.name for p in args.root.iterdir() if (p / "nodes.json").exists())
    reports = [report_construct(cid, args.root, fields, PAIR_DEFAULT) for cid in ids]
    if args.json:
        print(json.dumps(reports, indent=2))
        return
    for rep in reports:
        print(f"\n=== {rep['id']} (n={rep['node_count']}) ===")
        for f, d in rep["distributions"].items():
            if d.get("n"):
                print(f"  {f}: min={d['min']} med={d['median']} max={d['max']} mean={d['mean']}")
        for k, v in rep["correlations"].items():
            print(f"  r({k}) = {v['r']} (n={v['n']})")


if __name__ == "__main__":
    main()
