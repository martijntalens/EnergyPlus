// Energie+ — frontend. Reads the Energy dashboard configuration and long-term
// statistics from Home Assistant (read-only) and renders a detailed dashboard.
import { createDemoApi } from "./demo.js";

/* =========================================================================
 * Utilities
 * ========================================================================= */
const LOCALE = "nl-NL";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const nfCache = {};
const nf = (d) => (nfCache[d] ||= new Intl.NumberFormat(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }));
const num = (v, d = 1) => nf(d).format(v || 0);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const clamp0 = (v) => (v > 0 ? v : 0);
const toMs = (v) => (typeof v === "number" ? (v < 1e11 ? v * 1000 : v) : Date.parse(v));

function kwhParts(v) {
  const a = Math.abs(v || 0);
  if (a >= 10000) return [num(v / 1000, 2), "MWh"];
  return [num(v, a < 1 ? 2 : a < 100 ? 1 : 0), "kWh"];
}
const kwh = (v) => kwhParts(v).join(" ");
const unitFmt = (v, unit) => {
  const a = Math.abs(v || 0);
  return `${num(v, a < 10 ? 2 : a < 100 ? 1 : 0)} ${unit}`;
};
let CURRENCY = "EUR";
const money = (v, d = 2) =>
  new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0);
const pct = (v) => (isFinite(v) ? `${num(v * 100, 0)}%` : "–");
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`energyplus.${k}`);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`energyplus.${k}`, JSON.stringify(v));
    } catch {}
  },
};

/* ---------- dates ---------- */
const DOW_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MONTHS_LONG = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function rangeFor(period, anchor) {
  const a = new Date(anchor);
  const y = a.getFullYear(), m = a.getMonth(), d = a.getDate();
  if (period === "day") return { start: new Date(y, m, d), end: new Date(y, m, d + 1) };
  if (period === "week") {
    const dow = (a.getDay() + 6) % 7;
    return { start: new Date(y, m, d - dow), end: new Date(y, m, d - dow + 7) };
  }
  if (period === "month") return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
}
function shift(period, anchor, n) {
  const a = new Date(anchor);
  if (period === "day") a.setDate(a.getDate() + n);
  else if (period === "week") a.setDate(a.getDate() + 7 * n);
  else if (period === "month") {
    a.setDate(1);
    a.setMonth(a.getMonth() + n);
  } else a.setFullYear(a.getFullYear() + n);
  return a;
}
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - y0) / 864e5 + 1) / 7);
}
function makeBuckets(period, start, end) {
  const out = [];
  const c = new Date(start);
  while (c < end) {
    const s = new Date(c);
    let label, title;
    if (period === "day") {
      label = String(s.getHours()).padStart(2, "0");
      title = `${label}:00 – ${String((s.getHours() + 1) % 24).padStart(2, "0")}:00`;
      c.setHours(c.getHours() + 1);
    } else if (period === "year") {
      label = MONTHS[s.getMonth()];
      title = `${MONTHS_LONG[s.getMonth()]} ${s.getFullYear()}`;
      c.setMonth(c.getMonth() + 1);
    } else {
      label = period === "week" ? `${DOW_SHORT[s.getDay()]} ${s.getDate()}` : String(s.getDate());
      title = `${DOW_SHORT[s.getDay()]} ${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
      c.setDate(c.getDate() + 1);
    }
    out.push({ start: s.getTime(), label, title });
  }
  return out;
}
function bucketIndex(starts, ts) {
  let lo = 0, hi = starts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= ts) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
function periodLabel(period, anchor) {
  const { start, end } = rangeFor(period, anchor);
  if (period === "day")
    return start.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (period === "week") {
    const last = new Date(end - 864e5);
    return `Week ${isoWeek(start)} · ${start.getDate()} ${MONTHS[start.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
  }
  if (period === "month") return `${MONTHS_LONG[start.getMonth()]} ${start.getFullYear()}`;
  return String(start.getFullYear());
}
const PREV_NAME = { day: "gisteren", week: "vorige week", month: "vorige maand", year: "vorig jaar" };

/* =========================================================================
 * API
 * ========================================================================= */
async function createApi() {
  const forceDemo = new URLSearchParams(location.search).has("demo");
  if (!forceDemo) {
    try {
      const r = await fetch("api/bootstrap", { cache: "no-store" });
      if (r.ok) {
        const boot = await r.json();
        if (!boot.demo) return realApi(boot);
      }
    } catch {}
  }
  return createDemoApi();
}
function realApi(boot) {
  const json = async (r) => {
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || `HTTP ${r.status}`);
    }
    return r.json();
  };
  return {
    demo: false,
    options: boot.options || {},
    ws: (msg) =>
      fetch("api/ws", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(msg) }).then(json),
    states: (ids) => fetch(`api/states?ids=${encodeURIComponent(ids.join(","))}`).then(json),
    autodetect: () => fetch("api/autodetect").then(json),
  };
}

/* =========================================================================
 * Model: which statistics make up the energy picture
 * ========================================================================= */
function findKeys(obj, key, out = []) {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (k === key && typeof v === "string" && v) out.push(v);
    else if (typeof v === "object") findKeys(v, key, out);
  }
  return out;
}

function buildModel(prefs, info) {
  const cs = info?.cost_sensors || {};
  const costOf = (stat, id) => stat || cs[id] || null;
  const m = { gridIn: [], gridOut: [], solar: [], batteries: [], gas: [], water: [], devices: [], rates: { grid: [], solar: [], battery: [] }, forecast: [] };
  for (const src of prefs?.energy_sources || []) {
    if (src.type === "grid") {
      const froms = [...(src.flow_from || [])], tos = [...(src.flow_to || [])];
      if (src.stat_energy_from) froms.push(src);
      if (src.stat_energy_to) tos.push(src);
      for (const f of froms) if (f.stat_energy_from) m.gridIn.push({ id: f.stat_energy_from, cost: costOf(f.stat_cost, f.stat_energy_from) });
      for (const t of tos) if (t.stat_energy_to) m.gridOut.push({ id: t.stat_energy_to, comp: costOf(t.stat_compensation, t.stat_energy_to) });
      m.rates.grid.push(...findKeys(src, "stat_rate"));
    } else if (src.type === "solar" && src.stat_energy_from) {
      m.solar.push({ id: src.stat_energy_from });
      m.rates.solar.push(...findKeys(src, "stat_rate"));
      if (Array.isArray(src.config_entry_solar_forecast)) m.forecast.push(...src.config_entry_solar_forecast);
    } else if (src.type === "battery") {
      m.batteries.push({ out: src.stat_energy_from || null, in: src.stat_energy_to || null });
      m.rates.battery.push(...findKeys(src, "stat_rate"));
    } else if (src.type === "gas" && src.stat_energy_from) {
      m.gas.push({ id: src.stat_energy_from, cost: costOf(src.stat_cost, src.stat_energy_from) });
    } else if (src.type === "water" && src.stat_energy_from) {
      m.water.push({ id: src.stat_energy_from, cost: costOf(src.stat_cost, src.stat_energy_from) });
    }
  }
  const devIds = new Set();
  for (const d of prefs?.device_consumption || []) {
    if (!d.stat_consumption || devIds.has(d.stat_consumption)) continue;
    devIds.add(d.stat_consumption);
    m.devices.push({ id: d.stat_consumption, name: d.name || null, parent: d.included_in_stat || null });
  }
  for (const d of m.devices) if (d.parent && !devIds.has(d.parent)) d.parent = null;
  m.devices.forEach((d, i) => (d.slot = i < 8 ? `--d${i + 1}` : "--other"));
  m.hasCost = m.gridIn.some((g) => g.cost) || m.gridOut.some((g) => g.comp);
  m.hasBattery = m.batteries.length > 0;
  m.hasSolar = m.solar.length > 0;
  m.elecBase = [...m.gridIn.map((g) => g.id), ...m.gridOut.map((g) => g.id), ...m.solar.map((s) => s.id), ...m.batteries.flatMap((b) => [b.in, b.out])].filter(Boolean);
  m.elecAll = [
    ...m.elecBase,
    ...m.gridIn.map((g) => g.cost),
    ...m.gridOut.map((g) => g.comp),
    ...m.devices.map((d) => d.id),
  ].filter(Boolean);
  m.gasAll = m.gas.flatMap((g) => [g.id, g.cost]).filter(Boolean);
  m.waterAll = m.water.flatMap((g) => [g.id, g.cost]).filter(Boolean);
  return m;
}

