/** Surface card with optional ThemeScope pin (gallery / poster frame). */

import type { ReactNode } from "react";
import { ThemeScope } from "../../lib/theme/ThemeContext";
import type { Theme } from "../../lib/theme/tokens";

interface Props {
  children: ReactNode;
  className?: string;
  /** Pin subtree to a theme (paper charts use "light"). */
  theme?: Theme;
  as?: keyof JSX.IntrinsicElements;
}

export function SurfaceCard({
  children,
  className = "",
  theme,
  as = "div",
}: Props) {
  const cls = `surface-card ${className}`.trim();
  if (theme) {
    return (
      <ThemeScope theme={theme} className={cls} as={as}>
        {children}
      </ThemeScope>
    );
  }
  const Tag = as;
  return <Tag className={cls}>{children}</Tag>;
}
