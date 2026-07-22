/** Analytical observation derived from the current filtered view. */

import type { Insight } from "../lib/insights";

interface Props {
  insights: Insight[];
  onFocus?: (id: string) => void;
  /** Render inside Inspect panel instead of floating on the stage */
  embedded?: boolean;
}

export function InsightCard({ insights, onFocus, embedded = false }: Props) {
  if (!insights.length) return null;
  const primary = insights[0];
  const secondary = insights[1];

  return (
    <aside
      className={`insight-card${embedded ? " insight-card--panel" : ""}`}
      aria-live="polite"
    >
      <div className="insight-kicker mono">
        Insight
        <span className="insight-kind-inline">{primary.kind}</span>
      </div>
      <p className="insight-headline">
        {primary.focusId && onFocus ? (
          <button
            type="button"
            className="insight-link"
            onClick={() => onFocus(primary.focusId!)}
          >
            {primary.headline}
          </button>
        ) : (
          primary.headline
        )}
      </p>
      {primary.detail ? <p className="insight-detail">{primary.detail}</p> : null}
      {secondary ? (
        <p className="insight-secondary">
          <span className="insight-kind mono">{secondary.kind}</span>
          {secondary.headline}
        </p>
      ) : null}
    </aside>
  );
}
