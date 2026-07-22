import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Poster } from "./components/Poster";
import { DetailPanel } from "./components/DetailPanel";
import { TimelineHero } from "./components/TimelineHero";
import { ChartLegend } from "./components/ChartLegend";
import { loadConstruct, loadIndex } from "./lib/data";
import { filterEdges, filterNodes, resolveColorBy } from "./lib/filter";
import { matchSearch } from "./lib/search";
import { deriveInsights } from "./lib/insights";
import { specFromSearchParams, specToQuery } from "./lib/specUrl";
import {
  DEFAULT_SPEC,
  type ConstructData,
  type Edge,
  type Manifest,
  type Node,
  type PosterSpec,
} from "./lib/types";
import {
  EMPTY_SELECTION,
  activeEdge,
  activeId,
  neighborIds,
  type SelectionState,
} from "./lib/selection";

function usePrintMode(): boolean {
  const [print, setPrint] = useState(
    () => new URLSearchParams(window.location.search).has("print"),
  );
  useEffect(() => {
    if (print) document.body.classList.add("print-mode");
    else document.body.classList.remove("print-mode");
  }, [print]);
  return print;
}

export default function App() {
  const isPrint = usePrintMode();
  const params = new URLSearchParams(window.location.search);

  const [spec, setSpec] = useState<PosterSpec>(() =>
    specFromSearchParams(params, DEFAULT_SPEC),
  );
  const [index, setIndex] = useState<Manifest[]>([]);
  const [cache, setCache] = useState<Record<string, ConstructData>>({});
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const [status, setStatus] = useState("Loading…");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [inspectOpen, setInspectOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 901px)").matches;
  });

  const patch = useCallback((p: Partial<PosterSpec>) => {
    setSpec((s) => {
      const next = { ...s, ...p };
      // Auto-enable edge year filter once the career window moves off full span
      if (
        (p.yearFrom != null || p.yearTo != null) &&
        (next.yearFrom > 1920 || next.yearTo < 2030) &&
        !s.edgeYearFilter &&
        p.edgeYearFilter === undefined
      ) {
        next.edgeYearFilter = true;
      }
      return next;
    });
    if (p.activeConstruct || p.heroForm) setSelection(EMPTY_SELECTION);
  }, []);

  useEffect(() => {
    loadIndex()
      .then((idx) => {
        setIndex(idx);
        if (idx.length && !idx.find((m) => m.id === spec.activeConstruct)) {
          patch({ activeConstruct: idx[0].id });
        }
        if (!idx.length) {
          setStatus("No constructs yet — run pipeline");
          setError(
            "No data/out/index.json. From pipeline/: uv run loom download && uv run loom parquet && uv run loom enrich && uv run loom build",
          );
        }
      })
      .catch(() => setError("Could not load construct index"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const activeId_ = spec.activeConstruct;
    if (!activeId_) return;
    let cancelled = false;

    (async () => {
      try {
        if (!cacheRef.current[activeId_]) {
          setStatus(`Loading ${activeId_}…`);
          const data = await loadConstruct(activeId_);
          if (cancelled) return;
          setCache((c) => ({ ...c, [activeId_]: data }));
          setError(null);
          setStatus(`${data.manifest.title} ready`);
        } else {
          setStatus(`${cacheRef.current[activeId_].manifest.title} ready`);
        }

        const ids = index.map((m) => m.id);
        const toLoad = ids.filter((id) => id !== activeId_ && !cacheRef.current[id]);
        if (!toLoad.length) {
          if (ids.length) setStatus(`${ids.length} constructs loaded`);
          return;
        }
        setStatus(`Loading strip…`);
        const results = await Promise.all(
          toLoad.map(async (id) => {
            try {
              return [id, await loadConstruct(id)] as const;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        setCache((c) => {
          const next = { ...c };
          for (const r of results) if (r) next[r[0]] = r[1];
          return next;
        });
        setStatus(`${ids.length} constructs loaded`);
      } catch (e) {
        if (!cancelled) {
          setError(`Failed to load ${activeId_}: ${e}`);
          setStatus("Load error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [index, spec.activeConstruct]);

  const active = cache[spec.activeConstruct];
  const focusId = activeId(selection);
  const pinnedId = selection.pinnedId;

  const searchMatch = useMemo(() => {
    if (!active || !spec.searchQuery.trim()) return null;
    return matchSearch(active.nodes, active.edges, spec.searchQuery);
  }, [active, spec.searchQuery]);

  const nodes = useMemo(() => {
    if (!active) return [] as Node[];
    let list = filterNodes(active.nodes, spec, pinnedId, searchMatch);
    if (spec.neighborhoodOnly && pinnedId) {
      const ids = neighborIds(
        pinnedId,
        active.edges.filter((e) => e.weight >= spec.minWeight),
      );
      list = list.filter((n) => ids.has(n.id));
      if (!list.find((n) => n.id === pinnedId)) {
        const f = active.nodes.find((n) => n.id === pinnedId);
        if (f) list = [f, ...list];
      }
    }
    return list;
  }, [active, spec, pinnedId, searchMatch]);

  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(() => {
    if (!active) return [];
    return filterEdges(active.edges, nodeIds, spec, pinnedId, searchMatch);
  }, [active, nodeIds, spec, pinnedId, searchMatch]);

  const focusNode = useMemo(() => {
    return focusId ? nodes.find((n) => n.id === focusId) ?? null : null;
  }, [focusId, nodes]);

  const insights = useMemo(() => {
    if (!active || !nodes.length) return [];
    return deriveInsights({
      nodes,
      edges,
      fullNodes: active.nodes,
      fullEdges: active.edges,
      spec,
      search: searchMatch,
      focusId,
    });
  }, [active, nodes, edges, spec, searchMatch, focusId]);

  const onHover = useCallback((id: string | null) => {
    setSelection((s) => (s.pinnedId ? s : { ...s, hoveredId: id }));
  }, []);

  const onHoverEdge = useCallback((edge: Edge | null) => {
    setSelection((s) => {
      if (s.pinnedId || s.pinnedEdge) return s;
      return {
        ...s,
        hoveredEdge: edge,
        hoveredId: edge ? edge.source : null,
      };
    });
    if (edge) setInspectOpen(true);
  }, []);

  const onPinEdge = useCallback((edge: Edge | null) => {
    setSelection((s) => {
      if (edge == null) return { ...s, pinnedEdge: null, hoveredEdge: null };
      const same =
        s.pinnedEdge &&
        s.pinnedEdge.source === edge.source &&
        s.pinnedEdge.target === edge.target;
      if (same) return EMPTY_SELECTION;
      return {
        hoveredId: null,
        pinnedId: null,
        hoveredEdge: edge,
        pinnedEdge: edge,
      };
    });
    if (edge) setInspectOpen(true);
  }, []);

  const onPin = useCallback((id: string | null) => {
    setSelection((s) => {
      if (id == null) return EMPTY_SELECTION;
      if (s.pinnedId === id) return { ...EMPTY_SELECTION, hoveredId: id };
      return {
        hoveredId: id,
        pinnedId: id,
        hoveredEdge: null,
        pinnedEdge: null,
      };
    });
    if (id) setInspectOpen(true);
  }, []);

  useEffect(() => {
    // Annotations are positioned in the hero layout when available; skip orphan footer stubs.
    setSpec((s) => (s.annotations.length ? { ...s, annotations: [] } : s));
  }, [active?.manifest.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportAvailable =
    typeof window !== "undefined" && !window.location.hostname.endsWith("github.io");

  const onExport = async () => {
    if (!exportAvailable) {
      setStatus("PDF export needs the local Vite atelier (not available on GitHub Pages).");
      return;
    }
    setExporting(true);
    setStatus("Exporting PDF…");
    try {
      const r = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(specToQuery(spec)),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "export failed");
      setStatus(`Wrote ${j.path}`);
    } catch (e) {
      setStatus(`Export error: ${e}`);
    } finally {
      setExporting(false);
    }
  };

  const colorBy = resolveColorBy(spec, active?.manifest.key_variable || "degree");
  const showTimelineExplorer = !isPrint && spec.heroForm === "timeline" && !!active;

  const layoutClass = [
    "app",
    !isPrint && "with-panels",
    controlsOpen && "controls-open",
    inspectOpen && "inspect-open",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={layoutClass}>
      {!isPrint && (
        <Sidebar
          spec={spec}
          onChange={patch}
          index={index}
          onExport={onExport}
          exporting={exporting}
          exportAvailable={exportAvailable}
          status={status}
          open={controlsOpen}
          onToggle={() => setControlsOpen((o) => !o)}
          searchMatch={searchMatch}
          filteredCounts={{ people: nodes.length, links: edges.length }}
        />
      )}
      <main className="stage">
        {!isPrint && !showTimelineExplorer && (
          <div className="stage-hud">
            <span className="hud-pill mono">
              {nodes.length} people · {edges.length} links
              {spec.genderFilter !== "all" ? ` · ${spec.genderFilter}` : ""}
              {spec.yearFrom > 1920 || spec.yearTo < 2030
                ? ` · ${spec.yearFrom}–${spec.yearTo}`
                : ""}
              {spec.searchQuery.trim() ? ` · find “${spec.searchQuery.trim()}”` : ""}
            </span>
          </div>
        )}
        {error && !active ? (
          <div className="empty">
            <p>{error}</p>
            <p>
              Then refresh. Pipeline commands live in <code>pipeline/</code>.
            </p>
          </div>
        ) : !active ? (
          <div className="empty">Loading poster…</div>
        ) : showTimelineExplorer ? (
          <TimelineHero
            nodes={nodes}
            edges={edges}
            colorBy={colorBy}
            minWeight={spec.minWeight}
            title={active.manifest.title}
            subtitle={active.manifest.subtitle}
            selection={selection}
            onHover={onHover}
            onHoverEdge={onHoverEdge}
            onPinEdge={onPinEdge}
            onPin={(id) => onPin(id)}
            flipped={spec.timelineFlip}
            search={searchMatch}
            palette={spec.palette}
          />
        ) : (
          <div className="poster-frame">
            <ChartLegend
              form={spec.heroForm === "bundle" ? "bundle" : "chord"}
              colorBy={colorBy}
            />
            <Poster
              spec={spec}
              active={active}
              all={cache}
              index={index}
              selection={selection}
              onHover={onHover}
              onHoverEdge={onHoverEdge}
              onPinEdge={onPinEdge}
              onPin={(id) => onPin(id)}
              interactive={!isPrint}
              filteredNodes={nodes}
              filteredEdges={edges}
              colorBy={colorBy}
              search={searchMatch}
            />
          </div>
        )}
      </main>
      {!isPrint && (
        <DetailPanel
          node={focusNode}
          edge={activeEdge(selection)}
          nodes={nodes}
          edges={edges}
          pinned={!!selection.pinnedId}
          edgePinned={!!selection.pinnedEdge}
          insights={insights}
          onPin={onPin}
          onFocusNeighbor={(id) => onPin(id)}
          open={inspectOpen}
          onToggle={() => setInspectOpen((o) => !o)}
        />
      )}
    </div>
  );
}
