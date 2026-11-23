/* ======================================================================
 * EnergyPlus card core — shared by every EnergyPlus dashboard card.
 * Reads the Energy dashboard configuration and long-term statistics through
 * the Home Assistant connection of the logged-in user. Read-only.
 * ==================================================================== */
const EP_VERSION = '__VERSION__';
const EP_REPO = 'https://github.com/martijntalens/energyplus-cards';

/* ---------- i18n ---------- */
const TEXT = {
  nl: {
    day: 'Dag', week: 'Week', month: 'Maand', year: 'Jaar',
    prev_day: 'gisteren', prev_week: 'vorige week', prev_month: 'vorige maand', prev_year: 'vorig jaar',
    unit_day: 'uur', unit_week: 'dag', unit_month: 'dag', unit_year: 'maand',
    previous: 'Vorige periode', next: 'Volgende periode', now: 'Nu',
    loading: 'Laden…', no_energy: 'Het Energie-dashboard van Home Assistant is nog niet ingericht.',
    no_data: 'Geen gegevens in deze periode.', error: 'Kon de gegevens niet laden',
    dal: 'Daltarief', piek: 'Piektarief', enkel: 'Enkel tarief', band_dal: 'dal',
    home: 'Verbruik thuis', grid_in: 'Van het net', export: 'Teruglevering', solar: 'Zonne-opbrengst',
    self_sufficiency: 'Zelfvoorzienend', battery: 'Batterij ontladen', net_cost: 'Netto stroomkosten', gas: 'Gas', water: 'Water',
    avg_per: 'gem. {v} per {u}', net: 'netto {v}', compensation: 'vergoeding {v}', self_used: '{v} zelf gebruikt',
    own_gen: 'uit eigen opwek', own_gen_bat: 'eigen opwek + batterij', charged: 'geladen {v}', per_kwh: '{v} per kWh',
    vs: 't.o.v. {p}', same_moment: ' (zelfde tijdstip)', pp: 'procentpunt',
    untracked: 'Niet apart gemeten', total_use: 'Totaal verbruik', ranking: 'Ranglijst', timeline: 'Verloop', cost_hint: 'kosten tegen het dal- of piektarief van dat moment',
    cost_note: 'Kosten = verbruik × de prijs van het tarief (dal/piek) dat op dat uur gold. Ook stroom van je zonnepanelen telt mee tegen dat tarief.',
    production: 'Opbrengst', direct: 'Direct verbruikt', to_battery: 'Naar batterij', exported: 'Teruggeleverd', self_consumption: 'Zelfconsumptie',
    best: 'Beste {u}', forecast: 'Verwachting',
    electricity: 'Stroom', comp_short: 'Vergoeding', comp_long: 'Vergoeding teruglevering', total_net: 'Totaal netto', net_short: 'Netto', costs: 'Kosten',
    tariff: 'Tarief', import: 'Afname', feed_in: 'Teruglevering', price_kwh: 'Prijs/kWh', total: 'Totaal', tariff_sub: 'Afname en teruglevering per telwerk: tarief 1 = dal, tarief 2 = piek.',
    import_of: 'Afname {t}', feed_in_of: 'Teruglevering {t}',
    t_kpi: 'Kerncijfers', t_live: 'Live energiestroom', t_devices: 'Verbruikers', t_solar: 'Zonnepanelen', t_costs: 'Kosten', t_tariff: 'Dal- en piektarief', t_cycles: 'Apparaatcycli',
    grid: 'Net', sun: 'Zon', house: 'Thuis', bat: 'Batterij', importing: 'afname', exporting: 'teruglevering', measured_devices: 'gemeten apparaten',
    charging: 'laden', discharging: 'ontladen', idle: 'rust', no_update: '{a} geen update', last_reading: 'laatste meting {a} geleden',
    devices_gt_home: 'apparaten > huis', unknown_tip: '{n}: onbekend — de apparaten samen ({d}) verbruiken meer dan het huis ({h})',
    no_live: 'Geen vermogenssensoren gevonden. Stel ze in bij de kaartopties.',
    cycles_hint: 'Starttijd per beurt, herkend uit het uurverbruik · dal = 23–7 uur en weekend',
    device: 'Apparaat', runs: 'Beurten', per_week: 'Per week', kwh_run: 'kWh per beurt', cost_run: 'Kosten per beurt', cost_total: 'Kosten totaal', in_dal: 'In dal', usually: 'Meestal om', last_time: 'Laatste keer',
    running_now: 'draait nu · {w}', hours: '{n} uur', in_dal_share: '{p} in daltarief', no_cycle_devices: 'Geen wasmachine, droger, vaatwasser of oven gevonden bij de apparaten in het Energie-dashboard.',
    f_title: 'Titel (leeg = standaard)', f_period: 'Standaardperiode', f_show_navigation: 'Periodekeuze tonen', f_compare: 'Vergelijken met vorige periode',
    f_view: 'Weergave', f_show_cost: 'Kosten tonen', f_grid_power: 'Vermogen net (W)', f_grid_power_export: 'Vermogen teruglevering (W, optioneel)',
    f_solar_power: 'Vermogen zonnepanelen (W)', f_battery_power: 'Vermogen batterij (W)', f_battery_soc: 'Laadniveau batterij (%)', f_show_devices: 'Apparaten tonen',
    f_stale_minutes: 'Markeer sensoren zonder update na (min)', f_tiles: 'Tegels (leeg = alle)', f_energy_date_selection: 'Datumkiezer van het Energie-dashboard volgen',
  },
  en: {
    day: 'Day', week: 'Week', month: 'Month', year: 'Year',
    prev_day: 'yesterday', prev_week: 'last week', prev_month: 'last month', prev_year: 'last year',
    unit_day: 'hour', unit_week: 'day', unit_month: 'day', unit_year: 'month',
    previous: 'Previous period', next: 'Next period', now: 'Now',
    loading: 'Loading…', no_energy: 'The Home Assistant Energy dashboard has not been set up yet.',
    no_data: 'No data in this period.', error: 'Could not load the data',
    dal: 'Off-peak', piek: 'Peak', enkel: 'Single rate', band_dal: 'off-peak',
    home: 'Home consumption', grid_in: 'From grid', export: 'Returned to grid', solar: 'Solar production',
    self_sufficiency: 'Self-sufficiency', battery: 'Battery discharged', net_cost: 'Net electricity cost', gas: 'Gas', water: 'Water',
    avg_per: 'avg. {v} per {u}', net: 'net {v}', compensation: 'compensation {v}', self_used: '{v} used yourself',
    own_gen: 'from own production', own_gen_bat: 'own production + battery', charged: 'charged {v}', per_kwh: '{v} per kWh',
    vs: 'vs {p}', same_moment: ' (same point in time)', pp: 'percentage points',
    untracked: 'Not measured separately', total_use: 'Total consumption', ranking: 'Ranking', timeline: 'Timeline', cost_hint: 'cost at the off-peak or peak rate of that moment',
    cost_note: 'Cost = consumption × the price of the rate (off-peak/peak) that applied in that hour. Solar energy counts at that rate too.',
    production: 'Production', direct: 'Used directly', to_battery: 'To battery', exported: 'Returned', self_consumption: 'Self-consumption',
    best: 'Best {u}', forecast: 'Forecast',
    electricity: 'Electricity', comp_short: 'Compensation', comp_long: 'Feed-in compensation', total_net: 'Net total', net_short: 'Net', costs: 'Costs',
    tariff: 'Rate', import: 'Import', feed_in: 'Returned', price_kwh: 'Price/kWh', total: 'Total', tariff_sub: 'Import and return per meter register: tariff 1 = off-peak, tariff 2 = peak.',
    import_of: 'Import {t}', feed_in_of: 'Returned {t}',
    t_kpi: 'Key figures', t_live: 'Live energy flow', t_devices: 'Devices', t_solar: 'Solar panels', t_costs: 'Costs', t_tariff: 'Off-peak and peak', t_cycles: 'Appliance cycles',
    grid: 'Grid', sun: 'Solar', house: 'Home', bat: 'Battery', importing: 'import', exporting: 'returning', measured_devices: 'measured devices',
    charging: 'charging', discharging: 'discharging', idle: 'idle', no_update: '{a} no update', last_reading: 'last reading {a} ago',
    devices_gt_home: 'devices > home', unknown_tip: '{n}: unknown — the devices together ({d}) use more than the home ({h})',
    no_live: 'No power sensors found. Set them in the card options.',
    cycles_hint: 'Start time per run, detected from hourly use · off-peak = 23–7 h and weekends',
    device: 'Device', runs: 'Runs', per_week: 'Per week', kwh_run: 'kWh per run', cost_run: 'Cost per run', cost_total: 'Total cost', in_dal: 'Off-peak', usually: 'Usually at', last_time: 'Last run',
    running_now: 'running · {w}', hours: '{n} h', in_dal_share: '{p} at off-peak rate', no_cycle_devices: 'No washing machine, dryer, dishwasher or oven found among the Energy dashboard devices.',
    f_title: 'Title (empty = default)', f_period: 'Default period', f_show_navigation: 'Show period selector', f_compare: 'Compare with previous period',
    f_view: 'View', f_show_cost: 'Show cost', f_grid_power: 'Grid power (W)', f_grid_power_export: 'Export power (W, optional)',
    f_solar_power: 'Solar power (W)', f_battery_power: 'Battery power (W)', f_battery_soc: 'Battery state of charge (%)', f_show_devices: 'Show devices',
    f_stale_minutes: 'Mark sensors without update after (min)', f_tiles: 'Tiles (empty = all)', f_energy_date_selection: 'Follow the Energy dashboard date picker',
  },
};
const langOf = (hass) =>
  String((hass && ((hass.locale && hass.locale.language) || hass.language)) || document.documentElement.lang || navigator.language || 'nl')
    .toLowerCase()
    .startsWith('en') ? 'en' : 'nl';
