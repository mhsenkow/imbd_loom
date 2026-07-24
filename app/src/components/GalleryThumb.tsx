/** Small non-interactive chart preview for gallery cards. */

import { useEffect, useMemo, useRef, useState } from "react";
import { HeroViz } from "./HeroViz";
import { TimelineStatic } from "./TimelineStatic";
import { ScatterHero } from "./ScatterHero";
import { loadConstruct } from "../lib/data";
import {
  dropIsolates,
  filterEdges,
  filterNodes,
  resolveColorBy,
} from "../lib/filter";
import { matchSearch } from "../lib/search";
import type { ConstructData, PosterSpec, StatMarkId } from "../lib/types";
import { PAPER } from "../lib/fonts";

const W = 360;
const H = 220;

interface Props {
  spec: PosterSpec;
  onPreviewMeta?: (meta: GalleryPreviewMeta | null) => void;
}

export interface GalleryPreviewMeta {
  nodeCount: number;
  edgeCount: number;
  leaders: string[];
  strongestPair: string | null;
  strongestMetric: string | null;
  sharedTitle: string | null;
}

export function GalleryThumb({ spec, onPreviewMeta }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<ConstructData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setData(null);
    setFailed(false);
    loadConstruct(spec.activeConstruct)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, spec.activeConstruct]);

  const previewSpec = useMemo((): PosterSpec => {
    const lean: StatMarkId[] = ["top5_degree", "densest_pair", "median_peak"];
    return {
      ...spec,
      topN: Math.min(spec.topN, 48),
      labelMode: "none",
      // Lean core marks so gallery cards still read as charts, not dashboards
      statMarks: lean.filter((id) => spec.statMarks.includes(id)),
    };
  }, [spec]);

  const search = useMemo(() => {
    if (!data || !previewSpec.searchQuery.trim()) return null;
    return matchSearch(data.nodes, data.edges, previewSpec.searchQuery);
  }, [data, previewSpec.searchQuery]);

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    let nextNodes = filterNodes(data.nodes, previewSpec, null, search);
    let nextEdges = filterEdges(
      data.edges,
      new Set(nextNodes.map((n) => n.id)),
      previewSpec,
      null,
      search,
    );
    if (previewSpec.hideIsolates) {
      nextNodes = dropIsolates(nextNodes, nextEdges);
      const ids = new Set(nextNodes.map((n) => n.id));
      nextEdges = nextEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
    }
    return { nodes: nextNodes, edges: nextEdges };
  }, [data, previewSpec, search]);

  const colorBy = resolveColorBy(
    previewSpec,
    data?.manifest.key_variable || "degree",
  );

  const previewMeta = useMemo((): GalleryPreviewMeta | null => {
    if (!data || nodes.length < 3) return null;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const leaders = [...nodes]
      .sort(
        (a, b) =>
          Number(b.strength ?? b.degree ?? 0) - Number(a.strength ?? a.degree ?? 0),
      )
      .slice(0, 3)
      .map((node) => node.label);
    const strongest = [...edges].sort((a, b) => b.weight - a.weight)[0];
    const source = strongest ? byId.get(strongest.source)?.label : null;
    const target = strongest ? byId.get(strongest.target)?.label : null;
    const sharedTitle = strongest?.shared?.find((title) => title.title)?.title ?? null;
    const sharedCount = Number(strongest?.shared_count ?? strongest?.collab_count);
    const strongestMetric = strongest
      ? Number.isFinite(sharedCount)
        ? `${sharedCount.toLocaleString()} shared title${sharedCount === 1 ? "" : "s"}`
        : `tie score ${strongest.weight.toLocaleString()}`
      : null;

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      leaders,
      strongestPair: source && target ? `${source} ↔ ${target}` : null,
      strongestMetric,
      sharedTitle,
    };
  }, [data, edges, nodes]);

  useEffect(() => {
    onPreviewMeta?.(previewMeta);
  }, [onPreviewMeta, previewMeta]);

  if (failed) {
    return (
      <div ref={hostRef} className="gallery-thumb empty-thumb">
        Preview unavailable
      </div>
    );
  }

  if (!visible || !data) {
    return (
      <div ref={hostRef} className="gallery-thumb empty-thumb">
        Weaving…
      </div>
    );
  }

  if (nodes.length < 3) {
    return (
      <div ref={hostRef} className="gallery-thumb empty-thumb">
        Too sparse for this cut
      </div>
    );
  }

  if (previewSpec.heroForm === "scatter") {
    return (
      <div ref={hostRef} className="gallery-thumb" aria-hidden>
        <ScatterHero nodes={nodes} width={W} height={H} />
      </div>
    );
  }

  return (
    <div ref={hostRef} className="gallery-thumb" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img">
        <rect width={W} height={H} fill={PAPER} />
        {previewSpec.heroForm === "timeline" ? (
          <TimelineStatic
            nodes={nodes}
            edges={edges}
            width={W}
            height={H}
            colorBy={colorBy}
            minWeight={previewSpec.minWeight}
            title=""
            subtitle=""
            interactive={false}
            flipped={previewSpec.timelineFlip}
            search={search}
            palette={previewSpec.palette}
            sortBy={previewSpec.sortBy}
            thicknessBy={previewSpec.thicknessBy}
            sizeBy={previewSpec.sizeBy}
            statMarks={previewSpec.statMarks}
            manifest={data.manifest}
          />
        ) : (
          <g transform="translate(0, -8)">
            <HeroViz
              nodes={nodes}
              edges={edges}
              width={W}
              height={H + 16}
              form={previewSpec.heroForm === "bundle" ? "bundle" : "chord"}
              colorBy={colorBy}
              minWeight={previewSpec.minWeight}
              title=""
              subtitle=""
              interactive={false}
              labelMode="none"
              search={search}
              palette={previewSpec.palette}
              sortBy={previewSpec.sortBy}
              thicknessBy={previewSpec.thicknessBy}
              statMarks={previewSpec.statMarks}
              manifest={data.manifest}
            />
          </g>
        )}
      </svg>
    </div>
  );
}
