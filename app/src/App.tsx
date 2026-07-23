import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Poster } from "./components/Poster";
import { DetailPanel } from "./components/DetailPanel";
import { TimelineHero } from "./components/TimelineHero";
import { ChartLegend } from "./components/ChartLegend";
import { ScatterHero } from "./components/ScatterHero";
import { StatsRail } from "./components/StatsRail";
import { HomeGallery } from "./components/HomeGallery";
import { StyleGuide } from "./components/StyleGuide";
import { ThemeProvider, useTheme } from "./lib/theme/ThemeContext";
import type { PaletteName } from "./lib/theme/tokens";
import { SurfaceCard } from "./components/ui/SurfaceCard";
import type { ReactNode } from "react";
import { loadConstruct, loadIndex, loadPeopleIndex, loadQuality } from "./lib/data";
import type { Quality } from "./lib/types";
import { MethodologyPage } from "./components/MethodologyPage";
import {
  dropIsolates,
  filterEdges,
  filterNodes,
  filterNodesPool,
  resolveColorBy,
  weightSliderMax,
} from "./lib/filter";
import { matchSearch } from "./lib/search";
import { deriveInsights } from "./lib/insights";
import { computeViewStatMarks } from "./lib/statsMarks";
import { specFromSearchParams, specToQuery, specToSearchParams } from "./lib/specUrl";
import {
  homeHref,
  resolveStorySpec,
  viewFromSearchParams,
  type StoryPreset,
} from "./lib/gallery";
import {
  DEFAULT_SPEC,
  type ConstructData,
  type Edge,
  type Manifest,
  type Node,
  type PosterSpec,
} from "./lib/types";
import type { PersonIndexEntry } from "./lib/bridges";
import {
  EMPTY_SELECTION,
  activeEdge,
  activeId,
  neighborIds,
  type SelectionState,
} from "./lib/selection";
import { COARSE_MQ, PHONE_MQ, useMediaQuery } from "./lib/useMediaQuery";

function PosterShell({
  print,
  children,
}: {
  print: boolean;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <SurfaceCard theme={print ? "light" : theme} className="poster-frame paper-grain">
      {children}
    </SurfaceCard>
  );
}

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

function useSaveDataClass() {
  useEffect(() => {
    const saveData =
      typeof navigator !== "undefined" &&
      !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection
        ?.saveData;
    if (saveData) document.body.classList.add("save-data");
    else document.body.classList.remove("save-data");
  }, []);
}

function readParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function writeUrl(
  spec: PosterSpec,
  view: "home" | "atelier" | "methodology" | "styleguide",
  mode: "push" | "replace" = "push",
  methodologyConstruct?: string,
) {
  const base = import.meta.env.BASE_URL;
  const go =
    mode === "replace"
      ? window.history.replaceState.bind(window.history)
      : window.history.pushState.bind(window.history);
  const root = base.endsWith("/") ? base : `${base}/`;
  if (view === "home") {
    go({ view: "home" }, "", homeHref(base));
    return;
  }
  if (view === "methodology") {
    const qs = new URLSearchParams();
    qs.set("view", "methodology");
    if (methodologyConstruct) qs.set("c", methodologyConstruct);
    go({ view: "methodology" }, "", `${root}?${qs.toString()}`);
    return;
  }
  if (view === "styleguide") {
    go({ view: "styleguide" }, "", `${root}?view=styleguide`);
    return;
  }
  const qs = specToSearchParams(spec);
  qs.set("view", "atelier");
  go({ view: "atelier" }, "", `${root}?${qs.toString()}`);
}