/* =========================================================================
 * Calculations
 * ========================================================================= */
const NUM_FIELDS = [
  "fromGrid", "toGrid", "solar", "batIn", "batOut", "cost", "comp", "gas", "gasCost", "water", "waterCost",
  "home", "solarToHome", "solarToBat", "solarToGrid", "gridToHome", "gridToBat", "batToHome", "batToGrid",
];
const MAP_FIELDS = ["dev", "tariffIn", "tariffOut"];
const emptyAgg = () => {
  const o = { n: 0 };
  for (const k of NUM_FIELDS) o[k] = 0;
  for (const k of MAP_FIELDS) o[k] = {};
  return o;
};
function mergeInto(a, r) {
  a.n++;
  for (const k of NUM_FIELDS) a[k] += r[k] || 0;
  for (const k of MAP_FIELDS) for (const [id, v] of Object.entries(r[k] || {})) a[k][id] = (a[k][id] || 0) + v;
}

/** Split measured meter values into flows (same idea as HA's energy dashboard). */
function decompose(r) {
  const fg = clamp0(r.fromGrid), tg = clamp0(r.toGrid), so = clamp0(r.solar), bi = clamp0(r.batIn), bo = clamp0(r.batOut);
  const home = clamp0(fg + so + bo - tg - bi);
  const solarToHome = Math.min(so, home);
  let rem = home - solarToHome;
  const batToHome = Math.min(bo, rem);
  rem -= batToHome;
  const gridToHome = Math.min(fg, rem);
  let solarLeft = so - solarToHome;
  const solarToBat = Math.min(solarLeft, bi);
  solarLeft -= solarToBat;
  const solarToGrid = Math.min(solarLeft, tg);
  const gridToBat = clamp0(Math.min(fg - gridToHome, bi - solarToBat));
  const batToGrid = clamp0(Math.min(bo - batToHome, tg - solarToGrid));
  return { home, solarToHome, solarToBat, solarToGrid, gridToHome, gridToBat, batToHome, batToGrid };
}

function compute(model, raw, bucketStarts, cutoff = Infinity) {
  const recs = new Map();
  const add = (id, fn) => {
    if (!id) return;
    for (const p of raw[id] || []) {
      const ts = toMs(p.start);
      const v = p.change;
      if (ts >= cutoff || v == null || !isFinite(v)) continue;
      let r = recs.get(ts);
      if (!r) recs.set(ts, (r = { ts, ...emptyAgg() }));
      fn(r, v);
    }
  };
  for (const g of model.gridIn) {
    add(g.id, (r, v) => ((r.fromGrid += v), (r.tariffIn[g.id] = (r.tariffIn[g.id] || 0) + v)));
    add(g.cost, (r, v) => (r.cost += v));
  }
  for (const g of model.gridOut) {
    add(g.id, (r, v) => ((r.toGrid += v), (r.tariffOut[g.id] = (r.tariffOut[g.id] || 0) + v)));
    add(g.comp, (r, v) => (r.comp += Math.abs(v)));
  }
  for (const s of model.solar) add(s.id, (r, v) => (r.solar += v));
  for (const b of model.batteries) {
    add(b.out, (r, v) => (r.batOut += v));
    add(b.in, (r, v) => (r.batIn += v));
  }
  for (const g of model.gas) {
    add(g.id, (r, v) => (r.gas += v));
    add(g.cost, (r, v) => (r.gasCost += v));
  }
  for (const w of model.water) {
    add(w.id, (r, v) => (r.water += v));
    add(w.cost, (r, v) => (r.waterCost += v));
  }
  for (const d of model.devices) add(d.id, (r, v) => (r.dev[d.id] = (r.dev[d.id] || 0) + v));

  const buckets = bucketStarts.map(() => emptyAgg());
  const records = [...recs.values()].sort((a, b) => a.ts - b.ts);
  for (const r of records) {
    Object.assign(r, decompose(r));
    const i = bucketIndex(bucketStarts, r.ts);
    if (i >= 0) mergeInto(buckets[i], r);
  }
  const total = emptyAgg();
  buckets.forEach((b) => b.n && mergeInto(total, b));
  return { buckets, total, records, hasData: records.length > 0 };
}

/* =========================================================================
 * State & data loading
 * ========================================================================= */
const S = {
  period: store.get("period", "day"),
  anchor: new Date(),
  compare: store.get("compare", true),
  views: { balance: "chart", devices: "list" },
};
let api, model, meta = {}, haConfig = {}, D = null, co2Entity = "";
const cache = { calendar: new Map(), profile: new Map() };

async function stats(ids, start, end, period, units) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  return api.ws({
    type: "recorder/statistics_during_period",
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    statistic_ids: list,
    period,
    types: ["change"],
    units,
  });
}
async function fetchAll(start, end, period) {
  const [a, b, c] = await Promise.all([
    stats(model.elecAll, start, end, period, { energy: "kWh" }),
    stats(model.gasAll, start, end, period, { volume: "m³" }),
    stats(model.waterAll, start, end, period, { volume: "L" }),
  ]);
  return { ...a, ...b, ...c };
}

async function loadPeriod() {
  const { start, end } = rangeFor(S.period, S.anchor);
  const fetchPeriod = S.period === "year" ? "day" : "hour";
  const buckets = makeBuckets(S.period, start, end);
  const starts = buckets.map((b) => b.start);
  const now = Date.now();
  const inProgress = now > start && now < end;

  const prevR = rangeFor(S.period, shift(S.period, S.anchor, -1));
  const prevBuckets = makeBuckets(S.period, prevR.start, prevR.end);
  const prevCut = inProgress ? prevR.start.getTime() + (now - start.getTime()) : Infinity;

  const jobs = [fetchAll(start, end, fetchPeriod), S.compare ? fetchAll(prevR.start, prevR.end, fetchPeriod) : null];
  const forecastJob =
    model.hasSolar && (S.period === "day" || S.period === "week") && end > now - 2 * 864e5
      ? api.ws({ type: "energy/solar_forecast" }).catch(() => null)
      : null;
  const fossilJob =
    co2Entity && model.gridIn.length
      ? api
          .ws({
            type: "energy/fossil_energy_consumption",
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            energy_statistic_ids: model.gridIn.map((g) => g.id),
            co2_statistic_id: co2Entity,
            period: fetchPeriod,
          })
          .catch(() => null)
      : null;

  const [cur, prev, forecast, fossil] = await Promise.all([...jobs, forecastJob, fossilJob]);
  const C = compute(model, cur, starts);
  let P = null, Pcut = null;
  if (prev) {
    const pStarts = prevBuckets.map((b) => b.start);
    P = compute(model, prev, pStarts);
    Pcut = prevCut === Infinity ? P : compute(model, prev, pStarts, prevCut);
  }

  // Solar forecast (Wh per hour) folded into the display buckets.
  let fc = null;
  if (forecast) {
    fc = new Array(buckets.length).fill(0);
    let any = false;
    for (const [entry, f] of Object.entries(forecast)) {
      if (model.forecast.length && !model.forecast.includes(entry)) continue;
      for (const [iso, wh] of Object.entries(f?.wh_hours || {})) {
        const ts = Date.parse(iso);
        if (ts < start || ts >= end) continue;
        const i = bucketIndex(starts, ts);
        if (i >= 0) {
          fc[i] += wh / 1000;
          any = true;
        }
      }
    }
    if (!any) fc = null;
  }
  const fossilKwh = fossil ? sum(Object.values(fossil)) : null;

  D = { start, end, buckets, C, P, Pcut, fc, fossilKwh, inProgress, fetchPeriod };
}

