// Demo mode: a deterministic, synthetic Dutch household (gas + solar + battery + EV).
// Used when the page is opened outside Home Assistant or with ?demo in the URL.
// Mimics the subset of the HA WebSocket API that Energie+ uses.

const HOUR = 3600e3;
const BAT_CAP = 10, BAT_MAX = 3, BAT_EFF = 0.95;
const PRICE = { t1: 0.262, t2: 0.291, export: 0.22, gas: 1.38, water: 0.0011 };

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEVICES = [
  { id: "sensor.demo_laadpaal_energy", name: "Laadpaal" },
  { id: "sensor.demo_wasmachine_energy", name: "Wasmachine" },
  { id: "sensor.demo_droger_energy", name: "Wasdroger" },
  { id: "sensor.demo_vaatwasser_energy", name: "Vaatwasser" },
  { id: "sensor.demo_koelkast_energy", name: "Koelkast" },
  { id: "sensor.demo_computer_energy", name: "Computer & netwerk" },
  { id: "sensor.demo_werkplek_energy", name: "Werkplek", parent: "sensor.demo_computer_energy" },
  { id: "sensor.demo_verlichting_energy", name: "Verlichting" },
];

const dayCache = new Map();

function doyOf(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
}

function simulateDay(y, m, d) {
  const key = `${y}-${m}-${d}`;
  if (dayCache.has(key)) return dayCache.get(key);
  const date = new Date(y, m, d);
  const doy = doyOf(date);
  const dow = date.getDay();
  const weekend = dow === 0 || dow === 6;
  const r = mulberry(y * 1000 + doy * 7 + 13);
  const season = Math.cos((2 * Math.PI * (doy - 172)) / 365); // +1 midsummer, -1 midwinter
  const dayLen = 12 + 4.4 * season;
  const sunrise = 13.6 - dayLen / 2;
  const cloud = 0.2 + 0.8 * Math.pow(r(), 0.6);
  const peak = 3.6 * (0.42 + 0.58 * (season + 1) / 2);
  const temp = 10.5 - 7.5 * Math.cos((2 * Math.PI * (doy - 15)) / 365) + (r() - 0.5) * 5;

  const washDay = r() < 0.45, washHour = weekend ? 10 : 19;
  const dryer = washDay && r() < 0.35 + 0.4 * (1 - (season + 1) / 2);
  const evDay = r() < (weekend ? 0.35 : 0.3);
  const evSolar = weekend && evDay && cloud > 0.6;
  const evStart = evSolar ? 11 : 18;
  const evKwh = 9 + r() * 14;

  let soc = 2.5 + r() * 2;
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const ts = new Date(y, m, d, h).getTime();
    const rh = mulberry(ts / 1000);
    const awake = h >= 7 && h <= 23;
    const dev = {};
    dev["sensor.demo_koelkast_energy"] = 0.03 + rh() * 0.015;
    const office = !weekend && h >= 9 && h < 17;
    dev["sensor.demo_werkplek_energy"] = office ? 0.07 + rh() * 0.03 : 0.004;
    dev["sensor.demo_computer_energy"] = 0.03 + dev["sensor.demo_werkplek_energy"] + (h >= 19 && h <= 22 ? 0.03 : 0);
    const dark = h < sunrise + 0.5 || h > sunrise + dayLen - 0.5;
    dev["sensor.demo_verlichting_energy"] = awake && dark ? 0.06 + rh() * 0.08 : 0.004;
    dev["sensor.demo_wasmachine_energy"] = washDay && h === washHour ? 0.65 : washDay && h === washHour + 1 ? 0.25 : 0.001;
    dev["sensor.demo_droger_energy"] = dryer && (h === washHour + 2 || h === washHour + 3) ? 0.95 : 0.001;
    dev["sensor.demo_vaatwasser_energy"] = h === 20 ? 0.85 : h === 21 ? 0.2 : 0.001;
    let ev = 0;
    if (evDay && h >= evStart) {
      const done = Math.max(0, (h - evStart) * (evSolar ? 3.6 : 7.4));
      ev = Math.max(0, Math.min(evSolar ? 3.6 : 7.4, evKwh - done));
    }
    dev["sensor.demo_laadpaal_energy"] = ev;
    let untracked = 0.11 + rh() * 0.05;
    if (h === 7) untracked += 0.25;
    if (h === 17 || h === 18) untracked += 0.45 + rh() * 0.3;
    if (awake && h > 7) untracked += 0.06 * rh();

    const home = DEVICES.filter((x) => !x.parent).reduce((s, x) => s + dev[x.id], 0) + untracked;
    let solar = 0;
    const t = h + 0.5 - sunrise;
    if (t > 0 && t < dayLen) solar = peak * Math.sin((Math.PI * t) / dayLen) * cloud * (0.75 + 0.25 * rh());

    let fromGrid = 0, toGrid = 0, batIn = 0, batOut = 0;
    const surplus = solar - home;
    if (surplus > 0) {
      batIn = Math.min(surplus, BAT_MAX, (BAT_CAP - soc) / BAT_EFF);
      soc += batIn * BAT_EFF;
      toGrid = surplus - batIn;
    } else {
      const need = -surplus;
      batOut = ev > 0 ? 0 : Math.min(need, BAT_MAX, Math.max(0, soc - 1));
      soc -= batOut;
      fromGrid = need - batOut;
    }
    const low = weekend || h < 7 || h >= 23;
    const heat = Math.max(0, 18 - temp) * (awake ? 0.022 : 0.009);
    const gas = heat + (h === 7 ? 0.14 : 0) + (h === 18 ? 0.03 : 0);
    const water =
      (h === 7 ? 75 + rh() * 40 : 0) +
      (awake ? rh() * 14 : 0) +
      (dev["sensor.demo_wasmachine_energy"] > 0.1 && h === washHour ? 50 : 0) +
      (h === 20 ? 11 : 0);

    hours.push({
      ts, home, solar, fromGrid, toGrid, batIn, batOut, dev, gas, water, low,
      soc: (soc / BAT_CAP) * 100,
      forecast: t > 0 && t < dayLen ? peak * Math.sin((Math.PI * t) / dayLen) * 0.82 : 0,
    });
  }
  dayCache.set(key, hours);
  return hours;
}

