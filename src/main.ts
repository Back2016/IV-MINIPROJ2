import * as d3 from "d3";
import dataset from "./data.json";
import stateBoundaries from "./state-boundaries.json";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { version } from "../package.json";
import {
  bands,
  defaults,
  domain,
  filterRecords,
  phases,
  selectRecords,
  summary,
  type Filters,
  type Metric,
  type RecordRow,
  type Selection,
} from "./model";
import "./style.css";

const records: RecordRow[] = dataset.records;
// Keep comparison rows stable across filters, omitting groups absent from the dataset.
const comparisonRows = bands.flatMap((_, band) =>
  phases.flatMap((phase, phaseIndex) =>
    records.some((record) => record.band === band && record.phase === phase)
      ? [{ band, phase, phaseIndex }]
      : [],
  ),
).sort((a, b) => b.band - a.band);
// Fixed display limits for state means, independent of individual-observation axes.
// Values outside these limits retain their numeric value and receive an asterisk.
const mapColorLimits: Record<Metric, number> = { precip: 20, temp: 2 };
const colors: Record<string, string> = {
  "La Niña": "#0072B2",
  Neutral: "#333b46",
  "El Niño": "#b84b00",
};
const shapes: Record<string, d3.SymbolType> = {
  Northeast: d3.symbolCircle,
  Midwest: d3.symbolSquare,
  South: d3.symbolTriangle,
  West: d3.symbolDiamond,
};
let filters: Filters = { ...defaults };
let metric: Metric = "precip";
let mapStyle: "tiles" | "geographic" = "tiles";
const boundaries = stateBoundaries as FeatureCollection<Polygon | MultiPolygon>;
const boundariesByCode = new Map(boundaries.features.map((feature) => [feature.id, feature]));
let selection: Selection = null;
// Record browsing is a draft: search/checking never changes charts until Apply.
let recordPage = 0;
const pageSize = 25;
let checkedRecords = new Set<string>();
const stateNames = new Map(dataset.states.map((s) => [s.code, s.name]));
let available: RecordRow[] = [],
  focused: RecordRow[] = [];
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const fmt = (value: number | null, digits = 1) =>
  value === null
    ? "—"
    : d3.format(`+.${digits}f`)(
        Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value,
      );
const unit = () => (metric === "precip" ? "%" : "°C");
const metricName = () =>
  metric === "precip" ? "Precipitation" : "Temperature";
const options = (items: string[]) =>
  items.map((s) => `<option>${s}</option>`).join("");

const popout = (id: string, title: string, content: string) => `
 <dialog id="${id}" class="popout" aria-labelledby="${id}-title">
  <div class="popout-header"><h2 id="${id}-title">${title}</h2><form method="dialog"><button class="secondary" autofocus>Close</button></form></div>
  <div class="popout-body">${content}</div>
 </dialog>`;
const popoutButton = (id: string, text: string) =>
  `<button class="secondary" data-popout="${id}" aria-haspopup="dialog" aria-controls="${id}">${text}</button>`;