async function loadProfile() {
  const { end } = rangeFor(S.period, S.anchor);
  const pEnd = new Date(Math.min(end.getTime(), Date.now()));
  pEnd.setMinutes(0, 0, 0);
  const pStart = new Date(pEnd);
  pStart.setDate(pStart.getDate() - 28);
  const key = pEnd.getTime();
  if (!cache.profile.has(key)) {
    const raw = await stats(model.elecBase, pStart, pEnd, "hour", { energy: "kWh" });
    cache.profile.set(key, compute(model, raw, [pStart.getTime()]).records);
  }
  return cache.profile.get(key);
}

async function loadCalendar() {
  const y = new Date(S.anchor).getFullYear();
  const hit = cache.calendar.get(y);
  if (hit && (Date.now() - hit.at < 10 * 60e3 || y < new Date().getFullYear())) return hit.data;
  const start = new Date(y, 0, 1), end = new Date(y + 1, 0, 1);
  const raw = await stats(model.elecBase, start, end, "day", { energy: "kWh" });
  const res = compute(model, raw, [start.getTime()]).records.map((r) => [r.ts, r.home]);
  cache.calendar.set(y, { at: Date.now(), data: res });
  return res;
}

/* =========================================================================
 * Charts — shared ECharts styling
 * ========================================================================= */
const charts = {};
function chartFor(id) {
  const el = document.getElementById(id);
  let c = charts[id];
  if (c && c.getDom() !== el) {
    c.dispose();
    c = null;
  }
  if (!c) c = charts[id] = echarts.init(el, null, { renderer: "svg" });
  return c;
}
function setChart(id, option) {
  const c = chartFor(id);
  c.setOption(option, true);
  c.resize();
  return c;
}
window.addEventListener("resize", () => Object.values(charts).forEach((c) => c.resize()));

function tooltipBase(extra = {}) {
  return {
    backgroundColor: css("--surface"),
    borderColor: css("--axis"),
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: css("--ink"), fontSize: 12 },
    extraCssText: "border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.15);",
    confine: true,
    ...extra,
  };
}
function base() {
  return {
    animationDuration: 450,
    textStyle: { fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", color: css("--ink-2") },
    grid: { left: 6, right: 10, top: 34, bottom: 4, containLabel: true },
  };
}
function legend(extra = {}) {
  return {
    top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10, itemGap: 14,
    textStyle: { color: css("--ink-2"), fontSize: 12 },
    ...extra,
  };
}
function catAxis(labels) {
  return {
    type: "category",
    data: labels,
    axisLine: { lineStyle: { color: css("--axis") } },
    axisTick: { show: false },
    axisLabel: { color: css("--muted"), fontSize: 11, hideOverlap: true },
  };
}
function valAxis(fmt, extra = {}) {
  return {
    type: "value",
    splitLine: { lineStyle: { color: css("--grid") } },
    axisLabel: { color: css("--muted"), fontSize: 11, formatter: fmt },
    ...extra,
  };
}
function bar(name, data, color, stack, extra = {}) {
  return {
    name, type: "bar", stack, data, barMaxWidth: 26,
    itemStyle: { color, borderColor: css("--surface"), borderWidth: 1 },
    emphasis: { focus: "series" },
    ...extra,
  };
}
const swatch = (c) => `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};margin-right:6px"></span>`;
function axisTooltip(titles, fmt, footer) {
  return tooltipBase({
    trigger: "axis",
    axisPointer: { type: "shadow", shadowStyle: { color: "rgba(127,127,127,0.10)" } },
    formatter: (ps) => {
      const i = ps[0]?.dataIndex ?? 0;
      let h = `<div style="font-weight:600;margin-bottom:4px">${esc(titles[i])}</div>`;
      for (const p of ps) {
        if (p.value == null || Math.abs(p.value) < 1e-6) continue;
        h += `<div style="display:flex;justify-content:space-between;gap:18px"><span>${swatch(p.color)}${esc(p.seriesName)}</span><b>${fmt(Math.abs(p.value), p)}</b></div>`;
      }
      if (footer) h += footer(i);
      return h;
    },
  });
}
const anyNonZero = (arr) => arr.some((v) => Math.abs(v || 0) > 1e-6);

/* =========================================================================
 * Rendering
 * ========================================================================= */
function renderHeader() {
  $$(".seg[role=tablist] button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.period === S.period)));
  $("#period-label").textContent = periodLabel(S.period, S.anchor);
  const next = rangeFor(S.period, shift(S.period, S.anchor, 1));
  $("#next").disabled = next.start > new Date();
  $("#compare").checked = S.compare;
}

function delta(cur, prev, goodWhenUp) {
  if (!S.compare || prev == null || !isFinite(prev) || Math.abs(prev) < 1e-6) return "";
  const d = (cur - prev) / Math.abs(prev);
  if (!isFinite(d)) return "";
  const cls = Math.abs(d) < 0.005 ? "neutral" : d > 0 === goodWhenUp ? "good" : "bad";
  const arrow = Math.abs(d) < 0.005 ? "→" : d > 0 ? "▲" : "▼";
  return `<span class="delta ${cls}" title="t.o.v. ${PREV_NAME[S.period]}${D.inProgress ? " (zelfde tijdstip)" : ""}">${arrow} ${num(Math.abs(d) * 100, 0)}%</span>`;
}
function deltaPP(cur, prev) {
  if (!S.compare || prev == null || !isFinite(prev) || !isFinite(cur)) return "";
  const d = (cur - prev) * 100;
  const cls = Math.abs(d) < 0.5 ? "neutral" : d > 0 ? "good" : "bad";
  const arrow = Math.abs(d) < 0.5 ? "→" : d > 0 ? "▲" : "▼";
  return `<span class="delta ${cls}" title="procentpunt t.o.v. ${PREV_NAME[S.period]}">${arrow} ${num(Math.abs(d), 0)} pp</span>`;
}
function ring(frac, color) {
  const r = 16, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
  return `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" fill="none" stroke="${css("--grid")}" stroke-width="5"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 20 20)"/></svg>`;
}

function renderKpis() {
  const T = D.C.total, P = D.Pcut?.total;
  const tiles = [];
  const tile = (label, color, value, unit, foot, dlt = "", extra = "") =>
    tiles.push(`<div class="kpi" style="--kpi-color:${color}">${extra}<div class="label"><i></i>${label}</div><div class="value">${value}<small>${unit}</small></div><div class="foot"><span>${foot}</span>${dlt}</div></div>`);

  const [hv, hu] = kwhParts(T.home);
  tile("Verbruik thuis", css("--home"), hv, hu, D.buckets.length ? `gem. ${kwh(T.home / Math.max(1, D.C.buckets.filter((b) => b.n).length))} per ${S.period === "day" ? "uur" : S.period === "year" ? "maand" : "dag"}` : "", delta(T.home, P?.home, false));
  if (model.gridIn.length) {
    const [v, u] = kwhParts(T.fromGrid);
    tile("Van het net", css("--grid-in"), v, u, `netto ${kwh(T.fromGrid - T.toGrid)}`, delta(T.fromGrid, P?.fromGrid, false));
  }
  if (model.gridOut.length) {
    const [v, u] = kwhParts(T.toGrid);
    tile("Teruglevering", css("--export"), v, u, model.hasCost ? `vergoeding ${money(T.comp)}` : "", delta(T.toGrid, P?.toGrid, true));
  }
  if (model.hasSolar) {
    const [v, u] = kwhParts(T.solar);
    tile("Zonne-opbrengst", css("--solar"), v, u, `${pct((T.solar - T.solarToGrid) / T.solar)} zelf gebruikt`, delta(T.solar, P?.solar, true));
  }
  if (model.hasSolar || model.hasBattery) {
    const self = T.home > 0 ? (T.home - T.gridToHome) / T.home : 0;
    const pself = P && P.home > 0 ? (P.home - P.gridToHome) / P.home : null;
    tile("Zelfvoorzienend", css("--export"), num(self * 100, 0), "%", "eigen opwek + batterij", pself != null ? deltaPP(self, pself) : "", ring(self, css("--export")));
  }
  if (model.hasBattery) {
    const [v, u] = kwhParts(T.batOut);
    tile("Batterij ontladen", css("--battery"), v, u, `geladen ${kwh(T.batIn)}`, delta(T.batOut, P?.batOut, true));
  }
  if (model.hasCost) {
    const net = T.cost - T.comp, pnet = P ? P.cost - P.comp : null;
    tile("Netto stroomkosten", css("--grid-in"), money(net).replace(/\s/g, " "), "", T.fromGrid > 0 ? `${money(T.cost / T.fromGrid, 3)} per kWh` : "", delta(net, pnet, false));
  }
  if (D.fossilKwh != null && T.fromGrid > 0) {
    const fossilShare = D.fossilKwh / T.fromGrid;
    const green = T.home > 0 ? 1 - (D.fossilKwh * (T.gridToHome / T.fromGrid)) / T.home : 0;
    tile("Fossielvrij", css("--d6"), num(green * 100, 0), "%", `net: ${pct(1 - fossilShare)} fossielvrij`, "", ring(green, css("--d6")));
  }
  if (model.gas.length) tile("Gas", css("--gas"), num(T.gas, T.gas < 10 ? 2 : 1), gasUnit(), T.gasCost ? money(T.gasCost) : "", delta(T.gas, P?.gas, false));
  if (model.water.length) {
    const w = waterFmt(T.water);
    tile("Water", css("--water"), w[0], w[1], T.waterCost ? money(T.waterCost) : "", delta(T.water, P?.water, false));
  }
  $("#kpis").innerHTML = tiles.join("");
}
const gasUnit = () => (meta[model.gas[0]?.id]?.unit && !/m³|ft³|CCF|L/.test(meta[model.gas[0].id].unit) ? meta[model.gas[0].id].unit : "m³");
const waterFmt = (l) => (l >= 10000 ? [num(l / 1000, 1), "m³"] : [num(l, 0), "L"]);

/* ---------- Sankey ---------- */
function renderSankey() {
  const T = D.C.total;
  const total = T.home + T.toGrid + T.batIn;
  if (!D.C.hasData || total <= 0) return emptyChart("chart-sankey", "Geen gegevens in deze periode");
  const nodes = new Map(), links = [];
  const min = total * 0.004;
  const node = (id, name, color) => nodes.has(id) || nodes.set(id, { name: id, label: name, itemStyle: { color, borderColor: css("--surface") } });
  const link = (s, t, v) => v > min && links.push({ source: s, target: t, value: v });

  node("grid", "Net", css("--grid-in"));
  node("solar", "Zonnepanelen", css("--solar"));
  node("batOut", "Batterij (ontladen)", css("--battery"));
  node("home", "Thuis", css("--home"));
  node("batIn", "Batterij (laden)", css("--charge"));
  node("export", "Teruglevering", css("--export"));
  link("solar", "home", T.solarToHome);
  link("solar", "batIn", T.solarToBat);
  link("solar", "export", T.solarToGrid);
  link("grid", "home", T.gridToHome);
  link("grid", "batIn", T.gridToBat);
  link("batOut", "home", T.batToHome);
  link("batOut", "export", T.batToGrid);

  const kids = (pid) => model.devices.filter((d) => d.parent === pid);
  const addDevices = (pid, from, budget) => {
    let used = 0;
    for (const d of kids(pid).sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0))) {
      const v = Math.min(T.dev[d.id] || 0, budget - used);
      if (v <= min) continue;
      node(d.id, devName(d), css(d.slot));
      link(from, d.id, v);
      used += v;
      addDevices(d.id, d.id, v);
    }
    const rest = budget - used;
    if (pid && used > 0 && rest > min) {
      node(`${pid}_rest`, `${devName(model.devices.find((x) => x.id === pid))} (overig)`, css("--other"));
      link(from, `${pid}_rest`, rest);
    }
    return rest;
  };
  if (model.devices.length) {
    const rest = addDevices(null, "home", T.home);
    if (rest > min) {
      node("untracked", "Niet apart gemeten", css("--other"));
      link("home", "untracked", rest);
    }
  }
  const used = new Set(links.flatMap((l) => [l.source, l.target]));
  setChart("chart-sankey", {
    ...base(),
    tooltip: tooltipBase({
      trigger: "item",
      formatter: (p) =>
        p.dataType === "edge"
          ? `${esc(nodes.get(p.data.source).label)} → ${esc(nodes.get(p.data.target).label)}<br><b>${kwh(p.value)}</b> · ${pct(p.value / (T.home || 1))} van verbruik`
          : `<b>${esc(p.data.label)}</b><br>${kwh(p.value)}`,
    }),
    series: [
      {
        type: "sankey",
        left: 4, right: 200, top: 8, bottom: 8,
        nodeWidth: 12, nodeGap: 10, nodeAlign: "justify", draggable: false,
        layoutIterations: 64,
        data: [...nodes.values()].filter((n) => used.has(n.name)),
        links,
        lineStyle: { color: "gradient", opacity: 0.32, curveness: 0.5 },
        emphasis: { focus: "adjacency", lineStyle: { opacity: 0.6 } },
        label: {
          color: css("--ink"), fontSize: 12,
          formatter: (p) => `{n|${p.data.label}}  {v|${kwh(p.value)}}`,
          rich: { n: { color: css("--ink"), fontSize: 12 }, v: { color: css("--ink-2"), fontSize: 11 } },
        },
      },
    ],
  });
}
const devName = (d) => d?.name || meta[d?.id]?.name || d?.id || "";

