/** Token-backed chip / toggle primitive. */

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children: ReactNode;
}

export function Chip({ active = false, children, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      className={`chip${active ? " active" : ""} ${className}`.trim()}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}
