/** Token-backed color swatch primitive. */

interface Props {
  color: string;
  size?: number;
  label?: string;
  className?: string;
  title?: string;
}

export function Swatch({ color, size = 10, label, className = "", title }: Props) {
  return (
    <span className={`ui-swatch ${className}`.trim()} title={title ?? label}>
      <span
        className="ui-swatch-chip"
        style={{
          background: color,
          width: size,
          height: size,
        }}
        aria-hidden
      />
      {label ? <span className="ui-swatch-label">{label}</span> : null}
    </span>
  );
}