function emptyChart(id, text) {
  const c = chartFor(id);
  c.setOption(
    { title: { text, left: "center", top: "middle", textStyle: { color: css("--muted"), fontSize: 13, fontWeight: 400 } }, series: [] },
    true
  );
}

/* ---------- Balance chart + table ---------- */
function renderBalance() {
  const B = D.C.buckets;
  const labels = D.buckets.map((b) => b.label), titles = D.buckets.map((b) => b.title);
  const series = [
    bar("Zon → thuis", B.map((b) => b.solarToHome), css("--solar"), "pos"),
    bar("Batterij → thuis", B.map((b) => b.batToHome), css("--battery"), "pos"),
    bar("Net → thuis", B.map((b) => b.gridToHome), css("--grid-in"), "pos"),
    bar("Teruglevering", B.map((b) => -(b.solarToGrid + b.batToGrid)), css("--export"), "neg"),
    bar("Batterij laden", B.map((b) => -(b.solarToBat + b.gridToBat)), css("--charge"), "neg"),
  ].filter((s) => anyNonZero(s.data));
  if (S.compare && D.P) {
    series.push({
      name: `Verbruik ${PREV_NAME[S.period]}`, type: "line", data: labels.map((_, i) => D.P.buckets[i]?.home ?? null),
      symbol: "none", lineStyle: { type: "dashed", width: 2, color: css("--prev") }, itemStyle: { color: css("--prev") }, z: 5,
    });
  }
  series.push({
    name: "Totaal verbruik", type: "line", data: B.map((b) => (b.n ? b.home : null)), symbol: "circle", symbolSize: 6, showSymbol: false,
    lineStyle: { width: 0 }, itemStyle: { color: css("--home") }, tooltip: { show: false }, legendHoverLink: false,
  });
  setChart("chart-balance", {
    ...base(),
    legend: legend({ data: series.filter((s) => s.name !== "Totaal verbruik").map((s) => s.name) }),
    tooltip: axisTooltip(titles, (v) => kwh(v), (i) => `<div style="border-top:1px solid ${css("--grid")};margin-top:5px;padding-top:5px;display:flex;justify-content:space-between;gap:18px"><span>Totaal verbruik</span><b>${kwh(B[i].home)}</b></div>`),
    xAxis: catAxis(labels),
    yAxis: valAxis((v) => `${num(v, Math.abs(v) < 10 && v % 1 ? 1 : 0)} kWh`),
    series,
  });

  // Table view (accessibility + exact numbers)
  const cols = [
    ["Periode", (b, i) => esc(titles[i])],
    ["Verbruik", (b) => num(b.home, 2)],
    ["Van net", (b) => num(b.fromGrid, 2)],
    ...(model.gridOut.length ? [["Teruglevering", (b) => num(b.toGrid, 2)]] : []),
    ...(model.hasSolar ? [["Zon", (b) => num(b.solar, 2)]] : []),
    ...(model.hasBattery ? [["Batt. in", (b) => num(b.batIn, 2)], ["Batt. uit", (b) => num(b.batOut, 2)]] : []),
    ...(model.hasCost ? [["Kosten", (b) => money(b.cost - b.comp)]] : []),
    ...(model.gas.length ? [[`Gas (${gasUnit()})`, (b) => num(b.gas, 2)]] : []),
    ...(model.water.length ? [["Water (L)", (b) => num(b.water, 0)]] : []),
  ];
  $("#table-balance").innerHTML = `<table><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${B.map(
    (b, i) => `<tr>${cols.map((c) => `<td>${c[1](b, i)}</td>`).join("")}</tr>`
  ).join("")}</tbody></table>`;
}

