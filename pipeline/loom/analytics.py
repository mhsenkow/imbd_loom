"""Graph analytics attached to construct payloads."""

from __future__ import annotations

import math
from collections import defaultdict, deque
from typing import Any


def _adj(nodes: list[dict], edges: list[dict]) -> dict[str, set[str]]:
    ids = {n["id"] for n in nodes}
    g: dict[str, set[str]] = {i: set() for i in ids}
    for e in edges:
        s, t = e["source"], e["target"]
        if s in ids and t in ids:
            g[s].add(t)
            g[t].add(s)
    return g


def betweenness_centrality(nodes: list[dict], edges: list[dict]) -> dict[str, float]:
    """Brandes betweenness (unweighted). Normalized 0–1."""
    g = _adj(nodes, edges)
    ids = list(g.keys())
    n = len(ids)
    if n < 3:
        return {i: 0.0 for i in ids}

    cb: dict[str, float] = {i: 0.0 for i in ids}
    for s in ids:
        stack: list[str] = []
        pred: dict[str, list[str]] = {i: [] for i in ids}
        sigma: dict[str, float] = {i: 0.0 for i in ids}
        dist: dict[str, int] = {i: -1 for i in ids}
        sigma[s] = 1.0
        dist[s] = 0
        q: deque[str] = deque([s])
        while q:
            v = q.popleft()
            stack.append(v)
            for w in g[v]:
                if dist[w] < 0:
                    dist[w] = dist[v] + 1
                    q.append(w)
                if dist[w] == dist[v] + 1:
                    sigma[w] += sigma[v]
                    pred[w].append(v)
        delta: dict[str, float] = {i: 0.0 for i in ids}
        while stack:
            w = stack.pop()
            for v in pred[w]:
                if sigma[w]:
                    delta[v] += (sigma[v] / sigma[w]) * (1.0 + delta[w])
            if w != s:
                cb[w] += delta[w]
    # Undirected normalize
    scale = 1.0 / ((n - 1) * (n - 2)) if n > 2 else 1.0
    return {i: round(cb[i] * scale, 6) for i in ids}


def louvain_communities(nodes: list[dict], edges: list[dict], *, passes: int = 8) -> dict[str, int]:
    """Lightweight greedy modularity communities (approx Louvain first phase)."""
    g = _adj(nodes, edges)
    ids = list(g.keys())
    if not ids:
        return {}
    # Weighted degrees from edge weights
    weight: dict[tuple[str, str], float] = {}
    for e in edges:
        a, b = e["source"], e["target"]
        if a not in g or b not in g:
            continue
        w = float(e.get("weight") or 1)
        weight[(a, b)] = w
        weight[(b, a)] = w
    deg = {i: sum(weight.get((i, j), 1.0) for j in g[i]) for i in ids}
    m2 = sum(deg.values()) or 1.0
    community = {i: idx for idx, i in enumerate(ids)}

    def modularity_gain(node: str, target_c: int) -> float:
        # Neighbor community weight
        kin = 0.0
        for j in g[node]:
            if community[j] == target_c:
                kin += weight.get((node, j), 1.0)
        tot = sum(deg[j] for j in ids if community[j] == target_c)
        return kin - (deg[node] * tot) / m2

    for _ in range(passes):
        moved = False
        for node in ids:
            cur = community[node]
            best_c, best_gain = cur, 0.0
            neighbor_cs = {community[j] for j in g[node]} | {cur}
            for c in neighbor_cs:
                if c == cur:
                    continue
                gain = modularity_gain(node, c)
                if gain > best_gain:
                    best_gain, best_c = gain, c
            if best_c != cur:
                community[node] = best_c
                moved = True
        if not moved:
            break

    # Compact labels 0..k-1
    remap: dict[int, int] = {}
    out: dict[str, int] = {}
    for i in ids:
        c = community[i]
        if c not in remap:
            remap[c] = len(remap)
        out[i] = remap[c]
    return out


def clustering_coefficient(nodes: list[dict], edges: list[dict]) -> float:
    g = _adj(nodes, edges)
    coeffs = []
    for v, nbrs in g.items():
        k = len(nbrs)
        if k < 2:
            continue
        links = 0
        nbr_list = list(nbrs)
        for i in range(len(nbr_list)):
            for j in range(i + 1, len(nbr_list)):
                if nbr_list[j] in g[nbr_list[i]]:
                    links += 1
        coeffs.append(2 * links / (k * (k - 1)))
    return round(sum(coeffs) / len(coeffs), 4) if coeffs else 0.0


