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
    getSettings: () => fetch("api/settings", { cache: "no-store" }).then(json),
    saveSettings: (data) =>
      fetch("api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(json),
    devicePower: (ids) =>
      fetch("api/device_power", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).then(json),
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
      for (const f of froms)
        if (f.stat_energy_from)
          m.gridIn.push({
            id: f.stat_energy_from,
            cost: costOf(f.stat_cost, f.stat_energy_from),
            fixedPrice: typeof f.number_energy_price === "number" ? f.number_energy_price : null,
            priceEntity: f.entity_energy_price || null,
          });
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
    m.devices.push({ id: d.stat_consumption, name: d.name || null, parent: d.included_in_stat || null, rate: d.stat_rate || null });
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

/* ---------- Tariffs: tarief 1 = dal, tarief 2 = piek (Dutch meters) ---------- */
const TARIFF_LABEL = { dal: "Daltarief", piek: "Piektarief", enkel: "Enkel tarief" };
function classifyTariff(id, name, index, count) {
  if (count < 2) return "enkel";
  const t = `${id} ${name || ""}`.toLowerCase();
  if (/off[ _-]?peak|\blow\b|_low|laag|\bdal|tarif+[ _-]?1\b|tariff[ _-]?1\b|\bt1\b|_t1\b|_1$/.test(t)) return "dal";
  if (/peak|\bhigh\b|_high|hoog|normaal|normal|piek|tarif+[ _-]?2\b|tariff[ _-]?2\b|\bt2\b|_t2\b|_2$/.test(t)) return "piek";
  return index === 0 ? "dal" : index === 1 ? "piek" : `t${index + 1}`;
}
function classifyTariffs(m) {
  m.gridIn.forEach((g, i) => (g.tariff = classifyTariff(g.id, meta[g.id]?.name, i, m.gridIn.length)));
  m.gridOut.forEach((g, i) => (g.tariff = classifyTariff(g.id, meta[g.id]?.name, i, m.gridOut.length)));
  m.tariffKeys = [...new Set([...m.gridIn, ...m.gridOut].map((g) => g.tariff))];
}
const tariffLabel = (k) => TARIFF_LABEL[k] || k.toUpperCase();
/** Shares of each tariff in a record (by which meter moved; else the usual NL schedule). */
function tariffWeights(r, hourly) {
  const w = {};
  const from = (map, list) => {
    let tot = 0;
    for (const g of list) tot += clamp0(map[g.id] || 0);
    if (tot <= 1e-4) return false;
    for (const g of list) w[g.tariff] = (w[g.tariff] || 0) + clamp0(map[g.id] || 0) / tot;
    return true;
  };
  if (from(r.tariffIn, model.gridIn) || from(r.tariffOut, model.gridOut)) return w;
  const keys = model.tariffKeys || [];
  if (keys.length === 1) return { [keys[0]]: 1 };
  if (keys.includes("dal") && keys.includes("piek")) {
    const d = new Date(r.ts), dow = d.getDay(), weekend = dow === 0 || dow === 6;
    const dalShare = weekend ? 1 : hourly ? (d.getHours() < 7 || d.getHours() >= 23 ? 1 : 0) : 8 / 24;
    return { dal: dalShare, piek: 1 - dalShare };
  }
  return w;
}
/**
 * Price per kWh for each tariff. Historic cost statistics first (they follow price changes
 * over time), then the fixed price from the Energy settings, then the current price entity.
 */
function tariffPrices(records) {
  const prices = {}, kwh = {}, cost = {};
  for (const r of records)
    for (const g of model.gridIn) {
      kwh[g.tariff] = (kwh[g.tariff] || 0) + clamp0(r.tariffIn[g.id] || 0);
      cost[g.tariff] = (cost[g.tariff] || 0) + (r.costIn[g.id] || 0);
    }
  for (const k of Object.keys(kwh)) if (kwh[k] > 0.05 && cost[k] > 0) prices[k] = cost[k] / kwh[k];
  for (const g of model.gridIn) {
    if (prices[g.tariff] != null) continue;
    if (g.fixedPrice != null) prices[g.tariff] = g.fixedPrice;
    else if (livePrices[g.priceEntity] != null) prices[g.tariff] = livePrices[g.priceEntity];
  }
  return prices;
}
const SHIFTABLE = /was|droger|droog|vaatwas|dish|wash|dryer|boiler/i;

/* =========================================================================
 * Calculations
 * ========================================================================= */
const NUM_FIELDS = [
  "fromGrid", "toGrid", "solar", "batIn", "batOut", "cost", "comp", "gas", "gasCost", "water", "waterCost",
  "home", "solarToHome", "solarToBat", "solarToGrid", "gridToHome", "gridToBat", "batToHome", "batToGrid",
  "homeCost", "shiftPiek",
];
const MAP_FIELDS = ["dev", "devCost", "tariffIn", "tariffOut", "costIn", "compOut", "homeTariff"];
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
    add(g.cost, (r, v) => ((r.cost += v), (r.costIn[g.id] = (r.costIn[g.id] || 0) + v)));
  }
  for (const g of model.gridOut) {
    add(g.id, (r, v) => ((r.toGrid += v), (r.tariffOut[g.id] = (r.tariffOut[g.id] || 0) + v)));
    add(g.comp, (r, v) => ((r.comp += Math.abs(v)), (r.compOut[g.id] = (r.compOut[g.id] || 0) + Math.abs(v))));
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
  const hourly = records.length > 1 ? records[1].ts - records[0].ts <= 3600e3 : true;
  records.forEach((r) => Object.assign(r, decompose(r)));
  const prices = tariffPrices(records);
  const havePrice = Object.keys(prices).length > 0;
  const shiftIds = model.devices.filter((d) => SHIFTABLE.test(devName(d))).map((d) => d.id);
  for (const r of records) {
    // Cost of consumption at the tariff that applied at that moment (dal/piek).
    const w = tariffWeights(r, hourly);
    let price = 0, wsum = 0;
    for (const [k, share] of Object.entries(w)) {
      if (prices[k] != null) (price += share * prices[k]), (wsum += share);
      r.homeTariff[k] = (r.homeTariff[k] || 0) + share * r.home;
    }
    if (havePrice && wsum > 0) {
      price /= wsum;
      r.homeCost = r.home * price;
      for (const [id, v] of Object.entries(r.dev)) r.devCost[id] = v * price;
    }
    if (w.piek) r.shiftPiek = sum(shiftIds, (id) => r.dev[id] || 0) * w.piek;
    const i = bucketIndex(bucketStarts, r.ts);
    if (i >= 0) mergeInto(buckets[i], r);
  }
  const total = emptyAgg();
  buckets.forEach((b) => b.n && mergeInto(total, b));
  return { buckets, total, records, prices, havePrice, hasData: records.length > 0 };
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
const livePrices = {};
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
    tile("Zelfvoorzienend", css("--export"), num(self * 100, 0), "%", model.hasBattery ? "eigen opwek + batterij" : "uit eigen opwek", pself != null ? deltaPP(self, pself) : "", ring(self, css("--export")));
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
        left: 4, right: $("#chart-sankey").clientWidth < 640 ? 120 : 200, top: 8, bottom: 8,
        nodeWidth: 12, nodeGap: 10, nodeAlign: "justify", draggable: false,
        layoutIterations: 64,
        data: [...nodes.values()].filter((n) => used.has(n.name)),
        links,
        lineStyle: { color: "gradient", opacity: 0.32, curveness: 0.5 },
        emphasis: { focus: "adjacency", lineStyle: { opacity: 0.6 } },
        label: {
          color: css("--ink"), fontSize: 12,
          formatter: (p) => ($("#chart-sankey").clientWidth < 640 ? `{n|${p.data.label}}` : `{n|${p.data.label}}  {v|${kwh(p.value)}}`),
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
  $("#balance-sub").textContent = `Boven de nullijn: waar je verbruik vandaan kwam. Onder de nullijn: teruglevering${model.hasBattery ? " en batterij laden" : ""}.`;
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
  const withCost = D.C.havePrice;
  const top = model.devices.filter((d) => !d.parent);
  const tracked = sum(top, (d) => T.dev[d.id] || 0);
  const trackedCost = sum(top, (d) => T.devCost[d.id] || 0);
  const costCell = (c) => (withCost ? `<span class="cost">${money(c)}</span>` : "");
  const rows = [];
  const row = (d, depth) => {
    const v = T.dev[d.id] || 0, c = T.devCost[d.id] || 0;
    rows.push(`<div class="dev ${depth ? "child" : ""}" title="${esc(devName(d))}: ${kwh(v)}${withCost ? ` · ${money(c)}` : ""}">
      <span class="dot" style="background:${css(d.slot)}"></span><span class="name">${esc(devName(d))}</span>
      <span class="bar"><span style="width:${Math.min(100, (v / home) * 100)}%;background:${css(d.slot)}"></span></span>
      <span class="val">${kwh(v)}<small>${pct(v / home)}</small>${costCell(c)}</span></div>`);
    model.devices.filter((c) => c.parent === d.id).sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0)).forEach((c) => row(c, depth + 1));
  };
  top.sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0)).forEach((d) => row(d, 0));
  const rest = clamp0(T.home - tracked);
  const restCost = clamp0(T.homeCost - trackedCost);
  rows.push(`<div class="dev"><span class="dot" style="background:${css("--other")}"></span><span class="name">Niet apart gemeten</span>
    <span class="bar"><span style="width:${(rest / home) * 100}%;background:${css("--other")}"></span></span><span class="val">${kwh(rest)}<small>${pct(rest / home)}</small>${costCell(restCost)}</span></div>`);
  if (withCost)
    rows.push(`<div class="dev" style="border-top:1px solid var(--grid);margin-top:4px;padding-top:8px"><span></span><span class="name"><b>Totaal verbruik</b></span><span></span>
      <span class="val"><b>${kwh(T.home)}</b><small>100%</small>${costCell(T.homeCost)}</span></div>`);
  $("#device-list").innerHTML = rows.join("");
  $("#device-cost-hint").textContent = withCost ? "kosten tegen het dal- of piektarief van dat moment" : "";
  $("#device-cost-hint").title = "Kosten = verbruik van het apparaat × de prijs van het tarief (dal/piek) dat op dat uur gold. Ook stroom van je zonnepanelen telt mee tegen dat tarief.";

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
      tooltip: axisTooltip(D.buckets.map((b) => b.title), (v) => kwh(v), withCost ? (i) => `<div style="border-top:1px solid ${css("--grid")};margin-top:5px;padding-top:5px;display:flex;justify-content:space-between;gap:18px"><span>Kosten</span><b>${money(B[i].homeCost)}</b></div>` : undefined),
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

}

