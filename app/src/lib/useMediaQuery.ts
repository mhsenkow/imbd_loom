/** Tiny matchMedia hook — used for phone drawer / touch behavior. */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Phone / narrow portrait — overlay drawers + bottom sheet. */
export const PHONE_MQ = "(max-width: 560px)";

/** Coarse pointer (touch-first) — prefer tap over hover. */
export const COARSE_MQ = "(pointer: coarse)";