def average_path_length(
    nodes: list[dict], edges: list[dict], *, sample: int = 40
) -> tuple[float | None, int]:
    """Return (mean path length, sample source count). Exact when |V| ≤ sample."""
    g = _adj(nodes, edges)
    ids = [i for i, nbrs in g.items() if nbrs]
    if len(ids) < 2:
        return None, 0
    if len(ids) <= sample:
        sources = ids
    else:
        step = max(1, len(ids) // sample)
        sources = ids[::step][:sample]
    total = 0
    count = 0
    for s in sources:
        dist = {s: 0}
        q: deque[str] = deque([s])
        while q:
            v = q.popleft()
            for w in g[v]:
                if w not in dist:
                    dist[w] = dist[v] + 1
                    q.append(w)
        for d in dist.values():
            if d > 0:
                total += d
                count += 1
    if not count:
        return None, len(sources)
    return round(total / count, 3), len(sources)


def shortest_path(nodes: list[dict], edges: list[dict], source: str, target: str) -> list[str] | None:
    g = _adj(nodes, edges)
    if source not in g or target not in g:
        return None
    prev: dict[str, str | None] = {source: None}
    q: deque[str] = deque([source])
    while q:
        v = q.popleft()
        if v == target:
            break
        for w in g[v]:
            if w not in prev:
                prev[w] = v
                q.append(w)
    if target not in prev:
        return None
    path = []
    cur: str | None = target
    while cur is not None:
        path.append(cur)
        cur = prev[cur]
    path.reverse()
    return path


def attach_analytics(nodes: list[dict], edges: list[dict]) -> dict[str, Any]:
    """Mutate nodes with bridge_score, community, percentiles; return summary metrics."""
    if not nodes:
        return {}

    bc = betweenness_centrality(nodes, edges)
    communities = louvain_communities(nodes, edges)

    degrees = sorted(n.get("degree", 0) or 0 for n in nodes)
    prominences = sorted(float(n.get("prominence") or 0) for n in nodes)

    def pct(sorted_vals: list[float], v: float) -> int:
        if not sorted_vals:
            return 0
        # rank percentile
        lo = 0
        hi = len(sorted_vals)
        while lo < hi:
            mid = (lo + hi) // 2
            if sorted_vals[mid] < v:
                lo = mid + 1
            else:
                hi = mid
        return int(round(100 * lo / max(len(sorted_vals) - 1, 1)))

    for n in nodes:
        nid = n["id"]
        n["bridge_score"] = bc.get(nid, 0.0)
        n["community"] = communities.get(nid, 0)
        n["degree_pct"] = pct(degrees, float(n.get("degree") or 0))
        n["prominence_pct"] = pct(prominences, float(n.get("prominence") or 0))

    # Featured path between two highest-prominence connected nodes
    ranked = sorted(nodes, key=lambda x: float(x.get("prominence") or x.get("degree") or 0), reverse=True)
    featured: list[dict] | None = None
    labels = {n["id"]: n["label"] for n in nodes}
    for i, a in enumerate(ranked[:12]):
        for b in ranked[i + 1 : 12]:
            path = shortest_path(nodes, edges, a["id"], b["id"])
            if path and len(path) >= 2:
                featured = [{"id": pid, "label": labels.get(pid, pid)} for pid in path]
                break
        if featured:
            break

    # Era histogram + gender mix for summary
    era: dict[str, int] = defaultdict(int)
    gender: dict[str, int] = defaultdict(int)
    for n in nodes:
        gender[str(n.get("gender") or "unknown")] += 1
        yp = n.get("year_peak")
        if yp:
            decade = f"{(int(yp) // 10) * 10}s"
            era[decade] += 1

    avg_path, avg_path_n = average_path_length(nodes, edges)
    return {
        "clustering_coefficient": clustering_coefficient(nodes, edges),
        "avg_path_length": avg_path,
        "avg_path_sample_n": avg_path_n,
        "community_count": len(set(communities.values())) if communities else 0,
        "featured_path": featured,
        "summary": {
            "gender_mix": dict(gender),
            "era_histogram": dict(sorted(era.items())),
            "degree_max": max(degrees) if degrees else 0,
            "degree_median": degrees[len(degrees) // 2] if degrees else 0,
            "top_name": ranked[0]["label"] if ranked else None,
        },
    }


def decade_edge_slices(edges: list[dict]) -> dict[str, list[dict]]:
    """Group edges by collaboration decade for era animation."""
    out: dict[str, list[dict]] = defaultdict(list)
    for e in edges:
        y = e.get("year") or e.get("first_worked_together")
        if y is None:
            continue
        decade = f"{(int(y) // 10) * 10}s"
        out[decade].append(
            {
                "source": e["source"],
                "target": e["target"],
                "weight": e.get("weight", 1),
                "year": int(y),
            }
        )
    return dict(sorted(out.items()))


def simple_layout_2d(nodes: list[dict], edges: list[dict], *, seed: int = 42) -> None:
    """Deterministic spring-ish 2D embedding as constellation coords (no numpy)."""
    import random

    rng = random.Random(seed)
    g = _adj(nodes, edges)
    ids = [n["id"] for n in nodes]
    pos = {i: (rng.uniform(-1, 1), rng.uniform(-1, 1)) for i in ids}
    # Few iterations of force-directed
    for _ in range(40):
        disp = {i: [0.0, 0.0] for i in ids}
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                dx = pos[a][0] - pos[b][0]
                dy = pos[a][1] - pos[b][1]
                dist = math.hypot(dx, dy) or 0.01
                # repulsion
                force = 0.05 / (dist * dist)
                disp[a][0] += dx / dist * force
                disp[a][1] += dy / dist * force
                disp[b][0] -= dx / dist * force
                disp[b][1] -= dy / dist * force
        for e in edges:
            a, b = e["source"], e["target"]
            if a not in pos or b not in pos:
                continue
            dx = pos[a][0] - pos[b][0]
            dy = pos[a][1] - pos[b][1]
            dist = math.hypot(dx, dy) or 0.01
            force = dist * 0.02
            disp[a][0] -= dx / dist * force
            disp[a][1] -= dy / dist * force
            disp[b][0] += dx / dist * force
            disp[b][1] += dy / dist * force
        for i in ids:
            x = pos[i][0] + max(-0.1, min(0.1, disp[i][0]))
            y = pos[i][1] + max(-0.1, min(0.1, disp[i][1]))
            pos[i] = (x, y)
    for n in nodes:
        x, y = pos[n["id"]]
        n["embed_x"] = round(x, 4)
        n["embed_y"] = round(y, 4)
