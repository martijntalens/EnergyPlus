/* EnergyPlus devices card: consumption and cost per device, as a ranking or a timeline. */
class EnergyPlusDevicesCard extends EnergyPlusBase {
  static get titleKey() { return 't_devices'; }
  static get defaults() { return { view: 'list', show_cost: true }; }
  static getConfigForm() {
    return EnergyPlusBase.formSchema([
      { type: 'grid', name: '', flatten: true, schema: [
        { name: 'view', selector: { select: { mode: 'dropdown', options: [{ value: 'list', label: tr(null, 'ranking') }, { value: 'chart', label: tr(null, 'timeline') }] } } },
        { name: 'show_cost', selector: { boolean: {} } },
      ] },
    ]);
  }
  getCardSize() { return 6; }
  headExtra() {
    const v = this._view || this._config.view;
    return `<div class="seg views"><button data-view="list" aria-pressed="${v === 'list'}">${esc(this.L('ranking'))}</button><button data-view="chart" aria-pressed="${v === 'chart'}">${esc(this.L('timeline'))}</button></div>`;
  }
  renderBody(D, ctx, P, F) {
    const m = ctx.m, L = this.L;
    if (!m.devices.length) return `<div class="empty">${esc(L('no_data'))}</div>`;
    const T = D.C.total, home = T.home || 1;
    const withCost = this._config.show_cost && D.C.havePrice;
    const top = m.devices.filter((d) => !d.parent);
    const view = this._view || this._config.view;
    if (view === 'chart') {
      const B = D.C.buckets;
      const series = top.map((d) => ({ name: devName(ctx, d), color: devColor(P, d), stack: 'dev', data: B.map((b) => b.dev[d.id] || 0) }));
      series.push({ name: L('untracked'), color: P.other, stack: 'dev', data: B.map((b) => clamp0(b.home - sum(top, (d) => b.dev[d.id] || 0))) });
      const shown = series.filter((s) => anyNonZero(s.data));
      return legendHtml(shown) + this.chart('c', {
        height: 260, labels: D.buckets.map((b) => b.label), titles: D.buckets.map((b) => b.title), series: shown,
        yFmt: (v) => F.num(v, v % 1 ? 1 : 0), valFmt: (v) => F.kwh(v),
        footer: withCost ? (i) => `<div class="ft"><span>${esc(L('costs'))}</span><b>${esc(F.money(B[i].homeCost))}</b></div>` : null,
      });
    }
    const tracked = sum(top, (d) => T.dev[d.id] || 0), trackedCost = sum(top, (d) => T.devCost[d.id] || 0);
    const rows = [];
    const row = (name, color, v, c, depth, cls = '') => rows.push(`<div class="dev ${depth ? 'child' : ''} ${cls}" title="${esc(name)}: ${esc(F.kwh(v))}${withCost ? ` · ${esc(F.money(c))}` : ''}">
      <span class="dot" style="background:${color}"></span><span class="name">${esc(name)}</span>
      <span class="bar"><span style="width:${Math.min(100, (v / home) * 100)}%;background:${color}"></span></span>
      <span class="val">${esc(F.kwh(v))}<small>${esc(F.pct(v / home))}</small></span>${withCost ? `<span class="cost">${esc(F.money(c))}</span>` : ''}</div>`);
    const walk = (d, depth) => {
      row(devName(ctx, d), devColor(P, d), T.dev[d.id] || 0, T.devCost[d.id] || 0, depth);
      m.devices.filter((c) => c.parent === d.id).sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0)).forEach((c) => walk(c, depth + 1));
    };
    top.sort((a, b) => (T.dev[b.id] || 0) - (T.dev[a.id] || 0)).forEach((d) => walk(d, 0));
    row(L('untracked'), P.other, clamp0(T.home - tracked), clamp0(T.homeCost - trackedCost), 0);
    if (withCost) rows.push(`<div class="dev total"><span></span><span class="name">${esc(L('total_use'))}</span><span></span><span class="val">${esc(F.kwh(T.home))}<small>100%</small></span><span class="cost">${esc(F.money(T.homeCost))}</span></div>`);
    return `${withCost ? `<div class="hint" title="${esc(L('cost_note'))}">${esc(L('cost_hint'))} ⓘ</div>` : ''}<div class="list ${withCost ? 'wc' : ''}">${rows.join('')}</div>`;
  }
  afterRender() {
    this.shadowRoot.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => ((this._view = b.dataset.view), this._render())));
  }
}
EnergyPlusDevicesCard.style = `
  .hint { font-size: 12px; color: var(--ep-muted); margin: 0 0 8px; cursor: help; }
  .list { display: flex; flex-direction: column; gap: 2px; }
  .dev { display: grid; grid-template-columns: 12px minmax(90px, 1.2fr) 2fr auto; align-items: center; gap: 10px; padding: 5px 0; font-size: 14px; }
  .list.wc .dev { grid-template-columns: 12px minmax(90px, 1.2fr) 2fr auto 64px; }
  .dev.child { padding-left: 18px; }
  .dev.child .name::before { content: "↳ "; color: var(--ep-muted); }
  .dev .dot { width: 10px; height: 10px; border-radius: 3px; }
  .dev .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--primary-text-color); }
  .dev .bar { height: 8px; background: var(--ep-surface-2); border-radius: 999px; overflow: hidden; }
  .dev .bar span { display: block; height: 100%; border-radius: 999px; }
  .dev .val { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--primary-text-color); }
  .dev .val small { color: var(--ep-muted); margin-left: 6px; font-size: 11px; }
  .dev .cost { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--primary-text-color); }
  .dev.total { border-top: 1px solid var(--ep-grid); margin-top: 4px; padding-top: 8px; font-weight: 600; }
  @container (max-width: 420px) { .dev .bar { display: none; } .dev, .list.wc .dev { grid-template-columns: 12px 1fr auto auto; } .dev.total > span:nth-child(3) { display: none; } }
`;
registerCard('energyplus-devices-card', EnergyPlusDevicesCard, 'EnergyPlus devices', 'Consumption and cost per device (at the off-peak or peak rate of that moment), as a ranking or timeline.');
