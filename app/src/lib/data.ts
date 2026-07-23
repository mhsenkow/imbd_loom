/** Load construct JSON — works in Vite middleware (dev) and static /data (Pages). */

import type { ConstructData, Manifest, Quality } from "./types";

export function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}data/${path}`.replace(/([^:]\/)\/+/g, "$1");
}

export async function loadIndex(): Promise<Manifest[]> {
  const r = await fetch(dataUrl("index.json"));
  if (!r.ok) return [];
  return r.json();
}

export async function loadPeopleIndex(): Promise<
  Array<{ id: string; label: string; constructs: string[] }>
> {
  try {
    const r = await fetch(dataUrl("people.json"));
    if (!r.ok) return [];
    return r.json();
  } catch {
    return [];
  }
}

/** Merged top-level quality rollup (`data/quality.json`). */
export async function loadQuality(): Promise<Quality[]> {
  const r = await fetch(dataUrl("quality.json"));
  if (!r.ok) throw new Error(`quality.json ${r.status}`);
  const raw = await r.json();
  if (!Array.isArray(raw)) throw new Error("quality.json is not an array");
  return raw as Quality[];
}

/** Per-construct quality.json. */
export async function loadConstructQuality(id: string): Promise<Quality | null> {
  try {
    const r = await fetch(dataUrl(`${id}/quality.json`));
    if (!r.ok) return null;
    const q = (await r.json()) as Quality;
    return { ...q, id };
  } catch {
    return null;
  }
}

export async function loadSourcesMeta(): Promise<{
  sources?: unknown;
  imdb_snapshot_as_of?: string;
} | null> {
  try {
    const r = await fetch(dataUrl("sources.json"));
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export async function loadConstruct(id: string): Promise<ConstructData> {
  const [nodes, edges, stages, manifest] = await Promise.all([
    fetch(dataUrl(`${id}/nodes.json`)).then((r) => {
      if (!r.ok) throw new Error(`Missing nodes for ${id}`);
      return r.json();
    }),
    fetch(dataUrl(`${id}/edges.json`)).then((r) => r.json()),
    fetch(dataUrl(`${id}/stages.json`)).then((r) => r.json()),
    fetch(dataUrl(`${id}/manifest.json`)).then((r) => r.json()),
  ]);
  return { nodes, edges, stages, manifest };
}

export { dataUrl as buildDataUrl };