function exportCsv() {
  if (!D) return;
  const titles = D.buckets.map((b) => b.title);
  const head = ["periode", "verbruik_kwh", "van_net_kwh", "teruglevering_kwh", "zon_kwh", "batterij_in_kwh", "batterij_uit_kwh", "kosten", "vergoeding", "gas", "water_l"];
  const rows = D.C.buckets.map((b, i) =>
    [titles[i], b.home, b.fromGrid, b.toGrid, b.solar, b.batIn, b.batOut, b.cost, b.comp, b.gas, b.water]
      .map((v) => (typeof v === "number" ? v.toFixed(4) : `"${v}"`))
      .join(";")
  );
  const blob = new Blob([[head.join(";"), ...rows].join("\n")], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `energie-${S.period}-${D.start.toISOString().slice(0, 10)}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Devices ---------- */
function renderDevices() {
  const card = $("#card-devices");
  card.hidden = !model.devices.length;
  if (!model.devices.length) return;
  const T = D.C.total;
  const home = T.home || 1;
  const top = model.devices.filter((d) => !d.parent);
  const tracked = sum(top, (d) => T.dev[d.id] || 0);
  const rows = [];
  const row = (d, depth) => {
    const v = T.dev[d.id] || 0;
    rows.push(`<div class="dev ${depth ? "child" : ""}" title="${esc(devName(d))}: ${kwh(v)}">
      <span class="dot" style="background:${css(d.slot)}"></span><span class="name">${esc(devName(d))}</span>
      <span class="bar"><span style="width:${Math.min(100, (v / home) * 100)}%;background:${css(d.slot)}"></span></span>
      <span class="val">${kwh(v)}<small>${pct(v / home)}</small></span></div>`);
    model.devices.filter((c) => c.parent === d.id).sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0)).forEach((c) => row(c, depth + 1));
  };
  top.sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0)).forEach((d) => row(d, 0));
  const rest = clamp0(T.home - tracked);
  rows.push(`<div class="dev"><span class="dot" style="background:${css("--other")}"></span><span class="name">Niet apart gemeten</span>
    <span class="bar"><span style="width:${(rest / home) * 100}%;background:${css("--other")}"></span></span><span class="val">${kwh(rest)}<small>${pct(rest / home)}</small></span></div>`);
  $("#device-list").innerHTML = rows.join("");

  const B = D.C.buckets;
  const series = top.map((d) => bar(devName(d), B.map((b) => b.dev[d.id] || 0), css(d.slot), "dev"));
  series.push(bar("Niet apart gemeten", B.map((b) => clamp0(b.home - sum(top, (d) => b.dev[d.id] || 0))), css("--other"), "dev"));
  const list = S.views.devices === "list";
  $("#device-list").hidden = !list;
  $("#chart-devices").hidden = list;
  if (!list)
    setChart("chart-devices", {
      ...base(),
      grid: { left: 6, right: 10, top: 56, bottom: 4, containLabel: true },
      legend: legend({ type: "scroll" }),
      tooltip: axisTooltip(D.buckets.map((b) => b.title), (v) => kwh(v)),
      xAxis: catAxis(D.buckets.map((b) => b.label)),
      yAxis: valAxis((v) => num(v, v % 1 ? 1 : 0)),
      series,
    });
}

/* ---------- Solar ---------- */
function renderSolar() {
  const card = $("#card-solar");
  card.hidden = !model.hasSolar;
  if (!model.hasSolar) return;
  const T = D.C.total, B = D.C.buckets;
  const peakI = B.reduce((bi, b, i) => (b.solar > (B[bi]?.solar || 0) ? i : bi), 0);
  const st = [
    ["Opbrengst", kwh(T.solar), css("--solar")],
    ["Direct verbruikt", kwh(T.solarToHome), css("--solar")],
    ...(model.hasBattery ? [["Naar batterij", kwh(T.solarToBat), css("--charge")]] : []),
    ["Teruggeleverd", kwh(T.solarToGrid), css("--export")],
    ["Zelfconsumptie", pct((T.solar - T.solarToGrid) / T.solar), null],
    ...(T.solar > 0 ? [[`Beste ${S.period === "day" ? "uur" : S.period === "year" ? "maand" : "dag"}`, `${D.buckets[peakI].label} · ${kwh(B[peakI].solar)}`, null]] : []),
    ...(D.fc ? [["Verwachting", kwh(sum(D.fc)), null]] : []),
  ];
  $("#solar-stats").innerHTML = st.map(([l, v, c]) => `<div>${c ? `<i style="background:${c}"></i>` : ""}${l}<b>${v}</b></div>`).join("");
  const series = [
    bar("Direct verbruikt", B.map((b) => b.solarToHome), css("--solar"), "s"),
    bar("Naar batterij", B.map((b) => b.solarToBat), css("--charge"), "s"),
    bar("Teruggeleverd", B.map((b) => b.solarToGrid), css("--export"), "s"),
  ].filter((s) => anyNonZero(s.data));
  if (D.fc)
    series.push({ name: "Verwachting", type: "line", data: D.fc, symbol: "none", smooth: true, lineStyle: { type: "dashed", width: 2, color: css("--ink-2") }, itemStyle: { color: css("--ink-2") } });
  setChart("chart-solar", {
    ...base(),
    legend: legend(),
    tooltip: axisTooltip(D.buckets.map((b) => b.title), (v) => kwh(v)),
    xAxis: catAxis(D.buckets.map((b) => b.label)),
    yAxis: valAxis((v) => num(v, v % 1 ? 1 : 0)),
    series,
  });
}

/* ---------- Costs & price ---------- */
function renderCosts() {
  const hasGasCost = model.gas.some((g) => g.cost), hasWaterCost = model.water.some((w) => w.cost);
  const show = model.hasCost || hasGasCost || hasWaterCost;
  $("#card-costs").hidden = !show;
  const T = D.C.total, B = D.C.buckets;
  if (show) {
    const totalNet = T.cost - T.comp + T.gasCost + T.waterCost;
    const P = D.Pcut?.total;
    const pNet = P ? P.cost - P.comp + P.gasCost + P.waterCost : null;
    const st = [
      ...(model.hasCost ? [["Stroom", money(T.cost), css("--grid-in")], ["Vergoeding", `− ${money(T.comp)}`, css("--export")]] : []),
      ...(hasGasCost ? [["Gas", money(T.gasCost), css("--gas")]] : []),
      ...(hasWaterCost ? [["Water", money(T.waterCost), css("--water")]] : []),
      ["Totaal netto", `${money(totalNet)} ${delta(totalNet, pNet, false)}`, null],
    ];
    $("#cost-stats").innerHTML = st.map(([l, v, c]) => `<div>${c ? `<i style="background:${c}"></i>` : ""}${l}<b>${v}</b></div>`).join("");
    const series = [
      bar("Stroom", B.map((b) => b.cost), css("--grid-in"), "c"),
      bar("Gas", B.map((b) => b.gasCost), css("--gas"), "c"),
      bar("Water", B.map((b) => b.waterCost), css("--water"), "c"),
      bar("Vergoeding teruglevering", B.map((b) => -b.comp), css("--export"), "n"),
    ].filter((s) => anyNonZero(s.data));
    setChart("chart-costs", {
      ...base(),
      legend: legend(),
      tooltip: axisTooltip(D.buckets.map((b) => b.title), (v, p) => (p.seriesName.startsWith("Vergoeding") ? `− ${money(v)}` : money(v)), (i) => {
        const b = B[i];
        return `<div style="border-top:1px solid ${css("--grid")};margin-top:5px;padding-top:5px;display:flex;justify-content:space-between;gap:18px"><span>Netto</span><b>${money(b.cost - b.comp + b.gasCost + b.waterCost)}</b></div>`;
      }),
      xAxis: catAxis(D.buckets.map((b) => b.label)),
      yAxis: valAxis((v) => money(v, D.C.total.cost + D.C.total.gasCost < 50 * D.buckets.length ? 2 : 0)),
      series,
    });
  }

  // Average price per kWh + tariff split
  const showPrice = model.hasCost && T.fromGrid > 0;
  const showTariff = model.gridIn.length > 1 || model.gridOut.length > 1;
  $("#card-price").hidden = !(showPrice || showTariff);
  $("#chart-price").hidden = !showPrice;
  if (showPrice) {
    const avg = T.cost / T.fromGrid;
    const data = B.map((b) => (b.fromGrid > 0.01 && b.cost ? b.cost / b.fromGrid : null));
    setChart("chart-price", {
      ...base(),
      grid: { left: 6, right: 96, top: 14, bottom: 4, containLabel: true },
      tooltip: axisTooltip(D.buckets.map((b) => b.title), (v) => `${money(v, 3)} / kWh`),
      xAxis: catAxis(D.buckets.map((b) => b.label)),
      yAxis: valAxis((v) => money(v, 3), { scale: true, splitNumber: 4 }),
      series: [
        {
          name: "Gem. prijs", type: S.period === "day" ? "line" : "bar", step: S.period === "day" ? "middle" : undefined, data,
          barMaxWidth: 18, symbol: "none", connectNulls: false,
          lineStyle: { width: 2, color: css("--grid-in") },
          itemStyle: { color: css("--grid-in"), borderRadius: [3, 3, 0, 0] },
          areaStyle: S.period === "day" ? { color: css("--grid-in"), opacity: 0.08 } : undefined,
          markLine: {
            symbol: "none", silent: true,
            lineStyle: { color: css("--muted"), type: "dotted" },
            label: { formatter: `gem. ${money(avg, 3)}`, color: css("--ink-2"), fontSize: 11, position: "end" },
            data: [{ yAxis: avg }],
          },
        },
      ],
    });
  }
  const split = (title, map, ids, colors) => {
    const tot = sum(ids, (id) => map[id] || 0);
    if (tot <= 0 || ids.length < 2) return "";
    return `<div class="row"><span>${title}</span><span>${kwh(tot)}</span><div class="stack">${ids
      .map((id, i) => `<span title="${esc(meta[id]?.name || id)}: ${kwh(map[id] || 0)}" style="width:${((map[id] || 0) / tot) * 100}%;background:${colors[i % colors.length]}"></span>`)
      .join("")}</div>${ids.map((id, i) => `<span>${swatch(colors[i % colors.length])}${esc(meta[id]?.name || id)}</span><span>${kwh(map[id] || 0)} · ${pct((map[id] || 0) / tot)}</span>`).join("")}</div>`;
  };
  $("#tariff-split").innerHTML =
    split("Afname per telwerk", T.tariffIn, model.gridIn.map((g) => g.id), [css("--seq-6"), css("--seq-3")]) +
    split("Teruglevering per telwerk", T.tariffOut, model.gridOut.map((g) => g.id), [css("--export"), css("--seq-2")]);
}

/* ---------- Load profile heatmap ---------- */
async function renderProfile() {
  const card = $("#card-profile");
  const recs = await loadProfile();
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => [0, 0]));
  for (const r of recs) {
    const d = new Date(r.ts);
    const g = grid[(d.getDay() + 6) % 7][d.getHours()];
    g[0] += r.home;
    g[1]++;
  }
  const data = [];
  let max = 0;
  grid.forEach((row, y) => row.forEach(([s, n], x) => {
    if (!n) return;
    const w = (s / n) * 1000;
    max = Math.max(max, w);
    data.push([x, y, Math.round(w)]);
  }));
  card.hidden = !data.length;
  if (!data.length) return;
  const days = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  setChart("chart-profile", {
    ...base(),
    grid: { left: 6, right: 10, top: 6, bottom: 46, containLabel: true },
    tooltip: tooltipBase({ formatter: (p) => `<b>${days[p.value[1]]} ${String(p.value[0]).padStart(2, "0")}:00</b><br>gem. ${num(p.value[2], 0)} W` }),
    xAxis: { type: "category", data: [...Array(24).keys()].map((h) => String(h).padStart(2, "0")), splitArea: { show: false }, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: css("--muted"), fontSize: 11 } },
    yAxis: { type: "category", data: days, inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: css("--muted"), fontSize: 11 } },
    visualMap: {
      min: 0, max: Math.ceil(max / 100) * 100 || 100, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemHeight: 220, itemWidth: 10,
      text: [`${num(max, 0)} W`, "0 W"], textStyle: { color: css("--muted"), fontSize: 11 },
      inRange: { color: [css("--seq-0"), css("--seq-1"), css("--seq-2"), css("--seq-3"), css("--seq-4"), css("--seq-5"), css("--seq-6"), css("--seq-7")] },
    },
    series: [{ type: "heatmap", data, itemStyle: { borderColor: css("--surface"), borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: css("--ink"), borderWidth: 1 } } }],
  });
  D.profileRecs = recs;
}

/* ---------- Gas & water ---------- */
function renderUtility(kind) {
  const isGas = kind === "gas";
  const list = isGas ? model.gas : model.water;
  const card = $(`#card-${kind}`);
  card.hidden = !list.length;
  if (!list.length) return;
  const T = D.C.total, P = D.Pcut?.total, B = D.C.buckets;
  const unit = isGas ? gasUnit() : "L";
  const val = (v) => (isGas ? unitFmt(v, unit) : waterFmt(v).join(" "));
  const filled = B.filter((b) => b.n).length || 1;
  const per = S.period === "day" ? "uur" : S.period === "year" ? "maand" : "dag";
  const st = [
    ["Totaal", `${val(T[kind])} ${delta(T[kind], P?.[kind], false)}`],
    [`Gem. per ${per}`, val(T[kind] / filled)],
    ...(T[`${kind}Cost`] ? [["Kosten", money(T[`${kind}Cost`])]] : []),
    ...(!isGas && S.period === "year" ? [["Per dag", waterFmt(T.water / Math.max(1, sum(B, (b) => (b.n ? 1 : 0)) * (S.period === "year" ? 30.4 : 1))).join(" ")]] : []),
  ];
  $(`#${kind}-stats`).innerHTML = st.map(([l, v]) => `<div>${l}<b>${v}</b></div>`).join("");
  const color = css(isGas ? "--gas" : "--water");
  const series = [bar(isGas ? "Gas" : "Water", B.map((b) => b[kind]), color, undefined, { itemStyle: { color, borderRadius: [4, 4, 0, 0] } })];
  if (S.compare && D.P)
    series.push({ name: PREV_NAME[S.period], type: "line", data: D.buckets.map((_, i) => D.P.buckets[i]?.[kind] ?? null), symbol: "none", lineStyle: { type: "dashed", width: 2, color: css("--prev") }, itemStyle: { color: css("--prev") } });
  setChart(`chart-${kind}`, {
    ...base(),
    grid: { left: 6, right: 10, top: series.length > 1 ? 30 : 12, bottom: 4, containLabel: true },
    legend: series.length > 1 ? legend() : undefined,
    tooltip: axisTooltip(D.buckets.map((b) => b.title), (v) => val(v)),
    xAxis: catAxis(D.buckets.map((b) => b.label)),
    yAxis: valAxis((v) => num(v, v % 1 ? 1 : 0)),
    series,
  });
}

/* ---------- Calendar ---------- */
async function renderCalendar() {
  const data = await loadCalendar();
  const y = new Date(S.anchor).getFullYear();
  const vals = data.map((d) => d[1]).filter((v) => v > 0).sort((a, b) => a - b);
  const p95 = vals[Math.floor(vals.length * 0.95)] || 10;
  const fmtDate = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const c = setChart("chart-calendar", {
    ...base(),
    tooltip: tooltipBase({ formatter: (p) => `<b>${new Date(p.value[0]).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" })}</b><br>${kwh(p.value[1])}` }),
    visualMap: {
      min: 0, max: Math.ceil(p95), show: true, orient: "horizontal", left: "right", top: 0, itemHeight: 140, itemWidth: 10,
      text: [`${num(p95, 0)} kWh+`, "0"], textStyle: { color: css("--muted"), fontSize: 11 },
      inRange: { color: [css("--seq-1"), css("--seq-2"), css("--seq-3"), css("--seq-4"), css("--seq-5"), css("--seq-6"), css("--seq-7")] },
    },
    calendar: {
      range: String(y), top: 40, left: 34, right: 10, cellSize: ["auto", 16],
      splitLine: { show: false },
      itemStyle: { color: css("--surface-2"), borderColor: css("--surface"), borderWidth: 2 },
      yearLabel: { show: false },
      dayLabel: { firstDay: 1, nameMap: ["zo", "ma", "di", "wo", "do", "vr", "za"], color: css("--muted"), fontSize: 10 },
      monthLabel: { nameMap: MONTHS, color: css("--muted"), fontSize: 11 },
    },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data: data.map(([ts, v]) => [fmtDate(ts), v]), itemStyle: { borderRadius: 3 } }],
  });
  c.off("click");
  c.on("click", (p) => {
    if (!p.value) return;
    const [yy, mm, dd] = p.value[0].split("-").map(Number);
    S.period = "day";
    S.anchor = new Date(yy, mm - 1, dd, 12);
    store.set("period", S.period);
    reload();
  });
}