$("app").innerHTML = `
<header><h1>El Niño & U.S. winter weather</h1><span class="badge">v${version}</span></header>
<main data-ready="true">
 <section class="controls" aria-label="Dashboard filters">
  <label>Weather metric<select id="metric"><option value="precip">Precipitation anomaly (%)</option><option value="temp">Temperature anomaly (°C)</option></select></label>
  <label>First winter<input id="start" type="number" min="1982" max="2025" value="1982"></label>
  <label>Last winter<input id="end" type="number" min="1982" max="2025" value="2025"></label>
  <label>Region<select id="region">${options(["All", ...Object.keys(shapes)])}</select></label>
  <label>Phase<select id="phase">${options(["All", ...phases])}</select></label>
  <label>State<select id="state"><option value="All">All states</option>${dataset.states.map((s) => `<option value="${s.code}">${s.name}</option>`).join("")}</select></label>
  <button id="reset" class="secondary">Reset all</button>
 </section>
 <div id="error" role="alert"></div>
 <section class="summary-bar" aria-label="Current selection">
  <div class="summary-text"><strong id="cohort"></strong><span id="active-metric"></span></div>
  <div class="selection-context"><span id="state-context"></span><span id="selection-label" aria-live="polite"></span></div>
  <button id="clear" class="secondary">Clear selection</button><button id="all-states" class="secondary">Show all states</button>
  ${popoutButton("methods-dialog", "Data & methods")}
 </section>
 <p id="empty" class="empty" hidden>No matching records. Change the filters or clear the selection.</p>
 <section class="dashboard" aria-label="Linked weather charts and records">
  <article class="panel map-panel">
   <div class="panel-heading"><span class="view-letter">A</span><div><h2 id="map-title">State overview</h2><p>Click a state to filter all charts.</p></div><label class="map-style"><span>Map style</span><select id="map-style"><option value="tiles">Tile map</option><option value="geographic">Geographic map</option></select></label>${popoutButton("map-dialog", "Map details")}</div>
   <div id="map"></div><div id="color-key"></div>
  </article>
  <article class="panel scatter-panel">
   <div class="panel-heading"><span class="view-letter">B</span><div><h2 id="scatter-title">ENSO and precipitation</h2><p>Drag to select observations.</p></div><div class="panel-actions">${popoutButton("scatter-dialog", "Plot guide")}${popoutButton("brush-details", "Set exact bounds")}</div></div>
   <div id="scatter"></div>
  </article>
  <article class="panel comparison-panel">
   <div class="panel-heading"><span class="view-letter">C</span><div><h2 id="comparison-title">Anomaly by ENSO magnitude</h2><p>Click a row to select a group.</p></div>${popoutButton("comparison-dialog", "Chart details")}</div>
   <p id="comparison-mean" class="cohort-mean" aria-live="polite"></p><div id="comparison"></div>
  </article>
  <article class="panel records-panel" aria-labelledby="records-title">
   <div class="panel-heading"><span class="view-letter">D</span><h2 id="records-title">Find observations</h2></div>
 <div class="record-controls"><label class="record-search-label">Find records<input id="record-search" type="search" placeholder="State, winter, region or phase…"></label><label>Browse<select id="record-scope"><option value="available">Available</option><option value="selected">Chart selection</option></select></label><label>Sort by<select id="record-sort"><option value="newest">Newest winter</option><option value="oldest">Oldest winter</option><option value="state">State (A–Z)</option><option value="high">Highest active anomaly</option><option value="low">Lowest active anomaly</option><option value="extreme">Largest anomaly</option></select></label></div>
 <div class="record-actions"><button id="check-matches" class="secondary">Check all matches</button><button id="uncheck-records" class="secondary">Uncheck all</button><button id="apply-records">Apply to charts</button><span id="record-draft" role="status"></span></div>
 <div id="record-scroll" class="table-scroll" tabindex="0" aria-label="Observation results"><table><thead><tr><th>Check</th><th>State / winter</th><th>Region</th><th>ONI °C</th><th>Phase</th><th>Precip. %</th><th>Temp. °C</th><th>In charts</th></tr></thead><tbody id="record-table"></tbody></table></div>
 <div class="record-pagination"><p id="record-results" role="status"></p><button id="record-prev" class="secondary">Previous</button><button id="record-next" class="secondary">Next</button></div>
  </article>
 </section>
</main>
${popout("map-dialog", "Read the state map", `
 <strong id="map-mean" aria-live="polite"></strong>
 <p id="mean-scope"></p><p id="map-explanation"></p><p id="map-coverage"></p><p id="map-phases"></p><p id="map-baseline"></p>
 <p>Winter = December–February, labeled by the ending year. Winter 1998 means December 1997–February 1998.</p>
 <p>Dashed outlines have no selected records. Both map styles use the same color scale. Tile values marked * exceed the color scale. Hover over or focus a state for its exact value. Geographic boundaries come from the U.S. Census Bureau via U.S. Atlas.</p>`)}
${popout("scatter-dialog", "Read the scatterplot", `
 <p>Each point is one state in one winter. DJF ONI is the December–February Oceanic Niño Index, a measure of tropical Pacific sea surface temperature anomaly.</p>
 <p>Drag a rectangle or use <strong>Set exact bounds</strong> to select points. Hover to see an observation's details.</p>
 <div class="legend-block"><h3>ENSO phase · color and fill</h3><div id="phase-legend" class="legend"></div><h3>Region · shape</h3><div id="region-legend" class="legend"></div></div>`)}
${popout("comparison-dialog", "Read the ENSO comparison", `
 <p id="comparison-scope"></p>
 <p>Each row groups records by ENSO phase and absolute ONI (strength). The dot is the mean; the line spans the middle 50% of records. The numbers at right are records / distinct winters.</p>
 <p>Light gray marks show the group before the current chart selection, with filters still applied. They overlap the colored marks when the groups are identical.</p>`)}
${popout("brush-details", "Set exact bounds", `
 <p id="brush-scope"></p>
 <form id="brush-form"><div class="bounds"><label>ONI min (°C)<input id="x0" type="number" step="any" value="1"></label><label>ONI max (°C)<input id="x1" type="number" step="any" value="2.5"></label><label id="y0-label">Anomaly minimum<input id="y0" type="number" step="any" value="0"></label><label id="y1-label">Anomaly maximum<input id="y1" type="number" step="any" value="70"></label></div><p id="bounds-error" role="alert"></p><button type="submit">Select range</button></form>`)}
${popout("methods-dialog", "Data, methods & interpretation", `<p>Historical NOAA ONI joined to statewide nClimDiv records: 48 contiguous states, winters ending 1982–2025. ONI episode labels use at least five consecutive overlapping seasons at ±0.5 °C after rounding to one decimal; this app uses historical ONI, not RONI.</p><p>Precipitation: sum of December, January and February, expressed as a percentage departure from the state's 1991–2020 winter mean. Temperature: day-weighted monthly average, expressed in °C relative to the same winter baseline. Missing values are excluded only for the active metric. Filters do not change the baseline or axis domains.</p><p>Each state–winter has equal weight. Multiple states share an ENSO winter, so record counts are not independent event counts. The charts describe associations, not causation or forecasts. Other climate influences, warming trends and within-state variation remain relevant.</p><p>Snapshot: ${dataset.metadata.release}; retrieved ${dataset.metadata.retrieved}. Missing precipitation records: ${dataset.metadata.missing.precip}; temperature: ${dataset.metadata.missing.temp}. Full URLs, hashes and processing code are included with the source.</p><p class="source-url">NOAA CPC: https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/oni/v5/<br>NOAA NCEI: https://www.ncei.noaa.gov/monitoring-content/data/us/climdiv/monthly/current/</p><p>Built with D3.js and Electron. AI assisted the code, design and documentation; see ACKNOWLEDGMENTS.md in the source package.</p>`)}
<div id="tooltip" role="tooltip" hidden></div>`;

document.querySelectorAll<HTMLButtonElement>("[data-popout]").forEach((button) => {
  button.addEventListener("click", () => {
    hideTip();
    $("bounds-error").textContent = "";
    $<HTMLDialogElement>(button.dataset.popout!).showModal();
  });
});

function showTip(event: MouseEvent | FocusEvent, text: string) {
  const tip = $("tooltip");
  tip.textContent = text;
  tip.hidden = false;
  const rect = (event.currentTarget as Element)?.getBoundingClientRect();
  const x = "clientX" in event ? event.clientX : (rect?.left ?? 20);
  const y = "clientY" in event ? event.clientY : (rect?.bottom ?? 20);
  tip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - 310))}px`;
  tip.style.top = `${Math.max(8, Math.min(y + 14, window.innerHeight - tip.offsetHeight - 10))}px`;
}
function hideTip() {
  $("tooltip").hidden = true;
}
function choose(next: Selection) {
  // A map choice is persistent state context, shared with the State filter.
  // Range/group selections refine it instead of silently returning to all states.
  if (next?.kind === "state") {
    filters.state = next.state;
    $<HTMLSelectElement>("state").value = next.state;
    selection = null;
  } else selection = next;
  if (next?.kind === "brush") {
    for (const id of ["x0", "x1", "y0", "y1"] as const)
      $<HTMLInputElement>(id).value = String(next[id]);
  }
  checkedRecords = new Set(next?.kind === "records" ? next.ids : []);
  recordPage = 0;
  hideTip();
  render();
}
function keyboardClick(event: KeyboardEvent, callback: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    callback();
  }
}
function svgRoot(id: string) {
  const container = $(id);
  container.replaceChildren();
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  return {
    width,
    height,
    svg: d3
      .select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr(
        "aria-label",
        id === "map"
          ? mapStyle === "tiles" ? "State mean anomaly tile map" : "Geographic state mean anomaly map"
          : id === "scatter"
            ? "ONI versus weather anomaly; use Set exact bounds for numeric selection"
            : "Phase and ONI magnitude summaries",
      ),
  };
}
function titleFor(rows: RecordRow[], name: string) {
  const s = summary(rows, metric);
  return `${name}: ${s.n ? `mean ${fmt(s.mean)} ${unit()}, middle 50% ${fmt(s.q1)} to ${fmt(s.q3)} ${unit()}, ${s.n} records, ${s.winters} winters` : "no selected records"}`;
}

