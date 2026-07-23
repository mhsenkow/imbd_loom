/** Curated story presets — interesting construct × form × filter combinations. */

import { DEFAULT_SPEC, type PosterSpec } from "./types";
import { specToSearchParams } from "./specUrl";

export interface StoryPreset {
  id: string;
  /** Short concept title shown on the card */
  concept: string;
  /** One-line hook — what this cut reveals */
  hook: string;
  /** Display chips (form, era, filter idea) */
  tags: string[];
  /** Partial spec merged onto DEFAULT_SPEC when opening the atelier */
  spec: Partial<PosterSpec> & Pick<PosterSpec, "activeConstruct" | "heroForm">;
}

export interface GalleryCollection {
  id: string;
  label: string;
  /** Short blurb under the tab strip */
  blurb: string;
  stories: StoryPreset[];
}

/** Visually loud cuts — form, density, and palette first. */
const LOOK_COOL: StoryPreset[] = [
  {
    id: "cool-scream-dense",
    concept: "Scream-queen knot",
    hook: "Heavy co-appearance weight on a chord — pure woven density.",
    tags: ["Chord", "Dense", "Horror"],
    spec: {
      activeConstruct: "scream_queen",
      heroForm: "chord",
      topN: 90,
      minWeight: 4,
      colorMode: "gender",
      labelMode: "none",
      palette: "loom",
    },
  },
  {
    id: "cool-dubbing-dusk",
    concept: "Dubbing dusk bundle",
    hook: "Edge bundles in the dusk palette — voice careers as a soft loom.",
    tags: ["Bundle", "Dusk", "Voice"],
    spec: {
      activeConstruct: "dubbing",
      heroForm: "bundle",
      topN: 160,
      minWeight: 2,
      colorMode: "degree",
      labelMode: "none",
      palette: "dusk",
    },
  },
  {
    id: "cool-genre-ink",
    concept: "Ink genre bridges",
    hook: "Near-monochrome bundling — structure without loud color.",
    tags: ["Bundle", "Ink", "Bridges"],
    spec: {
      activeConstruct: "genre_bridge",
      heroForm: "bundle",
      topN: 120,
      minWeight: 2,
      minTitles: 5,
      colorMode: "degree",
      labelMode: "none",
      palette: "ink",
    },
  },
  {
    id: "cool-long-flip",
    concept: "Longevity, flipped",
    hook: "Half-century careers with axes swapped — years read as strata.",
    tags: ["Timeline", "Flip", "Longevity"],
    spec: {
      activeConstruct: "long_careers",
      heroForm: "timeline",
      topN: 70,
      minWeight: 2,
      timelineFlip: true,
      sortBy: "year_peak",
      minTitles: 6,
      labelMode: "hubs",
      palette: "loom",
    },
  },
  {
    id: "cool-comedy-horror-ring",
    concept: "Crossover ring",
    hook: "Comedy × horror as a tight chord — laughs and screams sharing the circle.",
    tags: ["Chord", "Crossover"],
    spec: {
      activeConstruct: "comedy_horror",
      heroForm: "chord",
      topN: 100,
      minWeight: 3,
      colorMode: "degree",
      labelMode: "hubs",
      palette: "dusk",
    },
  },
  {
    id: "cool-one-role-bloom",
    concept: "One-genre bloom",
    hook: "Genre co-membership as a full chord — specialists clustering by lane.",
    tags: ["Chord", "One-role"],
    spec: {
      activeConstruct: "one_role",
      heroForm: "chord",
      topN: 140,
      minWeight: 1,
      colorMode: "degree",
      labelMode: "none",
      sortBy: "title_count",
      palette: "loom",
    },
  },
  {
    id: "cool-cartoons-wide",
    concept: "Cartoon skyline",
    hook: "Wide timeline of voice careers — lanes stacked like a skyline.",
    tags: ["Timeline", "Animation"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "timeline",
      topN: 140,
      minWeight: 2,
      minTitles: 2,
      sortBy: "year_peak",
      labelMode: "none",
      palette: "dusk",
    },
  },
  {
    id: "cool-bechdel-bundle",
    concept: "Bechdel as fabric",
    hook: "Pass-film collaborations edge-bundled — collaboration as cloth.",
    tags: ["Bundle", "Bechdel"],
    spec: {
      activeConstruct: "bechdel",
      heroForm: "bundle",
      topN: 110,
      minWeight: 2,
      colorMode: "gender",
      labelMode: "none",
      palette: "loom",
    },
  },
  {
    id: "cool-men-horror-tight",
    concept: "Horror men — tight weave",
    hook: "Fewer nodes, higher weight — a compact horror-male chord.",
    tags: ["Chord", "min wt 5"],
    spec: {
      activeConstruct: "men_horror",
      heroForm: "chord",
      topN: 64,
      minWeight: 5,
      genderFilter: "male",
      colorMode: "degree",
      labelMode: "hubs",
      palette: "ink",
    },
  },
  {
    id: "cool-women-horror-dusk",
    concept: "Women in horror, dusk",
    hook: "Gender-colored chord in dusk tones — prominence sorted.",
    tags: ["Chord", "Dusk", "Horror"],
    spec: {
      activeConstruct: "women_horror",
      heroForm: "chord",
      topN: 100,
      minWeight: 3,
      colorMode: "gender",
      sortBy: "prominence",
      labelMode: "hubs",
      palette: "dusk",
    },
  },
];