function hourRec(ts) {
  const d = new Date(ts);
  return simulateDay(d.getFullYear(), d.getMonth(), d.getDate())[d.getHours()];
}

const EXTRACT = {
  "sensor.demo_import_t1": (h) => (h.low ? h.fromGrid : 0),
  "sensor.demo_import_t2": (h) => (h.low ? 0 : h.fromGrid),
  "sensor.demo_export_t1": (h) => (h.low ? h.toGrid : 0),
  "sensor.demo_export_t2": (h) => (h.low ? 0 : h.toGrid),
  "sensor.demo_import_t1_cost": (h) => (h.low ? h.fromGrid * PRICE.t1 : 0),
  "sensor.demo_import_t2_cost": (h) => (h.low ? 0 : h.fromGrid * PRICE.t2),
  "sensor.demo_export_t1_compensation": (h) => (h.low ? h.toGrid * PRICE.export : 0),
  "sensor.demo_export_t2_compensation": (h) => (h.low ? 0 : h.toGrid * PRICE.export),
  "sensor.demo_solar_energy": (h) => h.solar,
  "sensor.demo_battery_in": (h) => h.batIn,
  "sensor.demo_battery_out": (h) => h.batOut,
  "sensor.demo_gas": (h) => h.gas,
  "sensor.demo_gas_cost": (h) => h.gas * PRICE.gas,
  "sensor.demo_water": (h) => h.water,
  "sensor.demo_water_cost": (h) => h.water * PRICE.water,
};
for (const d of DEVICES) EXTRACT[d.id] = (h) => h.dev[d.id];

const NAMES = {
  "sensor.demo_import_t1": ["Stroomafname tarief 1 (dal)", "kWh"],
  "sensor.demo_import_t2": ["Stroomafname tarief 2 (normaal)", "kWh"],
  "sensor.demo_export_t1": ["Teruglevering tarief 1 (dal)", "kWh"],
  "sensor.demo_export_t2": ["Teruglevering tarief 2 (normaal)", "kWh"],
  "sensor.demo_solar_energy": ["Zonnepanelen opbrengst", "kWh"],
  "sensor.demo_battery_in": ["Thuisbatterij geladen", "kWh"],
  "sensor.demo_battery_out": ["Thuisbatterij ontladen", "kWh"],
  "sensor.demo_gas": ["Gasmeter", "m³"],
  "sensor.demo_water": ["Watermeter", "L"],
};

function startOfPeriod(ts, period) {
  const d = new Date(ts);
  if (period === "hour") return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
  if (period === "day") return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === "week") {
    const dow = (d.getDay() + 6) % 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  }
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function statistics({ start_time, end_time, statistic_ids, period }) {
  const start = new Date(start_time).getTime();
  const end = Math.min(new Date(end_time || Date.now()).getTime(), startOfPeriod(Date.now(), "hour").getTime());
  const out = {};
  for (const id of statistic_ids) {
    const fn = EXTRACT[id];
    if (!fn) continue;
    const buckets = new Map();
    for (let t = startOfPeriod(start, "hour").getTime(); t < end; ) {
      const rec = hourRec(t);
      const b = startOfPeriod(t, period).getTime();
      buckets.set(b, (buckets.get(b) || 0) + fn(rec));
      const d = new Date(t);
      t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    }
    out[id] = [...buckets].map(([s, change]) => ({ start: s, end: s + HOUR, change }));
  }
  return out;
}