function describeMap() {
  const winters = [...new Set(focused.map((r) => r.winter))].sort(
    (a, b) => a - b,
  );
  const counts = dataset.states
    .map((s) => focused.filter((r) => r.state === s.code).length)
    .filter(Boolean);
  $("map-explanation").textContent =
    `Each state’s color shows its average winter ${metricName().toLowerCase()} anomaly across the selected records (${unit()}). Each winter has equal weight within a state.`;
  $("map-coverage").textContent = winters.length
    ? `${winters.length} distinct winter${winters.length === 1 ? "" : "s"} · ${winters[0]}${winters.length > 1 ? `–${winters.at(-1)}` : ""} · ${counts.length} state${counts.length === 1 ? "" : "s"} · ${Math.min(...counts)}${Math.min(...counts) !== Math.max(...counts) ? `–${Math.max(...counts)}` : ""} winter(s) per shown state. ${winters.length !== winters.at(-1)! - winters[0] + 1 ? "Some years in this span are not selected." : ""}`
    : "No selected records. States have no average to display.";
  $("map-phases").textContent =
    "Included phases: " +
    (phases.filter((p) => focused.some((r) => r.phase === p)).join(", ") ||
      "none") +
    ".";
  $("map-baseline").textContent =
    metric === "precip"
      ? "Baseline: each state's 1991–2020 winter average. −4% means 4% drier; +4% means 4% wetter."
      : "Baseline: each state's 1991–2020 winter average. −1°C means 1°C cooler; +1°C means 1°C warmer.";
  const s = summary(focused, metric);
  $("map-mean").textContent = `Mean ${metricName().toLowerCase()} anomaly: ${fmt(s.mean)} ${unit()}`;
  $("mean-scope").textContent = `Current cohort across ${counts.length} state${counts.length === 1 ? "" : "s"} · ${s.n.toLocaleString()} records · ${s.winters} distinct winters. Each state–winter record has equal weight. The map shows each state's own mean.`;
}