/** Horror-family constructs and era cuts. */
const HORROR: StoryPreset[] = [
  {
    id: "horror-scream-classic",
    concept: "The scream-queen web",
    hook: "Actresses recurring across horror — co-appearance as the weave.",
    tags: ["Scream queen", "Chord"],
    spec: {
      activeConstruct: "scream_queen",
      heroForm: "chord",
      topN: 100,
      minWeight: 3,
      colorMode: "gender",
      sortBy: "degree",
    },
  },
  {
    id: "horror-scream-timeline",
    concept: "Scream queens over time",
    hook: "Career lanes for the same horror co-appearance cast.",
    tags: ["Scream queen", "Timeline"],
    spec: {
      activeConstruct: "scream_queen",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      sortBy: "year_peak",
      colorMode: "gender",
    },
  },
  {
    id: "horror-scream-modern",
    concept: "After 2000",
    hook: "Scream-queen web limited to careers touching the 21st century.",
    tags: ["2000–", "Timeline"],
    spec: {
      activeConstruct: "scream_queen",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      yearFrom: 2000,
      yearTo: 2030,
      edgeYearFilter: true,
      colorMode: "gender",
      sortBy: "year_peak",
    },
  },
  {
    id: "horror-women-full",
    concept: "Women in horror",
    hook: "Female-coded cast in horror — gender → prominence → title profile.",
    tags: ["Women", "Chord"],
    spec: {
      activeConstruct: "women_horror",
      heroForm: "chord",
      topN: 120,
      minWeight: 2,
      colorMode: "degree",
      sortBy: "prominence",
    },
  },
  {
    id: "horror-women-80s",
    concept: "Women · 80s–90s boom",
    hook: "Decade window on women in horror during the boom years.",
    tags: ["1980–1999", "Chord"],
    spec: {
      activeConstruct: "women_horror",
      heroForm: "chord",
      topN: 100,
      minWeight: 2,
      yearFrom: 1980,
      yearTo: 1999,
      edgeYearFilter: true,
      genderFilter: "female",
      sortBy: "prominence",
    },
  },
  {
    id: "horror-women-timeline",
    concept: "Women · career lanes",
    hook: "Horror actresses as a timeline — who overlapped which decades.",
    tags: ["Women", "Timeline"],
    spec: {
      activeConstruct: "women_horror",
      heroForm: "timeline",
      topN: 110,
      minWeight: 2,
      sortBy: "year_peak",
      colorMode: "degree",
    },
  },
  {
    id: "horror-men-full",
    concept: "Men in horror",
    hook: "Male-coded horror cast — hubs by co-appearance degree.",
    tags: ["Men", "Chord"],
    spec: {
      activeConstruct: "men_horror",
      heroForm: "chord",
      topN: 120,
      minWeight: 2,
      genderFilter: "male",
      colorMode: "degree",
      sortBy: "degree",
    },
  },
  {
    id: "horror-men-tight",
    concept: "Men · tight clique",
    hook: "Top 80, min weight 4 — only the densest horror-male links.",
    tags: ["Men", "Dense"],
    spec: {
      activeConstruct: "men_horror",
      heroForm: "chord",
      topN: 80,
      minWeight: 4,
      genderFilter: "male",
      colorMode: "degree",
      labelMode: "hubs",
    },
  },
  {
    id: "horror-men-bundle",
    concept: "Men · edge bundle",
    hook: "Same population as a hierarchical bundle — clusters without the circle.",
    tags: ["Men", "Bundle"],
    spec: {
      activeConstruct: "men_horror",
      heroForm: "bundle",
      topN: 120,
      minWeight: 2,
      genderFilter: "male",
      colorMode: "degree",
      labelMode: "hubs",
    },
  },
  {
    id: "horror-crossover",
    concept: "Comedy × horror",
    hook: "Careers that live in both lanes — crossover co-appearance.",
    tags: ["Crossover", "Chord"],
    spec: {
      activeConstruct: "comedy_horror",
      heroForm: "chord",
      topN: 120,
      minWeight: 2,
      colorMode: "degree",
      sortBy: "degree",
    },
  },
  {
    id: "horror-crossover-time",
    concept: "Crossover careers",
    hook: "Comedy–horror people as career lanes across decades.",
    tags: ["Crossover", "Timeline"],
    spec: {
      activeConstruct: "comedy_horror",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      sortBy: "year_peak",
      minTitles: 3,
    },
  },
  {
    id: "horror-crossover-70s",
    concept: "Crossover · 1970–1989",
    hook: "Laughs-and-screams window on the late classic / early boom era.",
    tags: ["1970–1989", "Chord"],
    spec: {
      activeConstruct: "comedy_horror",
      heroForm: "chord",
      topN: 90,
      minWeight: 2,
      yearFrom: 1970,
      yearTo: 1989,
      edgeYearFilter: true,
      colorMode: "degree",
    },
  },
];