/* ---------- Dal / piek tariff ---------- */
const TARIFF_COL = { dal: ["--grid-in", "--export"], piek: ["--d2", "--d4"], enkel: ["--grid-in", "--export"] };
const tariffCol = (k, dir) => css((TARIFF_COL[k] || ["--d7", "--d8"])[dir === "in" ? 0 : 1]);
function renderTariff() {
  const T = D.C.total, B = D.C.buckets;
  const keys = model.tariffKeys || [];
  const card = $("#card-tariff");
  card.hidden = !model.gridIn.length;
  if (!model.gridIn.length) return;
  const byKey = (map, list) => {
    const o = {};
    for (const g of list) o[g.tariff] = (o[g.tariff] || 0) + (map[g.id] || 0);
    return o;
  };
  const inK = byKey(T.tariffIn, model.gridIn), outK = byKey(T.tariffOut, model.gridOut);
  const costK = byKey(T.costIn, model.gridIn), compK = byKey(T.compOut, model.gridOut);
  const prices = D.C.prices || {};
  const hasOut = model.gridOut.length > 0, hasMoney = D.C.havePrice || model.hasCost;
  const costOfK = (k) => (costK[k] ? costK[k] : prices[k] != null ? (inK[k] || 0) * prices[k] : null);
  const head = ["Tarief", "Afname", ...(hasOut ? ["Teruglevering", "Netto"] : []), ...(hasMoney ? ["Prijs/kWh", "Kosten"] : []), ...(hasOut && model.hasCost ? ["Vergoeding"] : [])];
  const rowFor = (k) => {
    const i = inK[k] || 0, o = outK[k] || 0, c = costOfK(k);
    return [
      `<td class="k"><i style="background:${tariffCol(k, "in")}"></i>${tariffLabel(k)}</td>`,
      `<td>${kwh(i)} <small style="color:var(--muted)">${pct(i / (T.fromGrid || 1))}</small></td>`,
      ...(hasOut ? [`<td>${kwh(o)}</td>`, `<td>${kwh(i - o)}</td>`] : []),
      ...(hasMoney ? [`<td>${prices[k] != null ? money(prices[k], 3) : "–"}</td>`, `<td>${c != null ? money(c) : "–"}</td>`] : []),
      ...(hasOut && model.hasCost ? [`<td>${compK[k] ? `− ${money(compK[k])}` : "–"}</td>`] : []),
    ].join("");
  };
  const totalCost = sum(keys, (k) => costOfK(k) || 0);
  const totalRow = [
    `<td class="k">Totaal</td>`,
    `<td>${kwh(T.fromGrid)}</td>`,
    ...(hasOut ? [`<td>${kwh(T.toGrid)}</td>`, `<td>${kwh(T.fromGrid - T.toGrid)}</td>`] : []),
    ...(hasMoney ? [`<td>${T.fromGrid > 0 && totalCost ? money(totalCost / T.fromGrid, 3) : "–"}</td>`, `<td>${money(totalCost)}</td>`] : []),
    ...(hasOut && model.hasCost ? [`<td>− ${money(T.comp)}</td>`] : []),
  ].join("");
  $("#tariff-table").innerHTML = `<table class="tariff-tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${keys
    .map((k) => `<tr>${rowFor(k)}</tr>`)
    .join("")}<tr style="font-weight:600">${totalRow}</tr></tbody></table>`;

  const series = [
    ...keys.map((k) => bar(`Afname ${tariffLabel(k).toLowerCase()}`, B.map((b) => byKey(b.tariffIn, model.gridIn)[k] || 0), tariffCol(k, "in"), "in")),
    ...keys.map((k) => bar(`Teruglevering ${tariffLabel(k).toLowerCase()}`, B.map((b) => -(byKey(b.tariffOut, model.gridOut)[k] || 0)), tariffCol(k, "out"), "out")),
  ].filter((x) => anyNonZero(x.data));
  setChart("chart-tariff", {
    ...base(),
    grid: { left: 6, right: 10, top: 54, bottom: 4, containLabel: true },
    legend: legend(),
    tooltip: axisTooltip(D.buckets.map((b) => b.title), (v) => kwh(v)),
    xAxis: catAxis(D.buckets.map((b) => b.label)),
    yAxis: valAxis((v) => num(v, v % 1 ? 1 : 0)),
    series,
  });
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

/* ---------- Annual bill forecast ---------- */
let settings = {}, billData = null, cycleData = null, liveDevW = {};
const billCache = { key: null, at: 0, data: null };
function billWindow() {
  const [y, m, d] = String(settings.bill_start || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  let s = new Date(now.getFullYear(), m - 1, d);
  if (s > now) s = new Date(now.getFullYear() - 1, m - 1, d);
  return { s, e: new Date(s.getFullYear() + 1, m - 1, d) };
}
async function loadBill() {
  const w = billWindow();
  if (!w || settings.monthly_payment == null) return null;
  const key = `${w.s.getTime()}|${JSON.stringify(settings)}`;
  if (billCache.key === key && Date.now() - billCache.at < 10 * 60e3) return billCache.data;
  const days = makeBuckets("month", w.s, w.e);
  const ps = new Date(w.s.getFullYear() - 1, w.s.getMonth(), w.s.getDate());
  const pdays = makeBuckets("month", ps, w.s);
  const [cur, prev] = await Promise.all([fetchAll(w.s, new Date(Math.min(Date.now(), w.e)), "day"), fetchAll(ps, w.s, "day")]);
  const data = { w, days, C: compute(model, cur, days.map((b) => b.start)), P: compute(model, prev, pdays.map((b) => b.start)) };
  Object.assign(billCache, { key, at: Date.now(), data });
  return data;
}
const monthsBetween = (a, b) => (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0);

function renderBill(data) {
  $("#card-bill").hidden = !(model.hasCost || model.gas.some((g) => g.cost) || settings.bill_start);
  const body = $("#bill-body");
  const w = billWindow();
  $("#bill-period").textContent = w ? `${w.s.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })} – ${new Date(w.e - 864e5).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}` : "";
  $("#chart-bill").hidden = true;
  if (!w || settings.monthly_payment == null) {
    body.innerHTML = `<div class="empty">Vul via <b>Instellen</b> je termijnbedrag, vaste kosten en de start van je afrekenjaar in. Dan voorspelt Energie+ of je bij de jaarafrekening geld terugkrijgt of moet bijbetalen.</div>`;
    return;
  }
  if (!model.hasCost && !model.gas.some((g) => g.cost)) {
    body.innerHTML = `<div class="empty">Er zijn nog geen prijzen ingesteld in de Energie-instellingen van Home Assistant, dus de verbruikskosten zijn onbekend.</div>`;
    return;
  }
  if (!data) return;
  const { days, C, P } = data;
  const n = days.length, now = Date.now();
  const starts = days.map((b) => b.start);
  const ti = Math.max(0, Math.min(n - 1, bucketIndex(starts, now)));
  const dayFrac = Math.min(1, (now - starts[ti]) / 864e5);
  const streams = { elec: (b) => b.cost - b.comp, gas: (b) => b.gasCost };
  const fc = {}, methods = new Set();
  for (const [k, fn] of Object.entries(streams)) {
    const actual = C.buckets.map((b) => (b.n ? fn(b) : 0));
    let both = 0, bothPrev = 0, done = 0;
    for (let i = 0; i < ti; i++) {
      done += actual[i];
      if (P.buckets[i]?.n && C.buckets[i].n) (both += actual[i]), (bothPrev += fn(P.buckets[i]));
    }
    const remainIdx = [...Array(n).keys()].filter((i) => i >= ti);
    const cov = remainIdx.filter((i) => P.buckets[i]?.n).length / Math.max(1, remainIdx.length);
    const per = new Array(n).fill(0);
    if (cov >= 0.8) {
      const trend = Math.abs(bothPrev) > 20 ? Math.min(1.5, Math.max(0.6, both / bothPrev)) : 1;
      const lyAvg = sum(remainIdx.filter((i) => P.buckets[i]?.n), (i) => fn(P.buckets[i])) / Math.max(1, remainIdx.filter((i) => P.buckets[i]?.n).length);
      for (const i of remainIdx) per[i] = (P.buckets[i]?.n ? fn(P.buckets[i]) : lyAvg) * trend;
      methods.add("ly");
    } else {
      const avg = done / Math.max(1, ti);
      for (const i of remainIdx) per[i] = avg;
      methods.add("avg");
    }
    per[ti] *= 1 - dayFrac;
    fc[k] = { actual, per, actualSum: sum(actual), fcSum: sum(per) };
  }
  const fixedYear = ((settings.fixed_elec_month || 0) + (settings.fixed_gas_month || 0)) * 12 - (settings.tax_reduction_year || 0);
  const fixedDay = fixedYear / n;
  const varActual = fc.elec.actualSum + fc.gas.actualSum;
  const varFc = fc.elec.fcSum + fc.gas.fcSum;
  const expected = varActual + varFc + fixedYear;
  const monthly = settings.monthly_payment;
  const paidYear = monthly * 12;
  const termsPaid = Math.min(12, monthsBetween(data.w.s, new Date()) + 1);
  const paidSoFar = monthly * termsPaid;
  const diff = paidYear - expected;
  const remainingTerms = 12 - termsPaid;
  const neededMonthly = remainingTerms > 0 ? (expected - paidSoFar) / remainingTerms : null;
  const soFar = varActual + fixedDay * (ti + dayFrac);
  const good = diff >= 0;
  body.innerHTML = `
    <div class="bill-tiles">
      <div class="hero" style="--status:var(${good ? "--good" : "--bad"});--status-ink:var(${good ? "--good" : "--bad"})">
        <div class="l">${good ? "✓ Verwacht terug te krijgen" : "! Verwacht bij te betalen"}</div>
        <div class="v">${money(Math.abs(diff), 0)}</div>
        <div class="s">bij de jaarafrekening</div>
      </div>
      <div><div class="l">Verwachte jaarkosten</div><div class="v">${money(expected, 0)}</div>
        <div class="s">stroom ${money(fc.elec.actualSum + fc.elec.fcSum, 0)} · gas ${money(fc.gas.actualSum + fc.gas.fcSum, 0)} · vast ${money(fixedYear, 0)}</div></div>
      <div><div class="l">Termijnen</div><div class="v">${money(paidYear, 0)}</div>
        <div class="s">${money(monthly)} per maand · ${termsPaid} van 12 betaald</div></div>
      <div><div class="l">Kosten tot nu</div><div class="v">${money(soFar, 0)}</div>
        <div class="s">dag ${ti + 1} van ${n} · betaald ${money(paidSoFar, 0)}</div></div>
      <div><div class="l">Advies termijnbedrag</div><div class="v">${neededMonthly != null ? money(Math.max(0, neededMonthly), 0) : money(expected / 12, 0)}</div>
        <div class="s">${neededMonthly != null ? `om op € 0 uit te komen, voor de resterende ${remainingTerms} ${remainingTerms === 1 ? "termijn" : "termijnen"}` : "per maand voor het volgende jaar"}</div></div>
    </div>
    <p class="bill-note">${methods.has("ly") && !methods.has("avg") ? "Prognose: je verbruik van dezelfde periode vorig jaar, gecorrigeerd voor hoe je dit jaar tot nu toe verbruikt." : methods.has("ly") ? "Prognose deels op vorig jaar, deels op je gemiddelde tot nu toe (nog geen volledige historie)." : "Nog geen volledig jaar historie: de prognose gebruikt je gemiddelde tot nu toe, zonder seizoenseffecten (gas in de winter). Hij wordt nauwkeuriger naarmate er meer data is."} Prijswijzigingen in je contract worden alleen meegenomen als je ze ook in de Energie-instellingen aanpast.</p>`;

  // Cumulative chart: actual, forecast, payments
  const act = [], fcs = [], pay = [];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    const t = starts[i] + 864e5;
    if (i <= ti) {
      cum += fc.elec.actual[i] + fc.gas.actual[i] + fixedDay * (i === ti ? dayFrac : 1);
      act.push([Math.min(t, now), cum]);
      if (i === ti) fcs.push([Math.min(t, now), cum]);
    }
    if (i >= ti) {
      cum += fc.elec.per[i] + fc.gas.per[i] + fixedDay * (i === ti ? 1 - dayFrac : 1);
      fcs.push([t, cum]);
    }
    pay.push([starts[i], monthly * Math.min(12, monthsBetween(data.w.s, new Date(starts[i])) + 1)]);
  }
  pay.push([data.w.e.getTime(), paidYear]);
  $("#chart-bill").hidden = false;
  setChart("chart-bill", {
    ...base(),
    legend: legend(),
    tooltip: tooltipBase({
      trigger: "axis",
      formatter: (ps) =>
        `<div style="font-weight:600;margin-bottom:4px">${new Date(ps[0].value[0]).toLocaleDateString(LOCALE, { day: "numeric", month: "long", year: "numeric" })}</div>` +
        ps.map((p) => `<div style="display:flex;justify-content:space-between;gap:18px"><span>${swatch(p.color)}${esc(p.seriesName)}</span><b>${money(p.value[1], 0)}</b></div>`).join(""),
    }),
    xAxis: { type: "time", axisLine: { lineStyle: { color: css("--axis") } }, axisTick: { show: false }, axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => MONTHS[new Date(v).getMonth()] }, splitLine: { show: false } },
    yAxis: valAxis((v) => money(v, 0)),
    series: [
      { name: "Kosten tot nu", type: "line", data: act, symbol: "none", lineStyle: { width: 2.5, color: css("--grid-in") }, itemStyle: { color: css("--grid-in") }, areaStyle: { color: css("--grid-in"), opacity: 0.08 } },
      { name: "Prognose", type: "line", data: fcs, symbol: "none", lineStyle: { width: 2, type: "dashed", color: css("--grid-in") }, itemStyle: { color: css("--grid-in") } },
      { name: "Betaalde termijnen", type: "line", step: "end", data: pay, symbol: "none", lineStyle: { width: 2, color: css("--ink-2") }, itemStyle: { color: css("--ink-2") } },
    ],
  });
}

