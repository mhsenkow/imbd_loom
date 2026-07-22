/**
 * Puppeteer PDF exporter — exact physical page size, vector SVG.
 *
 * Usage:
 *   npx tsx export/export-pdf.ts --size a1 --construct voice_cartoons
 *   or POST /api/export from the Vite app
 *
 * Output: export/output/loom-{construct}-{size}.pdf
 * Requires the Vite app at --url (default http://127.0.0.1:5173).
 */

import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "export", "output");

const SIZES: Record<string, { width: string; height: string }> = {
  a1: { width: "594mm", height: "841mm" },
  a0: { width: "841mm", height: "1189mm" },
  tabloid: { width: "11in", height: "17in" },
  letter: { width: "8.5in", height: "11in" },
};

export interface ExportOpts {
  construct?: string;
  size?: string;
  hero?: string;
  baseUrl?: string;
  outPath?: string;
  /** Extra query params mirroring PosterSpec (topN, gender, search, …) */
  query?: Record<string, string>;
}

export async function exportPdf(opts: ExportOpts = {}): Promise<string> {
  const size = opts.size || opts.query?.size || "a1";
  const construct = opts.construct || opts.query?.construct || "voice_cartoons";
  const hero = opts.hero || opts.query?.hero || "timeline";
  const baseUrl = opts.baseUrl || "http://127.0.0.1:5173";
  const dims = SIZES[size] || SIZES.a1;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath =
    opts.outPath || path.join(OUT_DIR, `loom-${construct}-${size}.pdf`);

  const params = new URLSearchParams({
    print: "1",
    construct,
    size,
    hero,
    ...(opts.query || {}),
  });
  // Ensure print + core keys win
  params.set("print", "1");
  params.set("construct", construct);
  params.set("size", size);
  params.set("hero", hero);

  const url = `${baseUrl}/?${params.toString()}`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 120_000 });
    await page.waitForSelector("svg.poster", { timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 800));

    await page.pdf({
      path: outPath,
      width: dims.width,
      height: dims.height,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });
  } finally {
    await browser.close();
  }
  return outPath;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain || process.argv[1]?.endsWith("export-pdf.ts")) {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const query: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith("--")) continue;
    const key = args[i].slice(2);
    const val = args[i + 1];
    if (!val || val.startsWith("--")) continue;
    if (["size", "construct", "hero", "url"].includes(key)) continue;
    query[key] = val;
    i++;
  }
  exportPdf({
    size: get("--size", "a1"),
    construct: get("--construct", "voice_cartoons"),
    hero: get("--hero", "timeline"),
    baseUrl: get("--url", "http://127.0.0.1:5173"),
    query,
  })
    .then((p) => {
      console.log("Wrote", p);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