function matchingRecords() {
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const words = normalize($<HTMLInputElement>("record-search").value)
    .split(/\s+/)
    .filter(Boolean);
  const namesState = dataset.states.some((s) =>
    ` ${words.join(" ")} `.includes(` ${normalize(s.name)} `),
  );
  const pool =
    $<HTMLSelectElement>("record-scope").value === "selected"
      ? focused
      : available;
  const rows = pool.filter((r) => {
    const text = normalize(
      `${r.state} ${stateNames.get(r.state)} ${r.winter} ${r.region} ${r.phase}`,
    );
    // Treat region names as facets: "West" must not also match "Midwest".
    return words.every((word) =>
      !namesState &&
      Object.keys(shapes).some((region) => normalize(region) === word)
        ? normalize(r.region) === word
        : text.split(/\s+/).some((token) => token.startsWith(word)),
    );
  });
  const order = $<HTMLSelectElement>("record-sort").value;
  return rows.sort((a, b) => {
    const delta =
      order === "newest"
        ? b.winter - a.winter
        : order === "oldest"
          ? a.winter - b.winter
          : order === "high"
            ? b[metric]! - a[metric]!
            : order === "low"
              ? a[metric]! - b[metric]!
              : order === "extreme"
                ? Math.abs(b[metric]!) - Math.abs(a[metric]!)
                : a.state.localeCompare(b.state);
    return delta || a.state.localeCompare(b.state) || b.winter - a.winter;
  });
}

function updateDraftCount() {
  $("record-draft").textContent =
    `${checkedRecords.size.toLocaleString()} checked`;
  $<HTMLButtonElement>("apply-records").disabled = checkedRecords.size === 0;
  $<HTMLButtonElement>("uncheck-records").disabled = checkedRecords.size === 0;
}

