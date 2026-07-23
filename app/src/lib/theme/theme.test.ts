/**
 * Theme token + scale unit tests.
 * Run: npx vitest run --config vitest.config.ts
 */

import { describe, expect, it } from "vitest";
import {
  CSS_VAR_NAMES,
  PALETTES,
  PALETTE_NAMES,
  cssVars,
  mark,
  token,
  type Theme,
} from "./tokens";
import { contrastRatio, deltaE } from "./contrast";
import {
  categoricalScale,
  clearScaleCache,
  degreeColor,
  sequentialScale,
} from "./scales";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("tokens", () => {
  it("cssVars keys stay in sync with atelier.css custom properties", () => {
    const cssPath = path.resolve(__dirname, "../../styles/atelier.css");
    const css = fs.readFileSync(cssPath, "utf8");
    const declared = new Set(
      [...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => `--${m[1]}`),
    );
    const missing = CSS_VAR_NAMES.filter((k) => !declared.has(k));
    expect(missing, `CSS missing vars: ${missing.join(", ")}`).toEqual([]);
  });

  it("resolves semantic tokens in both themes", () => {
    for (const theme of ["light", "dark"] as Theme[]) {
      expect(token("surface.paper", theme)).toMatch(/^#/);
      expect(token("mark.hub", theme)).toMatch(/^#/);
      expect(token("stat.guide", theme)).toMatch(/^#/);
      expect(cssVars(theme)["--paper"]).toBe(token("surface.paper", theme));
    }
  });

  it("gender marks differ from loom categorical slots", () => {
    const loom = PALETTES.loom;
    const genders = [
      token("mark.gender.female"),
      token("mark.gender.male"),
      token("mark.gender.nonbinary"),
    ];
    for (const g of genders) {
      expect(loom.includes(g as (typeof loom)[number])).toBe(false);
    }
    void mark;
  });
});

describe("contrast", () => {
  it("text/line tokens meet WCAG AA against surfaces", () => {
    for (const theme of ["light", "dark"] as Theme[]) {
      const paper = token("surface.paper", theme);
      const workshop = token("surface.workshop", theme);
      const ink = token("text.ink", theme);
      const workshopText = token("text.workshop", theme);
      // Paper charts: ink on paper
      if (theme === "light") {
        expect(contrastRatio(ink, paper)).toBeGreaterThanOrEqual(4.5);
      }
      // Chrome: workshop text on atelier
      expect(contrastRatio(workshopText, workshop)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("adjacent categorical entries have minimum ΔE", () => {
    for (const name of PALETTE_NAMES) {
      const hues = PALETTES[name];
      for (let i = 0; i < hues.length - 1; i++) {
        const d = deltaE(hues[i], hues[i + 1]);
        expect(d, `${name}[${i}] vs [${i + 1}]`).toBeGreaterThanOrEqual(12);
      }
    }
  });
});

describe("scales", () => {
  it("sequential ramp is monotonic in lightness sampling", () => {
    clearScaleCache();
    const scale = sequentialScale("loom", [0, 10], "light");
    const labs: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const c = scale(i);
      // rough luminance proxy via hex parse
      const h = c.startsWith("#")
        ? c
        : degreeColor(i, 10, "loom", "light");
      labs.push(contrastRatio(h, "#ffffff"));
    }
    // Higher degree → darker on paper → higher contrast vs white
    for (let i = 1; i < labs.length; i++) {
      expect(labs[i]).toBeGreaterThanOrEqual(labs[i - 1] - 0.05);
    }
  });

  it("categorical overflow generates distinct hues beyond palette length", () => {
    clearScaleCache();
    const keys = Array.from({ length: 12 }, (_, i) => `g${i}`);
    const scale = categoricalScale("loom", keys, "light");
    const colors = keys.map(scale);
    expect(new Set(colors).size).toBeGreaterThan(6);
  });

  it("token resolution is stable across themes for palette hues", () => {
    expect(PALETTES.loom[0].toLowerCase()).toBe(token("mark.hub", "light").toLowerCase());
  });
});