function openBillForm(open) {
  const f = $("#bill-form");
  f.hidden = !open;
  if (!open) return;
  for (const el of f.querySelectorAll("input")) el.value = settings[el.name] ?? "";
  $("#bill-save-msg").textContent = "";
}
async function saveBillForm(e) {
  e.preventDefault();
  const data = {};
  for (const el of $("#bill-form").querySelectorAll("input")) if (el.value !== "") data[el.name] = el.type === "number" ? Number(el.value) : el.value;
  try {
    settings = await api.saveSettings(data);
    openBillForm(false);
    billCache.key = null;
    billData = await loadBill();
    renderBill(billData);
  } catch (err) {
    $("#bill-save-msg").textContent = `Opslaan mislukt: ${err.message}`;
  }
}

/* ---------- Appliance cycles ---------- */
const CYCLE_RE = /was|droger|droog|vaatwas|dish|wash|dryer|oven|airfryer/i;
const cycleCache = new Map();
async function loadCycles() {
  const devs = model.devices.filter((d) => CYCLE_RE.test(devName(d)));
  if (!devs.length) return null;
  const end = new Date(Math.min(D.end.getTime(), Date.now()));
  end.setMinutes(0, 0, 0);
  const key = `${D.start.getTime()}-${end.getTime()}`;
  if (!cycleCache.has(key)) {
    const ids = [...devs.map((d) => d.id), ...model.gridIn.flatMap((g) => [g.id, g.cost]), ...model.gridOut.map((g) => g.id)];
    const raw = await stats(ids, D.start, end, "hour", { energy: "kWh" });
    const C = compute(model, raw, [D.start.getTime()]);
    cycleCache.set(key, {
      devs,
      days: Math.max(1 / 24, (end - D.start) / 864e5),
      runs: Object.fromEntries(devs.map((d) => [d.id, detectRuns(C.records, d.id)])),
    });
  }
  return cycleCache.get(key);
}
/** A run = consecutive hours above the device's standby level (1 quiet hour inside a run is allowed). */
function detectRuns(records, id) {
  const pts = records.map((r) => ({ ts: r.ts, e: clamp0(r.dev[id] || 0), c: r.devCost[id] || 0, r }));
  if (pts.length < 3) return [];
  const sorted = pts.map((p) => p.e).sort((a, b) => a - b);
  const standby = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const thr = Math.max(0.05, standby * 3 + 0.02);
  const runs = [];
  let cur = null;
  const addHour = (p) => {
    const w = tariffWeights(p.r, true);
    cur.kwh += clamp0(p.e - standby);
    cur.raw += p.e;
    cur.cost += p.c;
    cur.dal += (w.dal || 0) * p.e;
    cur.end = p.ts;
    cur.hours++;
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (cur && p.ts - cur.end > 1.5 * 3600e3) (runs.push(cur), (cur = null));
    if (p.e > thr) {
      if (!cur) cur = { start: p.ts, end: p.ts, kwh: 0, raw: 0, cost: 0, dal: 0, hours: 0 };
      addHour(p);
    } else if (cur) {
      const nx = pts[i + 1];
      if (nx && nx.e > thr && nx.ts - p.ts <= 1.5 * 3600e3) addHour(p);
      else (runs.push(cur), (cur = null));
    }
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => r.kwh >= 0.1);
}
function updateCycleChips() {
  $$("[data-cycle-now]").forEach((el) => {
    const w = liveDevW[el.dataset.cycleNow];
    el.hidden = !(w > 10);
    if (w > 10) el.textContent = `draait nu · ${num(w, 0)} W`;
  });
}
function renderCycles(data) {
  const card = $("#card-cycles");
  card.hidden = !data;
  if (!data) return;
  const hasDal = (model.tariffKeys || []).includes("dal");
  const withCost = D.C.havePrice;
  const fmtStart = (ts) => {
    const d = new Date(ts);
    return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getHours()).padStart(2, "0")}:00`;
  };
  const rows = data.devs.map((d) => {
    const runs = data.runs[d.id] || [];
    const kwhT = sum(runs, (r) => r.kwh), costT = sum(runs, (r) => r.cost), rawT = sum(runs, (r) => r.raw), dalT = sum(runs, (r) => r.dal);
    const hours = runs.map((r) => new Date(r.start).getHours()).sort((a, b) => a - b);
    const last = runs[runs.length - 1];
    return `<tr>
      <td><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:6px;background:${css(d.slot)}"></span>${esc(devName(d))}<span class="chip" data-cycle-now="${esc(d.id)}" hidden></span></td>
      <td>${runs.length}</td>
      ${data.days >= 7 ? `<td>${num(runs.length / (data.days / 7), 1)}</td>` : ""}
      <td>${runs.length ? kwh(kwhT / runs.length) : "–"}</td>
      ${withCost ? `<td>${runs.length ? money(costT / runs.length) : "–"}</td><td>${money(costT)}</td>` : ""}
      ${hasDal ? `<td>${rawT > 0 ? pct(dalT / rawT) : "–"}</td>` : ""}
      <td>${hours.length ? `${String(hours[Math.floor(hours.length / 2)]).padStart(2, "0")}:00` : "–"}</td>
      <td>${last ? fmtStart(last.start) : "–"}</td></tr>`;
  });
  const head = ["Apparaat", "Beurten", ...(data.days >= 7 ? ["Per week"] : []), "kWh per beurt", ...(withCost ? ["Kosten per beurt", "Kosten totaal"] : []), ...(hasDal ? ["In dal"] : []), "Meestal om", "Laatste keer"];
  $("#cycles-table").innerHTML = `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  updateCycleChips();

  const series = data.devs.map((d, si) => ({
    name: devName(d),
    type: "scatter",
    data: (data.runs[d.id] || []).map((r) => {
      const t = new Date(r.start);
      return { value: [r.start, t.getHours() + 0.5], run: r };
    }),
    symbolSize: (v, p) => Math.max(9, Math.min(22, 8 + (p.data.run.kwh || 0) * 6)),
    itemStyle: { color: css(d.slot), borderColor: css("--surface"), borderWidth: 2, opacity: 0.9 },
    ...(si === 0
      ? {
          markArea: {
            silent: true,
            itemStyle: { color: css("--ink-2"), opacity: 0.06 },
            label: { color: css("--muted"), fontSize: 11, position: "insideTopLeft" },
            data: [[{ yAxis: 0, name: "dal" }, { yAxis: 7 }], [{ yAxis: 23, name: "dal" }, { yAxis: 24 }]],
          },
        }
      : {}),
  }));
  setChart("chart-cycles", {
    ...base(),
    legend: legend(),
    tooltip: tooltipBase({
      trigger: "item",
      formatter: (p) => {
        const r = p.data.run;
        return `<b>${esc(p.seriesName)}</b><br>${fmtStart(r.start)} · ${r.hours} uur<br>${kwh(r.kwh)}${withCost ? ` · ${money(r.cost)}` : ""}${hasDal ? `<br>${pct(r.dal / (r.raw || 1))} in daltarief` : ""}`;
      },
    }),
    xAxis: { type: "time", min: D.start.getTime(), max: D.end.getTime(), axisLine: { lineStyle: { color: css("--axis") } }, axisTick: { show: false }, axisLabel: { color: css("--muted"), fontSize: 11, hideOverlap: true }, splitLine: { show: false } },
    yAxis: { type: "value", min: 0, max: 24, interval: 3, inverse: true, axisLabel: { color: css("--muted"), fontSize: 11, formatter: (v) => `${String(v).padStart(2, "0")}:00` }, splitLine: { lineStyle: { color: css("--grid") } } },
    series,
  });
}