/** Voice acting, cartoons, dubbing multiverse. */
const VOICE: StoryPreset[] = [
  {
    id: "voice-cartoons-lanes",
    concept: "Cartoon career lanes",
    hook: "Voice actors across decades of animation — who overlapped, and when.",
    tags: ["Cartoons", "Timeline"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "timeline",
      topN: 120,
      minWeight: 2,
      minTitles: 3,
      sortBy: "year_peak",
      labelMode: "hubs",
    },
  },
  {
    id: "voice-cartoons-chord",
    concept: "Cartoon co-appearance",
    hook: "Shared animation titles as a chord — the voice-room clique.",
    tags: ["Cartoons", "Chord"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "chord",
      topN: 110,
      minWeight: 2,
      colorMode: "degree",
      sortBy: "degree",
      labelMode: "hubs",
    },
  },
  {
    id: "voice-cartoons-bundle",
    concept: "Cartoon bundles",
    hook: "Hierarchical edge bundling on animation voice credits.",
    tags: ["Cartoons", "Bundle"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "bundle",
      topN: 130,
      minWeight: 2,
      colorMode: "degree",
      labelMode: "hubs",
    },
  },
  {
    id: "voice-cartoons-women",
    concept: "Women voicing cartoons",
    hook: "Female-coded voice careers in animation.",
    tags: ["Female", "Timeline"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      genderFilter: "female",
      colorMode: "gender",
      sortBy: "degree",
      minTitles: 2,
    },
  },
  {
    id: "voice-cartoons-men",
    concept: "Men voicing cartoons",
    hook: "Male-coded animation voice lanes — degree-sorted hubs.",
    tags: ["Male", "Timeline"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      genderFilter: "male",
      colorMode: "gender",
      sortBy: "degree",
      minTitles: 2,
    },
  },
  {
    id: "voice-cartoons-golden",
    concept: "Golden-age overlap",
    hook: "Animation voice careers touching 1935–1965.",
    tags: ["1935–1965", "Chord"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "chord",
      topN: 90,
      minWeight: 2,
      yearFrom: 1935,
      yearTo: 1965,
      edgeYearFilter: true,
      colorMode: "degree",
      sortBy: "degree",
    },
  },
  {
    id: "voice-dubbing-fanout",
    concept: "Dubbing multiverse",
    hook: "Voice actor → character fan-out as an edge bundle.",
    tags: ["Dubbing", "Bundle"],
    spec: {
      activeConstruct: "dubbing",
      heroForm: "bundle",
      topN: 140,
      minWeight: 2,
      colorMode: "degree",
      labelMode: "hubs",
    },
  },
  {
    id: "voice-dubbing-chord",
    concept: "Dubbing as chord",
    hook: "Same multiverse on a circle — who shares character-heavy careers.",
    tags: ["Dubbing", "Chord"],
    spec: {
      activeConstruct: "dubbing",
      heroForm: "chord",
      topN: 110,
      minWeight: 2,
      colorMode: "degree",
      labelMode: "hubs",
    },
  },
  {
    id: "voice-dubbing-time",
    concept: "Dubbing careers",
    hook: "Character-heavy voice careers stretched across years.",
    tags: ["Dubbing", "Timeline"],
    spec: {
      activeConstruct: "dubbing",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      sortBy: "year_peak",
      minTitles: 3,
    },
  },
  {
    id: "voice-dubbing-women",
    concept: "Women in the multiverse",
    hook: "Female-coded dubbing / many-character voice careers.",
    tags: ["Female", "Bundle"],
    spec: {
      activeConstruct: "dubbing",
      heroForm: "bundle",
      topN: 100,
      minWeight: 2,
      genderFilter: "female",
      colorMode: "gender",
      labelMode: "hubs",
    },
  },
  {
    id: "voice-cartoons-modern",
    concept: "Cartoons since 1990",
    hook: "Animation voice web for careers touching the cable / streaming era.",
    tags: ["1990–", "Timeline"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "timeline",
      topN: 110,
      minWeight: 2,
      yearFrom: 1990,
      yearTo: 2030,
      edgeYearFilter: true,
      sortBy: "year_peak",
      minTitles: 2,
    },
  },
  {
    id: "voice-cartoons-prolific",
    concept: "Prolific cartoon voices",
    hook: "Min 5 titles — busier animation careers only.",
    tags: ["min titles 5", "Chord"],
    spec: {
      activeConstruct: "voice_cartoons",
      heroForm: "chord",
      topN: 100,
      minWeight: 2,
      minTitles: 5,
      sortBy: "title_count",
      colorMode: "degree",
    },
  },
];

