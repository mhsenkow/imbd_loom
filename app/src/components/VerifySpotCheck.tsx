/**
 * Spot-check widget — random edge + IMDb deep links so a human can verify
 * co-appearances (and Bechdel / Wikidata where relevant).
 */

import { useMemo, useState } from "react";
import type { ConstructData, Edge, Node } from "../lib/types";
import {
  bechdelViewUrl,
  imdbNameUrl,
  imdbTitleUrl,
  wikidataImdbSearchUrl,
} from "../lib/formatTime";
import { filmLine } from "../lib/sharedTitles";

interface Props {
  data: ConstructData | null;
  constructId: string;
}

function pickEdge(edges: Edge[]): Edge | null {
  if (!edges.length) return null;
  const withShared = edges.filter((e) => Array.isArray(e.shared) && e.shared.length);
  const pool = withShared.length ? withShared : edges;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function VerifySpotCheck({ data, constructId }: Props) {
  const [nonce, setNonce] = useState(0);
  const edge = useMemo(() => (data ? pickEdge(data.edges) : null), [data, nonce]);
  const byId = useMemo(() => {
    const m = new Map<string, Node>();
    data?.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [data]);

  if (!data) {
    return <p className="trust-muted">Load a construct to spot-check edges.</p>;
  }
  if (!edge) {
    return <p className="trust-muted">No edges to spot-check in this cut.</p>;
  }

  const a = byId.get(edge.source);
  const b = byId.get(edge.target);
  const shared = Array.isArray(edge.shared) ? edge.shared : [];

  return (
    <div className="trust-spotcheck">
      <div className="trust-spotcheck-head">
        <h3>Spot-check a random edge</h3>
        <button type="button" className="ghost" onClick={() => setNonce((n) => n + 1)}>
          Draw another
        </button>
      </div>
      <p>
        <a href={imdbNameUrl(edge.source)} target="_blank" rel="noopener noreferrer">
          {a?.label ?? edge.source}
        </a>
        {" ↔ "}
        <a href={imdbNameUrl(edge.target)} target="_blank" rel="noopener noreferrer">
          {b?.label ?? edge.target}
        </a>
        <span className="mono"> · weight {edge.weight}</span>
        {edge.year != null ? <span className="mono"> · ~{edge.year}</span> : null}
      </p>
      {shared.length ? (
        <ul className="trust-shared-list">
          {shared.map((s, i) => {
            const tconst = (s as { tconst?: string }).tconst;
            const line = filmLine(s);
            return (
              <li key={`${tconst ?? line}-${i}`}>
                {tconst ? (
                  <a href={imdbTitleUrl(tconst)} target="_blank" rel="noopener noreferrer">
                    {line || tconst}
                  </a>
                ) : (
                  line || "Untitled shared credit"
                )}
                {constructId === "bechdel" &&
                (s as unknown as { bechdel_id?: string | number }).bechdel_id != null ? (
                  <>
                    {" · "}
                    <a
                      href={bechdelViewUrl(
                        (s as unknown as { bechdel_id: string | number }).bechdel_id,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Bechdel page
                    </a>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="trust-muted">No shared-title sample attached on this edge.</p>
      )}
      <p className="trust-muted">
        Voice / Wikidata check:{" "}
        <a href={wikidataImdbSearchUrl(edge.source)} target="_blank" rel="noopener noreferrer">
          search {a?.label ?? edge.source}
        </a>
      </p>
    </div>
  );
}
