/** Load construct JSON — works in Vite middleware (dev) and static /data (Pages). */

import type { ConstructData, Manifest } from "./types";

function dataUrl(path: string): string {
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
