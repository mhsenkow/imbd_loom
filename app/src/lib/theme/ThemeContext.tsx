/**
 * ThemeProvider — writes CSS vars onto :root, stamps data-theme, persists prefs.
 */

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { clearScaleCache } from "./scales";
import {
  cssVars,
  contrastOverrides,
  token,
  type PaletteName,
  type Theme,
  type ThemePreference,
  type TokenName,
  PALETTES,
} from "./tokens";

const STORAGE_KEY = "loom-theme-prefs";

interface StoredPrefs {
  theme?: ThemePreference;
  palette?: PaletteName;
}

interface ThemeContextValue {
  theme: Theme;
  themePreference: ThemePreference;
  palette: PaletteName;
  setTheme: (t: ThemePreference) => void;
  setPalette: (p: PaletteName) => void;
  tokens: ReturnType<typeof cssVars>;
  token: (name: TokenName | string) => string;
  printForced: boolean;
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);

function readStored(): StoredPrefs {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredPrefs;
  } catch {
    return {};
  }
}

function writeStored(prefs: StoredPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* quota */
  }
}

function systemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveTheme(pref: ThemePreference, printForced: boolean): Theme {
  if (printForced) return "light";
  if (pref === "auto") return systemTheme();
  return pref;
}

function applyCssVars(theme: Theme, contrastMore: boolean) {
  const vars = { ...cssVars(theme), ...(contrastMore ? contrastOverrides(theme) : {}) };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Initial palette (e.g. from PosterSpec). Provider observes changes via `palette` prop. */
  palette?: PaletteName | string;
  onPaletteChange?: (p: PaletteName) => void;
  /** Force light/paper theme (print / PDF export). */
  printMode?: boolean;
}

export function ThemeProvider({
  children,
  palette: paletteProp,
  onPaletteChange,
  printMode = false,
}: ThemeProviderProps) {
  const stored = useMemo(() => readStored(), []);
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    () => stored.theme ?? "auto",
  );
  const [paletteLocal, setPaletteLocal] = useState<PaletteName>(() => {
    const p = paletteProp ?? stored.palette ?? "loom";
    return (p in PALETTES ? p : "loom") as PaletteName;
  });
  const [system, setSystem] = useState<Theme>(() => systemTheme());
  const [contrastMore, setContrastMore] = useState(false);

  const palette = (
    paletteProp && paletteProp in PALETTES ? paletteProp : paletteLocal
  ) as PaletteName;

  const theme = resolveTheme(themePreference, printMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystem(mq.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-contrast: more)");
    const onChange = () => setContrastMore(mq.matches);
    setContrastMore(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyCssVars(theme, contrastMore);
    clearScaleCache();
  }, [theme, contrastMore, system, palette]);

  useEffect(() => {
    writeStored({ theme: themePreference, palette });
  }, [themePreference, palette]);

  // Reduced motion: skip hue animation — only opacity fades if any
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      document.documentElement.classList.toggle("reduce-motion", mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const setTheme = useCallback((t: ThemePreference) => {
    setThemePreference(t);
  }, []);

  const setPalette = useCallback(
    (p: PaletteName) => {
      setPaletteLocal(p);
      onPaletteChange?.(p);
    },
    [onPaletteChange],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themePreference,
      palette,
      setTheme,
      setPalette,
      tokens: cssVars(theme),
      token: (name) => token(name, theme),
      printForced: printMode,
    }),
    [theme, themePreference, palette, setTheme, setPalette, printMode],
  );

  return createElement(ThemeCtx.Provider, { value }, children);
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    // Safe fallback for components outside provider (tests / static export)
    return {
      theme: "light",
      themePreference: "auto",
      palette: "loom",
      setTheme: () => {},
      setPalette: () => {},
      tokens: cssVars("light"),
      token: (name) => token(name, "light"),
      printForced: false,
    };
  }
  return ctx;
}

export function usePalette(): PaletteName {
  return useTheme().palette;
}

export function useToken(name: TokenName | string): string {
  return useTheme().token(name);
}

/**
 * Pin a subtree to a fixed theme (e.g. poster frame always on paper).
 * Injects CSS vars onto a wrapping element via style + data-theme.
 */
export function ThemeScope({
  theme,
  children,
  className,
  as: Tag = "div",
}: {
  theme: Theme;
  children: ReactNode;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}) {
  const vars = cssVars(theme);
  return createElement(
    Tag,
    {
      className,
      "data-theme": theme,
      style: vars as CSSProperties,
    },
    children,
  );
}
