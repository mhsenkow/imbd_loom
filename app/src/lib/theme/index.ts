/** Theme module public API. */

export {
  primitives,
  surface,
  text,
  line,
  accent,
  mark,
  link,
  grid,
  axis,
  stat,
  opacity,
  shadow,
  wash,
  type as typeTokens,
  PALETTES,
  PALETTE_META,
  PALETTE_NAMES,
  cssVars,
  token,
  contrastOverrides,
  CSS_VAR_NAMES,
  LIGHT,
  type Theme,
  type ThemePreference,
  type ThemedColor,
  type PaletteName,
  type PaletteMeta,
  type TokenName,
} from "./tokens";

export {
  contrastRatio,
  relativeLuminance,
  deltaE,
  hoverColor,
  activeColor,
  lightenLab,
  ensureContrast,
} from "./contrast";

export {
  sequentialScale,
  categoricalScale,
  divergingScale,
  degreeColor,
  paletteMidtones,
  sequentialLow,
  driftThreadColors,
  weaveGradientStops,
  weaveGradient,
  clearScaleCache,
} from "./scales";

export {
  ThemeProvider,
  ThemeScope,
  useTheme,
  usePalette,
  useToken,
} from "./ThemeContext";

export { chartChrome, type ChartChrome } from "./chartChrome";

export {
  linkInteractionStyle,
  linkFillOpacity,
  linkOpacity,
  linkClassName,
  gridLineStyle,
  warpLineStyle,
  markOpacity,
  resolveLinkState,
  type LinkVisualState,
  type GridLineKind,
  type WarpVisualState,
  type LinePaint,
} from "./lineStyle";
