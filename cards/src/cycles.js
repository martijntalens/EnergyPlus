/* EnergyPlus appliance cycles card: runs of washing machine, dryer, dishwasher and oven. */
const CYCLE_RE = /was|droger|droog|vaatwas|dish|wash|dryer|oven|airfryer|magnetron/i;
class EnergyPlusCyclesCard extends EnergyPlusBase {
  static get titleKey() { return 't_cycles'; }
  static get defaults() { return { period: 'week' }; }
  static getConfigForm() { return EnergyPlusBase.formSchema(); }
  getCardSize() { return 7; }
  async loadData(ctx) {
    const m = ctx.m;
    const devs = this._config.devices && this._config.devices.length
      ? m.devices.filter((d) => this._config.devices.includes(d.id))
      : m.devices.filter((d) => CYCLE_RE.test(devName(ctx, d)));
    const { start, end } = this._config.energy_date_selection && this._extRange ? this._extRange : rangeFor(this._period, this._anchor);
    const out = { devs, start, end, runs: {}, inProgress: Date.now() > start && Date.now() < end, period: this._period };
    if (!devs.length) return out;
    const stop = new Date(Math.min(end.getTime(), Date.now()));
    const ids = [...devs.map((d) => d.id), ...m.gridIn.flatMap((g) => [g.id, g.cost]), ...m.gridOut.map((g) => g.id)];
    const raw = await stats(this._hass, ids, start, stop, 'hour', { energy: 'kWh' }, end > Date.now() ? 240e3 : 3600e3);
    const C = compute(ctx, raw, [start.getTime()]);
    out.days = Math.max(1 / 24, (stop - start) / 864e5);
    out.havePrice = C.havePrice;
    for (const d of devs) out.runs[d.id] = detectRuns(m, C.records, d.id);
    return out;
  }
  onHass() {
    if (!this.shadowRoot || !this._ctx) return;
    const dp = findDevicePower(this._hass, this._ctx.m, this._config.device_power || {});
    const F = makeFmt(this._hass);
    this.shadowRoot.querySelectorAll('[data-now]').forEach((el) => {
      const w = powerW(this._hass, dp[el.dataset.now]);
      el.hidden = !(w > 10);
      if (w > 10) el.textContent = this.L('running_now', { w: F.W(w) });
    });
  }
  renderBody(D, ctx, P, F) {
    const L = this.L;
    if (!D.devs.length) return `<div class="empty">${esc(L('no_cycle_devices'))}</div>`;
    const hasDal = (ctx.m.tariffKeys || []).includes('dal'), withCost = D.havePrice, perWeek = D.days >= 7;
    const Dw = DOW[langOf(this._hass)], M = MONTHS[langOf(this._hass)];
    const fmtStart = (ts) => {
      const d = new Date(ts);
      return `${Dw[d.getDay()]} ${d.getDate()} ${M[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:00`;
    };
    const head = [L('device'), L('runs'), ...(perWeek ? [L('per_week')] : []), L('kwh_run'), ...(withCost ? [L('cost_run'), L('cost_total')] : []), ...(hasDal ? [L('in_dal')] : []), L('usually'), L('last_time')];
    const rows = D.devs.map((d) => {
      const runs = D.runs[d.id] || [];
      const kwhT = sum(runs, (r) => r.kwh), costT = sum(runs, (r) => r.cost), rawT = sum(runs, (r) => r.raw), dalT = sum(runs, (r) => r.dal);
      const hrs = runs.map((r) => new Date(r.start).getHours()).sort((a, b) => a - b);
      const last = runs[runs.length - 1];
      return `<tr><td><span class="sw" style="background:${devColor(P, d)}"></span>${esc(devName(ctx, d))}<span class="chip" data-now="${esc(d.id)}" hidden></span></td><td>${runs.length}</td>` +
        (perWeek ? `<td>${F.num(runs.length / (D.days / 7), 1)}</td>` : '') +
        `<td>${runs.length ? esc(F.kwh(kwhT / runs.length)) : '–'}</td>` +
        (withCost ? `<td>${runs.length ? esc(F.money(costT / runs.length)) : '–'}</td><td>${esc(F.money(costT))}</td>` : '') +
        (hasDal ? `<td>${rawT > 0 ? esc(F.pct(dalT / rawT)) : '–'}</td>` : '') +
        `<td>${hrs.length ? `${String(hrs[Math.floor(hrs.length / 2)]).padStart(2, '0')}:00` : '–'}</td><td>${last ? esc(fmtStart(last.start)) : '–'}</td></tr>`;
    });
    const series = D.devs.map((d) => ({ name: devName(ctx, d), color: devColor(P, d), runs: D.runs[d.id] || [] }));
    return `<div class="sub">${esc(L('cycles_hint'))}</div><div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` +
      legendHtml(series) + this.chart('c', { height: 240, draw: (el) => drawScatter(el, { series, start: D.start, end: D.end, period: D.period, hasDal, withCost, fmtStart }, this._hass) });
  }
  afterRender() { this.onHass(); }
}
/** A run = consecutive hours above the device's standby level (one quiet hour inside a run is allowed). */
function detectRuns(m, records, id) {
  const pts = records.map((r) => ({ ts: r.ts, e: clamp0(r.dev[id] || 0), c: r.devCost[id] || 0, r }));
  if (pts.length < 3) return [];
  const sorted = pts.map((p) => p.e).sort((a, b) => a - b);
  const standby = sorted[Math.floor(sorted.length * 0.2)] || 0;
  const thr = Math.max(0.05, standby * 3 + 0.02);
  const runs = [];
  let cur = null;
  const addHour = (p) => {
    const w = tariffWeights(m, p.r, true);
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
function drawScatter(el, spec, hass) {
  const F = makeFmt(hass), L = (k, v) => tr(hass, k, v), M = MONTHS[langOf(hass)];
  const width = el.clientWidth || 500, height = 240;
  const pad = { l: 44, r: 8, t: 6, b: 20 };
  const pw = width - pad.l - pad.r, ph = height - pad.t - pad.b;
  const t0 = spec.start.getTime(), t1 = spec.end.getTime();
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * pw;
  const y = (h) => pad.t + (h / 24) * ph;
  let svg = '';
  svg += `<rect x="${pad.l}" y="${y(0)}" width="${pw}" height="${y(7) - y(0)}" class="band"/><rect x="${pad.l}" y="${y(23)}" width="${pw}" height="${y(24) - y(23)}" class="band"/>`;
  svg += `<text x="${pad.l + 4}" y="${y(0) + 12}" class="bl">${spec.hasDal ? esc(tr(hass, 'band_dal')) : ''}</text>`;
  for (let h = 0; h <= 24; h += 3) svg += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(h)}" y2="${y(h)}" class="grid"/><text x="${pad.l - 6}" y="${y(h) + 4}" class="ylab">${String(h).padStart(2, '0')}:00</text>`;
  // x ticks
  const ticks = [];
  const c = new Date(t0);
  if (spec.period === 'day') for (let h = 4; h < 24; h += 4) ticks.push([new Date(c.getFullYear(), c.getMonth(), c.getDate(), h).getTime(), `${String(h).padStart(2, '0')}:00`]);
  else if (spec.period === 'year') for (let mo = 0; mo < 12; mo++) ticks.push([new Date(c.getFullYear(), mo, 1).getTime(), M[mo]]);
  else {
    const stepD = spec.period === 'week' ? 1 : Math.max(1, Math.ceil((((t1 - t0) / 864e5) * 34) / pw));
    for (let d = new Date(c); d < spec.end; d.setDate(d.getDate() + stepD)) ticks.push([d.getTime() + (spec.period === 'week' ? 432e5 : 0), spec.period === 'week' ? `${DOW[langOf(hass)][d.getDay()]} ${d.getDate()}` : String(d.getDate())]);
  }
  for (const [t, lab] of ticks) svg += `<text x="${x(t)}" y="${height - 5}" class="xlab">${esc(lab)}</text>`;
  const pts = [];
  spec.series.forEach((s, si) => s.runs.forEach((r, ri) => {
    const d = new Date(r.start);
    const cx = x(r.start + 1800e3), cy = y(d.getHours() + 0.5), rad = Math.max(4.5, Math.min(11, 4 + r.kwh * 3));
    pts.push({ s, r, cx, cy });
    svg += `<circle cx="${cx}" cy="${cy}" r="${rad}" style="fill:${s.color}" class="pt" data-k="${si}-${ri}"/>`;
  }));
  el.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${svg}</svg><div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip');
  el.querySelectorAll('.pt').forEach((node, i) => {
    node.addEventListener('mouseenter', () => {
      const p = pts[i], r = p.r;
      tip.innerHTML = `<div class="tt">${esc(p.s.name)}</div>${esc(spec.fmtStart(r.start))} · ${esc(L('hours', { n: r.hours }))}<br>${esc(F.kwh(r.kwh))}${spec.withCost ? ` · ${esc(F.money(r.cost))}` : ''}${spec.hasDal ? `<br>${esc(L('in_dal_share', { p: F.pct(r.dal / (r.raw || 1)) }))}` : ''}`;
      tip.hidden = false;
      tip.style.left = `${Math.min(p.cx + 12, width - tip.offsetWidth - 4)}px`;
      tip.style.top = `${Math.max(0, p.cy - 20)}px`;
    });
    node.addEventListener('mouseleave', () => (tip.hidden = true));
  });
}
EnergyPlusCyclesCard.style = `
  .sub { font-size: 12px; color: var(--ep-muted); margin: 0 0 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px; margin-left: 8px; color: var(--ep-good); background: color-mix(in srgb, var(--ep-good) 14%, transparent); }
  .chip[hidden] { display: none; }
  .chip::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .3; } }
  .chart .band { fill: rgba(127,127,127,.08); }
  .chart .bl { fill: var(--ep-muted); font-size: 11px; }
  .chart .pt { stroke: var(--card-background-color, #fff); stroke-width: 2; opacity: .92; cursor: default; }
  .legend { margin-top: 10px; }
`;
registerCard('energyplus-cycles-card', EnergyPlusCyclesCard, 'EnergyPlus appliance cycles', 'Runs of washing machine, dryer, dishwasher and oven: count, kWh and cost per run, off-peak share and start times.');
