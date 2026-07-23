/**
 * Browsable people / links tables for the selected construct.
 */

import { useMemo, useState } from "react";
import type { ConstructData, Edge, Node } from "../lib/types";
import { dataUrl } from "../lib/data";
import { imdbNameUrl, imdbTitleUrl } from "../lib/formatTime";
import { filmLine, uniqueShared } from "../lib/sharedTitles";

interface Props {
  data: ConstructData | null;
  onOpenAtelier: (id: string) => void;
}

type Tab = "people" | "links";
type PeopleSort = "degree" | "prominence" | "label";
type LinksSort = "weight" | "year";

const PAGE = 40;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function ConstructDataTable({ data, onOpenAtelier }: Props) {
  const [tab, setTab] = useState<Tab>("people");
  const [peopleSort, setPeopleSort] = useState<PeopleSort>("degree");
  const [linksSort, setLinksSort] = useState<LinksSort>("weight");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const byId = useMemo(() => {
    const m = new Map<string, Node>();
    for (const n of data?.nodes ?? []) m.set(n.id, n);
    return m;
  }, [data]);

  const people = useMemo(() => {
    if (!data) return [] as Node[];
    const q = query.trim().toLowerCase();
    let rows = [...data.nodes];
    if (q) {
      rows = rows.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.id.toLowerCase().includes(q) ||
          String(n.gender || "").toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      if (peopleSort === "label") return a.label.localeCompare(b.label);
      if (peopleSort === "prominence") return num(b.prominence) - num(a.prominence);
      return num(b.degree) - num(a.degree);
    });
    return rows;
  }, [data, query, peopleSort]);

  const links = useMemo(() => {
    if (!data) return [] as Edge[];
    const q = query.trim().toLowerCase();
    let rows = [...data.edges];
    if (q) {
      rows = rows.filter((e) => {
        const a = byId.get(e.source)?.label ?? e.source;
        const b = byId.get(e.target)?.label ?? e.target;
        const shared = uniqueShared(e.shared)
          .map((s) => filmLine(s))
          .join(" ");
        return (
          a.toLowerCase().includes(q) ||
          b.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          e.target.toLowerCase().includes(q) ||
          shared.toLowerCase().includes(q)
        );
      });
    }
    rows.sort((a, b) => {
      if (linksSort === "year") return num(b.year) - num(a.year);
      return num(b.weight) - num(a.weight);
    });
    return rows;
  }, [data, query, linksSort, byId]);

  if (!data) {
    return <p className="trust-muted">Load a construct to browse its people and links.</p>;
  }

  const shownPeople = people.slice(0, limit);
  const shownLinks = links.slice(0, limit);
  const total = tab === "people" ? people.length : links.length;
  const shown = tab === "people" ? shownPeople.length : shownLinks.length;
  const cid = data.manifest.id;

  return (
    <div className="trust-data-browser">
      <div className="trust-data-toolbar">
        <div className="trust-data-tabs" role="tablist" aria-label="Data table">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "people"}
            className={tab === "people" ? "active" : ""}
            onClick={() => {
              setTab("people");
              setLimit(PAGE);
            }}
          >
            People <span className="mono">{data.nodes.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "links"}
            className={tab === "links" ? "active" : ""}
            onClick={() => {
              setTab("links");
              setLimit(PAGE);
            }}
          >
            Links <span className="mono">{data.edges.length}</span>
          </button>
        </div>
        <label className="trust-data-search">
          <span className="trust-sr-only">Filter table</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder={tab === "people" ? "Filter people…" : "Filter links…"}
          />
        </label>
        {tab === "people" ? (
          <label className="trust-data-sort">
            Sort
            <select
              value={peopleSort}
              onChange={(e) => setPeopleSort(e.target.value as PeopleSort)}
            >
              <option value="degree">degree</option>
              <option value="prominence">prominence</option>
              <option value="label">name</option>
            </select>
          </label>
        ) : (
          <label className="trust-data-sort">
            Sort
            <select value={linksSort} onChange={(e) => setLinksSort(e.target.value as LinksSort)}>
              <option value="weight">weight</option>
              <option value="year">year</option>
            </select>
          </label>
        )}
      </div>

      {tab === "people" ? (
        <div className="trust-table-wrap trust-table-wrap--tall">
          <table className="trust-table">
            <caption>
              Showing {shown} of {total} people
              {query ? ` matching “${query.trim()}”` : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Gender</th>
                <th scope="col">Degree</th>
                <th scope="col">Prominence</th>
                <th scope="col">Peak</th>
                <th scope="col">Verify</th>
              </tr>
            </thead>
            <tbody>
              {shownPeople.map((n) => (
                <tr key={n.id}>
                  <td>
                    <button
                      type="button"
                      className="ghost inline"
                      onClick={() => onOpenAtelier(cid)}
                      title="Open construct in atelier"
                    >
                      {n.label}
                    </button>
                    <div className="trust-id mono">{n.id}</div>
                  </td>
                  <td>{String(n.gender ?? "unknown")}</td>
                  <td className="mono">{num(n.degree)}</td>
                  <td className="mono">{num(n.prominence).toFixed(1)}</td>
                  <td className="mono">{n.year_peak != null ? String(n.year_peak) : "—"}</td>
                  <td>
                    <a href={imdbNameUrl(n.id)} target="_blank" rel="noopener noreferrer">
                      IMDb
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="trust-table-wrap trust-table-wrap--tall">
          <table className="trust-table">
            <caption>
              Showing {shown} of {total} links
              {query ? ` matching “${query.trim()}”` : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col">Person A</th>
                <th scope="col">Person B</th>
                <th scope="col">Weight</th>
                <th scope="col">Year</th>
                <th scope="col">Shared titles</th>
              </tr>
            </thead>
            <tbody>
              {shownLinks.map((e, i) => {
                const a = byId.get(e.source);
                const b = byId.get(e.target);
                const shared = uniqueShared(e.shared).slice(0, 3);
                return (
                  <tr key={`${e.source}-${e.target}-${i}`}>
                    <td>
                      <a href={imdbNameUrl(e.source)} target="_blank" rel="noopener noreferrer">
                        {a?.label ?? e.source}
                      </a>
                    </td>
                    <td>
                      <a href={imdbNameUrl(e.target)} target="_blank" rel="noopener noreferrer">
                        {b?.label ?? e.target}
                      </a>
                    </td>
                    <td className="mono">{e.weight}</td>
                    <td className="mono">{e.year ?? "—"}</td>
                    <td>
                      {shared.length ? (
                        <ul className="trust-inline-list">
                          {shared.map((s) => {
                            const line = filmLine(s);
                            const tconst = s.tconst;
                            return (
                              <li key={`${tconst ?? line}`}>
                                {tconst ? (
                                  <a
                                    href={imdbTitleUrl(tconst)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {line || tconst}
                                  </a>
                                ) : (
                                  line
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <span className="trust-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {shown < total ? (
        <button type="button" className="ghost" onClick={() => setLimit((n) => n + PAGE)}>
          Show more ({total - shown} remaining)
        </button>
      ) : null}

      <p className="trust-muted">
        Raw JSON:{" "}
        <a href={dataUrl(`${cid}/nodes.json`)} target="_blank" rel="noopener noreferrer">
          nodes.json
        </a>
        {" · "}
        <a href={dataUrl(`${cid}/edges.json`)} target="_blank" rel="noopener noreferrer">
          edges.json
        </a>
      </p>
    </div>
  );
}
