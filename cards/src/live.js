/* EnergyPlus live flow card: animated power flow from grid and solar to the home and every device. */
class EnergyPlusLiveCard extends EnergyPlusBase {
  static get usesPeriod() { return false; }
  static get titleKey() { return 't_live'; }
  static get defaults() { return { show_devices: true, stale_minutes: 5 }; }
  static getConfigForm() {
    const ent = { entity: { domain: 'sensor', device_class: 'power' } };
    return {
      schema: [
        { name: 'title', selector: { text: {} } },
        { type: 'grid', name: '', flatten: true, schema: [
          { name: 'grid_power', selector: ent }, { name: 'grid_power_export', selector: ent },
          { name: 'solar_power', selector: ent }, { name: 'battery_power', selector: ent },
          { name: 'battery_soc', selector: { entity: { domain: 'sensor', device_class: 'battery' } } },
          { name: 'stale_minutes', selector: { number: { min: 1, max: 120, mode: 'box' } } },
        ] },
        { name: 'show_devices', selector: { boolean: {} } },
      ],
      computeLabel: (s) => tr(null, `f_${s.name}`),
    };
  }
  getCardSize() { return 7; }
  async loadData() { return { live: true }; }
  headExtra() { return this._updated ? `<span class="hint">${esc(this._updated)}</span>` : ''; }
  onHass() {
    if (!this._data || !this._ctx) return;
    const now = Date.now();
    if (this._lastDraw && now - this._lastDraw < 1000) {
      clearTimeout(this._pending);
      this._pending = setTimeout(() => this.onHass(), 1000);
      return;
    }
    const sig = JSON.stringify(this._ids().map((id) => {
      const s = this._hass.states[id];
      return s ? [s.state, Math.floor((now - Date.parse(s.last_reported || s.last_updated)) / 60e3)] : null;
    }));
    if (sig === this._sig) return;
    this._sig = sig;
    this._lastDraw = now;
    this._render();
  }
  _entities() {
    const c = this._config, m = this._ctx.m;
    return {
      grid: c.grid_power || m.rates.grid[0] || '',
      gridExport: c.grid_power_export || '',
      solar: c.solar_power || m.rates.solar[0] || '',
      battery: c.battery_power || m.rates.battery[0] || '',
      soc: c.battery_soc || '',
    };
  }
  _devPower() {
    if (!this._dp || Date.now() - this._dpAt > 60e3) (this._dp = findDevicePower(this._hass, this._ctx.m, this._config.device_power || {})), (this._dpAt = Date.now());
    return this._dp;
  }
  _ids() {
    return [...Object.values(this._entities()), ...Object.values(this._config.show_devices ? this._devPower() : {})].filter(Boolean);
  }
  renderBody(D, ctx, P, F) {
    const E = this._entities(), h = this._hass, c = this._config;
    const dp = c.show_devices ? this._devPower() : {};
    const devs = ctx.m.devices.filter((d) => dp[d.id] && h.states[dp[d.id]]);
    if (!E.grid && !devs.length) return `<div class="empty">${esc(this.L('no_live'))}</div>`;
    const staleMs = (c.stale_minutes || 5) * 60e3;
    const fresh = (ids) => {
      let age = null, stale = false;
      for (const id of ids.filter(Boolean)) {
        const s = h.states[id];
        if (!s) continue;
        const a = Math.max(0, Date.now() - Date.parse(s.last_reported || s.last_updated));
        if (!isFinite(a)) continue;
        age = Math.max(age ?? 0, a);
        if (a > staleMs && Math.abs(powerW(h, id) || 0) > 5) stale = true;
      }
      return { age, stale };
    };
    const state = {
      grid: E.grid ? (powerW(h, E.grid) || 0) - (E.gridExport ? powerW(h, E.gridExport) || 0 : 0) : null,
      solar: E.solar ? Math.max(0, powerW(h, E.solar) || 0) : 0,
      battery: E.battery ? powerW(h, E.battery) || 0 : 0,
      soc: E.soc && h.states[E.soc] ? parseFloat(h.states[E.soc].state) : null,
      hasSolar: !!E.solar, hasBattery: !!E.battery, devs,
      dev: Object.fromEntries(devs.map((d) => [d.id, Math.max(0, powerW(h, dp[d.id]) || 0)])),
      fr: { grid: fresh([E.grid, E.gridExport]), solar: fresh([E.solar]), battery: fresh([E.battery]), dev: Object.fromEntries(devs.map((d) => [d.id, fresh([dp[d.id]])])) },
    };
    this._updated = new Date().toLocaleTimeString(F.loc);
    return this.chart('live', { height: 'auto', draw: (el) => drawLive(el, state, ctx, h) });
  }
}
function drawLive(el, s, ctx, hass) {
  const P = palOf(hass), F = makeFmt(hass), L = (k, v) => tr(hass, k, v);
  const W = F.W, hasGrid = s.grid != null;
  const f = hasGrid ? decompose({ fromGrid: clamp0(s.grid), toGrid: clamp0(-s.grid), solar: s.solar, batOut: clamp0(s.battery), batIn: clamp0(-s.battery) }) : null;
  let rows = [];
  const add = (d, depth) => {
    rows.push({ d, depth, w: s.dev[d.id] || 0, fr: s.fr.dev[d.id] });
    s.devs.filter((c) => c.parent === d.id).forEach((c) => add(c, depth + 1));
  };
  s.devs.filter((d) => !d.parent || !s.devs.some((x) => x.id === d.parent)).forEach((d) => add(d, 0));
  const topW = sum(rows.filter((r) => r.depth === 0), (r) => r.w);
  const homeW = hasGrid ? f.home : topW;
  const mismatch = hasGrid && rows.length > 0 && topW - homeW > Math.max(40, 0.1 * homeW);
  if (hasGrid && rows.length) rows.push({ d: null, depth: 0, w: clamp0(homeW - topW), unknown: mismatch });
  const compact = (el.clientWidth || 600) < 560 && hasGrid;
  const allRows = rows;
  if (compact) rows = [];
  const valText = (r) => (r.unknown ? '?' : W(r.w));
  const ageTitle = (fr) => (fr && fr.age != null ? ` · ${L('last_reading', { a: F.age(fr.age) })}` : '');

  const rowH = 36, VBW = rows.length ? 920 : 470;
  const H = rows.length ? Math.max(300, 30 + rows.length * rowH) : s.hasBattery && hasGrid ? 340 : 250;
  const cy = H / 2 + (s.hasSolar && hasGrid ? 30 : 0);
  const Pp = rows.length
    ? { grid: [80, cy], home: [380, cy], solar: [230, Math.max(50, cy - 135)], battery: [230, Math.min(H - 50, cy + 135)] }
    : { grid: [70, 170], home: [390, 170], solar: [230, 55], battery: [230, 285] };
  if (!hasGrid) Pp.home = [110, cy];
  const flow = (d, val, color) => {
    const on = val > 3;
    const dur = on ? Math.max(0.6, 4 - Math.log10(val + 1)) : 0;
    return `<path class="base" d="${d}"/>${on ? `<path class="flow" d="${d}" style="stroke:${color};stroke-width:${Math.min(6, 2 + val / 1500)};animation-duration:${dur}s"><title>${W(val)}</title></path>` : ''}`;
  };
  const edge = (a, b, val, color, bend = 0) => {
    const [x1, y1] = Pp[a], [x2, y2] = Pp[b];
    return flow(`M${x1},${y1} Q${(x1 + x2) / 2 + bend},${(y1 + y2) / 2 + bend} ${x2},${y2}`, val, color);
  };
  const node = (k, label, value, color, sub = '', fr = null) =>
    `<g class="node" transform="translate(${Pp[k][0]},${Pp[k][1]})"><title>${esc(label)}: ${value}${esc(ageTitle(fr))}</title><circle r="44" style="stroke:${color}"/><text class="t2" y="-10">${esc(label)}</text><text class="t1" y="9">${value}</text>${sub ? `<text class="t2" y="25">${esc(sub)}</text>` : ''}${fr && fr.stale ? `<text class="stale" y="62">⏱ ${esc(L('no_update', { a: F.age(fr.age) }))}</text>` : ''}</g>`;
  let edges = '';
  if (hasGrid) {
    edges += edge('grid', 'home', f.gridToHome, P.grid);
    if (s.hasSolar) edges += edge('solar', 'home', f.solarToHome, P.solar) + edge('solar', 'grid', f.solarToGrid, P.export);
    if (s.hasSolar && s.hasBattery) edges += edge('solar', 'battery', f.solarToBat, P.charge, -40);
    if (s.hasBattery) edges += edge('battery', 'home', f.batToHome, P.battery) + edge('grid', 'battery', f.gridToBat, P.charge) + edge('battery', 'grid', f.batToGrid, P.export, 30);
  }
  const x0 = 560, pillW = 340, maxW = Math.max(1, ...rows.map((r) => r.w));
  const top0 = (H - rows.length * rowH) / 2 + 4;
  let pills = '';
  const parentY = {};
  rows.forEach((r, i) => {
    const y = top0 + i * rowH, x = x0 + r.depth * 26, w = pillW - r.depth * 26, mid = y + 14;
    const color = devColor(P, r.d);
    if (r.depth === 0) {
      const [hx, hy] = Pp.home;
      edges += flow(`M${hx + 44},${hy} C${hx + 120},${hy} ${x - 90},${mid} ${x},${mid}`, r.w, color);
    } else {
      const py = parentY[r.d.parent] ?? mid;
      edges += flow(`M${x - 14},${py + 14} L${x - 14},${mid} L${x},${mid}`, r.w, color);
    }
    if (r.d) parentY[r.d.id] = y;
    const name = r.d ? devName(ctx, r.d) : L('untracked');
    const tip = r.unknown ? L('unknown_tip', { n: name, d: W(topW), h: W(homeW) }) : `${name}: ${W(r.w)}${ageTitle(r.fr)}`;
    pills += `<g class="pill${(r.fr && r.fr.stale) || r.unknown ? ' warn' : ''}" transform="translate(${x},${y})"><title>${esc(tip)}</title>
      <rect class="bg" width="${w}" height="28" rx="14"/>
      <rect width="${Math.max(0, (r.w / maxW) * (w - 4))}" height="24" x="2" y="2" rx="12" style="fill:${color};opacity:.22"/>
      <circle cx="16" cy="14" r="5" style="fill:${color}"/>
      <text x="28" y="15" class="${r.w < 3 ? 'muted' : ''}">${esc(name.length > 30 ? name.slice(0, 29) + '…' : name)}</text>
      ${r.fr && r.fr.stale ? `<text x="${w - 74}" y="15" class="w stale">⏱ ${esc(F.age(r.fr.age))}</text>` : ''}
      ${r.unknown ? `<text x="${w - 30}" y="15" class="w stale">${esc(L('devices_gt_home'))}</text>` : ''}
      <text x="${w - 12}" y="15" class="w ${r.w < 3 && !r.unknown ? 'muted' : ''}">${valText(r)}</text></g>`;
  });
  const nodes = [
    hasGrid ? node('grid', L('grid'), W(Math.abs(s.grid)), P.grid, s.grid < -5 ? L('exporting') : s.grid > 5 ? L('importing') : '', s.fr.grid) : '',
    node('home', L('house'), W(homeW), P.home, hasGrid ? '' : L('measured_devices')),
    hasGrid && s.hasSolar ? node('solar', L('sun'), W(s.solar), P.solar, '', s.fr.solar) : '',
    hasGrid && s.hasBattery ? node('battery', L('bat'), W(Math.abs(s.battery)), P.battery, s.soc != null && !isNaN(s.soc) ? `${F.num(s.soc, 0)}% · ${L(s.battery > 5 ? 'discharging' : s.battery < -5 ? 'charging' : 'idle')}` : '', s.fr.battery) : '',
  ].join('');
  let list = '';
  if (compact && allRows.length) {
    const mx = Math.max(1, ...allRows.map((r) => r.w));
    list = `<div class="dl">${allRows.map((r) => {
      const color = devColor(P, r.d);
      return `<div class="dv ${r.depth ? 'child' : ''} ${(r.fr && r.fr.stale) || r.unknown ? 'warn' : ''}"><span class="dot" style="background:${color}"></span><span class="nm">${esc(r.d ? devName(ctx, r.d) : L('untracked'))}</span><span class="br"><span style="width:${(r.w / mx) * 100}%;background:${color}"></span></span><span class="vl">${r.fr && r.fr.stale ? `<small class="stale">⏱ ${esc(F.age(r.fr.age))}</small> ` : ''}${valText(r)}</span></div>`;
    }).join('')}</div>`;
  }
  el.style.height = 'auto';
  el.innerHTML = `<svg viewBox="0 0 ${VBW} ${H}" role="img" style="width:100%;height:auto;max-height:${Math.max(340, H)}px">${edges}${nodes}${pills}</svg>${list}`;
}
EnergyPlusLiveCard.style = `
  .chart svg { overflow: visible; }
  .node circle { fill: var(--card-background-color, #fff); stroke-width: 3; }
  .node .t1 { font-size: 13px; font-weight: 650; fill: var(--primary-text-color); text-anchor: middle; font-variant-numeric: tabular-nums; }
  .node .t2 { font-size: 11px; fill: var(--secondary-text-color); text-anchor: middle; }
  path.base { fill: none; stroke: var(--ep-grid); stroke-width: 2; }
  path.flow { fill: none; stroke-linecap: round; stroke-dasharray: 2 14; animation: flow linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -32; } }
  @media (prefers-reduced-motion: reduce) { path.flow { animation: none; stroke-dasharray: none; } }
  .pill rect.bg { fill: var(--ep-surface-2); }
  .pill.warn rect.bg { stroke: var(--ep-warn); stroke-width: 1; stroke-dasharray: 3 3; }
  .pill text { font-size: 12px; fill: var(--primary-text-color); dominant-baseline: middle; }
  .pill text.w { font-variant-numeric: tabular-nums; font-weight: 600; text-anchor: end; }
  .pill text.muted { fill: var(--secondary-text-color); }
  .stale { fill: var(--ep-warn-ink); color: var(--ep-warn-ink); font-size: 11px; font-weight: 600; }
  .node .stale { text-anchor: middle; }
  .dl { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
  .dv { display: grid; grid-template-columns: 12px minmax(80px, 1fr) 1fr auto; gap: 10px; align-items: center; padding: 5px 4px; font-size: 14px; border-radius: 8px; }
  .dv.warn { outline: 1px dashed var(--ep-warn); }
  .dv.child { padding-left: 18px; }
  .dv .dot { width: 10px; height: 10px; border-radius: 3px; }
  .dv .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dv .br { height: 8px; border-radius: 999px; background: var(--ep-surface-2); overflow: hidden; }
  .dv .br span { display: block; height: 100%; border-radius: 999px; }
  .dv .vl { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
`;
registerCard('energyplus-live-flow-card', EnergyPlusLiveCard, 'EnergyPlus live energy flow', 'Animated live power flow from grid and solar to your home and every device, with stale-sensor markers.');