function tr(hass, key, vars) {
  let s = TEXT[langOf(hass)][key] ?? TEXT.nl[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
const localeOf = (hass) => (langOf(hass) === 'en' ? 'en-GB' : 'nl-NL');

/* ---------- palette (validated for colour-vision deficiency) ---------- */
const PAL = {
  light: {
    solar: '#eda100', battery: '#e87ba4', grid: '#2a78d6', export: '#1baf7a', charge: '#6250d6', gas: '#eb6834', water: '#6250d6',
    home: '#52514e', prev: '#898781', other: '#b5b3ab', warn: '#fab219', warnInk: '#8a5a00', good: '#006300', bad: '#b42323',
    d: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    piek: '#eb6834', piekOut: '#eda100',
  },
  dark: {
    solar: '#c98500', battery: '#d55181', grid: '#3987e5', export: '#199e70', charge: '#9085e9', gas: '#d95926', water: '#9085e9',
    home: '#c3c2b7', prev: '#898781', other: '#5f5e5a', warn: '#fab219', warnInk: '#e0a43a', good: '#0ca30c', bad: '#e66767',
    d: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
    piek: '#d95926', piekOut: '#c98500',
  },
};
const palOf = (hass) => PAL[hass && hass.themes && hass.themes.darkMode ? 'dark' : 'light'];

/* ---------- formatting ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const clamp0 = (v) => (v > 0 ? v : 0);
const toMs = (v) => (typeof v === 'number' ? (v < 1e11 ? v * 1000 : v) : Date.parse(v));
function makeFmt(hass) {
  const loc = localeOf(hass);
  const cache = {};
  const nf = (d) => (cache[d] ||= new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const num = (v, d = 1) => nf(d).format(v || 0);
  const kwhParts = (v) => {
    const a = Math.abs(v || 0);
    if (a >= 10000) return [num(v / 1000, 2), 'MWh'];
    return [num(v, a < 1 ? 2 : a < 100 ? 1 : 0), 'kWh'];
  };
  const currency = (hass && hass.config && hass.config.currency) || 'EUR';
  const money = (v, d = 2) => new Intl.NumberFormat(loc, { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(v || 0);
  const W = (v) => (Math.abs(v) >= 1000 ? `${num(v / 1000, 2)} kW` : `${num(v, 0)} W`);
  return {
    loc, num, kwhParts, money, W,
    kwh: (v) => kwhParts(v).join(' '),
    pct: (v) => (isFinite(v) ? `${num(v * 100, 0)}%` : '–'),
    unit: (v, u) => `${num(v, Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0)} ${u}`,
    water: (l) => (l >= 10000 ? `${num(l / 1000, 1)} m³` : `${num(l, 0)} L`),
    age: (ms) => (ms == null ? '' : ms < 60e3 ? `${Math.round(ms / 1000)} s` : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : `${num(ms / 3600e3, 1)} ${langOf(hass) === 'en' ? 'h' : 'uur'}`),
  };
}

/* ---------- dates ---------- */
const MONTHS = { nl: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
const DOW = { nl: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
function rangeFor(period, anchor) {
  const a = new Date(anchor);
  const y = a.getFullYear(), m = a.getMonth(), d = a.getDate();
  if (period === 'day') return { start: new Date(y, m, d), end: new Date(y, m, d + 1) };
  if (period === 'week') {
    const dow = (a.getDay() + 6) % 7;
    return { start: new Date(y, m, d - dow), end: new Date(y, m, d - dow + 7) };
  }
  if (period === 'month') return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
}
function shiftAnchor(period, anchor, n) {
  const a = new Date(anchor);
  if (period === 'day') a.setDate(a.getDate() + n);
  else if (period === 'week') a.setDate(a.getDate() + 7 * n);
  else if (period === 'month') (a.setDate(1), a.setMonth(a.getMonth() + n));
  else a.setFullYear(a.getFullYear() + n);
  return a;
}
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  return Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7);
}
/** Display buckets for a period: hours for a day, days for week/month, months for a year. */
function makeBuckets(hass, period, start, end) {
  const L = langOf(hass), M = MONTHS[L], Dw = DOW[L];
  const out = [];
  const c = new Date(start);
  while (c < end) {
    const s = new Date(c);
    let label, title;
    if (period === 'day') {
      label = String(s.getHours()).padStart(2, '0');
      title = `${label}:00 – ${String((s.getHours() + 1) % 24).padStart(2, '0')}:00`;
      c.setHours(c.getHours() + 1);
    } else if (period === 'year') {
      label = M[s.getMonth()];
      title = `${s.toLocaleDateString(localeOf(hass), { month: 'long' })} ${s.getFullYear()}`;
      c.setMonth(c.getMonth() + 1);
    } else {
      label = period === 'week' ? `${Dw[s.getDay()]} ${s.getDate()}` : String(s.getDate());
      title = `${Dw[s.getDay()]} ${s.getDate()} ${M[s.getMonth()]} ${s.getFullYear()}`;
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
    if (starts[mid] <= ts) (ans = mid), (lo = mid + 1);
    else hi = mid - 1;
  }
  return ans;
}
function periodLabel(hass, period, anchor) {
  const { start, end } = rangeFor(period, anchor);
  const loc = localeOf(hass), M = MONTHS[langOf(hass)];
  if (period === 'day') return start.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  if (period === 'week') {
    const last = new Date(end - 864e5);
    return `${langOf(hass) === 'en' ? 'Week' : 'Week'} ${isoWeek(start)} · ${start.getDate()} ${M[start.getMonth()]} – ${last.getDate()} ${M[last.getMonth()]}`;
  }
  if (period === 'month') return start.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  return String(start.getFullYear());
}

/* ---------- model: which statistics make up the energy picture ---------- */
function findKeys(obj, key, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) {
    if (k === key && typeof v === 'string' && v) out.push(v);
    else if (typeof v === 'object') findKeys(v, key, out);
  }
  return out;
}
function buildModel(prefs, info) {
  const cs = (info && info.cost_sensors) || {};
  const costOf = (stat, id) => stat || cs[id] || null;
  const m = { gridIn: [], gridOut: [], solar: [], batteries: [], gas: [], water: [], devices: [], rates: { grid: [], solar: [], battery: [] }, forecast: [] };
  for (const src of (prefs && prefs.energy_sources) || []) {
    if (src.type === 'grid') {
      const froms = [...(src.flow_from || [])], tos = [...(src.flow_to || [])];
      if (src.stat_energy_from) froms.push(src);
      if (src.stat_energy_to) tos.push(src);
      for (const f of froms)
        if (f.stat_energy_from)
          m.gridIn.push({
            id: f.stat_energy_from,
            cost: costOf(f.stat_cost, f.stat_energy_from),
            fixedPrice: typeof f.number_energy_price === 'number' ? f.number_energy_price : null,
            priceEntity: f.entity_energy_price || null,
          });
      for (const t of tos) if (t.stat_energy_to) m.gridOut.push({ id: t.stat_energy_to, comp: costOf(t.stat_compensation, t.stat_energy_to) });
      m.rates.grid.push(...findKeys(src, 'stat_rate'));
    } else if (src.type === 'solar' && src.stat_energy_from) {
      m.solar.push({ id: src.stat_energy_from });
      m.rates.solar.push(...findKeys(src, 'stat_rate'));
      if (Array.isArray(src.config_entry_solar_forecast)) m.forecast.push(...src.config_entry_solar_forecast);
    } else if (src.type === 'battery') {
      m.batteries.push({ out: src.stat_energy_from || null, in: src.stat_energy_to || null });
      m.rates.battery.push(...findKeys(src, 'stat_rate'));
    } else if (src.type === 'gas' && src.stat_energy_from) {
      m.gas.push({ id: src.stat_energy_from, cost: costOf(src.stat_cost, src.stat_energy_from) });
    } else if (src.type === 'water' && src.stat_energy_from) {
      m.water.push({ id: src.stat_energy_from, cost: costOf(src.stat_cost, src.stat_energy_from) });
    }
  }
  const devIds = new Set();
  for (const d of (prefs && prefs.device_consumption) || []) {
    if (!d.stat_consumption || devIds.has(d.stat_consumption)) continue;
    devIds.add(d.stat_consumption);
    m.devices.push({ id: d.stat_consumption, name: d.name || null, parent: d.included_in_stat || null, rate: d.stat_rate || null });
  }
  for (const d of m.devices) if (d.parent && !devIds.has(d.parent)) d.parent = null;
  m.devices.forEach((d, i) => (d.slot = i < 8 ? i : -1));
  m.hasCost = m.gridIn.some((g) => g.cost) || m.gridOut.some((g) => g.comp);
  m.hasBattery = m.batteries.length > 0;
  m.hasSolar = m.solar.length > 0;
  m.elecBase = [...m.gridIn.map((g) => g.id), ...m.gridOut.map((g) => g.id), ...m.solar.map((s) => s.id), ...m.batteries.flatMap((b) => [b.in, b.out])].filter(Boolean);
  m.elecAll = [...m.elecBase, ...m.gridIn.map((g) => g.cost), ...m.gridOut.map((g) => g.comp), ...m.devices.map((d) => d.id)].filter(Boolean);
  m.gasAll = m.gas.flatMap((g) => [g.id, g.cost]).filter(Boolean);
  m.waterAll = m.water.flatMap((g) => [g.id, g.cost]).filter(Boolean);
  return m;
}
const devColor = (P, d) => (d && d.slot >= 0 ? P.d[d.slot] : P.other);

/* ---------- tariffs: tariff 1 = dal (off-peak), tariff 2 = piek (peak) ---------- */
function classifyTariff(id, name, index, count) {
  if (count < 2) return 'enkel';
  const t = `${id} ${name || ''}`.toLowerCase();
  if (/off[ _-]?peak|\blow\b|_low|laag|\bdal|tarif+[ _-]?1\b|tariff[ _-]?1\b|\bt1\b|_t1\b|_1$/.test(t)) return 'dal';
  if (/peak|\bhigh\b|_high|hoog|normaal|normal|piek|tarif+[ _-]?2\b|tariff[ _-]?2\b|\bt2\b|_t2\b|_2$/.test(t)) return 'piek';
  return index === 0 ? 'dal' : index === 1 ? 'piek' : `t${index + 1}`;
}
function classifyTariffs(m, meta) {
  m.gridIn.forEach((g, i) => (g.tariff = classifyTariff(g.id, meta[g.id] && meta[g.id].name, i, m.gridIn.length)));
  m.gridOut.forEach((g, i) => (g.tariff = classifyTariff(g.id, meta[g.id] && meta[g.id].name, i, m.gridOut.length)));
  m.tariffKeys = [...new Set([...m.gridIn, ...m.gridOut].map((g) => g.tariff))];
}
const tariffName = (hass, k) => (['dal', 'piek', 'enkel'].includes(k) ? tr(hass, k) : k.toUpperCase());
function tariffWeights(m, r, hourly) {
  const w = {};
  const from = (map, list) => {
    let tot = 0;
    for (const g of list) tot += clamp0(map[g.id] || 0);
    if (tot <= 1e-4) return false;
    for (const g of list) w[g.tariff] = (w[g.tariff] || 0) + clamp0(map[g.id] || 0) / tot;
    return true;
  };
  if (from(r.tariffIn, m.gridIn) || from(r.tariffOut, m.gridOut)) return w;
  const keys = m.tariffKeys || [];
  if (keys.length === 1) return { [keys[0]]: 1 };
  if (keys.includes('dal') && keys.includes('piek')) {
    const d = new Date(r.ts), dow = d.getDay(), weekend = dow === 0 || dow === 6;
    const dalShare = weekend ? 1 : hourly ? (d.getHours() < 7 || d.getHours() >= 23 ? 1 : 0) : 8 / 24;
    return { dal: dalShare, piek: 1 - dalShare };
  }
  return w;
}
/** Price per kWh per tariff: historic cost statistics first, then fixed price, then the price entity. */
function tariffPrices(m, records, livePrices) {
  const prices = {}, kwh = {}, cost = {};
  for (const r of records)
    for (const g of m.gridIn) {
      kwh[g.tariff] = (kwh[g.tariff] || 0) + clamp0(r.tariffIn[g.id] || 0);
      cost[g.tariff] = (cost[g.tariff] || 0) + (r.costIn[g.id] || 0);
    }
  for (const k of Object.keys(kwh)) if (kwh[k] > 0.05 && cost[k] > 0) prices[k] = cost[k] / kwh[k];
  for (const g of m.gridIn) {
    if (prices[g.tariff] != null) continue;
    if (g.fixedPrice != null) prices[g.tariff] = g.fixedPrice;
    else if (livePrices[g.priceEntity] != null) prices[g.tariff] = livePrices[g.priceEntity];
  }
  return prices;
}
const SHIFTABLE = /was|droger|droog|vaatwas|dish|wash|dryer|boiler/i;

/* ---------- calculations ---------- */
const NUM_FIELDS = ['fromGrid', 'toGrid', 'solar', 'batIn', 'batOut', 'cost', 'comp', 'gas', 'gasCost', 'water', 'waterCost',
  'home', 'solarToHome', 'solarToBat', 'solarToGrid', 'gridToHome', 'gridToBat', 'batToHome', 'batToGrid', 'homeCost', 'shiftPiek'];
const MAP_FIELDS = ['dev', 'devCost', 'tariffIn', 'tariffOut', 'costIn', 'compOut', 'homeTariff'];
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
/** Split meter readings into flows (same idea as the built-in Energy dashboard). */
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
function compute(ctx, raw, bucketStarts, cutoff = Infinity) {
  const m = ctx.m;
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
  for (const g of m.gridIn) {
    add(g.id, (r, v) => ((r.fromGrid += v), (r.tariffIn[g.id] = (r.tariffIn[g.id] || 0) + v)));
    add(g.cost, (r, v) => ((r.cost += v), (r.costIn[g.id] = (r.costIn[g.id] || 0) + v)));
  }
  for (const g of m.gridOut) {
    add(g.id, (r, v) => ((r.toGrid += v), (r.tariffOut[g.id] = (r.tariffOut[g.id] || 0) + v)));
    add(g.comp, (r, v) => ((r.comp += Math.abs(v)), (r.compOut[g.id] = (r.compOut[g.id] || 0) + Math.abs(v))));
  }
  for (const s of m.solar) add(s.id, (r, v) => (r.solar += v));
  for (const b of m.batteries) {
    add(b.out, (r, v) => (r.batOut += v));
    add(b.in, (r, v) => (r.batIn += v));
  }
  for (const g of m.gas) {
    add(g.id, (r, v) => (r.gas += v));
    add(g.cost, (r, v) => (r.gasCost += v));
  }
  for (const w of m.water) {
    add(w.id, (r, v) => (r.water += v));
    add(w.cost, (r, v) => (r.waterCost += v));
  }
  for (const d of m.devices) add(d.id, (r, v) => (r.dev[d.id] = (r.dev[d.id] || 0) + v));

  const buckets = bucketStarts.map(() => emptyAgg());
  const records = [...recs.values()].sort((a, b) => a.ts - b.ts);
  const hourly = records.length > 1 ? records[1].ts - records[0].ts <= 3600e3 : true;
  records.forEach((r) => Object.assign(r, decompose(r)));
  const prices = tariffPrices(m, records, ctx.livePrices || {});
  const havePrice = Object.keys(prices).length > 0;
  const shiftIds = m.devices.filter((d) => SHIFTABLE.test(devName(ctx, d))).map((d) => d.id);
  for (const r of records) {
    const w = tariffWeights(m, r, hourly);
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
  return { buckets, total, records, prices, havePrice, hasData: records.length > 0, hourly };
}
const devName = (ctx, d) => (d && (d.name || (ctx.meta[d.id] && ctx.meta[d.id].name) || d.id)) || '';

/* ---------- data access (shared cache, so several cards on one dashboard share requests) ---------- */
const EP_CACHE = (window.__energyplusCache = window.__energyplusCache || new Map());
function cachedWS(hass, msg, ttl = 300e3) {
  const key = JSON.stringify(msg);
  const hit = EP_CACHE.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.p;
  const p = hass.callWS(msg);
  EP_CACHE.set(key, { at: Date.now(), p });
  p.catch(() => EP_CACHE.delete(key));
  return p;
}
async function loadContext(hass) {
  const [prefs, info] = await Promise.all([
    cachedWS(hass, { type: 'energy/get_prefs' }, 600e3).catch(() => null),
    cachedWS(hass, { type: 'energy/info' }, 600e3).catch(() => ({})),
  ]);
  if (!prefs || !(prefs.energy_sources || []).length) return null;
  const m = buildModel(prefs, info);
  const ids = [...m.elecBase, ...m.devices.map((d) => d.id), ...m.gas.map((g) => g.id), ...m.water.map((w) => w.id)];
  const md = ids.length ? await cachedWS(hass, { type: 'recorder/get_statistics_metadata', statistic_ids: ids }, 600e3).catch(() => []) : [];
  const meta = {};
  for (const x of md || []) meta[x.statistic_id] = { name: x.name || x.statistic_id, unit: x.statistics_unit_of_measurement || x.display_unit_of_measurement };
  classifyTariffs(m, meta);
  const livePrices = {};
  for (const g of m.gridIn) {
    const st = g.priceEntity && hass.states[g.priceEntity];
    if (st && !isNaN(parseFloat(st.state))) livePrices[g.priceEntity] = parseFloat(st.state);
  }
  return { m, meta, livePrices };
}
function stats(hass, ids, start, end, period, units, ttl) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return Promise.resolve({});
  return cachedWS(hass, {
    type: 'recorder/statistics_during_period',
    start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(),
    statistic_ids: list, period, types: ['change'], units,
  }, ttl);
}
async function fetchAll(hass, m, start, end, period, opts = {}) {
  const ttl = end > Date.now() ? 240e3 : 3600e3;
  const [a, b, c] = await Promise.all([
    stats(hass, opts.elecIds || m.elecAll, start, end, period, { energy: 'kWh' }, ttl),
    opts.noGas ? {} : stats(hass, m.gasAll, start, end, period, { volume: 'm³' }, ttl),
    opts.noWater ? {} : stats(hass, m.waterAll, start, end, period, { volume: 'L' }, ttl),
  ]);
  return { ...a, ...b, ...c };
}
/** Everything a period view needs: current period, previous period (full and up to the same moment). */
async function loadPeriod(hass, ctx, period, anchor, { compare = true, range = null } = {}) {
  const { start, end } = range || rangeFor(period, anchor);
  const fetchPeriod = period === 'year' || end - start > 40 * 864e5 ? 'day' : 'hour';
  const buckets = makeBuckets(hass, period, start, end);
  const starts = buckets.map((b) => b.start);
  const now = Date.now();
  const inProgress = now > start && now < end;
  const span = end - start;
  const prevR = range ? { start: new Date(start - span), end: new Date(start) } : rangeFor(period, shiftAnchor(period, anchor, -1));
  const prevCut = inProgress ? prevR.start.getTime() + (now - start.getTime()) : Infinity;
  const [cur, prev] = await Promise.all([
    fetchAll(hass, ctx.m, start, end, fetchPeriod),
    compare ? fetchAll(hass, ctx.m, prevR.start, prevR.end, fetchPeriod) : null,
  ]);
  const C = compute(ctx, cur, starts);
  let P = null, Pcut = null;
  if (prev) {
    const pStarts = makeBuckets(hass, period, prevR.start, prevR.end).map((b) => b.start);
    P = compute(ctx, prev, pStarts);
    Pcut = prevCut === Infinity ? P : compute(ctx, prev, pStarts, prevCut);
  }
  return { start, end, buckets, C, P, Pcut, inProgress, fetchPeriod, period };
}

/* ---------- power sensors for devices (live) ---------- */
const EXPORT_RE = /_returned|_export|_production|_productie|teruglever/;
function isPowerState(st) {
  if (!st || !st.entity_id.startsWith('sensor.')) return false;
  const a = st.attributes || {};
  return a.device_class === 'power' || /^(k|M)?W$/.test(a.unit_of_measurement || '');
}
function findDevicePower(hass, m, overrides = {}) {
  const map = {};
  const ents = hass.entities || {};
  for (const d of m.devices) {
    if (overrides[d.id]) map[d.id] = overrides[d.id];
    else if (d.rate) map[d.id] = d.rate;
    else {
      const dev = ents[d.id] && ents[d.id].device_id;
      let cands = [];
      if (dev)
        cands = Object.values(ents)
          .filter((e) => e.device_id === dev && isPowerState(hass.states[e.entity_id]) && !EXPORT_RE.test(e.entity_id))
          .map((e) => e.entity_id)
          .sort((a, b) => (/power|vermogen/.test(b) ? 1 : 0) - (/power|vermogen/.test(a) ? 1 : 0));
      if (!cands.length) {
        const guess = d.id.replace(/_(today_|total_)?(energy|energie|consumption|verbruik)(_total|_today)?$/, '_power');
        if (guess !== d.id && isPowerState(hass.states[guess])) cands = [guess];
      }
      if (cands[0]) map[d.id] = cands[0];
    }
  }
  return map;
}
function powerW(hass, id) {
  const s = id && hass.states[id];
  if (!s) return null;
  const v = parseFloat(s.state);
  if (!isFinite(v)) return null;
  const u = (s.attributes && s.attributes.unit_of_measurement) || '';
  return /^kW$/i.test(u) ? v * 1000 : /^MW$/i.test(u) ? v * 1e6 : v;
}

/* ---------- SVG charts (no external libraries) ---------- */
function niceTicks(min, max, count = 4) {
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) || 10 * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}
/**
 * Stacked bar chart with optional line series.
 * spec: { labels, titles, series: [{name, color, data, stack, type:'bar'|'line', dashed}], yFmt, valFmt, footer(i) }
 */
function drawBarChart(el, spec, P) {
  const width = el.clientWidth || 400;
  const height = spec.height || 220;
  const n = spec.labels.length;
  const bars = spec.series.filter((s) => s.type !== 'line');
  const lines = spec.series.filter((s) => s.type === 'line');
  let maxV = 0, minV = 0;
  for (let i = 0; i < n; i++) {
    const stacks = {};
    for (const s of bars) {
      const v = s.data[i] || 0;
      const k = `${s.stack || s.name}|${v >= 0 ? '+' : '-'}`;
      stacks[k] = (stacks[k] || 0) + v;
    }
    for (const v of Object.values(stacks)) (maxV = Math.max(maxV, v)), (minV = Math.min(minV, v));
    for (const s of lines) if (s.data[i] != null) (maxV = Math.max(maxV, s.data[i])), (minV = Math.min(minV, s.data[i]));
  }
  const ticks = niceTicks(minV, maxV, height < 200 ? 3 : 4);
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const labW = Math.max(...ticks.map((t) => spec.yFmt(t).length)) * 6.4 + 8;
  const pad = { l: labW, r: 6, t: 8, b: 20 };
  const pw = width - pad.l - pad.r, ph = height - pad.t - pad.b;
  const y = (v) => pad.t + ph - ((v - y0) / (y1 - y0)) * ph;
  const band = pw / Math.max(1, n);
  const bw = Math.max(2, Math.min(26, band * 0.62));
  const cx = (i) => pad.l + band * i + band / 2;
  let svg = '';
  for (const t of ticks) svg += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'zero' : 'grid'}"/><text x="${pad.l - 6}" y="${y(t) + 4}" class="ylab">${esc(spec.yFmt(t))}</text>`;
  for (let i = 0; i < n; i++) {
    const acc = {};
    for (const s of bars) {
      const v = s.data[i] || 0;
      if (Math.abs(v) < 1e-9) continue;
      const k = `${s.stack || s.name}|${v >= 0 ? '+' : '-'}`;
      const base = acc[k] || 0;
      const top = base + v;
      acc[k] = top;
      const ya = y(Math.max(base, top)), yb = y(Math.min(base, top));
      svg += `<rect x="${cx(i) - bw / 2}" y="${ya}" width="${bw}" height="${Math.max(0.5, yb - ya)}" style="fill:${s.color}" class="bar"/>`;
    }
  }
  for (const s of lines) {
    let d = '', pen = false;
    for (let i = 0; i < n; i++) {
      const v = s.data[i];
      if (v == null) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${cx(i)},${y(v)}`;
      pen = true;
    }
    if (d) svg += `<path d="${d}" style="fill:none;stroke:${s.color};stroke-width:2;stroke-linejoin:round${s.dashed ? ';stroke-dasharray:5 4' : ''}"/>`;
  }
  const step = Math.max(1, Math.ceil((n * 30) / pw));
  for (let i = 0; i < n; i += step) svg += `<text x="${cx(i)}" y="${height - 5}" class="xlab">${esc(spec.labels[i])}</text>`;
  for (let i = 0; i < n; i++) svg += `<rect x="${pad.l + band * i}" y="${pad.t}" width="${band}" height="${ph}" class="hit" data-i="${i}"/>`;
  el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">${svg}</svg><div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip');
  el.querySelectorAll('.hit').forEach((r) => {
    r.addEventListener('mouseenter', () => {
      const i = +r.dataset.i;
      el.querySelectorAll('.hit').forEach((x) => x.classList.toggle('on', x === r));
      let h = `<div class="tt">${esc(spec.titles[i])}</div>`;
      for (const s of spec.series) {
        const v = s.data[i];
        if (v == null || Math.abs(v) < 1e-6) continue;
        h += `<div class="tr"><span><i style="background:${s.color}"></i>${esc(s.name)}</span><b>${esc(spec.valFmt(Math.abs(v), s))}</b></div>`;
      }
      if (spec.footer) h += spec.footer(i);
      tip.innerHTML = h;
      tip.hidden = false;
      const left = cx(i) + 12;
      tip.style.left = `${Math.min(left, width - tip.offsetWidth - 4)}px`;
      if (left + tip.offsetWidth > width) tip.style.left = `${Math.max(0, cx(i) - tip.offsetWidth - 12)}px`;
      tip.style.top = `${pad.t}px`;
    });
  });
  el.querySelector('svg').addEventListener('mouseleave', () => {
    tip.hidden = true;
    el.querySelectorAll('.hit').forEach((x) => x.classList.remove('on'));
  });
}
const legendHtml = (series) =>
  `<div class="legend">${series.map((s) => `<span><i class="${s.type === 'line' ? 'ln' : ''}" style="${s.type === 'line' ? `border-color:${s.color}` : `background:${s.color}`}"></i>${esc(s.name)}</span>`).join('')}</div>`;
const anyNonZero = (arr) => arr.some((v) => Math.abs(v || 0) > 1e-6);

/* ---------- shared styles ---------- */
const BASE_STYLE = `
  :host { display: block; --ep-muted: var(--secondary-text-color); --ep-grid: var(--divider-color, rgba(127,127,127,.2)); --ep-surface-2: var(--secondary-background-color, rgba(127,127,127,.08)); }
  ha-card { container-type: inline-size; overflow: hidden; }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; padding: 14px 16px 6px; }
  .head h2 { margin: 0; font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
  .head .hint { font-size: 12px; color: var(--ep-muted); }
  .nav { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: 9px; background: var(--ep-surface-2); }
  .seg button { border: 0; background: transparent; padding: 3px 9px; border-radius: 7px; color: var(--ep-muted); font: inherit; font-size: 12px; cursor: pointer; }
  .seg button[aria-pressed="true"] { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 2px rgba(0,0,0,.15); }
  .ib { border: 0; background: var(--ep-surface-2); color: var(--primary-text-color); border-radius: 8px; height: 26px; min-width: 26px; font: inherit; cursor: pointer; }
  .ib:disabled { opacity: .35; cursor: default; }
  .pn { display: inline-flex; align-items: center; gap: 6px; }
  .plabel { font-size: 12px; font-weight: 600; color: var(--primary-text-color); min-width: 0; text-align: center; }
  @container (max-width: 520px) { .nav { width: 100%; } .nav .seg { flex: 1; } .nav .seg button { flex: 1; } .pn { width: 100%; justify-content: space-between; } }
  .content { padding: 4px 16px 16px; }
  .empty { color: var(--ep-muted); padding: 18px 0; text-align: center; font-size: 13px; }
  .stats { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 2px 0 8px; }
  .stats div { font-size: 12px; color: var(--ep-muted); }
  .stats b { display: block; font-size: 17px; color: var(--primary-text-color); font-variant-numeric: tabular-nums; font-weight: 600; }
  .stats i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: 1px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--ep-muted); margin: 4px 0 2px; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
  .legend i.ln { width: 14px; height: 0; border-top: 2px dashed; border-radius: 0; vertical-align: 3px; }
  .chart { position: relative; width: 100%; }
  .chart svg { display: block; overflow: visible; }
  .chart .grid { stroke: var(--ep-grid); stroke-width: 1; }
  .chart .zero { stroke: var(--ep-muted); stroke-opacity: .5; stroke-width: 1; }
  .chart .ylab { fill: var(--ep-muted); font-size: 11px; text-anchor: end; font-variant-numeric: tabular-nums; }
  .chart .xlab { fill: var(--ep-muted); font-size: 11px; text-anchor: middle; }
  .chart .bar { stroke: var(--ha-card-background, var(--card-background-color, #fff)); stroke-width: 1; }
  .chart .hit { fill: transparent; }
  .chart .hit.on { fill: rgba(127,127,127,.10); }
  .tip { position: absolute; z-index: 2; pointer-events: none; min-width: 150px; background: var(--card-background-color, #fff); color: var(--primary-text-color);
    border: 1px solid var(--ep-grid); border-radius: 10px; padding: 8px 10px; font-size: 12px; box-shadow: 0 6px 24px rgba(0,0,0,.18); }
  .tip .tt { font-weight: 600; margin-bottom: 4px; }
  .tip .tr { display: flex; justify-content: space-between; gap: 16px; }
  .tip .tr i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; }
  .tip .ft { border-top: 1px solid var(--ep-grid); margin-top: 5px; padding-top: 5px; display: flex; justify-content: space-between; gap: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
  th, td { padding: 7px 6px; text-align: right; border-bottom: 1px solid var(--ep-grid); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--ep-muted); font-weight: 500; font-size: 12px; }
  td small { color: var(--ep-muted); font-size: 11px; }
  .tw { overflow-x: auto; }
  .sw { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 7px; }
  .delta { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 12px; }
  .delta.good { color: var(--ep-good); } .delta.bad { color: var(--ep-bad); } .delta.neutral { color: var(--ep-muted); }
`;

/* ---------- base class for period cards ---------- */
const PERIODS = ['day', 'week', 'month', 'year'];
class EnergyPlusBase extends HTMLElement {
  static get usesPeriod() { return true; }
  static getStubConfig() { return {}; }
  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    if (config.period && !PERIODS.includes(config.period)) throw new Error('period must be day, week, month or year');
    const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined && v !== null));
    this._config = { show_navigation: true, compare: true, ...this.constructor.defaults, ...clean };
    this._period = this._config.period || 'day';
    this._anchor = new Date();
    this._data = null;
    if (this._hass) this._load();
  }
  set hass(hass) {
    const first = !this._hass;
    const themeSig = `${!!(hass.themes && hass.themes.darkMode)}|${langOf(hass)}`;
    const changed = themeSig !== this._themeSig;
    this._hass = hass;
    this._themeSig = themeSig;
    if (first) this._load();
    else if (changed && this._data) this._render();
    if (this.onHass) this.onHass(hass);
    if (this._config && this._config.energy_date_selection) this._subscribeEnergy();
  }
  getCardSize() { return 5; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }
  connectedCallback() {
    clearInterval(this._timer);
    this._timer = setInterval(() => this._data && this._data.inProgress && document.visibilityState === 'visible' && this._load(true), 5 * 60e3);
    if (!this._ro && window.ResizeObserver) this._ro = new ResizeObserver(() => this._drawCharts());
    if (this.shadowRoot) this.shadowRoot.querySelectorAll('.chart').forEach((c) => this._ro && this._ro.observe(c));
  }
  disconnectedCallback() {
    clearInterval(this._timer);
    if (this._ro) this._ro.disconnect();
    if (this._unsubEnergy) (this._unsubEnergy(), (this._unsubEnergy = null));
  }
  /** Optional: follow the date picker of the built-in Energy dashboard (energy-date-selection card). */
  _subscribeEnergy() {
    if (this._unsubEnergy || this._energyTried > 20) return;
    const coll = this._hass.connection && (this._hass.connection[`_energy${this._config.collection_key ? '_' + this._config.collection_key : ''}`]);
    if (!coll || typeof coll.subscribe !== 'function') {
      this._energyTried = (this._energyTried || 0) + 1;
      return;
    }
    this._unsubEnergy = coll.subscribe((d) => {
      if (!d || !d.start) return;
      const start = new Date(d.start), end = d.end ? new Date(d.end) : rangeFor('day', start).end;
      const days = (end - start) / 864e5;
      this._period = days <= 1.01 ? 'day' : days <= 7.01 ? 'week' : days <= 31.5 ? 'month' : 'year';
      this._anchor = start;
      this._extRange = { start, end };
      this._load();
    });
  }
  get L() { return (k, v) => tr(this._hass, k, v); }
  async _load(silent) {
    if (!this._hass || !this._config) return;
    const seq = (this._seq = (this._seq || 0) + 1);
    if (!silent && !this._data) this._shell(`<div class="empty">${esc(this.L('loading'))}</div>`);
    try {
      this._ctx = this._ctx && Date.now() - this._ctxAt < 600e3 ? this._ctx : await loadContext(this._hass);
      this._ctxAt = this._ctxAt && this._ctx ? this._ctxAt : Date.now();
      if (seq !== this._seq) return;
      if (!this._ctx) return this._shell(`<div class="empty">${esc(this.L('no_energy'))}</div>`);
      const data = await this.loadData(this._ctx);
      if (seq !== this._seq) return;
      this._data = data;
      this._render();
    } catch (e) {
      console.error('EnergyPlus card', e);
      this._shell(`<div class="empty">${esc(this.L('error'))}: ${esc(e.message || e)}</div>`);
    }
  }
  loadData(ctx) {
    return loadPeriod(this._hass, ctx, this._period, this._anchor, { compare: this._config.compare, range: this._config.energy_date_selection ? this._extRange : null });
  }
  _headHtml() {
    const c = this._config, L = this.L;
    const title = c.title === '' ? '' : `<h2>${esc(c.title || L(this.constructor.titleKey))}</h2>`;
    let nav = '';
    if (this.constructor.usesPeriod && c.show_navigation && !c.energy_date_selection) {
      const next = rangeFor(this._period, shiftAnchor(this._period, this._anchor, 1)).start > new Date();
      nav = `<div class="nav"><div class="seg">${PERIODS.map((p) => `<button data-p="${p}" aria-pressed="${p === this._period}">${esc(L(p))}</button>`).join('')}</div>
        <span class="pn"><button class="ib" data-nav="-1" aria-label="${esc(L('previous'))}">‹</button><span class="plabel">${esc(periodLabel(this._hass, this._period, this._anchor))}</span>
        <button class="ib" data-nav="1" aria-label="${esc(L('next'))}" ${next ? 'disabled' : ''}>›</button></span></div>`;
    } else if (this.constructor.usesPeriod && this._data && c.title !== '') {
      nav = `<span class="hint">${esc(periodLabel(this._hass, this._period, this._anchor))}</span>`;
    }
    const extra = this.headExtra ? this.headExtra() : '';
    return title || nav || extra ? `<div class="head">${title}${extra}${nav}</div>` : '';
  }
  _shell(body) {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const P = palOf(this._hass);
    this.shadowRoot.innerHTML = `<style>${BASE_STYLE}${this.constructor.style || ''}</style><ha-card style="--ep-good:${P.good};--ep-bad:${P.bad};--ep-warn:${P.warn};--ep-warn-ink:${P.warnInk}">${this._headHtml()}<div class="content${this._config && this._config.title === '' && !this._headHtml() ? ' nohead' : ''}">${body}</div></ha-card>`;
    const root = this.shadowRoot;
    root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => ((this._period = b.dataset.p), (this._data = null), this._load())));
    root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => ((this._anchor = shiftAnchor(this._period, this._anchor, +b.dataset.nav)), this._load())));
  }
  _render() {
    if (!this._data || !this._hass) return;
    const P = palOf(this._hass), F = makeFmt(this._hass);
    this._charts = {};
    this._shell(this.renderBody(this._data, this._ctx, P, F));
    if (this.afterRender) this.afterRender(this._data, this._ctx, P, F);
    if (this._ro) this.shadowRoot.querySelectorAll('.chart').forEach((c) => this._ro.observe(c));
    this._drawCharts();
  }
  chart(id, spec) {
    this._charts = this._charts || {};
    this._charts[id] = spec;
    return `<div class="chart" id="${id}"${spec.height === 'auto' ? '' : ` style="height:${spec.height || 220}px"`}></div>`;
  }
  _drawCharts() {
    if (!this.shadowRoot || !this._charts) return;
    const P = palOf(this._hass);
    for (const [id, spec] of Object.entries(this._charts)) {
      const el = this.shadowRoot.getElementById(id);
      if (el && el.clientWidth) (spec.draw || drawBarChart)(el, spec, P);
    }
  }
  /** delta badge versus the previous period (same moment when the period is still running) */
  delta(cur, prev, goodWhenUp) {
    if (!this._config.compare || prev == null || !isFinite(prev) || Math.abs(prev) < 1e-6) return '';
    const d = (cur - prev) / Math.abs(prev);
    if (!isFinite(d)) return '';
    const F = makeFmt(this._hass);
    const cls = Math.abs(d) < 0.005 ? 'neutral' : d > 0 === goodWhenUp ? 'good' : 'bad';
    const arrow = Math.abs(d) < 0.005 ? '→' : d > 0 ? '▲' : '▼';
    const title = this.L('vs', { p: this.L(`prev_${this._period}`) }) + (this._data && this._data.inProgress ? this.L('same_moment') : '');
    return `<span class="delta ${cls}" title="${esc(title)}">${arrow} ${F.num(Math.abs(d) * 100, 0)}%</span>`;
  }
  static formSchema(extra = []) {
    return {
      schema: [
        { name: 'title', selector: { text: {} } },
        { type: 'grid', name: '', flatten: true, schema: [
          { name: 'period', selector: { select: { mode: 'dropdown', options: PERIODS.map((p) => ({ value: p, label: tr(null, p) })) } } },
          { name: 'show_navigation', selector: { boolean: {} } },
        ] },
        ...extra,
        { name: 'energy_date_selection', selector: { boolean: {} } },
      ],
      computeLabel: (s) => tr(null, `f_${s.name}`),
    };
  }
}
function registerCard(tag, cls, name, description) {
  if (!customElements.get(tag)) customElements.define(tag, cls);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === tag))
    window.customCards.push({ type: tag, name, description, preview: true, documentationURL: EP_REPO });
}