export function createDemoApi() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    demo: true,
    options: {
      grid_power_entity: "sensor.demo_grid_power",
      grid_power_export_entity: "",
      solar_power_entity: "sensor.demo_solar_power",
      battery_power_entity: "sensor.demo_battery_power",
      battery_soc_entity: "sensor.demo_battery_soc",
      co2_signal_entity: "sensor.demo_fossil_fuel_percentage",
      live_refresh_seconds: 3,
    },
    async autodetect() {
      return { co2_signal_entity: "sensor.demo_fossil_fuel_percentage" };
    },
    async states(ids) {
      const now = Date.now();
      const rec = hourRec(startOfPeriod(now, "hour").getTime());
      const jitter = () => 0.85 + Math.random() * 0.3;
      const vals = {
        "sensor.demo_grid_power": ((rec.fromGrid - rec.toGrid) * 1000 * jitter()).toFixed(0),
        "sensor.demo_solar_power": (rec.solar * 1000 * jitter()).toFixed(0),
        "sensor.demo_battery_power": ((rec.batOut - rec.batIn) * 1000 * jitter()).toFixed(0),
        "sensor.demo_battery_soc": rec.soc.toFixed(0),
      };
      const units = { "sensor.demo_battery_soc": "%" };
      const out = {};
      for (const id of ids) out[id] = id in vals ? { state: vals[id], unit: units[id] || "W", name: id } : null;
      return out;
    },
    async ws(msg) {
      switch (msg.type) {
        case "get_config":
          return { time_zone: tz, currency: "EUR", location_name: "Demo-woning", country: "NL" };
        case "energy/get_prefs":
          return {
            energy_sources: [
              {
                type: "grid",
                flow_from: [
                  { stat_energy_from: "sensor.demo_import_t1", stat_cost: null, number_energy_price: PRICE.t1 },
                  { stat_energy_from: "sensor.demo_import_t2", stat_cost: null, number_energy_price: PRICE.t2 },
                ],
                flow_to: [
                  { stat_energy_to: "sensor.demo_export_t1", stat_compensation: null },
                  { stat_energy_to: "sensor.demo_export_t2", stat_compensation: null },
                ],
                cost_adjustment_day: 0,
              },
              { type: "solar", stat_energy_from: "sensor.demo_solar_energy", config_entry_solar_forecast: ["demo_forecast"] },
              { type: "battery", stat_energy_from: "sensor.demo_battery_out", stat_energy_to: "sensor.demo_battery_in" },
              { type: "gas", stat_energy_from: "sensor.demo_gas", stat_cost: "sensor.demo_gas_cost" },
              { type: "water", stat_energy_from: "sensor.demo_water", stat_cost: "sensor.demo_water_cost" },
            ],
            device_consumption: DEVICES.map((d) => ({ stat_consumption: d.id, name: d.name, included_in_stat: d.parent })),
          };
        case "energy/info":
          return {
            cost_sensors: {
              "sensor.demo_import_t1": "sensor.demo_import_t1_cost",
              "sensor.demo_import_t2": "sensor.demo_import_t2_cost",
              "sensor.demo_export_t1": "sensor.demo_export_t1_compensation",
              "sensor.demo_export_t2": "sensor.demo_export_t2_compensation",
            },
            solar_forecast_domains: ["forecast_solar"],
          };
        case "recorder/get_statistics_metadata":
          return (msg.statistic_ids || []).map((id) => ({
            statistic_id: id,
            name: NAMES[id]?.[0] || DEVICES.find((d) => d.id === id)?.name || id,
            statistics_unit_of_measurement: NAMES[id]?.[1] || "kWh",
          }));
        case "recorder/statistics_during_period":
          return statistics(msg);
        case "energy/solar_forecast": {
          const wh = {};
          const today = startOfPeriod(Date.now(), "day");
          for (let dd = -1; dd <= 1; dd++) {
            for (let h = 0; h < 24; h++) {
              const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dd, h);
              const rec = hourRec(t.getTime());
              if (rec.forecast > 0) wh[t.toISOString()] = Math.round(rec.forecast * 1000);
            }
          }
          return { demo_forecast: { wh_hours: wh } };
        }
        case "energy/fossil_energy_consumption": {
          const res = statistics({ ...msg, statistic_ids: msg.energy_statistic_ids, period: "hour" });
          const out = {};
          for (const arr of Object.values(res))
            for (const p of arr) {
              const h = new Date(p.start).getHours();
              const fossil = 0.38 + 0.2 * Math.cos(((h - 13) / 24) * 2 * Math.PI) * -1; // greener midday
              out[p.start] = (out[p.start] || 0) + p.change * Math.min(0.75, Math.max(0.15, fossil));
            }
          return out;
        }
        default:
          throw new Error(`Demo: unsupported ${msg.type}`);
      }
    },
  };
}
