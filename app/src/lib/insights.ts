/** Derive a short analytical insight from the current filtered view. */

import type { Edge, Node, PosterSpec } from "./types";
import type { SearchMatch } from "./search";
import { edgeSharedCount, isSameCharacterEdge } from "./encode";
import { uniqueShared } from "./sharedTitles";

export interface Insight {
  /** Short eyebrow, e.g. "Hub" / "Series" / "Era" */
  kind: string;
  /** One-sentence observation */
  headline: string;
  /** Optional supporting detail */
  detail?: string;
  /** Optional node/edge ids for click-through later */
  focusId?: string;
  score: number;
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function degreeInView(id: string, edges: Edge[]): number {
  let d = 0;
  for (const e of edges) {
    if (e.source === id || e.target === id) d += 1;
  }
  return d;
}

function components(nodes: Node[], edges: Edge[]): string[][] {
  const ids = new Set(nodes.map((n) => n.id));
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    const comp: string[] = [];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        stack.push(nb);
      }
    }
    out.push(comp);
  }
  return out;
}

function density(n: number, e: number): number {
  if (n < 2) return 0;
  return (2 * e) / (n * (n - 1));
}

function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

function filmHint(edge: Edge): string | undefined {
  const s = uniqueShared(edge.shared)[0];
  if (!s) return undefined;
  return s.year ? `${s.title} (${s.year})` : s.title;
}

/**
 * Score several candidate observations and return the best few for this view.
 * Insights are relative to the *visible* graph (after filters / isolate).
 */
