/* EnergyPlus key figures card: tiles with totals and change versus the previous period. */
const KPI_TILES = ['home', 'grid_in', 'export', 'solar', 'self_sufficiency', 'battery', 'net_cost', 'gas', 'water'];
class EnergyPlusKpiCard extends EnergyPlusBase {
  static get titleKey() { return 't_kpi'; }
  static get defaults() { return {}; }
  static getConfigForm() {
    return EnergyPlusBase.formSchema([
      { name: 'compare', selector: { boolean: {} } },
      { name: 'tiles', selector: { select: { multiple: true, mode: 'list', options: KPI_TILES.map((t) => ({ value: t, label: tr(null, t) })) } } },
    ]);
  }
  getCardSize() { return 3; }
  renderBody(D, ctx, P, F) {
    const m = ctx.m, T = D.C.total, Pv = D.Pcut && D.Pcut.total, L = this.L;
    const want = (k) => !(this._config.tiles && this._config.tiles.length) || this._config.tiles.includes(k);
    const tiles = [];
    const tile = (k, color, value, unit, foot, dlt = '', ring = null) => {
      if (!want(k)) return;
      const r = ring == null ? '' : (() => {
        const rr = 15, c = 2 * Math.PI * rr, f = Math.max(0, Math.min(1, ring));
        return `<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="${rr}" fill="none" stroke="var(--ep-grid)" stroke-width="5"/><circle cx="20" cy="20" r="${rr}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c * f} ${c}" transform="rotate(-90 20 20)"/></svg>`;
      })();
      tiles.push(`<div class="kpi" style="--c:${color}">${r}<div class="lb"><i></i>${esc(L(k))}</div><div class="v">${value}<small>${esc(unit)}</small></div><div class="ft"><span>${foot}</span>${dlt}</div></div>`);
    };
    const filled = D.C.buckets.filter((b) => b.n).length || 1;
    const [hv, hu] = F.kwhParts(T.home);
    tile('home', P.home, hv, hu, esc(L('avg_per', { v: F.kwh(T.home / filled), u: L(`unit_${this._period}`) })), this.delta(T.home, Pv && Pv.home, false));
    if (m.gridIn.length) {
      const [v, u] = F.kwhParts(T.fromGrid);
      tile('grid_in', P.grid, v, u, esc(L('net', { v: F.kwh(T.fromGrid - T.toGrid) })), this.delta(T.fromGrid, Pv && Pv.fromGrid, false));
    }
    if (m.gridOut.length) {
      const [v, u] = F.kwhParts(T.toGrid);
      tile('export', P.export, v, u, m.hasCost ? esc(L('compensation', { v: F.money(T.comp) })) : '', this.delta(T.toGrid, Pv && Pv.toGrid, true));
    }
    if (m.hasSolar) {
      const [v, u] = F.kwhParts(T.solar);
      tile('solar', P.solar, v, u, esc(L('self_used', { v: F.pct((T.solar - T.solarToGrid) / T.solar) })), this.delta(T.solar, Pv && Pv.solar, true));
    }
    if (m.hasSolar || m.hasBattery) {
      const self = T.home > 0 ? (T.home - T.gridToHome) / T.home : 0;
      const pself = Pv && Pv.home > 0 ? (Pv.home - Pv.gridToHome) / Pv.home : null;
      let d = '';
      if (this._config.compare && pself != null) {
        const pp = (self - pself) * 100;
        const cls = Math.abs(pp) < 0.5 ? 'neutral' : pp > 0 ? 'good' : 'bad';
        d = `<span class="delta ${cls}" title="${esc(L('pp'))}">${Math.abs(pp) < 0.5 ? '→' : pp > 0 ? '▲' : '▼'} ${F.num(Math.abs(pp), 0)} pp</span>`;
      }
      tile('self_sufficiency', P.export, F.num(self * 100, 0), '%', esc(L(m.hasBattery ? 'own_gen_bat' : 'own_gen')), d, self);
    }
    if (m.hasBattery) {
      const [v, u] = F.kwhParts(T.batOut);
      tile('battery', P.battery, v, u, esc(L('charged', { v: F.kwh(T.batIn) })), this.delta(T.batOut, Pv && Pv.batOut, true));
    }
    if (m.hasCost) {
      const net = T.cost - T.comp, pnet = Pv ? Pv.cost - Pv.comp : null;
      tile('net_cost', P.grid, esc(F.money(net)), '', T.fromGrid > 0 ? esc(L('per_kwh', { v: F.money(T.cost / T.fromGrid, 3) })) : '', this.delta(net, pnet, false));
    }
    if (m.gas.length) {
      const u = ctx.meta[m.gas[0].id] && ctx.meta[m.gas[0].id].unit && !/m³|ft³|CCF|L/.test(ctx.meta[m.gas[0].id].unit) ? ctx.meta[m.gas[0].id].unit : 'm³';
      tile('gas', P.gas, F.num(T.gas, T.gas < 10 ? 2 : 1), u, T.gasCost ? esc(F.money(T.gasCost)) : '', this.delta(T.gas, Pv && Pv.gas, false));
    }
    if (m.water.length) {
      const [v, u] = F.water(T.water).split(' ');
      tile('water', P.water, v, u, T.waterCost ? esc(F.money(T.waterCost)) : '', this.delta(T.water, Pv && Pv.water, false));
    }
    return `<div class="kpis">${tiles.join('')}</div>`;
  }
}
EnergyPlusKpiCard.style = `
  .kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .kpi { position: relative; overflow: hidden; border-radius: 12px; padding: 12px 14px 10px 16px; background: var(--ep-surface-2); }
  .kpi::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--c); }
  .kpi .lb { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ep-muted); font-weight: 500; }
  .kpi .lb i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  .kpi .v { font-size: 24px; font-weight: 650; letter-spacing: -0.02em; margin: 4px 0 2px; font-variant-numeric: tabular-nums; color: var(--primary-text-color); }
  .kpi .v small { font-size: 13px; font-weight: 500; color: var(--ep-muted); margin-left: 3px; }
  .kpi .ft { display: flex; justify-content: space-between; gap: 6px; font-size: 11.5px; color: var(--ep-muted); }
  .kpi .ring { position: absolute; right: 10px; top: 10px; width: 34px; height: 34px; }
`;
registerCard('energyplus-kpi-card', EnergyPlusKpiCard, 'EnergyPlus key figures', 'Consumption, grid, solar, self-sufficiency and costs with change versus the previous period.');
