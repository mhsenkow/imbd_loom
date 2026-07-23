"""Default alluvial stages from person nodes when a construct emits none."""

from __future__ import annotations

from collections import Counter
from typing import Any


def _era(year: Any) -> str:
    try:
        y = int(year)
    except (TypeError, ValueError):
        return "unknown era"
    if y < 1980:
        return "pre-1980"
    if y < 2000:
        return "1980–1999"
    if y < 2015:
        return "2000–2014"
    return "2015+"


def _degree_band(degree: Any) -> str:
    try:
        d = int(degree or 0)
    except (TypeError, ValueError):
        d = 0
    if d >= 40:
        return "hub"
    if d >= 15:
        return "connected"
    if d >= 5:
        return "linked"
    return "sparse"


def stages_from_nodes(nodes: list[dict]) -> list[dict]:
    """gender → era → degree_band flows for the strip alluvial."""
    if not nodes:
        return []
    g_e: Counter[tuple[str, str]] = Counter()
    e_d: Counter[tuple[str, str]] = Counter()
    for n in nodes:
        gender = str(n.get("gender") or "unknown")
        era = _era(n.get("year_peak") or n.get("year_max"))
        band = _degree_band(n.get("degree"))
        g_e[(gender, era)] += 1
        e_d[(era, band)] += 1

    stages: list[dict] = []
    for (g, e), v in g_e.items():
        stages.append(
            {
                "stageFrom": "gender",
                "stageTo": "era",
                "categoryFrom": g,
                "categoryTo": e,
                "value": v,
            }
        )
    for (e, b), v in e_d.items():
        stages.append(
            {
                "stageFrom": "era",
                "stageTo": "degree",
                "categoryFrom": e,
                "categoryTo": b,
                "value": v,
            }
        )
    return stages