function drawRecords() {
  const matches = matchingRecords();
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  recordPage = Math.min(recordPage, pages - 1);
  const start = recordPage * pageSize;
  const activeIds = new Set(focused.map((r) => r.id));
  $("record-results").textContent =
    `${matches.length.toLocaleString()} matches · ${matches.length ? start + 1 : 0}–${Math.min(start + pageSize, matches.length)} shown · page ${recordPage + 1} of ${pages}`;
  $<HTMLButtonElement>("record-prev").disabled = recordPage === 0;
  $<HTMLButtonElement>("record-next").disabled = recordPage >= pages - 1;
  $<HTMLButtonElement>("check-matches").disabled = matches.length === 0;
  $("record-table").innerHTML =
    matches
      .slice(start, start + pageSize)
      .map(
        (r) =>
          `<tr class="${selection && activeIds.has(r.id) ? "active-record" : ""}"><td><input type="checkbox" data-id="${r.id}" aria-label="Check ${stateNames.get(r.state)} winter ${r.winter}" ${checkedRecords.has(r.id) ? "checked" : ""}></td><td><button class="record-button" data-id="${r.id}" aria-label="Select only ${stateNames.get(r.state)} winter ${r.winter}">${r.state} ${r.winter}</button></td><td>${r.region}</td><td>${fmt(r.oni)}</td><td>${r.phase}</td><td>${fmt(r.precip)}</td><td>${fmt(r.temp)}</td><td>${activeIds.has(r.id) ? "Yes" : "—"}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="8">No matches. Try another search or browse all available records.</td></tr>';
  $("record-table")
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) checkedRecords.add(input.dataset.id!);
        else checkedRecords.delete(input.dataset.id!);
        updateDraftCount();
      });
    });
  $("record-table")
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button) =>
      button.addEventListener("click", () =>
        choose({ kind: "record", id: button.dataset.id! }),
      ),
    );
  updateDraftCount();
}

// Keep all available tiles selectable even when another state is selected.
function drawMap() {
  const { svg, width, height } = svgRoot("map");
  const tileRows = d3.max(dataset.states, (s) => s.tile[1])! + 1;
  const size = Math.min((width - 8) / 12, (height - 8) / tileRows, 56);
  const originX = (width - size * 12) / 2;
  const originY = (height - size * tileRows) / 2;
  const path = mapStyle === "geographic"
    ? d3.geoPath(d3.geoAlbers().fitExtent([[6, 5], [width - 6, height - 5]], boundaries))
    : null;
  svg.attr("data-map-style", mapStyle);
  const lim = mapColorLimits[metric];
  svg.attr("data-color-limit", lim);
  const color = d3
    .scaleLinear<string>()
    .domain([-lim, 0, lim])
    .range(["#99510d", "#f7f7f7", "#2166ac"])
    .interpolate(d3.interpolateLab)
    .clamp(true);
  const switchable = filterRecords(records, { ...filters, state: "All" }, metric);
  for (const state of dataset.states) {
    const group = focused.filter((r) => r.state === state.code),
      s = summary(group, metric);
    const enabled = switchable.some((r) => r.state === state.code);
    const clipped = s.mean !== null && Math.abs(s.mean) > lim;
    const label =
      titleFor(group, state.name) +
      (clipped
        ? `; color capped at ${s.mean! < 0 ? -lim : lim} ${unit()}; numeric value is not capped`
        : "");
    const x = originX + state.tile[0] * size,
      y = originY + state.tile[1] * size;
    const tile = svg
      .append("g")
      .attr("transform", path ? null : `translate(${x},${y})`)
      .attr("role", "button")
      .attr("tabindex", enabled ? 0 : -1)
      .attr("id", `tile-${state.code}`)
      .attr("data-count", s.n)
      .attr("data-color-capped", String(clipped))
      .attr("aria-label", label)
      .attr("aria-disabled", String(!enabled))
      .attr(
        "aria-pressed",
        String(filters.state === state.code),
      )
      .attr("class", `tile ${enabled ? "" : "disabled"}`)
      .on("click", () => {
        if (enabled) choose({ kind: "state", state: state.code });
      })
      .on("keydown", (event: KeyboardEvent) =>
        keyboardClick(event, () => {
          if (enabled) choose({ kind: "state", state: state.code });
        }),
      )
      .on("mouseover", (event: MouseEvent) => showTip(event, label))
      .on("mouseout", hideTip)
      .on("focus", (event: FocusEvent) => showTip(event, label))
      .on("blur", hideTip);
    const face = s.mean === null ? "#f4f6f8" : color(s.mean);
    const rgb = d3.rgb(face);
    const linear = [rgb.r, rgb.g, rgb.b].map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    const luminance =
      linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    const textColor =
      (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
        ? "#000000"
        : "#ffffff";
    const feature = boundariesByCode.get(state.code)!;
    const shape = tile.append<SVGElement>(path ? "path" : "rect");
    if (path) shape.attr("d", path(feature) ?? "");
    else shape.attr("width", size - 2).attr("height", size - 2).attr("rx", 3);
    shape
      .attr("class", "state-shape")
      .attr("fill", face)
      .attr("stroke", filters.state === state.code ? "#172a3a" : "#929ba5")
      .attr("stroke-width", filters.state === state.code ? 2.4 : 1)
      .attr("stroke-dasharray", s.mean === null ? "3 2" : null);
    if (path) {
      if (path.area(feature) > 290) {
        const [cx, cy] = path.centroid(feature);
        tile.append("text")
          .attr("class", "map-state-label")
          .attr("x", cx).attr("y", cy)
          .attr("text-anchor", "middle").attr("dominant-baseline", "central")
          .attr("font-size", 11).attr("font-weight", 700)
          .attr("fill", textColor).text(state.code);
      }
      continue;
    }
    tile
      .append("text")
      .attr("x", (size - 3) / 2)
      .attr("y", size * 0.34)
      .attr("text-anchor", "middle")
      .attr("font-weight", 700)
      .attr("font-size", Math.min(14, size * 0.32))
      .attr("fill", textColor)
      .text(state.code);
    tile
      .append("text")
      .attr("x", (size - 3) / 2)
      .attr("y", size * 0.72)
      .attr("text-anchor", "middle")
      .attr("font-size", Math.min(12, size * 0.28))
      .attr("fill", textColor)
      .text(fmt(s.mean, metric === "precip" ? 0 : 1) + (clipped ? "*" : ""));
  }
  $("color-key").innerHTML =
    `<div class="color-gradient"></div><div class="color-labels"><span>≤ ${-lim}${unit()} · ${metric === "precip" ? "Drier" : "Cooler"}</span><span>0</span><span>≥ +${lim}${unit()} · ${metric === "precip" ? "Wetter" : "Warmer"}</span></div>`;
  ($("color-key").firstElementChild as HTMLElement).style.background =
    `linear-gradient(90deg,${d3
      .range(21)
      .map((i) => `${color(-lim + (2 * lim * i) / 20)} ${i * 5}%`)
      .join(",")})`;
}

// The brush selects records; it never changes the underlying axis domains.
function drawScatter() {
  const { svg, width, height } = svgRoot("scatter");
  const compact = height < 240;
  const m = { left: compact ? 43 : 64, right: 14, top: compact ? 28 : 10, bottom: 42 };
  const x = d3
    .scaleLinear()
    .domain([-3, 3])
    .range([m.left, width - m.right]);
  const y = d3
    .scaleLinear()
    .domain(domain(records, metric))
    .range([height - m.bottom, m.top]);
  svg
    .append("g")
    .attr("class", "grid")
    .attr("aria-hidden", "true")
    .attr("transform", `translate(${m.left},0)`)
    .call(
      d3
        .axisLeft(y)
        .ticks(5)
        .tickSize(-(width - m.left - m.right))
        .tickFormat(() => ""),
    );
  svg
    .append("g")
    .attr("class", "chart-axis")
    .attr("transform", `translate(0,${height - m.bottom})`)
    .call(d3.axisBottom(x).ticks(7));
  svg
    .append("g")
    .attr("class", "chart-axis")
    .attr("transform", `translate(${m.left},0)`)
    .call(d3.axisLeft(y).ticks(5));
  svg
    .append("line")
    .attr("x1", m.left)
    .attr("x2", width - m.right)
    .attr("y1", y(0))
    .attr("y2", y(0))
    .attr("stroke", "#7d8994");
  svg
    .append("text")
    .attr("class", "axis-title")
    .attr("x", (m.left + width - m.right) / 2)
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .text("DJF ONI (°C)");
  const yTitle = svg.append("text")
    .attr("class", "axis-title")
    .text(`${metricName()} anomaly (${unit()})`);
  if (compact) yTitle.attr("x", m.left).attr("y", 16);
  else yTitle
    .attr("transform", `translate(15,${(m.top + height - m.bottom) / 2}) rotate(-90)`)
    .attr("text-anchor", "middle");
  const selectedIds = new Set(focused.map((r) => r.id));
  const ordered = [...available].sort(
    (a, b) => Number(selectedIds.has(a.id)) - Number(selectedIds.has(b.id)),
  );
  svg
    .append("g")
    .selectAll("path")
    .data(ordered)
    .join("path")
    .attr("data-record", (d) => d.id)
    .attr("data-selected", (d) => String(selectedIds.has(d.id)))
    .attr("transform", (d) => `translate(${x(d.oni)},${y(d[metric]!)})`)
    .attr("d", (d) => d3.symbol().type(shapes[d.region]).size(23)()!)
    .attr("fill", (d) =>
      !selectedIds.has(d.id)
        ? "#c9d0d6"
        : d.phase === "La Niña"
          ? "white"
          : colors[d.phase],
    )
    .attr("stroke", (d) =>
      selectedIds.has(d.id) ? colors[d.phase] : "#b8c1ca",
    )
    .attr("stroke-width", 0.8)
    .attr("opacity", (d) => (selectedIds.has(d.id) ? 0.8 : 0.35));
  const brush = d3
    .brush<unknown>()
    .extent([
      [m.left, m.top],
      [width - m.right, height - m.bottom],
    ])
    .on("end", (event) => {
      if (!event.sourceEvent) return;
      if (!event.selection) {
        choose(null);
        return;
      }
      const [[x0, y0], [x1, y1]] = event.selection as [
        [number, number],
        [number, number],
      ];
      choose({
        kind: "brush",
        x0: x.invert(x0),
        x1: x.invert(x1),
        y0: y.invert(y1),
        y1: y.invert(y0),
      });
    });
  const brushG = svg.append("g").attr("class", "brush").call(brush);
  if (selection?.kind === "brush") {
    const x0 = Math.max(-3, selection.x0),
      x1 = Math.min(3, selection.x1);
    const [low, high] = domain(records, metric),
      y0 = Math.max(low, selection.y0),
      y1 = Math.min(high, selection.y1);
    if (x0 <= x1 && y0 <= y1)
      brushG.call(brush.move, [
        [x(x0), y(y1)],
        [x(x1), y(y0)],
      ]);
  }
  brushG
    .on("mousemove", function (event: MouseEvent) {
      if (event.buttons) {
        hideTip();
        return;
      }
      const [px, py] = d3.pointer(event, svg.node());
      const nearest = d3.least(
        focused,
        (r) => (x(r.oni) - px) ** 2 + (y(r[metric]!) - py) ** 2,
      );
      if (
        nearest &&
        Math.hypot(x(nearest.oni) - px, y(nearest[metric]!) - py) < 13
      ) {
        showTip(
          event,
          `${nearest.state} · winter ${nearest.winter}\n${nearest.region} · ${nearest.phase}\nONI ${fmt(nearest.oni)} °C\nPrecipitation ${fmt(nearest.precip)}% · temperature ${fmt(nearest.temp)} °C\nOverlapping points may share this position; use the observation table for exact records.`,
        );
      } else hideTip();
    })
    .on("mouseleave", hideTip);
}

// Context and selected IQRs use the same fixed phase/band rows.
function drawComparison() {
  const { svg, width, height } = svgRoot("comparison");
  const axisY = height - 39;
  const groupGap = 3;
  const step = (axisY - 22 - groupGap * (bands.length - 1)) / comparisonRows.length;
  const rowFont = Math.max(8, Math.min(13, step - 1));
  const x = d3
    .scaleLinear()
    .domain(domain(records, metric))
    .range([158, width - 74]);
  svg
    .append("g")
    .attr("class", "chart-axis")
    .attr("transform", `translate(0,${axisY})`)
    .call(d3.axisBottom(x).ticks(width < 400 ? 2 : 5));
  svg
    .append("text")
    .attr("class", "axis-title")
    .attr("x", (158 + width - 74) / 2)
    .attr("y", height - 4)
    .attr("text-anchor", "middle")
    .text(`${metricName()} anomaly (${unit()})`);
  svg
    .append("text")
    .attr("x", 7)
    .attr("y", 13)
    .attr("class", "small-label")
    .text("|ONI| °C / phase");
  svg
    .append("text")
    .attr("x", width - 5)
    .attr("y", 13)
    .attr("text-anchor", "end")
    .attr("class", "small-label")
    .text("n / winters");
  svg
    .append("line")
    .attr("x1", x(0))
    .attr("x2", x(0))
    .attr("y1", 20)
    .attr("y2", axisY)
    .attr("stroke", "#b3bbc3");
  comparisonRows.forEach(({ band, phase, phaseIndex }, index) => {
      const y = 20 + (index + 0.5) * step + (bands.length - 1 - band) * groupGap;
      const base = available.filter(
          (r) => r.band === band && r.phase === phase,
        ),
        group = focused.filter((r) => r.band === band && r.phase === phase);
      const context = summary(base, metric),
        s = summary(group, metric);
      const label = `${phase}, |ONI| ${bands[band]} °C`;
      const row = svg
        .append("g")
        .attr("id", `group-${band}-${phaseIndex}`)
        .attr("data-count", s.n)
        .attr("class", "group-row")
        .attr("role", "button")
        .attr("tabindex", base.length ? 0 : -1)
        .attr("aria-disabled", String(!base.length))
        .attr("aria-label", titleFor(group, label))
        .attr(
          "aria-pressed",
          String(
            selection?.kind === "group" &&
              selection.phase === phase &&
              selection.band === band,
          ),
        )
        .on("click", () => {
          if (base.length) choose({ kind: "group", phase, band });
        })
        .on("keydown", (event: KeyboardEvent) =>
          keyboardClick(event, () => {
            if (base.length) choose({ kind: "group", phase, band });
          }),
        )
        .on("mouseover", (event: MouseEvent) =>
          showTip(event, titleFor(group, label)),
        )
        .on("mouseout", hideTip)
        .on("focus", (event: FocusEvent) =>
          showTip(event, titleFor(group, label)),
        )
        .on("blur", hideTip);
      row
        .append("rect")
        .attr("x", 2)
        .attr("y", y - step / 2)
        .attr("width", width - 4)
        .attr("height", step)
        .attr("rx", 3)
        .attr("fill", "transparent");
      if (index === 0 || comparisonRows[index - 1].band !== band)
        svg
          .append("text")
          .attr("x", 7)
          .attr("y", y + rowFont * 0.34)
          .attr("font-size", rowFont)
          .attr("font-weight", 700)
          .text(bands[band]);
      row
        .append("text")
        .attr("x", 73)
        .attr("y", y + rowFont * 0.34)
        .attr("font-size", rowFont)
        .attr("fill", base.length ? "#273747" : "#697684")
        .text(phase);
      if (context.mean !== null) {
        row
          .append("line")
          .attr("x1", x(context.q1!))
          .attr("x2", x(context.q3!))
          .attr("y1", y)
          .attr("y2", y)
          .attr("stroke", "#c4ccd3")
          .attr("stroke-width", 3);
        row
          .append("circle")
          .attr("cx", x(context.mean))
          .attr("cy", y)
          .attr("r", 3)
          .attr("fill", "#a3adb7");
      }
      if (s.mean !== null) {
        row
          .append("line")
          .attr("x1", x(s.q1!))
          .attr("x2", x(s.q3!))
          .attr("y1", y)
          .attr("y2", y)
          .attr("stroke", colors[phase])
          .attr("stroke-width", 2);
        row
          .append("circle")
          .attr("cx", x(s.mean))
          .attr("cy", y)
          .attr("r", 4)
          .attr("fill", phase === "La Niña" ? "white" : colors[phase])
          .attr("stroke", colors[phase])
          .attr("stroke-width", 1.5);
      }
      row
        .append("text")
        .attr("x", width - 5)
        .attr("y", y + rowFont * 0.34)
        .attr("text-anchor", "end")
        .attr("font-size", rowFont)
        .text(s.n ? `${s.n} / ${s.winters}` : "—");
  });
}

function drawLegends() {
  for (const phase of phases) {
    const item = d3.select("#phase-legend").append("span");
    item
      .append("svg")
      .attr("width", 18)
      .attr("height", 18)
      .append("circle")
      .attr("cx", 9)
      .attr("cy", 9)
      .attr("r", 4)
      .attr("stroke", colors[phase])
      .attr("stroke-width", 1.5)
      .attr("fill", phase === "La Niña" ? "white" : colors[phase]);
    item.append("span").text(phase);
  }
  for (const [region, shape] of Object.entries(shapes)) {
    const item = d3.select("#region-legend").append("span");
    item
      .append("svg")
      .attr("width", 18)
      .attr("height", 18)
      .append("path")
      .attr("transform", "translate(9,9)")
      .attr("d", d3.symbol().type(shape).size(48)()!)
      .attr("fill", "white")
      .attr("stroke", "#273747");
    item.append("span").text(region);
  }
}
// Compute one cohort and pass it to every view before updating the UI.
function render() {
  const oldFocus = document.activeElement?.id;
  available = filterRecords(records, filters, metric);
  focused = selectRecords(available, selection, metric);
  const s = summary(focused, metric);
  $("cohort").textContent =
    `${s.n.toLocaleString()} records · ${s.winters} winter${s.winters === 1 ? "" : "s"}`;
  const label = !selection
    ? "All filtered observations"
    : selection.kind === "state"
      ? `${selection.state} selected`
      : selection.kind === "group"
        ? `${selection.phase} · |ONI| ${bands[selection.band]} °C`
        : selection.kind === "record"
          ? selection.id
          : selection.kind === "records"
            ? `${focused.length} individually selected records`
            : `Range: ONI ${selection.x0.toFixed(2)} to ${selection.x1.toFixed(2)} °C; anomaly ${selection.y0.toFixed(1)} to ${selection.y1.toFixed(1)} ${unit()}`;
  $("selection-label").textContent =
    `${label} · ${available.length.toLocaleString()} available`;
  $("active-metric").textContent = `Viewing: ${metricName()} anomaly (${unit()})`;
  $("state-context").textContent = filters.state === "All" ? "State scope: all states" : `State scope: ${stateNames.get(filters.state)}`;
  $<HTMLButtonElement>("all-states").disabled = filters.state === "All";
  $("map-title").textContent = `State overview · ${metricName().toLowerCase()} (${unit()})`;
  $("comparison-title").textContent = `${metricName()} anomaly by ENSO magnitude (${unit()})`;
  $("comparison-mean").textContent = `Current cohort mean: ${fmt(s.mean)} ${unit()} · ${s.n.toLocaleString()} records · ${s.winters} distinct winters`;
  $("comparison-scope").textContent = `${filters.state === "All" ? "Across all available states" : stateNames.get(filters.state)} · ${label}. Dot = mean ${metricName().toLowerCase()} anomaly; line = middle 50% of records.`;
  $("brush-scope").textContent = `Select within ${filters.state === "All" ? "all states" : stateNames.get(filters.state)} and the active filters. Both endpoints are included.`;
  $("empty").hidden = focused.length > 0;
  $("scatter-title").textContent =
    `ENSO and winter ${metricName().toLowerCase()}`;
  $("y0-label").firstChild!.textContent = `${metricName()} min (${unit()})`;
  $("y1-label").firstChild!.textContent = `${metricName()} max (${unit()})`;
  drawMap();
  describeMap();
  drawScatter();
  drawComparison();
  drawRecords();
  // Restore SVG keyboard focus after rebuilding the plots.
  if (oldFocus && document.activeElement?.id !== oldFocus) $(oldFocus)?.focus();
  hideTip();
  document.querySelector("main")!.dataset.count = String(focused.length);
}
for (const id of ["start", "end", "region", "phase", "state", "metric"])
  $(id).addEventListener("change", () => {
    const start = Number($<HTMLInputElement>("start").value),
      end = Number($<HTMLInputElement>("end").value);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1982 ||
      end > 2025 ||
      start > end
    ) {
      $("error").textContent =
        "Choose whole winter years between 1982 and 2025, with first ≤ last.";
      return;
    }
    $("error").textContent = "";
    const nextMetric = $<HTMLSelectElement>("metric").value as Metric;
    if (nextMetric !== metric) {
      $<HTMLInputElement>("y0").value = "0";
      $<HTMLInputElement>("y1").value = nextMetric === "temp" ? "3" : "70";
    }
    metric = nextMetric;
    filters = {
      start,
      end,
      region: $<HTMLSelectElement>("region").value,
      phase: $<HTMLSelectElement>("phase").value,
      state: $<HTMLSelectElement>("state").value,
    };
    selection = null;
    checkedRecords.clear();
    recordPage = 0;
    render();
  });
$("map-style").addEventListener("change", () => {
  mapStyle = $<HTMLSelectElement>("map-style").value === "geographic" ? "geographic" : "tiles";
  hideTip();
  drawMap();
});
$("clear").addEventListener("click", () => choose(null));
$("all-states").addEventListener("click", () => {
  filters.state = "All";
  $<HTMLSelectElement>("state").value = "All";
  choose(null);
});
$("reset").addEventListener("click", () => {
  filters = { ...defaults };
  metric = "precip";
  selection = null;
  checkedRecords.clear();
  recordPage = 0;
  $<HTMLInputElement>("record-search").value = "";
  $<HTMLSelectElement>("record-scope").value = "available";
  $<HTMLSelectElement>("record-sort").value = "newest";
  for (const [key, value] of Object.entries(defaults))
    $<HTMLInputElement>(key).value = String(value);
  $<HTMLSelectElement>("metric").value = "precip";
  for (const [id, value] of Object.entries({
    x0: "1",
    x1: "2.5",
    y0: "0",
    y1: "70",
  }))
    $<HTMLInputElement>(id).value = value;
  $("error").textContent = "";
  render();
});
$("brush-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const values = ["x0", "x1", "y0", "y1"].map(
    (id) => $<HTMLInputElement>(id).value,
  );
  const [x0, x1, y0, y1] = values.map(Number);
  if (
    values.some((v) => v.trim() === "") ||
    ![x0, x1, y0, y1].every(Number.isFinite) ||
    x0 > x1 ||
    y0 > y1
  ) {
    $("bounds-error").textContent =
      "Enter finite range bounds with each minimum ≤ maximum.";
    return;
  }
  $("bounds-error").textContent = "";
  $<HTMLDialogElement>("brush-details").close();
  choose({ kind: "brush", x0, x1, y0, y1 });
});
$("record-search").addEventListener("input", () => {
  recordPage = 0;
  drawRecords();
  $("record-scroll").scrollTop = 0;
});
for (const id of ["record-scope", "record-sort"])
  $(id).addEventListener("change", () => {
    recordPage = 0;
    drawRecords();
  });
$("record-prev").addEventListener("click", () => {
  recordPage--;
  drawRecords();
  $("record-scroll").scrollTop = 0;
});
$("record-next").addEventListener("click", () => {
  recordPage++;
  drawRecords();
  $("record-scroll").scrollTop = 0;
});
$("check-matches").addEventListener("click", () => {
  for (const r of matchingRecords()) checkedRecords.add(r.id);
  drawRecords();
});
$("uncheck-records").addEventListener("click", () => {
  checkedRecords.clear();
  drawRecords();
});
$("apply-records").addEventListener("click", () => {
  if (checkedRecords.size)
    choose({ kind: "records", ids: [...checkedRecords] });
});
drawLegends();
render();
let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
});
