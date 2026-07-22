/** Poster geometry in millimetres (A1 + bleed). */

export const BLEED_MM = 3;
export const SAFE_MM = 10;

/** Trim sizes (width × height mm) */
export const PAGE_SIZES = {
  a1: { w: 594, h: 841, label: "A1" },
  a0: { w: 841, h: 1189, label: "A0" },
  tabloid: { w: 279.4, h: 431.8, label: '11×17"' },
  letter: { w: 215.9, h: 279.4, label: "Letter" },
} as const;

export type PageSizeKey = keyof typeof PAGE_SIZES;

export function artboard(size: PageSizeKey = "a1") {
  const trim = PAGE_SIZES[size];
  return {
    trimW: trim.w,
    trimH: trim.h,
    /** Full artboard including bleed */
    w: trim.w + BLEED_MM * 2,
    h: trim.h + BLEED_MM * 2,
    bleed: BLEED_MM,
    safe: SAFE_MM,
    label: trim.label,
  };
}

/** Layout bands inside trim (relative to artboard origin which includes bleed) */
export function bands(size: PageSizeKey = "a1") {
  const a = artboard(size);
  const ox = a.bleed;
  const oy = a.bleed;
  const heroH = a.trimH * 0.58;
  const stripH = a.trimH * 0.28;
  const footerH = a.trimH - heroH - stripH;
  return {
    ...a,
    content: { x: ox + a.safe, y: oy + a.safe, w: a.trimW - a.safe * 2, h: a.trimH - a.safe * 2 },
    hero: { x: ox + a.safe, y: oy + a.safe, w: a.trimW - a.safe * 2, h: heroH - a.safe },
    strip: {
      x: ox + a.safe,
      y: oy + heroH + 4,
      w: a.trimW - a.safe * 2,
      h: stripH - 8,
    },
    footer: {
      x: ox + a.safe,
      y: oy + heroH + stripH,
      w: a.trimW - a.safe * 2,
      h: footerH - a.safe,
    },
  };
}