/** Careers, bridges, Bechdel, one-role concentration. */
const CAREERS: StoryPreset[] = [
  {
    id: "careers-long",
    concept: "Long careers",
    hook: "35+ year credited spans — longevity × collaboration.",
    tags: ["Longevity", "Timeline"],
    spec: {
      activeConstruct: "long_careers",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      sortBy: "year_peak",
      minTitles: 4,
      labelMode: "hubs",
    },
  },
  {
    id: "careers-long-flip",
    concept: "Long careers, flipped",
    hook: "Same longevity cut with years vertical and people across.",
    tags: ["Longevity", "Flip"],
    spec: {
      activeConstruct: "long_careers",
      heroForm: "timeline",
      topN: 80,
      minWeight: 2,
      timelineFlip: true,
      sortBy: "year_peak",
      minTitles: 5,
      labelMode: "hubs",
    },
  },
  {
    id: "careers-long-chord",
    concept: "Longevity as chord",
    hook: "Long-span collaborators on a circle — who kept meeting.",
    tags: ["Longevity", "Chord"],
    spec: {
      activeConstruct: "long_careers",
      heroForm: "chord",
      topN: 100,
      minWeight: 2,
      colorMode: "degree",
      sortBy: "degree",
      labelMode: "hubs",
    },
  },
  {
    id: "careers-bridges",
    concept: "Genre bridge builders",
    hook: "Careers spanning two+ genres — the connectors in the loom.",
    tags: ["Bridges", "Bundle"],
    spec: {
      activeConstruct: "genre_bridge",
      heroForm: "bundle",
      topN: 100,
      minWeight: 2,
      minTitles: 4,
      sortBy: "title_count",
      colorMode: "degree",
      labelMode: "hubs",
    },
  },
  {
    id: "careers-bridges-chord",
    concept: "Bridges as chord",
    hook: "Multi-genre people co-appearance — who spans the map together.",
    tags: ["Bridges", "Chord"],
    spec: {
      activeConstruct: "genre_bridge",
      heroForm: "chord",
      topN: 110,
      minWeight: 2,
      minTitles: 3,
      colorMode: "degree",
      sortBy: "title_count",
    },
  },
  {
    id: "careers-bridges-time",
    concept: "Bridge careers over time",
    hook: "Multi-genre careers as lanes — when the crossing happens.",
    tags: ["Bridges", "Timeline"],
    spec: {
      activeConstruct: "genre_bridge",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      minTitles: 4,
      sortBy: "year_peak",
    },
  },
  {
    id: "careers-one-role",
    concept: "One-role wonders",
    hook: "≥90% one genre — links are genre co-membership, not shared titles.",
    tags: ["One-role", "Chord"],
    spec: {
      activeConstruct: "one_role",
      heroForm: "chord",
      topN: 120,
      minWeight: 1,
      colorMode: "degree",
      sortBy: "title_count",
      labelMode: "hubs",
    },
  },
  {
    id: "careers-one-role-time",
    concept: "Specialists over time",
    hook: "One-genre careers as a timeline — concentration across eras.",
    tags: ["One-role", "Timeline"],
    spec: {
      activeConstruct: "one_role",
      heroForm: "timeline",
      topN: 100,
      minWeight: 1,
      sortBy: "year_peak",
      colorMode: "degree",
    },
  },
  {
    id: "careers-one-role-bundle",
    concept: "Specialist bundles",
    hook: "Genre-concentrated careers edge-bundled by affinity.",
    tags: ["One-role", "Bundle"],
    spec: {
      activeConstruct: "one_role",
      heroForm: "bundle",
      topN: 120,
      minWeight: 1,
      colorMode: "degree",
      sortBy: "title_count",
      labelMode: "none",
    },
  },
  {
    id: "careers-bechdel",
    concept: "The Bechdel web",
    hook: "Cast across films that pass the Bechdel test (rating = 3).",
    tags: ["Bechdel", "Chord"],
    spec: {
      activeConstruct: "bechdel",
      heroForm: "chord",
      topN: 120,
      minWeight: 2,
      colorMode: "gender",
      sortBy: "degree",
    },
  },
  {
    id: "careers-bechdel-time",
    concept: "Bechdel over time",
    hook: "Pass-film collaborations as career lanes.",
    tags: ["Bechdel", "Timeline"],
    spec: {
      activeConstruct: "bechdel",
      heroForm: "timeline",
      topN: 100,
      minWeight: 2,
      minTitles: 2,
      sortBy: "year_peak",
      colorMode: "gender",
    },
  },
  {
    id: "careers-bechdel-women",
    concept: "Bechdel · women",
    hook: "Female-coded cast on pass films — gender-colored hubs.",
    tags: ["Bechdel", "Female"],
    spec: {
      activeConstruct: "bechdel",
      heroForm: "chord",
      topN: 100,
      minWeight: 2,
      genderFilter: "female",
      colorMode: "gender",
      sortBy: "degree",
      labelMode: "hubs",
    },
  },
];