/* ---------- Insights ---------- */
function renderInsights() {
  const T = D.C.total, out = [];
  const add = (ico, title, text) => out.push(`<li><span class="ico" aria-hidden="true">${ico}</span><div><b>${title}</b><span>${text}</span></div></li>`);
  const avgPrice = model.hasCost && T.fromGrid > 0 ? T.cost / T.fromGrid : null;

  const recs = D.profileRecs || [];
  if (recs.length > 48) {
    const watts = recs.map((r) => r.home * 1000).sort((a, b) => a - b);
    const base = watts[Math.floor(watts.length * 0.05)];
    const yearKwh = (base * 8760) / 1000;
    add("🌙", `Sluipverbruik ≈ ${num(base, 0)} W`, `Dat is ongeveer ${num(yearKwh, 0)} kWh per jaar${avgPrice ? ` (≈ ${money(yearKwh * avgPrice, 0)})` : ""}. Gemeten als het laagste uurverbruik van de afgelopen 4 weken.`);
  }
  const B = D.C.buckets;
  const unitName = S.period === "day" ? "uur" : S.period === "year" ? "maand" : "dag";
  if (T.home > 0) {
    const pi = B.reduce((bi, b, i) => (b.home > B[bi].home ? i : bi), 0);
    add("📈", `Hoogste verbruik: ${D.buckets[pi].title}`, `${kwh(B[pi].home)} in ${unitName === "dag" || unitName === "maand" ? "die" : "dat"} ${unitName}, ${pct(B[pi].home / T.home)} van het totaal deze periode.`);
  }
  if (model.devices.length && T.home > 0) {
    const top = model.devices.filter((d) => !d.parent).sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0))[0];
    const v = T.dev[top?.id] || 0;
    if (v > 0) add("🔌", `Grootste verbruiker: ${esc(devName(top))}`, `${kwh(v)} (${pct(v / T.home)} van je verbruik)${avgPrice ? `, ≈ ${money(v * avgPrice)} tegen je gemiddelde netprijs` : ""}.`);
  }
  if (model.hasSolar && T.solar > 0) {
    const sc = (T.solar - T.solarToGrid) / T.solar;
    add("☀️", `${pct(sc)} van je zonnestroom zelf gebruikt`, T.solarToGrid > 0.1 ? `${kwh(T.solarToGrid)} ging naar het net. Draai grote verbruikers (wasmachine, vaatwasser, auto laden) bij voorkeur tijdens zonuren.` : "Vrijwel alle opwek is direct of via de batterij in huis gebruikt.");
  }
  if (model.gridOut.length && T.toGrid > 0.1) {
    const nettingEnd = new Date(2027, 0, 1);
    if (new Date() < nettingEnd)
      add("⚖️", "Salderen stopt per 1 januari 2027", `Je leverde deze periode ${kwh(T.toGrid)} terug. Na afschaffing van de salderingsregeling krijg je hiervoor alleen nog de terugleververgoeding van je leverancier — zelf verbruiken of opslaan wordt dan waardevoller.`);
    else add("⚖️", "Geen saldering meer", `Je leverde ${kwh(T.toGrid)} terug${model.hasCost ? ` voor ${money(T.comp)}` : ""}. Zelfverbruik en opslag leveren nu het meeste op.`);
  }
  if (model.hasBattery && T.batIn > 0.1) {
    const eff = T.batOut / T.batIn;
    add("🔋", `Batterij dekte ${pct(T.batToHome / (T.home || 1))} van je verbruik`, `${kwh(T.batIn)} geladen (${pct(T.solarToBat / T.batIn)} uit zon), ${kwh(T.batOut)} ontladen${eff > 0.5 && eff < 1.05 && S.period !== "day" ? `; rendement ≈ ${pct(eff)}` : ""}.`);
  }
  if (S.compare && D.Pcut && D.Pcut.total.home > 0 && T.home > 0) {
    const d = (T.home - D.Pcut.total.home) / D.Pcut.total.home;
    if (Math.abs(d) > 0.03)
      add(d < 0 ? "✅" : "⚠️", `${num(Math.abs(d) * 100, 0)}% ${d < 0 ? "minder" : "meer"} verbruik dan ${PREV_NAME[S.period]}`, `${kwh(T.home)} tegenover ${kwh(D.Pcut.total.home)}${D.inProgress ? " op hetzelfde tijdstip" : ""}.`);
  }
  if (model.gas.length && T.gas > 0 && S.period !== "day") {
    const days = Math.max(1, (Math.min(Date.now(), D.end) - D.start) / 864e5);
    add("🔥", `Gemiddeld ${unitFmt(T.gas / days, gasUnit())} gas per dag`, D.Pcut?.total.gas ? `${PREV_NAME[S.period][0].toUpperCase() + PREV_NAME[S.period].slice(1)}: ${unitFmt(D.Pcut.total.gas / days, gasUnit())} per dag.` : "");
  }
  $("#insights").innerHTML = out.length ? out.join("") : `<li><div class="empty">Nog te weinig gegevens voor inzichten.</div></li>`;
}