export default function App() {
  const isPrint = usePrintMode();
  useSaveDataClass();
  const isPhone = useMediaQuery(PHONE_MQ);
  const isCoarse = useMediaQuery(COARSE_MQ);
  const overlayPanels = useMediaQuery("(max-width: 900px)");
  const params = readParams();

  const [view, setView] = useState<"home" | "atelier" | "styleguide" | "methodology">(() => {
    const v = params.get("view");
    if (v === "styleguide") return "styleguide";
    if (v === "methodology") return "methodology";
    return viewFromSearchParams(params);
  });
  const [methodologyConstruct, setMethodologyConstruct] = useState(
    () => params.get("c") || DEFAULT_SPEC.activeConstruct,
  );
  const [qualityRollup, setQualityRollup] = useState<Quality[] | null>(null);
  const [qualityUnavailable, setQualityUnavailable] = useState(false);
  const [spec, setSpec] = useState<PosterSpec>(() =>
    specFromSearchParams(params, DEFAULT_SPEC),
  );
  const [index, setIndex] = useState<Manifest[]>([]);
  const [peopleIndex, setPeopleIndex] = useState<PersonIndexEntry[]>([]);
  const [cache, setCache] = useState<Record<string, ConstructData>>({});
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const [status, setStatus] = useState("Loading…");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [controlsOpen, setControlsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    // Desktop: open; tablet/phone overlay: start closed so the chart fills the screen
    return window.matchMedia("(min-width: 901px)").matches;
  });
  const [inspectOpen, setInspectOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 901px)").matches;
  });
  const drawerHistoryRef = useRef(false);
  const ignoreNextPopRef = useRef(false);

  const popDrawerHistory = useCallback(() => {
    if (!drawerHistoryRef.current) return;
    drawerHistoryRef.current = false;
    ignoreNextPopRef.current = true;
    window.history.back();
  }, []);

  const closeAllDrawers = useCallback(() => {
    setControlsOpen(false);
    setInspectOpen(false);
  }, []);

  const toggleControls = useCallback(() => {
    if (controlsOpen) {
      setControlsOpen(false);
    } else {
      setInspectOpen(false);
      setControlsOpen(true);
    }
  }, [controlsOpen]);

  const toggleInspect = useCallback(() => {
    if (inspectOpen) {
      setInspectOpen(false);
    } else {
      setControlsOpen(false);
      setInspectOpen(true);
    }
  }, [inspectOpen]);

  const openInspect = useCallback(() => {
    setControlsOpen(false);
    setInspectOpen(true);
  }, []);

  // Clear the synthetic history entry when drawers finish closing
  const prevAnyOpen = useRef(false);
  useEffect(() => {
    const anyOpen = controlsOpen || inspectOpen;
    if (prevAnyOpen.current && !anyOpen) popDrawerHistory();
    prevAnyOpen.current = anyOpen;
  }, [controlsOpen, inspectOpen, popDrawerHistory]);

  // Escape closes the topmost drawer
  useEffect(() => {
    if (view !== "atelier") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (controlsOpen || inspectOpen) {
        e.preventDefault();
        closeAllDrawers();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, controlsOpen, inspectOpen, closeAllDrawers]);

  // Browser back closes an overlay drawer (one history entry while any drawer is open)
  useEffect(() => {
    if (!overlayPanels || view !== "atelier") return;
    const anyOpen = controlsOpen || inspectOpen;
    if (anyOpen && !drawerHistoryRef.current) {
      window.history.pushState({ loomDrawer: true }, "");
      drawerHistoryRef.current = true;
    }
  }, [overlayPanels, view, controlsOpen, inspectOpen]);

  useEffect(() => {
    const onPop = () => {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        return;
      }
      const p = readParams();
      if (drawerHistoryRef.current) {
        drawerHistoryRef.current = false;
        setControlsOpen(false);
        setInspectOpen(false);
        return;
      }
      setView(
        p.get("view") === "styleguide"
          ? "styleguide"
          : p.get("view") === "methodology"
            ? "methodology"
            : viewFromSearchParams(p),
      );
      if (p.get("c")) setMethodologyConstruct(p.get("c")!);
      setSpec(specFromSearchParams(p, DEFAULT_SPEC));
      setSelection(EMPTY_SELECTION);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const patch = useCallback(
    (p: Partial<PosterSpec>) => {
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
      // On phones, close controls after picking a construct/form so the chart shows
      if (isPhone && (p.activeConstruct || p.heroForm)) {
        setControlsOpen(false);
      }
    },
    [isPhone],
  );

  const openStory = useCallback((story: StoryPreset) => {
    const next = resolveStorySpec(story);
    setSpec(next);
    setSelection(EMPTY_SELECTION);
    setView("atelier");
    writeUrl(next, "atelier");
  }, []);

  const openAtelier = useCallback((constructId?: string) => {
    const next = {
      ...DEFAULT_SPEC,
      ...(constructId ? { activeConstruct: constructId } : {}),
    };
    setSpec(next);
    setSelection(EMPTY_SELECTION);
    setView("atelier");
    writeUrl(next, "atelier");
  }, []);

  const openHome = useCallback(() => {
    setView("home");
    setSelection(EMPTY_SELECTION);
    writeUrl(spec, "home");
  }, [spec]);

  const openMethodology = useCallback(
    (constructIdOrHash?: string, hash?: string) => {
      // DetailPanel may pass only a hash like "metric-edge"
      let c = methodologyConstruct || spec.activeConstruct;
      let section = hash;
      if (constructIdOrHash?.startsWith("metric-") || constructIdOrHash === "sources" || constructIdOrHash === "math" || constructIdOrHash === "report" || constructIdOrHash === "verify" || constructIdOrHash === "overview") {
        section = constructIdOrHash;
      } else if (constructIdOrHash) {
        c = constructIdOrHash;
      }
      setMethodologyConstruct(c);
      setView("methodology");
      writeUrl(spec, "methodology", "push", c);
      if (section) {
        // Defer scroll until page mounts
        requestAnimationFrame(() => {
          window.setTimeout(() => {
            document.getElementById(section!)?.scrollIntoView({ behavior: "smooth" });
          }, 50);
        });
      }
    },
    [methodologyConstruct, spec],
  );

  const selectMethodologyConstruct = useCallback(
    (id: string) => {
      setMethodologyConstruct(id);
      writeUrl(spec, "methodology", "replace", id);
    },
    [spec],
  );

  useEffect(() => {
    let cancelled = false;
    loadQuality()
      .then((q) => {
        if (cancelled) return;
        setQualityRollup(q);
        setQualityUnavailable(false);
      })
      .catch(() => {
        if (cancelled) return;
        setQualityRollup(null);
        setQualityUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Always warm the construct index for home + methodology + atelier
    loadIndex()
      .then((idx) => {
        setIndex(idx);
      })
      .catch(() => {
        /* atelier effect handles error messaging */
      });
  }, []);

  useEffect(() => {
    if (view !== "atelier") return;
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
    loadPeopleIndex().then(setPeopleIndex).catch(() => setPeopleIndex([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view !== "atelier") return;
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
        // On phones / metered: skip strip prefetch to save bandwidth
        const saveData =
          typeof navigator !== "undefined" &&
          ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection
            ?.saveData ||
            isPhone);
        if (saveData) {
          if (ids.length) setStatus(`${Object.keys(cacheRef.current).length} constructs loaded`);
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
  }, [view, index, spec.activeConstruct, isPhone]);

  const active = cache[spec.activeConstruct];
  const focusId = activeId(selection);
  const pinnedId = selection.pinnedId;

  const searchMatch = useMemo(() => {
    if (!active || !spec.searchQuery.trim()) return null;
    return matchSearch(active.nodes, active.edges, spec.searchQuery);
  }, [active, spec.searchQuery]);

  const poolSize = useMemo(() => {
    if (!active) return 0;
    return filterNodesPool(active.nodes, spec).length;
  }, [active, spec]);

  const weightMax = useMemo(() => {
    if (!active) return 10;
    return weightSliderMax(active.edges);
  }, [active]);

  // Keep min-weight inside this construct's useful range when switching lenses
  useEffect(() => {
    if (!active) return;
    if (spec.minWeight > weightMax) patch({ minWeight: weightMax });
  }, [active, weightMax, spec.minWeight, patch]);

  const { nodes, edges } = useMemo(() => {
    if (!active) return { nodes: [] as Node[], edges: [] as Edge[] };
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
    let nextEdges = filterEdges(
      active.edges,
      new Set(list.map((n) => n.id)),
      spec,
      pinnedId,
      searchMatch,
    );
    if (spec.hideIsolates) {
      const keep = pinnedId ? new Set([pinnedId]) : undefined;
      list = dropIsolates(list, nextEdges, keep);
      const ids = new Set(list.map((n) => n.id));
      nextEdges = nextEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
    }
    return { nodes: list, edges: nextEdges };
  }, [active, spec, pinnedId, searchMatch]);

  // Keep shareable atelier URLs in sync as density/connect knobs move
  useEffect(() => {
    if (view !== "atelier" || isPrint) return;
    const t = window.setTimeout(() => writeUrl(spec, "atelier", "replace"), 180);
    return () => window.clearTimeout(t);
  }, [spec, view, isPrint]);

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

  const insightFocusId = insights[0]?.focusId ?? null;

  const viewStats = useMemo(() => {
    if (!nodes.length || !spec.statMarks.length) return null;
    return computeViewStatMarks({
      nodes,
      edges,
      enabled: spec.statMarks,
      manifest: active?.manifest,
      insightFocusId,
      fullNodeCount: active?.nodes.length,
      sortBy: spec.sortBy,
      focusId: pinnedId,
    });
  }, [
    nodes,
    edges,
    spec.statMarks,
    spec.sortBy,
    active?.manifest,
    active?.nodes.length,
    insightFocusId,
    pinnedId,
  ]);

  const onHover = useCallback((id: string | null) => {
    setSelection((s) => (s.pinnedId ? s : { ...s, hoveredId: id }));
  }, []);

  const onHoverEdge = useCallback(
    (edge: Edge | null) => {
      setSelection((s) => {
        if (s.pinnedId || s.pinnedEdge) return s;
        return {
          ...s,
          hoveredEdge: edge,
          hoveredId: edge ? edge.source : null,
        };
      });
      // Tap-to-open on touch; hover-to-open only on fine pointers
      if (edge && !isCoarse) openInspect();
    },
    [isCoarse, openInspect],
  );

  const onPinEdge = useCallback(
    (edge: Edge | null) => {
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
      if (edge) openInspect();
    },
    [openInspect],
  );

  const onPin = useCallback(
    (id: string | null) => {
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
      if (id) openInspect();
    },
    [openInspect],
  );

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
  const showScatterExplorer = !isPrint && spec.heroForm === "scatter" && !!active;
  const scrimVisible = overlayPanels && (controlsOpen || inspectOpen);

  const layoutClass = [
    "app",
    !isPrint && "with-panels",
    controlsOpen && "controls-open",
    inspectOpen && "inspect-open",
    isPhone && "is-phone",
  ]
    .filter(Boolean)
    .join(" ");

  if (!isPrint && view === "styleguide") {
    return (
      <ThemeProvider printMode={false} palette={spec.palette as PaletteName}>
        <StyleGuide onBack={() => setView("home")} />
      </ThemeProvider>
    );
  }

  if (!isPrint && view === "home") {
    return (
      <ThemeProvider printMode={false} palette={spec.palette as PaletteName}>
        <HomeGallery
          onOpenStory={openStory}
          onOpenAtelier={() => openAtelier()}
          onOpenMethodology={() => openMethodology()}
        />
      </ThemeProvider>
    );
  }

  if (!isPrint && view === "methodology") {
    return (
      <ThemeProvider printMode={false} palette={spec.palette as PaletteName}>
        <MethodologyPage
          index={index}
          constructId={methodologyConstruct}
          onSelectConstruct={selectMethodologyConstruct}
          onBackHome={openHome}
          onOpenAtelier={(id) => openAtelier(id)}
          qualityRollup={qualityRollup}
          qualityUnavailable={qualityUnavailable}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider
      printMode={isPrint}
      palette={spec.palette as PaletteName}
      onPaletteChange={(p) => patch({ palette: p })}
    >
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
          onToggle={toggleControls}
          onOpenHome={openHome}
          onOpenMethodology={() => openMethodology(spec.activeConstruct)}
          searchMatch={searchMatch}
          filteredCounts={{ people: nodes.length, links: edges.length }}
          poolSize={poolSize}
          weightMax={weightMax}
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
              {spec.statMarks.length ? ` · ${spec.statMarks.length} stats` : ""}
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
          <div className="empty empty--loading">
            <div className="empty-plate" aria-hidden />
            <p>Loading poster…</p>
            <p className="empty-hint">Warming the plate under the lamp.</p>
          </div>
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
            sortBy={spec.sortBy}
            thicknessBy={spec.thicknessBy}
            sizeBy={spec.sizeBy}
            statMarks={spec.statMarks}
            manifest={active.manifest}
            insightFocusId={insightFocusId}
            viewStats={viewStats}
          />
        ) : showScatterExplorer ? (
          <div className="scatter-stage">
            <StatsRail
              manifest={active.manifest}
              onHoverIds={(ids) => {
                if (ids?.[0]) onHover(ids[0]);
                else onHover(null);
              }}
            />
            <div className="scatter-stage-plot">
              <h2 className="scatter-stage-title">{active.manifest.title}</h2>
              <p className="scatter-stage-sub">{active.manifest.subtitle}</p>
              <ScatterHero
                nodes={nodes}
                width={720}
                height={480}
                highlightIds={
                  selection.hoveredId || selection.pinnedId
                    ? new Set(
                        [selection.hoveredId, selection.pinnedId].filter(Boolean) as string[],
                      )
                    : null
                }
                onHover={(id) => onHover(id)}
                onSelect={(id) => onPin(id)}
              />
            </div>
          </div>
        ) : (
          <PosterShell print={isPrint}>
            {!isPrint && active ? (
              <StatsRail
                manifest={active.manifest}
                onHoverIds={(ids) => {
                  if (ids?.[0]) onHover(ids[0]);
                  else onHover(null);
                }}
              />
            ) : null}
            <ChartLegend
              form={spec.heroForm === "bundle" ? "bundle" : "chord"}
              colorBy={colorBy}
              palette={spec.palette}
              statMarks={viewStats}
            />
            <Poster
              spec={spec}
              active={active}
              all={cache}
              index={index}
              peopleIndex={peopleIndex}
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
              viewStats={viewStats}
              insightFocusId={insightFocusId}
            />
          </PosterShell>
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
          viewStats={viewStats}
          onPin={onPin}
          onFocusNeighbor={(id) => onPin(id)}
          open={inspectOpen}
          onToggle={toggleInspect}
          onOpenMethodology={(hash) => openMethodology(hash)}
        />
      )}
      {!isPrint && (
        <button
          type="button"
          className={`panel-scrim${scrimVisible ? " visible" : ""}`}
          aria-label="Close panel"
          tabIndex={scrimVisible ? 0 : -1}
          onClick={closeAllDrawers}
        />
      )}
    </div>
    </ThemeProvider>
  );
}