/** New lenses — repertory, reunions, muses, child stars, etc. */
const NEW_LENSES: StoryPreset[] = [
  {
    id: "lens-repertory",
    concept: "Repertory companies",
    hook: "Tight troupes — people with ≥3 partners who share ≥3 titles each.",
    tags: ["Repertory", "Chord"],
    spec: { activeConstruct: "repertory", heroForm: "chord", topN: 100, minWeight: 3 },
  },
  {
    id: "lens-child-stars",
    concept: "Child stars",
    hook: "Debuted before 12 — colored by whether they still worked past 25.",
    tags: ["Child stars", "Timeline"],
    spec: { activeConstruct: "child_stars", heroForm: "timeline", topN: 100, minWeight: 2 },
  },
  {
    id: "lens-same-character",
    concept: "Same character club",
    hook: "Batmans, Bonds, Draculas — roles worn by three or more faces.",
    tags: ["Characters", "Bundle"],
    spec: { activeConstruct: "same_character", heroForm: "bundle", topN: 120, minWeight: 1 },
  },
  {
    id: "lens-muses",
    concept: "Director's muses",
    hook: "Actors with ≥4 titles under one director — the muse loom.",
    tags: ["Muses", "Chord"],
    spec: { activeConstruct: "director_muses", heroForm: "chord", topN: 100, minWeight: 2 },
  },
  {
    id: "lens-reunions",
    concept: "The reunion map",
    hook: "Pairs who shared a credit, vanished for 20+ years, then met again.",
    tags: ["Reunions", "Timeline"],
    spec: { activeConstruct: "reunions", heroForm: "timeline", topN: 100, minWeight: 1 },
  },
  {
    id: "lens-genre-drift",
    concept: "Genre drift",
    hook: "Careers whose early and late genres barely overlap.",
    tags: ["Drift", "Timeline"],
    spec: { activeConstruct: "genre_drift", heroForm: "timeline", topN: 100, minWeight: 2 },
  },
  {
    id: "lens-comeback",
    concept: "Comeback trail",
    hook: "Eight-year (or longer) hiatus, then five or more credits after.",
    tags: ["Comeback", "Timeline"],
    spec: { activeConstruct: "comeback", heroForm: "timeline", topN: 100, minWeight: 2 },
  },
  {
    id: "lens-blockbuster",
    concept: "Blockbuster ensemble",
    hook: "Careers mostly spent in top-decile-vote titles.",
    tags: ["Blockbuster", "Chord"],
    spec: { activeConstruct: "blockbuster", heroForm: "chord", topN: 100, minWeight: 2 },
  },
  {
    id: "lens-b-movie",
    concept: "B-movie loyalists",
    hook: "The inverse loom — careers loyal to below-median-vote titles.",
    tags: ["B-movie", "Chord"],
    spec: { activeConstruct: "b_movie", heroForm: "chord", topN: 100, minWeight: 2 },
  },
  {
    id: "lens-national",
    concept: "National cinema bridges",
    hook: "Actors credited across two or more production regions.",
    tags: ["Regions", "Bundle"],
    spec: { activeConstruct: "national_bridges", heroForm: "bundle", topN: 100, minWeight: 2 },
  },
  {
    id: "lens-voice-face",
    concept: "Voice ↔ face",
    hook: "People with both animation voice and live-action movie careers.",
    tags: ["Voice", "Face"],
    spec: { activeConstruct: "voice_face", heroForm: "timeline", topN: 100, minWeight: 2 },
  },
  {
    id: "lens-hyphenates",
    concept: "The hyphenates",
    hook: "Actor-directors and actor-writers — people who wear two hats.",
    tags: ["Hyphenates", "Chord"],
    spec: { activeConstruct: "hyphenates", heroForm: "chord", topN: 100, minWeight: 2 },
  },
];

