/** Cross-construct bridge people for the poster strip. */

export interface PersonIndexEntry {
  id: string;
  label: string;
  constructs: string[];
}

export interface StripBridge {
  id: string;
  label: string;
  /** Strip panel indices this person belongs to (sorted). */
  panels: number[];
}

/**
 * People spanning multiple strip constructs.
 * Prefer bridges that include the active panel (index 0) so warps start on-screen left.
 */
export function stripBridges(
  people: PersonIndexEntry[],
  stripIds: string[],
  limit = 24,
): StripBridge[] {
  if (stripIds.length < 2 || !people.length) return [];

  const scored: Array<StripBridge & { span: number; includesActive: boolean }> = [];
  for (const p of people) {
    const set = new Set(p.constructs);
    const panels = stripIds
      .map((id, i) => (set.has(id) ? i : -1))
      .filter((i) => i >= 0);
    if (panels.length < 2) continue;
    const includesActive = panels[0] === 0 || panels.includes(0);
    // Only keep threads that touch the lead (active) construct — otherwise they
    // visually "start" mid-strip and look broken.
    if (!includesActive) continue;
    scored.push({
      id: p.id,
      label: p.label,
      panels,
      span: panels.length,
      includesActive,
    });
  }

  scored.sort(
    (a, b) =>
      b.span - a.span ||
      Number(b.includesActive) - Number(a.includesActive) ||
      a.label.localeCompare(b.label),
  );
  return scored.slice(0, limit).map(({ id, label, panels }) => ({ id, label, panels }));
}

/** Build a path that visits only the panels this person is in (with per-hop curves). */
export function bridgePathThrough(
  allCenters: number[],
  panelIndices: number[],
  baseY: number,
  amplitude: number,
): string {
  if (panelIndices.length < 2) return "";
  const pts = panelIndices.map((pi, i) => ({
    x: allCenters[pi],
    y: baseY + (i % 2 === 0 ? -amplitude : amplitude),
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  }
  return d;
}

/** Pick strip companions: share people with active, and prefer constructs that already have stages. */
export function pickStripIds(
  constructIds: string[],
  activeId: string,
  people: PersonIndexEntry[],
  stageCounts: Record<string, number>,
  limit = 4,
): string[] {
  const ids = constructIds.filter(Boolean);
  if (!ids.length) return [];
  if (!ids.includes(activeId)) {
    // fall through with first available
  }
  const inActive = new Set(
    people.filter((p) => p.constructs.includes(activeId)).map((p) => p.id),
  );

  const scored = ids
    .filter((id) => id !== activeId)
    .map((id) => {
      const share = people.reduce(
        (n, p) => n + (p.constructs.includes(id) && inActive.has(p.id) ? 1 : 0),
        0,
      );
      const stages = stageCounts[id] ?? 0;
      // Hard preference for constructs with real stage tables; synthesized still ok
      const stageScore = stages > 0 ? 1000 + Math.min(stages, 80) : 0;
      return { id, score: stageScore + share };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const ordered = [activeId, ...scored.map((s) => s.id)].filter((id) => ids.includes(id));
  // de-dupe
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ordered) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}