/* ---------- Insights ---------- */
function renderInsights() {
  const T = D.C.total, B = D.C.buckets, out = [];
  const add = (ico, title, text) => out.push(`<li><span class="ico" aria-hidden="true">${ico}</span><div><b>${title}</b><span>${text}</span></div></li>`);
  const prices = D.C.prices || {};
  const avgPrice = T.home > 0 && T.homeCost > 0 ? T.homeCost / T.home : model.hasCost && T.fromGrid > 0 ? T.cost / T.fromGrid : null;
  const unitName = S.period === "day" ? "uur" : S.period === "year" ? "maand" : "dag";
  const recs = D.profileRecs || [];

  // Standby load (last 4 weeks)
  if (recs.length > 48) {
    const watts = recs.map((r) => r.home * 1000).sort((a, b) => a - b);
    const base = watts[Math.floor(watts.length * 0.05)];
    const yearKwh = (base * 8760) / 1000;
    add("🌙", `Sluipverbruik ≈ ${num(base, 0)} W`, `Dat is ongeveer ${num(yearKwh, 0)} kWh per jaar${avgPrice ? ` (≈ ${money(yearKwh * avgPrice, 0)})` : ""}. Gemeten als het laagste uurverbruik van de afgelopen 4 weken. Elke 10 W minder scheelt ${num(87.6, 0)} kWh per jaar.`);
  }
  // Dal vs piek
  const dal = T.homeTariff?.dal || 0, piek = T.homeTariff?.piek || 0;
  if (dal + piek > 0.1) {
    let text = `${kwh(dal)} in het daltarief en ${kwh(piek)} in het piektarief.`;
    if (prices.dal != null && prices.piek != null && prices.piek > prices.dal) {
      text += ` Piek is ${money(prices.piek - prices.dal, 3)} per kWh duurder.`;
      if (T.shiftPiek > 0.05) text += ` Wasmachine, droger en vaatwasser draaiden ${kwh(T.shiftPiek)} in piekuren — in het dal had dat ${money(T.shiftPiek * (prices.piek - prices.dal))} gescheeld.`;
    }
    add("🕐", `${pct(dal / (dal + piek))} van je verbruik viel in het daltarief`, text);
  }
  // Peak moment
  if (T.home > 0) {
    const pi = B.reduce((bi, b, i) => (b.home > B[bi].home ? i : bi), 0);
    add("📈", `Hoogste verbruik: ${D.buckets[pi].title}`, `${kwh(B[pi].home)} in ${unitName === "dag" || unitName === "maand" ? "die" : "dat"} ${unitName}, ${pct(B[pi].home / T.home)} van het totaal deze periode.`);
    const filled = B.filter((b) => b.n && b.home > 0);
    if (filled.length > 3 && S.period !== "day") {
      const lo = filled.reduce((a, b) => (b.home < a.home ? b : a));
      const li = B.indexOf(lo);
      add("📉", `Zuinigste ${unitName}: ${D.buckets[li].title}`, `${kwh(lo.home)} — ${pct(1 - lo.home / (T.home / filled.length))} onder je gemiddelde.`);
    }
  }
  // Devices
  if (model.devices.length && T.home > 0) {
    const top = model.devices.filter((d) => !d.parent);
    const byKwh = [...top].sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0))[0];
    const v = T.dev[byKwh?.id] || 0;
    if (v > 0) add("🔌", `Grootste verbruiker: ${esc(devName(byKwh))}`, `${kwh(v)} (${pct(v / T.home)} van je verbruik)${D.C.havePrice ? `, ${money(T.devCost[byKwh.id] || 0)}` : ""}.`);
    const tracked = sum(top, (d) => T.dev[d.id] || 0);
    const untracked = clamp0(T.home - tracked) / T.home;
    if (untracked > 0.35)
      add("🔍", `${pct(untracked)} van je verbruik wordt niet apart gemeten`, "Een paar slimme stekkers (bijv. bij koelkast, tv-meubel of bureau) maken zichtbaar waar die stroom heen gaat.");
  }
  // Weekend vs weekdays and night share (last 4 weeks)
  if (recs.length > 24 * 10) {
    const days = new Map();
    for (const r of recs) {
      const d = new Date(r.ts);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const e = days.get(k) || { kwh: 0, n: 0, we: d.getDay() === 0 || d.getDay() === 6 };
      e.kwh += r.home;
      e.n++;
      days.set(k, e);
    }
    const full = [...days.values()].filter((e) => e.n >= 23);
    const we = full.filter((e) => e.we), wd = full.filter((e) => !e.we);
    if (we.length && wd.length) {
      const a = sum(we, (e) => e.kwh) / we.length, b = sum(wd, (e) => e.kwh) / wd.length;
      const d = (a - b) / b;
      add("📅", Math.abs(d) < 0.05 ? "Weekend en doordeweeks zijn vrijwel gelijk" : `In het weekend ${pct(Math.abs(d))} ${d > 0 ? "meer" : "minder"} verbruik`, `Gemiddeld ${kwh(a)} per weekenddag tegenover ${kwh(b)} doordeweeks (laatste 4 weken).`);
    }
    const night = sum(recs.filter((r) => new Date(r.ts).getHours() < 6), (r) => r.home);
    const all = sum(recs, (r) => r.home);
    if (all > 0) add("🦉", `${pct(night / all)} van je stroom gebruik je tussen 0:00 en 6:00`, `Dat is gemiddeld ${num((night / Math.max(1, recs.filter((r) => new Date(r.ts).getHours() < 6).length)) * 1000, 0)} W terwijl iedereen slaapt.`);
  }
  // Solar
  if (model.hasSolar && T.solar > 0) {
    const sc = (T.solar - T.solarToGrid) / T.solar;
    add("☀️", `${pct(sc)} van je zonnestroom zelf gebruikt`, T.solarToGrid > 0.1 ? `${kwh(T.solarToGrid)} ging naar het net. Zet wasmachine, droger en vaatwasser bij voorkeur aan als de zon schijnt.` : "Vrijwel alle opwek is direct in huis gebruikt.");
    const self = T.home > 0 ? (T.home - T.gridToHome) / T.home : 0;
    if (self > 0) add("🏡", `${pct(self)} van je verbruik kwam van je eigen dak`, `${kwh(T.home - T.gridToHome)} van de ${kwh(T.home)} hoefde niet van het net te komen.`);
  }
  if (model.hasBattery && T.batIn > 0.1) {
    const eff = T.batOut / T.batIn;
    add("🔋", `Batterij dekte ${pct(T.batToHome / (T.home || 1))} van je verbruik`, `${kwh(T.batIn)} geladen (${pct(T.solarToBat / T.batIn)} uit zon), ${kwh(T.batOut)} ontladen${eff > 0.5 && eff < 1.05 && S.period !== "day" ? `; rendement ≈ ${pct(eff)}` : ""}.`);
  }
  // Compared to previous period
  if (S.compare && D.Pcut && D.Pcut.total.home > 0 && T.home > 0) {
    const d = (T.home - D.Pcut.total.home) / D.Pcut.total.home;
    if (Math.abs(d) > 0.03)
      add(d < 0 ? "✅" : "⚠️", `${num(Math.abs(d) * 100, 0)}% ${d < 0 ? "minder" : "meer"} verbruik dan ${PREV_NAME[S.period]}`, `${kwh(T.home)} tegenover ${kwh(D.Pcut.total.home)}${D.inProgress ? " op hetzelfde tijdstip" : ""}.`);
  }
  // Gas & water
  const days = Math.max(1, (Math.min(Date.now(), D.end) - D.start) / 864e5);
  if (model.gas.length && T.gas > 0 && S.period !== "day") {
    add("🔥", `Gemiddeld ${unitFmt(T.gas / days, gasUnit())} gas per dag`, D.Pcut?.total.gas ? `${PREV_NAME[S.period][0].toUpperCase() + PREV_NAME[S.period].slice(1)}: ${unitFmt(D.Pcut.total.gas / days, gasUnit())} per dag.` : "");
  }
  const hh = api.options?.household_size || 0;
  if (model.water.length && T.water > 0 && S.period !== "day") {
    const perDay = T.water / days;
    add("💧", hh ? `${num(perDay / hh, 0)} L water per persoon per dag` : `${num(perDay, 0)} L water per dag`, hh ? `Een gemiddelde Nederlander gebruikt ongeveer 125 L per dag${perDay / hh < 125 ? " — jullie zitten daaronder." : "."}` : "Een gemiddelde Nederlander gebruikt ongeveer 125 L per dag. Vul in de app-opties je huishoudgrootte in voor een vergelijking per persoon.");
  }
  $("#insights").innerHTML = out.length ? out.join("") : `<li><div class="empty">Nog te weinig gegevens voor inzichten.</div></li>`;
}