const ARCHETYPES: StoryPreset[] = [
  {
    id: "arch-franchise",
    concept: "Franchise nomads",
    hook: "People who hop across three or more series / IP groups.",
    tags: ["Franchise", "Bundle"],
    spec: { activeConstruct: "franchise_nomads", heroForm: "bundle", topN: 100, minWeight: 2 },
  },
  {
    id: "arch-doc-selves",
    concept: "Documentary selves",
    hook: "The talk-show / documentary ecosystem of people credited as Self.",
    tags: ["Documentary", "Chord"],
    spec: { activeConstruct: "documentary_selves", heroForm: "chord", topN: 100, minWeight: 2 },
  },
  {
    id: "arch-typecast",
    concept: "Typecast index",
    hook: "Perpetual cops, nurses, judges — character names that stick.",
    tags: ["Typecast", "Chord"],
    spec: { activeConstruct: "typecast", heroForm: "chord", topN: 100, minWeight: 2 },
  },
  {
    id: "arch-silent-sound",
    concept: "Silent → sound survivors",
    hook: "Careers that straddled 1927 — who made the transition.",
    tags: ["Silent era", "Timeline"],
    spec: { activeConstruct: "silent_sound", heroForm: "timeline", topN: 80, minWeight: 1 },
  },
  {
    id: "arch-horror-blood",
    concept: "Horror bloodlines",
    hook: "Dense horror co-appearance across genders — the royal court of screams.",
    tags: ["Horror", "Chord"],
    spec: {
      activeConstruct: "horror_bloodlines",
      heroForm: "chord",
      topN: 100,
      minWeight: 3,
      colorMode: "gender",
    },
  },
  {
    id: "arch-one-role-fixed",
    concept: "One-role wonders (stratified)",
    hook: "≥90% one genre — now stratified by genre and ranked by prominence, not raw volume.",
    tags: ["One-role", "Chord"],
    spec: {
      activeConstruct: "one_role",
      heroForm: "chord",
      topN: 120,
      minWeight: 1,
      sortBy: "prominence",
      labelMode: "hubs",
    },
  },
  {
    id: "arch-reunions-chord",
    concept: "Reunions as chord",
    hook: "The same 20-year gaps, read as a circle of long-dormant ties.",
    tags: ["Reunions", "Chord"],
    spec: { activeConstruct: "reunions", heroForm: "chord", topN: 90, minWeight: 1 },
  },
  {
    id: "arch-muses-timeline",
    concept: "Muses over time",
    hook: "Director–actor loyalty lanes across decades.",
    tags: ["Muses", "Timeline"],
    spec: { activeConstruct: "director_muses", heroForm: "timeline", topN: 100, minWeight: 2 },
  },
  {
    id: "arch-child-chord",
    concept: "Child-star web",
    hook: "Who grew up on screen together — co-appearance among early debuts.",
    tags: ["Child stars", "Chord"],
    spec: { activeConstruct: "child_stars", heroForm: "chord", topN: 90, minWeight: 2 },
  },
  {
    id: "arch-same-char-chord",
    concept: "Character inheritance chord",
    hook: "Shared character names as the weave — legacy casting as a circle.",
    tags: ["Characters", "Chord"],
    spec: { activeConstruct: "same_character", heroForm: "chord", topN: 100, minWeight: 1 },
  },
  {
    id: "arch-dynasties",
    concept: "Acting dynasties",
    hook: "Family trees (when Wikidata is warm) woven with co-appearance.",
    tags: ["Family", "Chord"],
    spec: { activeConstruct: "acting_dynasties", heroForm: "chord", topN: 100, minWeight: 1 },
  },
  {
    id: "arch-athletes",
    concept: "Athletes to actors",
    hook: "Wrestlers, martial artists, and athletes who crossed onto the screen.",
    tags: ["Athletes", "Chord"],
    spec: { activeConstruct: "athletes_actors", heroForm: "chord", topN: 100, minWeight: 2 },
  },
  {
    id: "arch-drama-schools",
    concept: "Drama school webs",
    hook: "RADA / Juilliard / stage-school clusters — classmates who kept meeting.",
    tags: ["Schools", "Bundle"],
    spec: { activeConstruct: "drama_schools", heroForm: "bundle", topN: 100, minWeight: 2 },
  },
  {
    id: "arch-awards",
    concept: "Award season cohorts",
    hook: "Award-linked careers woven by the titles they actually share.",
    tags: ["Awards", "Chord"],
    spec: { activeConstruct: "award_cohorts", heroForm: "chord", topN: 100, minWeight: 2 },
  },
];