export function deriveInsights(opts: {
  nodes: Node[];
  edges: Edge[];
  /** Full construct before search/isolate — for contrast */
  fullNodes?: Node[];
  fullEdges?: Edge[];
  spec: PosterSpec;
  search?: SearchMatch | null;
  focusId?: string | null;
}): Insight[] {
  const { nodes, edges, spec, search, focusId } = opts;
  const fullNodes = opts.fullNodes ?? nodes;
  const fullEdges = opts.fullEdges ?? edges;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const candidates: Insight[] = [];

  if (nodes.length < 2) {
    return [
      {
        kind: "Empty",
        headline: "This filter left almost no one on the loom — loosen Find or Density.",
        score: 1,
      },
    ];
  }

  // ── Hub: person touching the most links (among search matches when highlighting) ──
  const hubPool =
    search && spec.searchMode === "highlight"
      ? nodes.filter((n) => search.matchedNodeIds.has(n.id))
      : nodes;
  let hub: Node | null = null;
  let hubDeg = -1;
  for (const n of hubPool.length ? hubPool : nodes) {
    const d = degreeInView(n.id, edges);
    if (d > hubDeg) {
      hubDeg = d;
      hub = n;
    }
  }
  if (hub && hubDeg >= 2) {
    const share = edges.length ? Math.round((hubDeg / edges.length) * 100) : 0;
    const inSearch = !!search;
    candidates.push({
      kind: "Hub",
      headline: inSearch
        ? `Within this Find cut, ${hub.label} is the densest connector (${hubDeg} partners).`
        : `${hub.label} anchors this view — ${hubDeg} partners${
            share >= 25 ? `, touching ${share}% of the links` : ""
          }.`,
      detail:
        !inSearch && share >= 40
          ? "Remove or pin them to see whether the weave holds without this hub."
          : undefined,
      focusId: hub.id,
      score: (inSearch ? 10 : 8) + Math.min(6, hubDeg / 3) + (share >= 35 ? 3 : 0),
    });
  }

  // ── Most shared-title co-appearance pair (literal count, not weighted score) ──
  let bestEdge: Edge | null = null;
  for (const e of edges) {
    const shared = edgeSharedCount(e);
    const bestShared = bestEdge ? edgeSharedCount(bestEdge) : -1;
    if (
      !bestEdge ||
      shared > bestShared ||
      (shared === bestShared && e.weight > bestEdge.weight)
    ) {
      bestEdge = e;
    }
  }
  if (bestEdge && edgeSharedCount(bestEdge) >= 2) {
    const a = byId.get(bestEdge.source);
    const b = byId.get(bestEdge.target);
    const shared = edgeSharedCount(bestEdge);
    const film = filmHint(bestEdge);
    const characterLink = isSameCharacterEdge(bestEdge);
    candidates.push({
      kind: "Pair",
      headline: characterLink
        ? `${a?.label ?? "?"} ↔ ${b?.label ?? "?"} share ${shared} character name${
            shared === 1 ? "" : "s"
          }${bestEdge.character ? ` (e.g. ${bestEdge.character})` : ""} — densest role overlap here.`
        : `${a?.label ?? "?"} ↔ ${b?.label ?? "?"} share ${shared} title${
            shared === 1 ? "" : "s"
          } — densest co-appearance here.`,
      detail: characterLink
        ? bestEdge.character
          ? `Matching role string: ${bestEdge.character}.`
          : undefined
        : film
          ? `Sample: ${film}. Weighted tie score ${bestEdge.weight}.`
          : `Weighted tie score ${bestEdge.weight}.`,
      focusId: bestEdge.source,
      score: 7 + Math.min(5, shared / 2),
    });
  }

  // ── Era / decade concentration ──
  const decadeCounts = new Map<number, number>();
  let dated = 0;
  for (const e of edges) {
    const y = num(e.year);
    if (y == null) continue;
    dated += 1;
    const d = decadeOf(y);
    decadeCounts.set(d, (decadeCounts.get(d) ?? 0) + 1);
  }
  if (dated >= 5 && decadeCounts.size) {
    let peakDec = 0;
    let peakN = 0;
    for (const [d, n] of decadeCounts) {
      if (n > peakN) {
        peakN = n;
        peakDec = d;
      }
    }
    const pct = Math.round((peakN / dated) * 100);
    if (pct >= 30) {
      candidates.push({
        kind: "Era",
        headline: `${pct}% of dated links land in the ${peakDec}s — collaboration clusters there.`,
        detail:
          decadeCounts.size >= 3
            ? `Spread across ${decadeCounts.size} decades in this cut.`
            : undefined,
        score: 6 + (pct >= 45 ? 4 : pct >= 35 ? 2 : 0),
      });
    }
  }

  // ── Bridge across components (if multi-component after removing hub) ──
  const comps = components(nodes, edges);
  if (comps.length >= 2) {
    const sizes = comps.map((c) => c.length).sort((a, b) => b - a);
    candidates.push({
      kind: "Islands",
      headline: `This cut splits into ${comps.length} islands (largest ${sizes[0]} people).`,
      detail: "The Find / year window is carving separate collaboration pockets.",
      score: 9 + Math.min(4, comps.length),
    });
  } else if (hub && nodes.length >= 8) {
    // Check if hub is a bridge: remove hub → more components
    const without = nodes.filter((n) => n.id !== hub!.id);
    const withoutE = edges.filter((e) => e.source !== hub!.id && e.target !== hub!.id);
    const after = components(without, withoutE);
    if (after.length >= 2) {
      candidates.push({
        kind: "Bridge",
        headline: `${hub.label} is a bridge — without them the view splits into ${after.length} groups.`,
        focusId: hub.id,
        score: 12,
      });
    }
  }

  // ── Density vs full construct ──
  const dView = density(nodes.length, edges.length);
  const dFull = density(fullNodes.length, fullEdges.length);
  if (fullNodes.length > nodes.length + 5 && dFull > 0) {
    const ratio = dView / dFull;
    if (ratio >= 1.4) {
      candidates.push({
        kind: "Dense",
        headline: `This cut is ${ratio.toFixed(1)}× denser than the full construct — a tight clique, not a sparse web.`,
        score: 8 + Math.min(4, ratio),
      });
    } else if (ratio <= 0.55 && edges.length >= 3) {
      candidates.push({
        kind: "Sparse",
        headline: `This cut is only ${(ratio * 100).toFixed(0)}% as dense as the full weave — more spokes than a mesh.`,
        score: 7,
      });
    }
  }

  // ── Search / series specific ──
  if (search) {
    const label = search.focusLabel ?? search.query;
    const mode = spec.searchMode;
    if (search.kinds.has("title") || search.kinds.has("character")) {
      // Who appears most often with this title in roles
      let star: Node | null = null;
      let starHits = 0;
      const q = search.q;
      for (const n of nodes) {
        if (!search.matchedNodeIds.has(n.id)) continue;
        let hits = 0;
        for (const r of n.roles ?? []) {
          const t = (r.title || "").toLowerCase();
          const c = (r.character || "").toLowerCase();
          if (t.includes(q) || c.includes(q)) hits += 1;
        }
        if (hits > starHits) {
          starHits = hits;
          star = n;
        }
      }
      if (star && starHits >= 1) {
        candidates.push({
          kind: search.kinds.has("character") ? "Character" : "Series",
          headline:
            mode === "isolate"
              ? `Isolating “${label}” leaves ${nodes.length} people — ${star.label} carries the most matching credits (${starHits}).`
              : `In the “${label}” highlight, ${star.label} has the most matching credits (${starHits}).`,
          focusId: star.id,
          score: 22,
        });
      } else {
        candidates.push({
          kind: "Series",
          headline:
            mode === "isolate"
              ? `Isolating “${label}” yields ${nodes.length} people and ${edges.length} co-appearance links.`
              : `“${label}” touches ${search.matchedNodeIds.size} people in this construct.`,
          score: 20,
        });
      }
    } else if (search.kinds.has("person")) {
      const person = nodes.find((n) => search.matchedNodeIds.has(n.id));
      if (person) {
        const d = degreeInView(person.id, edges);
        candidates.push({
          kind: "Person",
          headline: `${person.label} sits with ${d} partners in the current cut.`,
          focusId: person.id,
          score: 21,
        });
      }
    }
  }

  // ── Gender skew in view ──
  const genderCounts: Record<string, number> = {};
  for (const n of nodes) {
    const g = (n.gender as string) || "unknown";
    genderCounts[g] = (genderCounts[g] ?? 0) + 1;
  }
  const known = nodes.length - (genderCounts.unknown ?? 0);
  if (known >= 8 && spec.genderFilter === "all") {
    const female = genderCounts.female ?? 0;
    const male = genderCounts.male ?? 0;
    const fPct = Math.round((female / known) * 100);
    const mPct = Math.round((male / known) * 100);
    if (Math.abs(fPct - mPct) >= 25) {
      const lean = fPct > mPct ? "women" : "men";
      const pct = Math.max(fPct, mPct);
      candidates.push({
        kind: "Gender",
        headline: `This view leans ${lean} (${pct}% of gendered people) under the current filters.`,
        score: 5 + Math.min(4, Math.abs(fPct - mPct) / 10),
      });
    }
  } else if (spec.genderFilter !== "all") {
    candidates.push({
      kind: "Filter",
      headline: `Gender filter = ${spec.genderFilter}: ${nodes.length} people, ${edges.length} links remain.`,
      score: 4,
    });
  }

  // ── Year window contrast ──
  if (spec.yearFrom > 1920 || spec.yearTo < 2030) {
    const kept = fullNodes.length
      ? Math.round((nodes.length / fullNodes.length) * 100)
      : 100;
    candidates.push({
      kind: "Window",
      headline: `Career window ${spec.yearFrom}–${spec.yearTo} keeps ~${kept}% of people from the full construct.`,
      score: kept <= 40 ? 9 : kept <= 70 ? 6 : 3,
    });
  }

  // ── Career span outlier ──
  const spans = nodes
    .map((n) => {
      const a = num(n.year_min) ?? num(n.yearMin);
      const b = num(n.year_max) ?? num(n.yearMax);
      if (a == null || b == null) return null;
      return { n, span: b - a };
    })
    .filter(Boolean) as Array<{ n: Node; span: number }>;
  if (spans.length >= 6) {
    spans.sort((a, b) => b.span - a.span);
    const top = spans[0];
    const median = spans[Math.floor(spans.length / 2)].span;
    if (top.span >= median * 1.8 && top.span >= 25) {
      candidates.push({
        kind: "Span",
        headline: `${top.n.label} spans ${top.span} years here — nearly ${
          median ? (top.span / Math.max(1, median)).toFixed(1) : "?"
        }× the median career in this cut.`,
        focusId: top.n.id,
        score: 7,
      });
    }
  }

  // ── Focused person ──
  if (focusId) {
    const n = byId.get(focusId);
    if (n) {
      const d = degreeInView(focusId, edges);
      const top = [...edges]
        .filter((e) => e.source === focusId || e.target === focusId)
        .sort((a, b) => {
          const ds = edgeSharedCount(b) - edgeSharedCount(a);
          return ds !== 0 ? ds : b.weight - a.weight;
        })[0];
      const other = top
        ? byId.get(top.source === focusId ? top.target : top.source)
        : null;
      const film = top ? filmHint(top) : undefined;
      const shared = top ? edgeSharedCount(top) : 0;
      const characterLink = top ? isSameCharacterEdge(top) : false;
      candidates.push({
        kind: "Focus",
        headline: `${n.label} is pinned with ${d} partners in this cut.`,
        detail:
          other && top
            ? characterLink
              ? `Strongest tie: ${other.label}${
                  top.character ? ` via “${top.character}”` : ""
                } (${shared} shared character name${shared === 1 ? "" : "s"}).`
              : `Strongest tie: ${other.label} (${shared} shared · score ${top.weight})${
                  film ? ` · ${film}` : ""
                }.`
            : undefined,
        focusId: n.id,
        score: 15,
      });
    }
  }

  // Pick top unique kinds (avoid two hubs)
  candidates.sort((a, b) => b.score - a.score);
  const seenKinds = new Set<string>();
  const picked: Insight[] = [];
  for (const c of candidates) {
    if (seenKinds.has(c.kind)) continue;
    seenKinds.add(c.kind);
    picked.push(c);
    if (picked.length >= 2) break;
  }
  return picked;
}