/* ---------- Fun facts (rounded rules of thumb) ---------- */
const FACT = {
  phoneKwh: 0.015, // full smartphone charge ≈ 15 Wh
  teaKwh: 0.03, // one cup of tea in a kettle
  evKwhPerKm: 0.18,
  ledW: 8,
  co2PerKwh: 0.3, // kg CO2 per kWh, Dutch electricity mix (approx.)
  co2PerM3Gas: 1.78, // kg CO2 per m3 natural gas
  kwhPerM3Gas: 8.8, // energy content of 1 m3 Groningen-quality gas
  treeKgPerYear: 20,
  showerL: 60,
  bathL: 120,
  nlKwhYear: 2500, // average Dutch household, rounded
  nlGasYear: 1000,
};
function renderFacts() {
  const T = D.C.total, out = [];
  const add = (big, title, text) => out.push(`<li><span class="big" aria-hidden="true">${big}</span><div><b>${title}</b><span>${text}</span></div></li>`);
  const days = Math.max(1 / 24, (Math.min(Date.now(), D.end) - D.start) / 864e5);
  const big = (v) => num(v, v < 10 ? 1 : 0);
  if (T.home > 0) {
    add("📱", `${big(T.home / FACT.phoneKwh)}× je telefoon opladen`, `Zoveel energie zit er in je stroomverbruik van ${kwh(T.home)}.`);
    add("☕", `${big(T.home / FACT.teaKwh)} koppen thee`, "zou je kunnen zetten met dezelfde hoeveelheid stroom.");
    add("🚗", `${big(T.home / FACT.evKwhPerKm)} km elektrisch rijden`, "Zo ver komt een gemiddelde elektrische auto op je verbruik van deze periode.");
    const avgW = (T.home * 1000) / (days * 24);
    add("💡", `${big(avgW / FACT.ledW)} ledlampen die continu branden`, `Je huis verbruikte gemiddeld ${num(avgW, 0)} W — evenveel als zoveel ledlampen van ${FACT.ledW} W.`);
  }
  if (model.hasSolar && T.solar > 0) {
    const co2 = T.solar * FACT.co2PerKwh;
    add("🌳", `≈ ${big(co2)} kg CO₂ bespaard`, `door je zonnepanelen — wat ${big(co2 / (FACT.treeKgPerYear * (days / 365)))} bomen in dezelfde tijd opnemen.`);
    const homePerDay = T.home / days;
    if (homePerDay > 0 && S.period !== "day")
      add("🔆", `${big(T.solar / homePerDay)} dagen stroom`, `Je panelen wekten genoeg op om je huis ${big(T.solar / homePerDay)} gemiddelde dagen van stroom te voorzien.`);
  }
  if (model.gas.length && T.gas > 0 && gasUnit() === "m³") {
    add("🔥", `${big(T.gas * FACT.kwhPerM3Gas)} kWh aan warmte`, `Je ${unitFmt(T.gas, "m³")} gas bevat ${T.home > 0 ? `${big((T.gas * FACT.kwhPerM3Gas) / T.home)}× zoveel energie als je stroomverbruik` : "veel energie"}, en gaf ≈ ${big(T.gas * FACT.co2PerM3Gas)} kg CO₂.`);
  }
  if (model.water.length && T.water > 0) {
    add("🚿", `${big(T.water / FACT.showerL)} douchebeurten`, `${waterFmt(T.water).join(" ")} water is ongeveer ${big(T.water / FACT.bathL)} volle badkuipen.`);
  }
  if ((S.period === "month" || S.period === "year") && days >= 7 && T.home > 0) {
    const yearKwh = (T.home / days) * 365;
    add("🇳🇱", `≈ ${num(yearKwh, 0)} kWh per jaar`, `In dit tempo verbruik je ${yearKwh < FACT.nlKwhYear ? `${pct(1 - yearKwh / FACT.nlKwhYear)} minder` : `${pct(yearKwh / FACT.nlKwhYear - 1)} meer`} stroom dan een gemiddeld Nederlands huishouden (grofweg ${num(FACT.nlKwhYear, 0)} kWh).`);
  }
  $("#facts").innerHTML = out.length ? out.join("") : `<li><div class="empty">Nog geen gegevens.</div></li>`;
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
/** Find a live power sensor (W) per device: Energy settings → app option → same HA device. */
async function resolveDevicePower() {
  const map = {};
  for (const d of model.devices) if (d.rate) map[d.id] = d.rate;
  for (const line of api.options?.device_power_entities || []) {
    const [e, pw] = String(line).split("=").map((x) => x.trim());
    if (e && pw) map[e] = pw;
  }
  const missing = model.devices.filter((d) => !map[d.id]).map((d) => d.id);
  if (missing.length && api.devicePower) {
    const auto = await api.devicePower(missing).catch(() => ({}));
    for (const id of missing) if (auto?.[id]) map[id] = auto[id];
  }
  model.devicePower = map;
}
function setupLive() {
  const E = liveEntities();
  const devPower = model.devicePower || {};
  const devs = model.devices.filter((d) => devPower[d.id]);
  const ids = [...new Set([...Object.values(E), ...devs.map((d) => devPower[d.id])].filter(Boolean))];
  const show = !!E.grid || devs.length > 0;
  $("#card-live").hidden = !show;
  clearInterval(liveTimer);
  if (!show) return;
  const tick = async () => {
    try {
      const st = await api.states(ids);
      const w = (id) => {
        const s = st[id];
        if (!s || isNaN(parseFloat(s.state))) return 0;
        const v = parseFloat(s.state);
        return /^kW$/i.test(s.unit || "") ? v * 1000 : /^MW$/i.test(s.unit || "") ? v * 1e6 : v;
      };
      const grid = E.grid ? w(E.grid) - (E.gridExport ? w(E.gridExport) : 0) : null;
      const solar = E.solar ? Math.max(0, w(E.solar)) : 0;
      const battery = E.battery ? w(E.battery) : 0;
      const soc = E.soc && st[E.soc] ? parseFloat(st[E.soc].state) : null;
      const dev = {};
      for (const d of devs) dev[d.id] = Math.max(0, w(devPower[d.id]));
      // Freshness: a sensor that shows real power but has not reported for a while is suspect.
      const ageOf = (id) => {
        const t = Date.parse(st[id]?.last_reported || st[id]?.last_updated || "");
        return Number.isFinite(t) ? Math.max(0, Date.now() - t) : null;
      };
      const fresh = (list) => {
        let age = null, stale = false;
        for (const id of list.filter(Boolean)) {
          const a = ageOf(id);
          if (a == null) continue;
          age = Math.max(age ?? 0, a);
          if (a > LIVE_STALE_MS && Math.abs(w(id)) > 5) stale = true;
        }
        return { age, stale };
      };
      const freshness = {
        grid: fresh([E.grid, E.gridExport]),
        solar: fresh([E.solar]),
        battery: fresh([E.battery]),
        dev: Object.fromEntries(devs.map((d) => [d.id, fresh([devPower[d.id]])])),
      };
      drawLive({ grid, solar, battery, soc, hasSolar: !!E.solar, hasBattery: !!E.battery, devs, dev, freshness });
      liveDevW = dev;
      updateCycleChips();
      $("#live-updated").textContent = `bijgewerkt ${new Date().toLocaleTimeString(LOCALE)}`;
    } catch (e) {
      $("#live-updated").textContent = "geen live-data";
    }
  };
  tick();
  liveTimer = setInterval(tick, Math.max(2, api.options?.live_refresh_seconds || 5) * 1000);
}
const LIVE_STALE_MS = 5 * 60e3;
function fmtAge(ms) {
  if (ms == null) return "";
  if (ms < 60e3) return `${Math.round(ms / 1000)} s`;
  if (ms < 3600e3) return `${Math.round(ms / 60e3)} min`;
  return `${num(ms / 3600e3, 1)} uur`;
}
function drawLive({ grid, solar, battery, soc, hasSolar, hasBattery, devs, dev, freshness = { dev: {} } }) {
  const W = (v) => (Math.abs(v) >= 1000 ? `${num(v / 1000, 2)} kW` : `${num(v, 0)} W`);
  const hasGrid = grid != null;
  const f = hasGrid ? decompose({ fromGrid: clamp0(grid), toGrid: clamp0(-grid), solar, batOut: clamp0(battery), batIn: clamp0(-battery) }) : null;

  // Device rows (top-level first, children indented under their parent)
  let rows = [];
  const add = (d, depth) => {
    rows.push({ d, depth, w: dev[d.id] || 0, fr: freshness.dev?.[d.id] });
    devs.filter((c) => c.parent === d.id).forEach((c) => add(c, depth + 1));
  };
  devs.filter((d) => !d.parent || !devs.some((x) => x.id === d.parent)).forEach((d) => add(d, 0));
  const topW = sum(rows.filter((r) => r.depth === 0), (r) => r.w);
  const homeW = hasGrid ? f.home : topW;
  // Devices can never use more than the whole home; if they do, the sensors disagree.
  const mismatch = hasGrid && rows.length > 0 && topW - homeW > Math.max(40, 0.1 * homeW);
  if (hasGrid && rows.length) rows.push({ d: null, depth: 0, w: clamp0(homeW - topW), unknown: mismatch });
  const valText = (r) => (r.unknown ? "?" : W(r.w));
  const staleText = (r) => (r.fr?.stale ? `⏱ ${fmtAge(r.fr.age)}` : "");
  const ageTitle = (fr) => (fr?.age != null ? ` · laatste meting ${fmtAge(fr.age)} geleden` : "");
  const compact = $("#live-flow").clientWidth < 640 && hasGrid;
  const allRows = rows;
  if (compact) rows = [];

  const rowH = 36, VBW = rows.length ? 920 : 470;
  const H = Math.max(rows.length ? 300 : 340, 30 + rows.length * rowH);
  const cy = H / 2 + (hasSolar && hasGrid ? 30 : 0);
  const P = rows.length
    ? { grid: [80, cy], home: [380, cy], solar: [230, Math.max(50, cy - 135)], battery: [230, Math.min(H - 50, cy + 135)] }
    : { grid: [70, 170], home: [390, 170], solar: [230, 55], battery: [230, 285] };
  if (!hasGrid) P.home = [110, cy];
  const flowPath = (d, val, color) => {
    const on = val > 3;
    const dur = on ? Math.max(0.6, 4 - Math.log10(val + 1)) : 0;
    const width = on ? Math.min(6, 2 + val / 1500) : 0;
    return `<path class="base" d="${d}"/>${on ? `<path class="flow" d="${d}" stroke="${color}" stroke-width="${width}" style="animation-duration:${dur}s"><title>${W(val)}</title></path>` : ""}`;
  };
  const edge = (a, b, val, color, bend = 0) => {
    const [x1, y1] = P[a], [x2, y2] = P[b];
    return flowPath(`M${x1},${y1} Q${(x1 + x2) / 2 + bend},${(y1 + y2) / 2 + bend} ${x2},${y2}`, val, color);
  };
  const node = (k, label, value, color, sub = "", fr = null) =>
    `<g class="node" transform="translate(${P[k][0]},${P[k][1]})"><title>${label}: ${value}${ageTitle(fr)}</title><circle r="44" stroke="${color}"/><text class="t2" y="-10">${label}</text><text class="t1" y="9">${value}</text>${sub ? `<text class="t2" y="25">${sub}</text>` : ""}${fr?.stale ? `<text class="stale-t" y="62">⏱ ${fmtAge(fr.age)} geen update</text>` : ""}</g>`;

  let edges = "";
  if (hasGrid) {
    edges += edge("grid", "home", f.gridToHome, css("--grid-in"));
    if (hasSolar) edges += edge("solar", "home", f.solarToHome, css("--solar")) + edge("solar", "grid", f.solarToGrid, css("--export"));
    if (hasSolar && hasBattery) edges += edge("solar", "battery", f.solarToBat, css("--charge"), -40);
    if (hasBattery) edges += edge("battery", "home", f.batToHome, css("--battery")) + edge("grid", "battery", f.gridToBat, css("--charge")) + edge("battery", "grid", f.batToGrid, css("--export"), 30);
  }
  // Device pills
  const x0 = 560, pillW = 340, maxW = Math.max(1, ...rows.map((r) => r.w));
  const top0 = (H - rows.length * rowH) / 2 + 4;
  let pills = "";
  const parentY = {};
  rows.forEach((r, i) => {
    const y = top0 + i * rowH, x = x0 + r.depth * 26, w = pillW - r.depth * 26, mid = y + 14;
    const color = r.d ? css(r.d.slot) : css("--other");
    if (r.depth === 0) {
      const [hx, hy] = P.home;
      edges += flowPath(`M${hx + 44},${hy} C${hx + 120},${hy} ${x - 90},${mid} ${x},${mid}`, r.w, color);
    } else {
      const py = parentY[r.d.parent] ?? mid;
      edges += flowPath(`M${x - 14},${py + 14} L${x - 14},${mid} L${x},${mid}`, r.w, color);
    }
    if (r.d) parentY[r.d.id] = y;
    const name = r.d ? devName(r.d) : "Niet apart gemeten";
    const tip = r.unknown ? `${name}: onbekend — de apparaten samen (${W(topW)}) verbruiken meer dan het huis (${W(homeW)})` : `${name}: ${W(r.w)}${ageTitle(r.fr)}`;
    pills += `<g class="pill${r.fr?.stale || r.unknown ? " stale" : ""}" transform="translate(${x},${y})"><title>${esc(tip)}</title>
      <rect class="bg" width="${w}" height="28" rx="14"/>
      <rect width="${Math.max(0, (r.w / maxW) * (w - 4))}" height="24" x="2" y="2" rx="12" fill="${color}" opacity="0.22"/>
      <circle cx="16" cy="14" r="5" fill="${color}"/>
      <text x="28" y="15" class="${r.w < 3 ? "muted" : ""}">${esc(name.length > 30 ? name.slice(0, 29) + "…" : name)}</text>
      ${r.fr?.stale ? `<text x="${w - 74}" y="15" class="w stale-t">${staleText(r)}</text>` : ""}
      ${r.unknown ? `<text x="${w - 30}" y="15" class="w stale-t">apparaten &gt; huis</text>` : ""}
      <text x="${w - 12}" y="15" class="w ${r.w < 3 && !r.unknown ? "muted" : ""}">${valText(r)}</text></g>`;
  });
  const nodes = [
    hasGrid ? node("grid", "Net", W(Math.abs(grid)), css("--grid-in"), grid < -5 ? "teruglevering" : grid > 5 ? "afname" : "", freshness.grid) : "",
    node("home", "Thuis", W(homeW), css("--home"), hasGrid ? "" : "gemeten apparaten"),
    hasGrid && hasSolar ? node("solar", "Zon", W(solar), css("--solar"), "", freshness.solar) : "",
    hasGrid && hasBattery ? node("battery", "Batterij", W(Math.abs(battery)), css("--battery"), soc != null && !isNaN(soc) ? `${num(soc, 0)}% · ${battery > 5 ? "ontladen" : battery < -5 ? "laden" : "rust"}` : "", freshness.battery) : "",
  ].join("");
  let list = "";
  if (compact && allRows.length) {
    const mx = Math.max(1, ...allRows.map((r) => r.w));
    list = `<div class="device-list" style="max-height:none;margin-top:8px">${allRows
      .map((r) => {
        const color = r.d ? css(r.d.slot) : css("--other");
        return `<div class="dev ${r.depth ? "child" : ""}"><span class="dot" style="background:${color}"></span><span class="name">${esc(r.d ? devName(r.d) : "Niet apart gemeten")}</span><span class="bar"><span style="width:${(r.w / mx) * 100}%;background:${color}"></span></span><span class="val">${r.fr?.stale ? `<small class="stale-t">${staleText(r)}</small> ` : ""}${valText(r)}</span></div>`;
      })
      .join("")}</div>`;
  }
  $("#live-flow").innerHTML = `<svg viewBox="0 0 ${VBW} ${H}" role="img" aria-label="Live energiestroom per apparaat" style="max-height:${Math.max(340, H)}px;${compact ? "min-width:0" : ""}">${edges}${nodes}${pills}</svg>${list}`;
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
  renderTariff();
  renderUtility("gas");
  renderUtility("water");
  renderInsights();
  renderFacts();
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
      loadProfile().then((r) => (D.profileRecs = r)).catch((e) => console.warn("profile", e)),
      loadBill().then((b) => renderBill((billData = b))).catch((e) => (console.warn("bill", e), renderBill(null))),
      loadCycles().then((c) => renderCycles((cycleData = c))).catch((e) => console.warn("cycles", e)),
      renderCalendar().catch((e) => console.warn("calendar", e)),
    ]);
    renderInsights();
    renderFacts();
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
    cycleCache.clear();
    billCache.key = null;
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
      renderCalendar().catch(() => {});
      renderBill(billData);
      renderCycles(cycleData);
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
  $("#bill-edit").addEventListener("click", () => openBillForm($("#bill-form").hidden));
  $("#bill-cancel").addEventListener("click", () => openBillForm(false));
  $("#bill-form").addEventListener("submit", saveBillForm);
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
    classifyTariffs(model);
    co2Entity = api.options?.co2_signal_entity || (await api.autodetect().catch(() => ({}))).co2_signal_entity || "";
    settings = (await api.getSettings?.().catch(() => ({}))) || {};
    await resolveDevicePower();
    const priceEnts = model.gridIn.map((g) => g.priceEntity).filter(Boolean);
    if (priceEnts.length) {
      const st = await api.states(priceEnts).catch(() => ({}));
      for (const id of priceEnts) if (st[id] && !isNaN(parseFloat(st[id].state))) livePrices[id] = parseFloat(st[id].state);
    }
    setupLive();
    await reload();
  } catch (e) {
    console.error(e);
    banner(`Kon geen verbinding maken met Home Assistant: ${esc(e.message)}`);
    loading(false);
  }
}

init();
