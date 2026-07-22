/** Detail panel — collapsible progressive disclosure. */

import { topNeighbors } from "../lib/selection";
import type { Edge, Node, RoleCredit } from "../lib/types";
import { colorForGender } from "../lib/colors";
import { filmLine, uniqueShared } from "../lib/sharedTitles";
import type { Insight } from "../lib/insights";
import { describeNodeStats, hasStat, type ViewStatMarks } from "../lib/statsMarks";
import { InsightCard } from "./InsightCard";

interface Props {
  node: Node | null;
  edge: Edge | null;
  nodes: Node[];
  edges: Edge[];
  pinned: boolean;
  edgePinned?: boolean;
  insights?: Insight[];
  viewStats?: ViewStatMarks | null;
  onPin: (id: string | null) => void;
  onFocusNeighbor: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}

function roleLine(r: RoleCredit): { character: string; credit: string } {
  const character = r.character?.trim() || "Uncredited / unnamed";
  const bits = [r.title];
  if (r.year) bits.push(String(r.year));
  if (r.billing != null && r.billing <= 3) bits.push("lead billing");
  else if (r.billing != null && r.billing <= 8) bits.push("featured");
  return { character, credit: bits.filter(Boolean).join(" · ") };
}

export function DetailPanel({
  node,
  edge,
  nodes,
  edges,
  pinned,
  edgePinned = false,
  insights = [],
  viewStats = null,
  onPin,
  onFocusNeighbor,
  open,
  onToggle,
}: Props) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const insightBlock =
    insights.length > 0 ? (
      <InsightCard
        insights={insights}
        onFocus={(id) => onPin(id)}
        embedded
        syncOnChart={!!viewStats && hasStat(viewStats, "insight_sync")}
      />
    ) : null;

  if (!open) {
    return (
      <aside className="panel-rail right">
        <button
          type="button"
          className={`rail-btn ${node || edge || insights.length ? "has-focus" : ""}`}
          onClick={onToggle}
          aria-label="Open inspect"
          title="Inspect"
        >
          <span className="rail-icon">◎</span>
          <span className="rail-label">
            {edge
              ? "Link"
              : node
                ? node.label.split(" ")[0]
                : insights.length
                  ? "Insight"
                  : "Inspect"}
          </span>
        </button>
      </aside>
    );
  }

  // Prefer explaining a hovered / pinned link when present
  if (edge && (!pinned || edgePinned)) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    const shared = uniqueShared(edge.shared);
    return (
      <aside className="detail-panel panel-open link-focus">
        <div className="panel-top">
          <h2>{edgePinned ? "Pinned link" : "Co-appearance"}</h2>
          <button
            type="button"
            className="panel-close"
            onClick={onToggle}
            aria-label="Close inspect"
          >
            ✕
          </button>
        </div>
        {insightBlock}
        <p className="link-explain">
          These two people are linked because they were both credited on the{" "}
          <strong>same title(s)</strong>
          {edge.year ? (
            <>
              {" "}
              (around <strong>{edge.year}</strong>)
            </>
          ) : null}
          .
        </p>
        <div className="link-pair">
          <button type="button" className="link-person" onClick={() => a && onPin(a.id)}>
            {a?.label ?? edge.source}
          </button>
          <span className="link-amp">↔</span>
          <button type="button" className="link-person" onClick={() => b && onPin(b.id)}>
            {b?.label ?? edge.target}
          </button>
        </div>
        <div className="stats">
          <div>
            <div className="stat-label">Shared titles</div>
            <div className="stat-value mono">{edge.weight}</div>
          </div>
          {edge.year != null && (
            <div>
              <div className="stat-label">Around</div>
              <div className="stat-value mono">{edge.year}</div>
            </div>
          )}
        </div>
        {shared.length > 0 ? (
          <div className="roles">
            <h3>They both appeared in</h3>
            <ul>
              {shared.map((s) => (
                <li key={s.tconst ?? filmLine(s)}>
                  <div className="role-character">{s.title}</div>
                  <div className="role-credit">
                    {s.year ?? "year unknown"}
                    {s.votes ? ` · ${s.votes.toLocaleString()} votes` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : edge.construct === "one_role" ? (
          <p className="hint">
            These links are <strong>genre co-membership</strong> (same dominant genre), not
            shared titles on the same film.
          </p>
        ) : (
          <p className="hint">
            Film names for this link aren’t loaded yet — run{" "}
            <code>uv run loom build</code> to attach shared-title samples.
          </p>
        )}
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="detail-panel empty-detail panel-open">
        <div className="panel-top">
          <h2>Inspect</h2>
          <button
            type="button"
            className="panel-close"
            onClick={onToggle}
            aria-label="Close inspect"
          >
            ✕
          </button>
        </div>
        {insightBlock}
        <p className="hint">
          <strong>Links mean co-appearances</strong> — both people credited on the same film or
          show. Hover a curved link to see which titles connect them. Tap a person for their roles
          and partners.
        </p>
      </aside>
    );
  }

  const neighbors = topNeighbors(node.id, nodes, edges, 10);
  const yearMin = Number(node.year_min ?? node.yearMin);
  const yearMax = Number(node.year_max ?? node.yearMax);
  const yearPeakRaw = node.year_peak ?? node.yearPeak;
  const yearPeak = yearPeakRaw != null ? Number(yearPeakRaw) : null;
  const hasYears = Number.isFinite(yearMin) || Number.isFinite(yearMax);
  const roles = (node.roles as RoleCredit[] | undefined) ?? [];
  const statTags = describeNodeStats(viewStats, node.id);

  return (
    <aside className={`detail-panel panel-open ${pinned ? "pinned" : ""}`}>
      <div className="panel-top">
        <h2>{pinned ? "Pinned" : "Peek"}</h2>
        <div className="panel-top-actions">
          <button
            type="button"
            className="ghost touch-btn"
            onClick={() => onPin(pinned ? null : node.id)}
          >
            {pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            className="panel-close"
            onClick={onToggle}
            aria-label="Close inspect"
          >
            ✕
          </button>
        </div>
      </div>

      {insightBlock}

      <div className="detail-name">
        <span
          className="swatch"
          style={{ background: colorForGender(node.gender as string) }}
        />
        <div>
          <div className="name">{node.label}</div>
          <div className="meta mono">
            {node.id}
            {node.gender ? ` · ${node.gender}` : ""}
          </div>
        </div>
      </div>

      {statTags.length ? (
        <div className="stat-tag-row" aria-label="Active statistical marks">
          {statTags.map((t) => (
            <span key={t} className="stat-tag mono">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      <dl className="stats">
        <div>
          <dt>Degree</dt>
          <dd>{node.degree}</dd>
        </div>
        {node.title_count != null && (
          <div>
            <dt>Titles</dt>
            <dd>{String(node.title_count)}</dd>
          </div>
        )}
        {node.character_count != null && (
          <div>
            <dt>Characters</dt>
            <dd>{String(node.character_count)}</dd>
          </div>
        )}
        {node.dominant_genre != null && (
          <div>
            <dt>Genre</dt>
            <dd>{String(node.dominant_genre)}</dd>
          </div>
        )}
        {node.concentration != null && (
          <div>
            <dt>Focus</dt>
            <dd>{Math.round(Number(node.concentration) * 100)}%</dd>
          </div>
        )}
        {hasYears && (
          <div className="wide">
            <dt>Career</dt>
            <dd>
              {Number.isFinite(yearMin) ? yearMin : "?"}–
              {Number.isFinite(yearMax) ? yearMax : "?"}
              {yearPeak != null && Number.isFinite(yearPeak) ? ` · peak ${yearPeak}` : ""}
            </dd>
          </div>
        )}
      </dl>

      {roles.length > 0 && (
        <div className="roles">
          <h3>Prominent roles</h3>
          <ul>
            {roles.map((r, i) => {
              const line = roleLine(r);
              return (
                <li key={`${r.tconst ?? r.title}-${i}`}>
                  <div className="role-character">{line.character}</div>
                  <div className="role-credit">{line.credit}</div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {neighbors.length > 0 && (
        <div className="neighbors">
          <h3>Connected via shared titles</h3>
          <ul>
            {neighbors.map(({ node: n, weight, edge }) => {
              const shared = uniqueShared(edge.shared);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className="neighbor-btn"
                    onClick={() => onFocusNeighbor(n.id)}
                  >
                    <span className="neighbor-main">
                      <span className="neighbor-name">{n.label}</span>
                      {shared[0] && (
                        <span className="neighbor-via">{filmLine(shared[0])}</span>
                      )}
                    </span>
                    <span className="mono wt">{weight}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}