export const GALLERY_COLLECTIONS: GalleryCollection[] = [
  {
    id: "look-cool",
    label: "Just look cool",
    blurb: "Form, density, and palette first — weaves picked because they read as objects.",
    stories: LOOK_COOL,
  },
  {
    id: "horror",
    label: "Horror webs",
    blurb: "Scream queens, gendered horror casts, and comedy × horror crossovers.",
    stories: HORROR,
  },
  {
    id: "voice",
    label: "Voice & cartoons",
    blurb: "Animation voice rooms and the dubbing multiverse — shared shows and character fan-out.",
    stories: VOICE,
  },
  {
    id: "careers",
    label: "Careers & bridges",
    blurb: "Longevity, multi-genre connectors, one-role specialists, and the Bechdel web.",
    stories: CAREERS,
  },
  {
    id: "new-lenses",
    label: "New lenses",
    blurb: "Repertory troupes, muses, reunions, child stars, blockbusters, hyphenates, and more.",
    stories: NEW_LENSES,
  },
  {
    id: "archetypes",
    label: "Archetypes & eras",
    blurb: "Typecasting, franchise hoppers, silent-era survivors, documentary selves, character clubs.",
    stories: ARCHETYPES,
  },
];

/** Flat list (all tabs) — useful for search / deep links. */
export const GALLERY_STORIES: StoryPreset[] = GALLERY_COLLECTIONS.flatMap((c) => c.stories);