/* =========================================================================
 * Live power flow
 * ========================================================================= */
let liveTimer = null;
function liveEntities() {
  const o = api.options || {};
  return {
    grid: o.grid_power_entity || model.rates.grid[0] || "",
    gridExport: o.grid_power_export_entity || "",
    solar: o.solar_power_entity || model.rates.solar[0] || "",
    battery: o.battery_power_entity || model.rates.battery[0] || "",
    soc: o.battery_soc_entity || "",
  };
}
function setupLive() {
  const E = liveEntities();
  const ids = Object.values(E).filter(Boolean);
  const card = $("#card-live");
  card.hidden = !E.grid;
  $("#card-sankey").classList.toggle("span-12", !E.grid);
  $("#card-sankey").classList.toggle("span-7", !!E.grid);
  if (!E.grid) return;
  const tick = async () => {
    try {
      const st = await api.states(ids);
      const w = (id) => {
        const s = st[id];
        if (!s || isNaN(parseFloat(s.state))) return 0;
        const v = parseFloat(s.state);
        return /^kW$/i.test(s.unit || "") ? v * 1000 : /^MW$/i.test(s.unit || "") ? v * 1e6 : v;
      };
      const grid = w(E.grid) - (E.gridExport ? w(E.gridExport) : 0);
      const solar = E.solar ? Math.max(0, w(E.solar)) : 0;
      const battery = E.battery ? w(E.battery) : 0;
      const soc = E.soc && st[E.soc] ? parseFloat(st[E.soc].state) : null;
      drawLive({ grid, solar, battery, soc, hasSolar: !!E.solar, hasBattery: !!E.battery });
      $("#live-updated").textContent = `bijgewerkt ${new Date().toLocaleTimeString(LOCALE)}`;
    } catch (e) {
      $("#live-updated").textContent = "geen live-data";
    }
  };
  clearInterval(liveTimer);
  tick();
  liveTimer = setInterval(tick, Math.max(2, api.options?.live_refresh_seconds || 5) * 1000);
}
function drawLive({ grid, solar, battery, soc, hasSolar, hasBattery }) {
  const f = decompose({ fromGrid: clamp0(grid), toGrid: clamp0(-grid), solar, batOut: clamp0(battery), batIn: clamp0(-battery) });
  const W = (v) => (Math.abs(v) >= 1000 ? `${num(v / 1000, 2)} kW` : `${num(v, 0)} W`);
  const P = { grid: [70, 170], home: [390, 170], solar: [230, 55], battery: [230, 285] };
  const node = (k, label, value, color, sub = "") =>
    `<g class="node" transform="translate(${P[k][0]},${P[k][1]})"><circle r="44" stroke="${color}"/><text class="t2" y="-10">${label}</text><text class="t1" y="9">${value}</text>${sub ? `<text class="t2" y="25">${sub}</text>` : ""}</g>`;
  const edge = (a, b, val, color, bend = 0) => {
    const [x1, y1] = P[a], [x2, y2] = P[b];
    const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2 + bend;
    const d = `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
    const on = val > 5;
    const dur = on ? Math.max(0.6, 4 - Math.log10(val + 1)) : 0;
    const width = on ? Math.min(6, 2 + val / 1500) : 0;
    return `<path class="base" d="${d}"/>${on ? `<path class="flow" d="${d}" stroke="${color}" stroke-width="${width}" style="animation-duration:${dur}s"><title>${W(val)}</title></path>` : ""}`;
  };
  const edges = [
    edge("grid", "home", f.gridToHome, css("--grid-in")),
    hasSolar ? edge("solar", "home", f.solarToHome, css("--solar")) : "",
    hasSolar ? edge("solar", "grid", f.solarToGrid, css("--export")) : "",
    hasSolar && hasBattery ? edge("solar", "battery", f.solarToBat, css("--charge"), -40) : "",
    hasBattery ? edge("battery", "home", f.batToHome, css("--battery")) : "",
    hasBattery ? edge("grid", "battery", f.gridToBat, css("--charge")) : "",
    hasBattery ? edge("battery", "grid", f.batToGrid, css("--export"), 30) : "",
  ].join("");
  const nodes = [
    node("grid", "Net", W(Math.abs(grid)), css("--grid-in"), grid < -5 ? "teruglevering" : grid > 5 ? "afname" : ""),
    node("home", "Thuis", W(f.home), css("--home")),
    hasSolar ? node("solar", "Zon", W(solar), css("--solar")) : "",
    hasBattery ? node("battery", "Batterij", W(Math.abs(battery)), css("--battery"), soc != null && !isNaN(soc) ? `${num(soc, 0)}% · ${battery > 5 ? "ontladen" : battery < -5 ? "laden" : "rust"}` : "") : "",
  ].join("");
  $("#live-flow").innerHTML = `<svg viewBox="0 0 460 340" role="img" aria-label="Live energiestroom">${edges}${nodes}</svg>`;
}

/* =========================================================================
 * Orchestration
 * ========================================================================= */
function banner(msg, info = false) {
  const b = $("#banner");
  b.hidden = !msg;
  b.className = `banner${info ? " info" : ""}`;
  b.innerHTML = msg || "";
}
const loading = (on) => ($("#loading").hidden = !on);

function renderAll() {
  renderHeader();
  renderKpis();
  renderSankey();
  renderBalance();
  renderDevices();
  renderSolar();
  renderCosts();
  renderUtility("gas");
  renderUtility("water");
  renderInsights();
  const tbl = S.views.balance === "table";
  $("#chart-balance").hidden = tbl;
  $("#table-balance").hidden = !tbl;
}

let busy = false;
async function reload({ silent = false } = {}) {
  if (busy) return;
  busy = true;
  renderHeader();
  if (!silent) loading(true);
  try {
    await loadPeriod();
    renderAll();
    if (!D.C.hasData) banner("Er zijn (nog) geen statistieken voor deze periode.", true);
    else if (!api.demo) banner("");
    await Promise.all([
      renderProfile().catch((e) => console.warn("profile", e)),
      renderCalendar().catch((e) => console.warn("calendar", e)),
    ]);
    renderInsights();
  } catch (e) {
    console.error(e);
    banner(`Kon de gegevens niet laden: ${esc(e.message)}`);
  } finally {
    busy = false;
    loading(false);
  }
}

function applyTheme(t) {
  if (t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
}

function wireUi() {
  $$(".seg[role=tablist] button").forEach((b) =>
    b.addEventListener("click", () => {
      S.period = b.dataset.period;
      store.set("period", S.period);
      reload();
    })
  );
  $("#prev").addEventListener("click", () => ((S.anchor = shift(S.period, S.anchor, -1)), reload()));
  $("#next").addEventListener("click", () => ((S.anchor = shift(S.period, S.anchor, 1)), reload()));
  $("#today").addEventListener("click", () => ((S.anchor = new Date()), reload()));
  $("#refresh").addEventListener("click", () => {
    cache.calendar.clear();
    cache.profile.clear();
    reload();
  });
  $("#compare").addEventListener("change", (e) => {
    S.compare = e.target.checked;
    store.set("compare", S.compare);
    reload();
  });
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme")
      ? document.documentElement.getAttribute("data-theme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const t = dark ? "light" : "dark";
    store.set("theme", t);
    applyTheme(t);
    if (D) {
      renderAll();
      renderProfile().catch(() => {});
      renderCalendar().catch(() => {});
      setupLive();
    }
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => D && !store.get("theme") && renderAll());
  $$("[data-view-for]").forEach((seg) =>
    seg.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
        S.views[seg.dataset.viewFor] = b.dataset.view;
        if (D) renderAll();
      })
    )
  );
  $("#csv").addEventListener("click", exportCsv);
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "ArrowLeft") $("#prev").click();
    if (e.key === "ArrowRight" && !$("#next").disabled) $("#next").click();
  });
  // Keep the current period fresh.
  setInterval(() => D?.inProgress && document.visibilityState === "visible" && reload({ silent: true }), 5 * 60e3);
}

async function init() {
  applyTheme(store.get("theme", null));
  wireUi();
  loading(true);
  try {
    api = await createApi();
    $("#demo-badge").hidden = !api.demo;
    if (api.demo) banner("Je bekijkt <b>demo-data</b>. Installeer Energie+ als Home Assistant-app om je eigen gegevens te zien.", true);
    haConfig = await api.ws({ type: "get_config" }).catch(() => ({}));
    CURRENCY = haConfig.currency || "EUR";
    if (haConfig.location_name) $("#location").textContent = haConfig.location_name;
    const [prefs, info] = await Promise.all([api.ws({ type: "energy/get_prefs" }).catch(() => null), api.ws({ type: "energy/info" }).catch(() => ({}))]);
    if (!prefs || !(prefs.energy_sources || []).length) {
      loading(false);
      banner("Het Energie-dashboard van Home Assistant is nog niet ingericht. Stel eerst je bronnen in via <b>Instellingen → Dashboards → Energie</b>; Energie+ gebruikt diezelfde configuratie.");
      return;
    }
    model = buildModel(prefs, info);
    const ids = [...model.elecBase, ...model.devices.map((d) => d.id), ...model.gas.map((g) => g.id), ...model.water.map((w) => w.id)];
    const md = await api.ws({ type: "recorder/get_statistics_metadata", statistic_ids: ids }).catch(() => []);
    for (const x of md || []) meta[x.statistic_id] = { name: x.name || x.statistic_id, unit: x.statistics_unit_of_measurement || x.display_unit_of_measurement };
    co2Entity = api.options?.co2_signal_entity || (await api.autodetect().catch(() => ({}))).co2_signal_entity || "";
    setupLive();
    await reload();
  } catch (e) {
    console.error(e);
    banner(`Kon geen verbinding maken met Home Assistant: ${esc(e.message)}`);
    loading(false);
  }
}

init();
