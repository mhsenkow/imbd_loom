/** Client-side alluvial stages when a construct ships an empty stages.json. */

import type { Node, StageRow } from "./types";

function era(year: unknown): string {
  const y = typeof year === "number" ? year : Number(year);
  if (!Number.isFinite(y)) return "unknown era";
  if (y < 1980) return "pre-1980";
  if (y < 2000) return "1980–1999";
  if (y < 2015) return "2000–2014";
  return "2015+";
}

function degreeBand(degree: unknown): string {
  const d = typeof degree === "number" ? degree : Number(degree) || 0;
  if (d >= 40) return "hub";
  if (d >= 15) return "connected";
  if (d >= 5) return "linked";
  return "sparse";
}

/** Facet labels used by strip alluvials — for cross-highlighting a person. */
export function personFacetLabels(n: Node): {
  gender: string;
  era: string;
  band: string;
  keys: Set<string>;
} {
  const gender = String(n.gender || "unknown");
  const e = era(n.year_peak ?? n.year_max);
  const band = degreeBand(n.degree);
  return {
    gender,
    era: e,
    band,
    keys: new Set([gender, e, band]),
  };
}

/** gender → era → degree_band — matches pipeline stages_from_nodes. */
export function synthesizeStages(nodes: Node[]): StageRow[] {
  if (!nodes.length) return [];
  const ge = new Map<string, number>();
  const ed = new Map<string, number>();
  for (const n of nodes) {
    const gender = String(n.gender || "unknown");
    const e = era(n.year_peak ?? n.year_max);
    const band = degreeBand(n.degree);
    const k1 = `${gender}\0${e}`;
    const k2 = `${e}\0${band}`;
    ge.set(k1, (ge.get(k1) || 0) + 1);
    ed.set(k2, (ed.get(k2) || 0) + 1);
  }
  const stages: StageRow[] = [];
  for (const [k, v] of ge) {
    const [categoryFrom, categoryTo] = k.split("\0");
    stages.push({
      stageFrom: "gender",
      stageTo: "era",
      categoryFrom,
      categoryTo,
      value: v,
    });
  }
  for (const [k, v] of ed) {
    const [categoryFrom, categoryTo] = k.split("\0");
    stages.push({
      stageFrom: "era",
      stageTo: "degree",
      categoryFrom,
      categoryTo,
      value: v,
    });
  }
  return stages;
}

export function effectiveStages(stages: StageRow[] | undefined, nodes: Node[]): StageRow[] {
  if (stages && stages.length > 0) return stages;
  return synthesizeStages(nodes);
}
