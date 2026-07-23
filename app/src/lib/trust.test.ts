import { describe, expect, it } from "vitest";
import { formatBuiltAt, formatSnapshotAge, oldestIso } from "./formatTime";
import { runIntegrityChecks } from "./integrity";
import { DATA_SOURCES, METRIC_DEFS, ACCURACY_ROWS } from "./provenance";
import type { ConstructData, Quality } from "./types";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const outRoot = resolve(__dirname, "../../../data/out");

describe("formatTime", () => {
  it("formats built_at", () => {
    const s = formatBuiltAt("2024-01-15T12:00:00.000Z");
    expect(s).not.toBe("unknown");
    expect(s.length).toBeGreaterThan(4);
  });

  it("humanizes snapshot age", () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatSnapshotAge(recent)).toMatch(/3 days/);
  });

  it("picks oldest snapshot iso", () => {
    expect(
      oldestIso({
        a: "2024-06-01T00:00:00.000Z",
        b: "2024-01-01T00:00:00.000Z",
      }),
    ).toBe("2024-01-01T00:00:00.000Z");
  });
});

describe("provenance constants", () => {
  it("lists seven data sources", () => {
    expect(DATA_SOURCES).toHaveLength(7);
    expect(DATA_SOURCES.every((s) => s.url.startsWith("http"))).toBe(true);
  });

  it("defines core metrics including edge", () => {
    expect(METRIC_DEFS.some((m) => m.id === "edge")).toBe(true);
    expect(ACCURACY_ROWS.length).toBeGreaterThanOrEqual(5);
  });
});

describe("integrity checks", () => {
  it("flags dangling endpoints", () => {
    const data = {
      nodes: [{ id: "a", label: "A" }],
      edges: [{ source: "a", target: "missing", weight: 1 }],
      stages: [],
      manifest: {
        id: "x",
        title: "x",
        subtitle: "",
        key_variable: "degree",
        built_at: "",
        node_count: 1,
        edge_count: 1,
        stage_row_count: 0,
        method_note: "n",
        data_credit: "d",
      },
    } as unknown as ConstructData;
    const r = runIntegrityChecks(data, null);
    expect(r.ok).toBe(false);
    expect(r.warnings.some((w) => w.includes("dangling"))).toBe(true);
  });

  it("agrees with matching quality edges_with_year_pct", () => {
    const data = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ source: "a", target: "b", weight: 2, year: 2001 }],
      stages: [],
      manifest: {
        id: "x",
        title: "x",
        subtitle: "",
        key_variable: "degree",
        built_at: "",
        node_count: 2,
        edge_count: 1,
        stage_row_count: 0,
        method_note: "n",
        data_credit: "d",
      },
    } as unknown as ConstructData;
    const q: Quality = {
      node_count: 2,
      edge_count: 1,
      missing_birth_year_pct: 0,
      gender_unknown_pct: 0,
      prominence_coverage_pct: 100,
      edges_with_year_pct: 100,
    };
    expect(runIntegrityChecks(data, q).ok).toBe(true);
  });
});

describe("committed quality fixtures", () => {
  it("merged quality.json is a non-empty array with required fields", () => {
    const path = resolve(outRoot, "quality.json");
    expect(existsSync(path)).toBe(true);
    const raw = JSON.parse(readFileSync(path, "utf8")) as Quality[];
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBeGreaterThan(0);
    for (const q of raw.slice(0, 5)) {
      expect(typeof q.node_count).toBe("number");
      expect(typeof q.edges_with_year_pct).toBe("number");
    }
  });

  it("sample construct quality + manifest exist", () => {
    const id = "voice_cartoons";
    expect(existsSync(resolve(outRoot, id, "quality.json"))).toBe(true);
    expect(existsSync(resolve(outRoot, id, "manifest.json"))).toBe(true);
  });
});
