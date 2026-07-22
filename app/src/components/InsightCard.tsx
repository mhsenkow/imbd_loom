/** Analytical observation derived from the current filtered view. */

import type { Insight } from "../lib/insights";

interface Props {
  insights: Insight[];
  onFocus?: (id: string) => void;
  /** Render inside Inspect panel instead of floating on the stage */
  embedded?: boolean;
  /** Show “on chart” when insight_sync mark is painting the focus */
  syncOnChart?: boolean;
}

export function InsightCard({
  insights,
  onFocus,
  embedded = false,
  syncOnChart = true,
}: Props) {
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
        {syncOnChart && primary.focusId ? (
          <span className="insight-sync-hint" title="Halo on the chart matches this focus">
            · on chart
          </span>
        ) : null}
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
