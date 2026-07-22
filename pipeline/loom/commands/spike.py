"""M0 spike: voice-actors-in-cartoons → static HTML sketch (fail fast)."""

from __future__ import annotations

import json
from pathlib import Path

from rich.console import Console

from loom import OUT, ROOT
from loom.constructs.cartoons import build as build_cartoons
from loom.db import connect, ensure_dirs, register_base_tables

console = Console()


SPIKE_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>IMDb Loom — M0 Spike: Voice Actors in Cartoons</title>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font-family: "IBM Plex Sans", system-ui, sans-serif;
         background: #0e0e12; color: #e8e4dc; }
  header { padding: 24px 32px 8px; }
  h1 { font-weight: 500; letter-spacing: 0.02em; margin: 0 0 4px; font-size: 22px; }
  .sub { color: #9a958c; font-size: 13px; }
  .stats { display: flex; gap: 24px; padding: 8px 32px 16px; font-variant-numeric: tabular-nums;
           font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; color: #c4bfb4; }
  .stats b { color: #f0ebe0; font-weight: 500; }
  #chart { width: 100%; height: 70vh; }
  .label { font-size: 10px; fill: #c4bfb4; }
  .chord path { fill-opacity: 0.75; }
  footer { padding: 16px 32px; font-size: 11px; color: #6e6a62; max-width: 720px; line-height: 1.5; }
</style>
</head>
<body>
<header>
  <h1>Voice Actors in Cartoons</h1>
  <div class="sub">M0 spike — chord of shared Animation titles · fail-fast story check</div>
</header>
<div class="stats" id="stats"></div>
<svg id="chart"></svg>
<footer id="method"></footer>
<script>
const DATA = __DATA__;
const nodes = DATA.nodes;
const edges = DATA.edges;
const n = nodes.length;
const index = new Map(nodes.map((d, i) => [d.id, i]));
const matrix = Array.from({length: n}, () => Array(n).fill(0));
for (const e of edges) {
  const i = index.get(e.source), j = index.get(e.target);
  if (i == null || j == null) continue;
  matrix[i][j] += e.weight;
  matrix[j][i] += e.weight;
}
document.getElementById("stats").innerHTML =
  `<span><b>${nodes.length}</b> people</span>
   <span><b>${edges.length}</b> co-appearances</span>
   <span>top: <b>${nodes.slice(0,5).map(d => d.label).join(", ")}</b></span>`;
document.getElementById("method").textContent = DATA.manifest.method_note;

const svg = d3.select("#chart");
const width = svg.node().clientWidth;
const height = svg.node().clientHeight;
svg.attr("viewBox", [0, 0, width, height]);
const outer = Math.min(width, height) * 0.42;
const inner = outer - 18;
const g = svg.append("g").attr("transform", `translate(${width/2},${height/2})`);

const chord = d3.chord().padAngle(0.03).sortSubgroups(d3.descending)(matrix);
const color = d3.scaleSequential(d3.interpolateYlOrBr).domain([0, d3.max(nodes, d => d.degree) || 1]);
const arc = d3.arc().innerRadius(inner).outerRadius(outer);
const ribbon = d3.ribbon().radius(inner - 2);

g.append("g").attr("class", "chord")
  .selectAll("path").data(chord).join("path")
  .attr("d", ribbon)
  .attr("fill", d => color(nodes[d.source.index].degree))
  .attr("stroke", "none")
  .append("title")
  .text(d => `${nodes[d.source.index].label} ↔ ${nodes[d.target.index].label}: ${d.source.value}`);

const group = g.append("g").selectAll("g").data(chord.groups).join("g");
group.append("path")
  .attr("d", arc)
  .attr("fill", d => color(nodes[d.index].degree))
  .attr("stroke", "#0e0e12");
group.append("text")
  .attr("class", "label")
  .each(d => { d.angle = (d.startAngle + d.endAngle) / 2; })
  .attr("transform", d => `
    rotate(${(d.angle * 180 / Math.PI - 90)})
    translate(${outer + 6})
    ${d.angle > Math.PI ? "rotate(180)" : ""}`)
  .attr("text-anchor", d => d.angle > Math.PI ? "end" : "start")
  .text((d, i) => nodes[i].degree >= (d3.max(nodes, x => x.degree) || 0) * 0.35
    ? nodes[i].label : "");
</script>
</body>
</html>
"""


def run_spike() -> None:
    ensure_dirs()
    con = connect()
    register_base_tables(con)
    try:
        con.execute("SELECT 1 FROM title_principals LIMIT 1")
    except Exception:
        console.print("[red]Run `loom download` + `loom parquet` first[/red]")
        raise SystemExit(1)

    console.print("[bold]M0 spike[/bold] — building voice_cartoons (top_n=120)…")
    payload = build_cartoons(con, top_n=120)

    out_dir = OUT / "voice_cartoons"
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in ("nodes", "edges", "stages", "manifest"):
        with open(out_dir / f"{name}.json", "w", encoding="utf-8") as f:
            json.dump(payload[name], f, indent=2)

    spike_dir = ROOT / "data" / "out" / "_spike"
    spike_dir.mkdir(parents=True, exist_ok=True)
    html_path = spike_dir / "cartoons.html"
    html = SPIKE_HTML.replace("__DATA__", json.dumps(payload))
    html_path.write_text(html, encoding="utf-8")

    console.print(f"[green]✓[/green] {len(payload['nodes'])} nodes, {len(payload['edges'])} edges")
    if payload["nodes"]:
        top = ", ".join(n["label"] for n in sorted(payload["nodes"], key=lambda x: -x["degree"])[:8])
        console.print(f"  hubs: {top}")
    console.print(f"  open [bold]{html_path}[/bold] in a browser to judge the story")