export function collectionById(id: string | null | undefined): GalleryCollection {
  return GALLERY_COLLECTIONS.find((c) => c.id === id) ?? GALLERY_COLLECTIONS[0];
}

export function resolveStorySpec(story: StoryPreset): PosterSpec {
  return { ...DEFAULT_SPEC, ...story.spec };
}

export function storyToHref(story: StoryPreset, baseUrl = "/"): string {
  const spec = resolveStorySpec(story);
  const qs = specToSearchParams(spec);
  qs.set("view", "atelier");
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}?${qs.toString()}`;
}

export function atelierHref(baseUrl = "/"): string {
  const qs = specToSearchParams(DEFAULT_SPEC);
  qs.set("view", "atelier");
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}?${qs.toString()}`;
}

export function homeHref(baseUrl = "/", tab?: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const qs = new URLSearchParams({ view: "home" });
  if (tab && tab !== GALLERY_COLLECTIONS[0].id) qs.set("tab", tab);
  return `${base}?${qs.toString()}`;
}

const ATELIER_HINTS = [
  "construct",
  "hero",
  "topN",
  "minWeight",
  "minTitles",
  "gender",
  "yearFrom",
  "yearTo",
  "search",
  "flip",
  "palette",
  "size",
] as const;

/** Decide landing surface from the current query string. */
export function viewFromSearchParams(
  params: URLSearchParams,
): "home" | "atelier" | "methodology" {
  if (params.has("print")) return "atelier";
  const view = params.get("view");
  if (view === "home" || view === "gallery") return "home";
  if (view === "methodology") return "methodology";
  if (view === "atelier") return "atelier";
  if (ATELIER_HINTS.some((k) => params.has(k))) return "atelier";
  return "home";
}
