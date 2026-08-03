import { describe, expect, it } from "vitest";
import type { Edge, Node, PosterSpec } from "./types";
import { edgeEvidenceLabel, edgeSharedCount, linkStrokeWidth } from "./encode";
import { deriveInsights } from "./insights";
import { computeViewStatMarks } from "./statsMarks";

const node = (id: string, degree: number, strength: number): Node => ({
  id,
  label: id.toUpperCase(),
  type: "person",
  degree,
  strength,
});

const edge = (
  source: string,
  target: string,
  sharedCount: number,
  weight: number,
): Edge => ({
  source,
  target,
  construct: "test",
  shared_count: sharedCount,
  weight,
});

describe("literal counts vs weighted scores", () => {
  it("computes degree marks from distinct-neighbor degree, not strength", () => {
    const nodes = [
      node("a", 1, 10_000),
      node("b", 2, 20),
      node("c", 3, 30),
      node("d", 4, 40),
    ];
    const stats = computeViewStatMarks({
      nodes,
      edges: [],
      enabled: ["median_size", "top5_degree"],
    });

    expect(stats.medianDegreeValue).toBe(2.5);
    expect(stats.top5DegreeIds).toEqual(new Set(["d"]));
  });

  it("selects the most repeated collaboration by shared-title count", () => {
    const nodes = [node("a", 1, 1), node("b", 1, 1), node("c", 1, 1)];
    const stats = computeViewStatMarks({
      nodes,
      edges: [edge("a", "b", 2, 900), edge("a", "c", 8, 100)],
      enabled: ["densest_pair"],
    });

    expect(stats.densestPair).toMatchObject({
      source: "a",
      target: "c",
      sharedCount: 8,
      weight: 100,
    });
  });

  it("uses shared_count for shared-title thickness", () => {
    const lowCountHighScore = edge("a", "b", 2, 900);
    const highCountLowScore = edge("a", "c", 8, 100);
    const years = { yearMin: 2000, yearMax: 2020 };

    expect(edgeSharedCount(highCountLowScore)).toBe(8);
    expect(linkStrokeWidth(highCountLowScore, "shared", 8, years)).toBeGreaterThan(
      linkStrokeWidth(lowCountHighScore, "shared", 8, years),
    );
  });

  it("labels insight pairs with shared-title count, not weighted score", () => {
    const nodes = [
      node("a", 2, 1000),
      node("b", 1, 900),
      node("c", 1, 100),
    ];
    const edges = [edge("a", "b", 2, 900), edge("a", "c", 8, 100)];
    const pairInsight = deriveInsights({
      nodes,
      edges,
      spec: { activeConstruct: "test" } as PosterSpec,
    }).find((i) => i.kind === "Pair");

    expect(pairInsight?.headline).toContain("share 8 titles");
    expect(pairInsight?.headline).not.toContain("share 900");
    expect(pairInsight?.detail).toContain("Weighted tie score 100");

    const focusInsight = deriveInsights({
      nodes,
      edges,
      spec: { activeConstruct: "test" } as PosterSpec,
      focusId: "a",
    }).find((i) => i.kind === "Focus");

    expect(focusInsight?.detail).toContain("8 shared · score 100");
    expect(focusInsight?.detail).not.toMatch(/\(\d+ titles\)/);
  });

  it("does not treat one_role lane scores as shared-title counts", () => {
    const genreEdge: Edge = {
      source: "a",
      target: "b",
      construct: "one_role",
      edge_kind: "genre_membership",
      genre: "Comedy",
      weight: 7096,
    };
    expect(edgeSharedCount(genreEdge)).toBe(0);
    expect(edgeEvidenceLabel(genreEdge)).toContain("Comedy");
    expect(edgeEvidenceLabel(genreEdge)).toContain("7096");
  });
});
