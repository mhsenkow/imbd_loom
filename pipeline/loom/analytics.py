"""Graph analytics attached to construct payloads."""

from __future__ import annotations

import math
from collections import Counter, defaultdict, deque
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
    nodes: list[dict], edges: list[dict], *, sample: int = 40, exact_below: int = 600
) -> tuple[float | None, int, bool]:
    """Return (mean path length, source count, sampled?). Exact when |V| < exact_below."""
    g = _adj(nodes, edges)
    ids = [i for i, nbrs in g.items() if nbrs]
    if len(ids) < 2:
        return None, 0, False
    sampled = len(ids) >= exact_below
    if not sampled:
        sources = ids
    else:
        step = max(1, len(ids) // sample)
        sources = ids[::step][:sample]
    total = 0
    count = 0
    all_dists: list[int] = []
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
                all_dists.append(d)
    if not count:
        return None, len(sources), sampled
    return round(total / count, 3), len(sources), sampled


def path_diameter_stats(
    nodes: list[dict], edges: list[dict], *, exact_below: int = 600
) -> tuple[int | None, float | None]:
    """Diameter and 90th-percentile path length for small graphs."""
    g = _adj(nodes, edges)
    ids = [i for i, nbrs in g.items() if nbrs]
    if len(ids) < 2 or len(ids) >= exact_below:
        return None, None
    dists: list[int] = []
    for s in ids:
        dist = {s: 0}
        q: deque[str] = deque([s])
        while q:
            v = q.popleft()
            for w in g[v]:
                if w not in dist:
                    dist[w] = dist[v] + 1
                    q.append(w)
        dists.extend(d for d in dist.values() if d > 0)
    if not dists:
        return None, None
    dists.sort()
    diameter = dists[-1]
    p90 = dists[int(0.9 * (len(dists) - 1))]
    return diameter, float(p90)


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


def _pct_rank(sorted_vals: list[float], v: float) -> int:
    if not sorted_vals:
        return 0
    lo, hi = 0, len(sorted_vals)
    while lo < hi:
        mid = (lo + hi) // 2
        if sorted_vals[mid] < v:
            lo = mid + 1
        else:
            hi = mid
    return int(round(100 * lo / max(len(sorted_vals) - 1, 1)))


def _zscore(vals: list[float], v: float) -> float:
    if len(vals) < 2:
        return 0.0
    mean = sum(vals) / len(vals)
    var = sum((x - mean) ** 2 for x in vals) / len(vals)
    sd = math.sqrt(var) or 1.0
    return (v - mean) / sd


def gini(values: list[float]) -> float:
    """Gini coefficient of non-negative values."""
    xs = sorted(max(0.0, float(v)) for v in values)
    n = len(xs)
    if n < 2:
        return 0.0
    total = sum(xs)
    if total <= 0:
        return 0.0
    cum = 0.0
    for i, x in enumerate(xs, start=1):
        cum += i * x
    return round((2 * cum) / (n * total) - (n + 1) / n, 4)


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


def spearman(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None

    def ranks(vals: list[float]) -> list[float]:
        order = sorted(range(n), key=lambda i: vals[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1.0
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    return pearson(ranks(xs), ranks(ys))


def correlations(
    nodes: list[dict],
    pairs: list[tuple[str, str]] | None = None,
) -> dict[str, dict[str, Any]]:
    """Pearson + Spearman for field pairs; null when degenerate (n<8 or constant)."""
    pairs = pairs or [
        ("degree", "prominence"),
        ("strength", "prominence"),
        ("degree", "strength"),
        ("title_rating_median", "prominence"),
        ("genre_entropy", "degree"),
        ("genre_entropy", "strength"),
        ("degree", "collaborator_loyalty"),
        ("acclaim_gap", "prominence"),
        ("pagerank", "prominence"),
    ]
    out: dict[str, dict[str, Any]] = {}
    for a, b in pairs:
        xs, ys = [], []
        for n in sorted(nodes, key=lambda x: x.get("id") or ""):
            if isinstance(n.get(a), (int, float)) and isinstance(n.get(b), (int, float)):
                xs.append(float(n[a]))
                ys.append(float(n[b]))
        key = f"{a}×{b}"
        if len(xs) < 8:
            out[key] = {"r": None, "rho": None, "n": len(xs)}
        else:
            out[key] = {
                "r": pearson(xs, ys),
                "rho": spearman(xs, ys),
                "n": len(xs),
            }
    return out


def pagerank(
    nodes: list[dict], edges: list[dict], *, damping: float = 0.85, iters: int = 40
) -> dict[str, float]:
    g = _adj(nodes, edges)
    ids = sorted(g.keys())
    n = len(ids)
    if not n:
        return {}
    # Weighted out-strength
    wadj: dict[str, list[tuple[str, float]]] = {i: [] for i in ids}
    strength = {i: 0.0 for i in ids}
    for e in edges:
        a, b = e["source"], e["target"]
        if a not in g or b not in g:
            continue
        w = float(e.get("weight") or 1)
        wadj[a].append((b, w))
        wadj[b].append((a, w))
        strength[a] += w
        strength[b] += w
    pr = {i: 1.0 / n for i in ids}
    for _ in range(iters):
        nxt = {i: (1.0 - damping) / n for i in ids}
        for i in ids:
            s = strength[i] or 1.0
            share = damping * pr[i] / s
            for j, w in wadj[i]:
                nxt[j] += share * w
        pr = nxt
    # Normalize to sum 1
    total = sum(pr.values()) or 1.0
    return {i: round(pr[i] / total, 8) for i in ids}


def eigen_centrality(nodes: list[dict], edges: list[dict], *, iters: int = 40) -> dict[str, float]:
    g = _adj(nodes, edges)
    ids = sorted(g.keys())
    if not ids:
        return {}
    wadj: dict[str, list[tuple[str, float]]] = {i: [] for i in ids}
    for e in edges:
        a, b = e["source"], e["target"]
        if a not in g or b not in g:
            continue
        w = float(e.get("weight") or 1)
        wadj[a].append((b, w))
        wadj[b].append((a, w))
    x = {i: 1.0 for i in ids}
    for _ in range(iters):
        nxt = {i: 0.0 for i in ids}
        for i in ids:
            for j, w in wadj[i]:
                nxt[j] += x[i] * w
        norm = math.sqrt(sum(v * v for v in nxt.values())) or 1.0
        x = {i: nxt[i] / norm for i in ids}
    return {i: round(x[i], 6) for i in ids}


def local_clustering(nodes: list[dict], edges: list[dict]) -> dict[str, float]:
    g = _adj(nodes, edges)
    out: dict[str, float] = {}
    for v, nbrs in g.items():
        k = len(nbrs)
        if k < 2:
            out[v] = 0.0
            continue
        links = 0
        nbr_list = list(nbrs)
        for i in range(len(nbr_list)):
            for j in range(i + 1, len(nbr_list)):
                if nbr_list[j] in g[nbr_list[i]]:
                    links += 1
        out[v] = round(2 * links / (k * (k - 1)), 4)
    return out


def k_core_numbers(nodes: list[dict], edges: list[dict]) -> dict[str, int]:
    g = {i: set(nbrs) for i, nbrs in _adj(nodes, edges).items()}
    core = {i: 0 for i in g}
    if not g:
        return core
    # Batagelj–Zaversnik style peeling
    remaining = set(g.keys())
    while remaining:
        # Find min degree among remaining
        min_d = min(len(g[i] & remaining) for i in remaining)
        # Peel all with degree <= min_d iteratively for this shell
        changed = True
        shell = set()
        while changed:
            changed = False
            for i in list(remaining):
                if len(g[i] & remaining) <= min_d:
                    shell.add(i)
                    remaining.remove(i)
                    changed = True
        for i in shell:
            core[i] = min_d
    return core


def modularity_score(nodes: list[dict], edges: list[dict], communities: dict[str, int]) -> float:
    if not communities or not edges:
        return 0.0
    m = sum(float(e.get("weight") or 1) for e in edges) or 1.0
    strength: dict[str, float] = defaultdict(float)
    for e in edges:
        w = float(e.get("weight") or 1)
        strength[e["source"]] += w
        strength[e["target"]] += w
    q = 0.0
    for e in edges:
        a, b = e["source"], e["target"]
        if communities.get(a) == communities.get(b):
            w = float(e.get("weight") or 1)
            q += w - (strength[a] * strength[b]) / (2 * m)
    return round(q / (2 * m), 4)


def degree_assortativity(nodes: list[dict], edges: list[dict]) -> float | None:
    """Newman's degree assortativity (unweighted degree)."""
    g = _adj(nodes, edges)
    if len(edges) < 8:
        return None
    xs, ys = [], []
    for e in edges:
        a, b = e["source"], e["target"]
        if a not in g or b not in g:
            continue
        xs.append(len(g[a]))
        ys.append(len(g[b]))
    return pearson(xs, ys)


def connected_components(nodes: list[dict], edges: list[dict]) -> list[list[str]]:
    g = _adj(nodes, edges)
    seen: set[str] = set()
    comps: list[list[str]] = []
    for start in sorted(g.keys()):
        if start in seen:
            continue
        stack = [start]
        comp = []
        seen.add(start)
        while stack:
            v = stack.pop()
            comp.append(v)
            for w in g[v]:
                if w not in seen:
                    seen.add(w)
                    stack.append(w)
        comps.append(sorted(comp))
    comps.sort(key=lambda c: (-len(c), c[0] if c else ""))
    return comps


def histogram(values: list[float], *, bins: int = 10) -> list[dict[str, float | int]]:
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi <= lo:
        return [{"lo": lo, "hi": hi, "count": len(values)}]
    width = (hi - lo) / bins
    counts = [0] * bins
    for v in values:
        idx = min(bins - 1, int((v - lo) / width))
        counts[idx] += 1
    out = []
    for i, c in enumerate(counts):
        out.append({"lo": round(lo + i * width, 3), "hi": round(lo + (i + 1) * width, 3), "count": c})
    return out


def enrich_edge_metrics(nodes: list[dict], edges: list[dict]) -> None:
    """Loyalty asymmetry, tenure overlap, era/age flags, genre jaccard, director glue."""
    by_id = {n["id"]: n for n in nodes}
    # Total collab strength per node (in-construct)
    totals: dict[str, float] = defaultdict(float)
    for e in edges:
        totals[e["source"]] += float(e.get("shared_count") or e.get("collab_count") or 0)
        totals[e["target"]] += float(e.get("shared_count") or e.get("collab_count") or 0)

    for e in edges:
        a, b = e["source"], e["target"]
        na, nb = by_id.get(a), by_id.get(b)
        shared = float(e.get("shared_count") or e.get("collab_count") or 0)
        if totals[a]:
            e["loyalty_ab"] = round(shared / totals[a], 3)
        if totals[b]:
            e["loyalty_ba"] = round(shared / totals[b], 3)

        if na and nb:
            # Tenure overlap vs collab span
            a0, a1 = na.get("year_min"), na.get("year_max")
            b0, b1 = nb.get("year_min"), nb.get("year_max")
            c0, c1 = e.get("first_worked_together"), e.get("last_worked_together")
            if all(isinstance(x, (int, float)) for x in (a0, a1, b0, b1)):
                overlap = max(0, min(int(a1), int(b1)) - max(int(a0), int(b0)))
                union = max(int(a1), int(b1)) - min(int(a0), int(b0))
                e["tenure_overlap"] = round(overlap / max(union, 1), 3)
            if isinstance(c0, (int, float)) and isinstance(c1, (int, float)):
                span = max(int(c1) - int(c0), 0)
                if all(isinstance(x, (int, float)) for x in (a0, a1, b0, b1)):
                    peer_span = max(0, min(int(a1), int(b1)) - max(int(a0), int(b0)))
                    e["same_era"] = peer_span >= max(span, 1) * 0.5
            ba, bb = na.get("birth_year"), nb.get("birth_year")
            if isinstance(ba, (int, float)) and isinstance(bb, (int, float)):
                gap = abs(int(ba) - int(bb))
                e["age_gap"] = gap
                e["cross_generational"] = gap >= 20

            ga = set()
            gb = set()
            if na.get("dominant_genre"):
                ga.add(str(na["dominant_genre"]))
            if nb.get("dominant_genre"):
                gb.add(str(nb["dominant_genre"]))
            # Prefer genre list on node if present
            for key, bucket in (("genres", ga),):
                pass
            # Use edge genres vs node dominant as weak jaccard of career genres via phases
            # Better: use concentration genres from career — approximate with dominant + edge genres
            eg = set(e.get("genres") or [])
            ga |= eg
            gb |= eg
            if ga or gb:
                e["edge_genre_jaccard"] = round(len(ga & gb) / max(len(ga | gb), 1), 3)

            da, db = na.get("top_director"), nb.get("top_director")
            if da and db and da == db:
                e["directorial_glue"] = True


def attach_analytics(nodes: list[dict], edges: list[dict]) -> dict[str, Any]:
    """Mutate nodes with centrality/percentiles; return summary + correlations."""
    if not nodes:
        return {}

    bc = betweenness_centrality(nodes, edges)
    communities = louvain_communities(nodes, edges)
    pr = pagerank(nodes, edges)
    eigen = eigen_centrality(nodes, edges)
    local_c = local_clustering(nodes, edges)
    kcore = k_core_numbers(nodes, edges)

    degrees = sorted(float(n.get("degree") or 0) for n in nodes)
    strengths = sorted(float(n.get("strength") or n.get("degree") or 0) for n in nodes)
    prominences = sorted(float(n.get("prominence") or 0) for n in nodes)
    ratings = [float(n["title_rating_median"]) for n in nodes if isinstance(n.get("title_rating_median"), (int, float))]
    pr_vals = sorted(pr.values())

    # Hub-vs-loyal needs loyalty scaled
    loyalties = [float(n.get("collaborator_loyalty") or 0) for n in nodes]
    max_loy = max(loyalties) if loyalties else 1.0

    for n in nodes:
        nid = n["id"]
        n["bridge_score"] = bc.get(nid, 0.0)
        n["community"] = communities.get(nid, 0)
        n["pagerank"] = pr.get(nid, 0.0)
        n["eigen_centrality"] = eigen.get(nid, 0.0)
        n["clustering_local"] = local_c.get(nid, 0.0)
        n["kcore"] = kcore.get(nid, 0)
        deg = float(n.get("degree") or 0)
        strength = float(n.get("strength") or deg)
        prom = float(n.get("prominence") or 0)
        n["degree_pct"] = _pct_rank(degrees, deg)
        n["strength_pct"] = _pct_rank(strengths, strength)
        n["prominence_pct"] = _pct_rank(prominences, prom)
        n["prominence_pct_construct"] = n["prominence_pct"]
        n["pagerank_pct"] = _pct_rank(pr_vals, float(n["pagerank"]))
        n["degree_z"] = round(_zscore(degrees, deg), 3)
        n["strength_z"] = round(_zscore(strengths, strength), 3)
        n["prominence_z"] = round(_zscore(prominences, prom), 3)
        n["pagerank_z"] = round(_zscore(pr_vals, float(n["pagerank"])), 3)
        # acclaim–popularity gap
        if isinstance(n.get("title_rating_median"), (int, float)) and ratings:
            n["acclaim_gap"] = round(
                _zscore(ratings, float(n["title_rating_median"])) - _zscore(prominences, prom),
                3,
            )
        loy = float(n.get("collaborator_loyalty") or 0)
        n["hub_vs_loyal"] = round(deg - (loy / max(max_loy, 1e-9)) * (max(degrees) or 1), 3)
        # In-construct collaborator reach ≈ degree; career reach if set later
        n["collaborator_reach"] = n.get("collaborator_reach") or int(deg)

    # Featured path between two highest-prominence connected nodes
    ranked = sorted(
        nodes,
        key=lambda x: float(x.get("prominence") or x.get("strength") or x.get("degree") or 0),
        reverse=True,
    )
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

    era: dict[str, int] = defaultdict(int)
    gender: dict[str, int] = defaultdict(int)
    for n in nodes:
        gender[str(n.get("gender") or "unknown")] += 1
        yp = n.get("year_peak")
        if yp:
            decade = f"{(int(yp) // 10) * 10}s"
            era[decade] += 1

    nn = len(nodes)
    ee = len(edges)
    density = round(2 * ee / max(nn * (nn - 1), 1), 6) if nn > 1 else 0.0
    comps = connected_components(nodes, edges)
    giant = len(comps[0]) if comps else 0
    community_sizes = sorted(Counter(communities.values()).values(), reverse=True)
    largest_share = round(community_sizes[0] / max(nn, 1), 3) if community_sizes else 0.0

    avg_path, avg_path_n, sampled = average_path_length(nodes, edges)
    diameter, effective_d = path_diameter_stats(nodes, edges)

    # Homophily
    by_id = {n["id"]: n for n in nodes}
    same_g = sum(
        1
        for e in edges
        if by_id.get(e["source"], {}).get("gender")
        and by_id.get(e["source"], {}).get("gender") == by_id.get(e["target"], {}).get("gender")
    )
    gender_homophily = round(same_g / max(ee, 1), 3) if ee else None

    # Era homophily via edge year vs node peak decades
    same_era = 0
    era_n = 0
    for e in edges:
        y = e.get("year")
        if y is None:
            continue
        era_n += 1
        da = by_id.get(e["source"], {}).get("year_peak")
        db = by_id.get(e["target"], {}).get("year_peak")
        if da is None or db is None:
            continue
        if abs(int(da) - int(y)) <= 10 and abs(int(db) - int(y)) <= 10:
            same_era += 1
    era_homophily = round(same_era / max(era_n, 1), 3) if era_n else None

    corr = correlations(nodes)
    # Scatter samples for strength × prominence
    scatter_pts = []
    for n in sorted(nodes, key=lambda x: x.get("id") or ""):
        if isinstance(n.get("strength") or n.get("degree"), (int, float)) and isinstance(
            n.get("prominence"), (int, float)
        ):
            scatter_pts.append(
                {
                    "id": n["id"],
                    "x": float(n.get("strength") or n.get("degree") or 0),
                    "y": float(n["prominence"]),
                }
            )
    # stride sample ≤ 80 points
    if len(scatter_pts) > 80:
        step = max(1, len(scatter_pts) // 80)
        scatter_pts = scatter_pts[::step][:80]

    # Outliers >2σ on strength / prominence / acclaim_gap
    outliers: dict[str, list[str]] = {}
    for field in ("strength", "prominence", "acclaim_gap", "pagerank"):
        vals = [float(n[field]) for n in nodes if isinstance(n.get(field), (int, float))]
        if len(vals) < 8:
            continue
        hits = [
            n["id"]
            for n in nodes
            if isinstance(n.get(field), (int, float)) and abs(_zscore(vals, float(n[field]))) > 2
        ]
        if hits:
            outliers[field] = sorted(hits)[:12]

    # Insight from strongest |r|
    insight = None
    best = None
    for k, v in corr.items():
        r = v.get("r")
        if r is None:
            continue
        if best is None or abs(r) > abs(best[1]):
            best = (k, r)
    if best:
        k, r = best
        insight = f"In this cut, {k.replace('×', ' and ')} track with r={r}."

    # Console-friendly metric ranges
    console_bits = {
        "degree_gini": gini(degrees),
        "strength_gini": gini(strengths),
        "density": density,
        "assortativity": degree_assortativity(nodes, edges),
    }

    return {
        "clustering_coefficient": clustering_coefficient(nodes, edges),
        "avg_path_length": avg_path,
        "avg_path_sample_n": avg_path_n,
        "avg_path_length_sampled": sampled,
        "community_count": len(set(communities.values())) if communities else 0,
        "featured_path": featured,
        "correlations": corr,
        "insight": insight,
        "summary": {
            "gender_mix": dict(gender),
            "era_histogram": dict(sorted(era.items())),
            "degree_max": int(max(degrees)) if degrees else 0,
            "degree_median": int(degrees[len(degrees) // 2]) if degrees else 0,
            "strength_max": int(max(strengths)) if strengths else 0,
            "strength_median": int(strengths[len(strengths) // 2]) if strengths else 0,
            "top_name": ranked[0]["label"] if ranked else None,
            "degree_gini": console_bits["degree_gini"],
            "strength_gini": console_bits["strength_gini"],
            "assortativity": console_bits["assortativity"],
            "density": density,
            "modularity": modularity_score(nodes, edges, communities),
            "community_sizes": community_sizes,
            "largest_community_share": largest_share,
            "component_count": len(comps),
            "giant_component_share": round(giant / max(nn, 1), 3),
            "diameter": diameter,
            "effective_diameter": effective_d,
            "degree_hist": histogram(degrees),
            "strength_hist": histogram(strengths),
            "prominence_hist": histogram(prominences),
            "acclaim_gap_hist": histogram(
                [float(n["acclaim_gap"]) for n in nodes if isinstance(n.get("acclaim_gap"), (int, float))]
            ),
            "gender_homophily": gender_homophily,
            "era_homophily": era_homophily,
            "scatter_strength_prominence": scatter_pts,
            "outliers": outliers,
            **{f"corr_{k}": v for k, v in list(corr.items())[:3]},
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
