/** Home gallery — tabbed grids of curated chart configurations. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { GalleryThumb, type GalleryPreviewMeta } from "./GalleryThumb";
import {
  GALLERY_COLLECTIONS,
  collectionById,
  resolveStorySpec,
  storyToHref,
  type StoryPreset,
} from "../lib/gallery";

interface Props {
  onOpenStory: (story: StoryPreset) => void;
  onOpenAtelier: () => void;
  onOpenMethodology?: () => void;
}

function StoryCard({
  story,
  onOpenStory,
  base,
  index,
}: {
  story: StoryPreset;
  onOpenStory: (story: StoryPreset) => void;
  base: string;
  index: number;
}) {
  const full = resolveStorySpec(story);
  const [preview, setPreview] = useState<GalleryPreviewMeta | null>(null);
  const handlePreview = useCallback((next: GalleryPreviewMeta | null) => {
    setPreview(next);
  }, []);

  return (
    <article
      className="gallery-card"
      style={{ animationDelay: `${Math.min(index, 10) * 55}ms` }}
    >
      <a
        className="gallery-card-link"
        href={storyToHref(story, base)}
        onClick={(e) => {
          e.preventDefault();
          onOpenStory(story);
        }}
      >
        <div className="gallery-thumb-wrap">
          <GalleryThumb spec={full} onPreviewMeta={handlePreview} />
          {preview ? (
            <span className="gallery-cut-count mono">
              {preview.nodeCount} people · {preview.edgeCount.toLocaleString()} ties
            </span>
          ) : null}
        </div>
        <div className="gallery-card-body">
          <p className="gallery-card-kicker mono">
            {full.activeConstruct.replaceAll("_", " ")}
          </p>
          <h2>{story.concept}</h2>
          <div className="gallery-hook">
            <p>{story.hook}</p>
          </div>
          {preview ? (
            <div className="gallery-evidence">
              <p className="gallery-evidence-label mono">In this cut</p>
              <p className="gallery-evidence-leaders">
                {preview.leaders.join(" · ")}
              </p>
              {preview.strongestPair ? (
                <p className="gallery-evidence-pair mono">
                  Most shared · {preview.strongestPair}
                  {preview.strongestMetric ? ` · ${preview.strongestMetric}` : ""}
                  {preview.sharedTitle ? ` · e.g. ${preview.sharedTitle}` : ""}
                </p>
              ) : null}
            </div>
          ) : null}
          <ul className="gallery-tags">
            {story.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="gallery-meta mono">
            {full.heroForm}
            {full.yearFrom > 1920 || full.yearTo < 2030
              ? ` · ${full.yearFrom}–${full.yearTo}`
              : ""}
            {full.genderFilter !== "all" ? ` · ${full.genderFilter}` : ""}
          </p>
        </div>
      </a>
    </article>
  );
}

function StoryGrid({
  stories,
  onOpenStory,
  base,
}: {
  stories: StoryPreset[];
  onOpenStory: (story: StoryPreset) => void;
  base: string;
}) {
  return (
    <section className="gallery-grid" aria-label="Curated configurations">
      {stories.map((story, i) => (
        <StoryCard
          key={story.id}
          story={story}
          onOpenStory={onOpenStory}
          base={base}
          index={i}
        />
      ))}
    </section>
  );
}

export function HomeGallery({ onOpenStory, onOpenAtelier, onOpenMethodology }: Props) {
  const base = import.meta.env.BASE_URL;
  const [tab, setTab] = useState(
    () => collectionById(new URLSearchParams(window.location.search).get("tab")).id,
  );

  const collection = useMemo(() => collectionById(tab), [tab]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "home");
    if (tab === GALLERY_COLLECTIONS[0].id) url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    // Drop atelier-only params when browsing the gallery
    for (const k of [
      "construct",
      "hero",
      "topN",
      "minWeight",
      "minTitles",
      "gender",
      "yearFrom",
      "yearTo",
      "search",
      "searchMode",
      "flip",
      "palette",
      "size",
      "labelMode",
      "colorMode",
      "sortBy",
      "neighborhood",
      "edgeYear",
    ]) {
      url.searchParams.delete(k);
    }
    const next = `${url.pathname}?${url.searchParams.toString()}`;
    const cur = `${window.location.pathname}${window.location.search}`;
    if (cur !== next) {
      window.history.replaceState({ view: "home", tab }, "", next);
    }
  }, [tab]);

  return (
    <div className="home-gallery">
      <header className="gallery-hero">
        <h1 className="gallery-brand">IMDb Loom</h1>
        <p className="gallery-headline">Actor networks, cut by construct</p>
        <p className="gallery-lede">
          Six shelves of saved lenses — construct, chart form, filters, and marks
          already tuned. Open a sheet, then re-author in the atelier.
        </p>
        <div className="gallery-actions">
          <button type="button" className="gallery-cta" onClick={onOpenAtelier}>
            Open atelier
          </button>
          {onOpenMethodology ? (
            <button type="button" className="gallery-cta ghost" onClick={onOpenMethodology}>
              Trust the data
            </button>
          ) : null}
        </div>
      </header>

      <div className="gallery-tabs-wrap">
        <div className="gallery-tabs" role="tablist" aria-label="Story collections">
          {GALLERY_COLLECTIONS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              id={`gallery-tab-${c.id}`}
              aria-selected={tab === c.id}
              aria-controls={`gallery-panel-${c.id}`}
              className={`gallery-tab ${tab === c.id ? "active" : ""}`}
              onClick={() => setTab(c.id)}
            >
              {c.label}
              <span className="gallery-tab-count mono">{c.stories.length}</span>
            </button>
          ))}
        </div>
        <p className="gallery-tab-blurb" id={`gallery-panel-${collection.id}`} role="tabpanel">
          {collection.blurb}
        </p>
      </div>

      <StoryGrid
        key={collection.id}
        stories={collection.stories}
        onOpenStory={onOpenStory}
        base={base}
      />

      <div className="gallery-cta-sticky">
        <button type="button" className="gallery-cta" onClick={onOpenAtelier}>
          Open atelier
        </button>
      </div>

      <footer className="gallery-foot mono">
        Non-commercial IMDb data · printable poster atelier · {GALLERY_COLLECTIONS.reduce(
          (n, c) => n + c.stories.length,
          0,
        )}{" "}
        curated cuts
        {onOpenMethodology ? (
          <>
            {" · "}
            <button type="button" className="ghost inline" onClick={onOpenMethodology}>
              Trust the data
            </button>
          </>
        ) : null}
      </footer>
    </div>
  );
}
