/** Freshness / date formatting for methodology page. */

export function formatBuiltAt(iso: string | undefined | null): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatSnapshotAge(iso: string | undefined | null): string {
  if (!iso) return "unknown age";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown age";
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 1) {
    const hours = Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
    return hours <= 1 ? "built less than an hour ago" : `built ${hours} hours ago`;
  }
  if (days === 1) return "built 1 day ago";
  if (days < 30) return `built ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "built about 1 month ago";
  if (months < 12) return `built about ${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "built about 1 year ago" : `built about ${years} years ago`;
}

export function oldestIso(files: Record<string, string> | undefined): string | null {
  if (!files) return null;
  const times = Object.values(files)
    .map((v) => new Date(v).getTime())
    .filter((t) => Number.isFinite(t));
  if (!times.length) return null;
  return new Date(Math.min(...times)).toISOString();
}

export function imdbNameUrl(nconst: string): string {
  return `https://www.imdb.com/name/${nconst}/`;
}

export function imdbTitleUrl(tconst: string): string {
  return `https://www.imdb.com/title/${tconst}/`;
}

export function bechdelViewUrl(id: string | number): string {
  return `https://bechdeltest.com/view/${id}`;
}

export function wikidataImdbSearchUrl(nconst: string): string {
  return `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(nconst)}&title=Special:Search`;
}
