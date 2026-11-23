/* EnergyPlus costs card: electricity, gas and water costs and feed-in compensation. */
class EnergyPlusCostsCard extends EnergyPlusBase {
  static get titleKey() { return 't_costs'; }
  static get defaults() { return {}; }
  static getConfigForm() { return EnergyPlusBase.formSchema([{ name: 'compare', selector: { boolean: {} } }]); }
  getCardSize() { return 5; }
  renderBody(D, ctx, P, F) {
    const m = ctx.m, L = this.L, T = D.C.total, B = D.C.buckets, Pv = D.Pcut && D.Pcut.total;
    const hasGas = m.gas.some((g) => g.cost), hasWater = m.water.some((w) => w.cost);
    if (!m.hasCost && !hasGas && !hasWater) return `<div class="empty">${esc(L('no_data'))}</div>`;
    const net = T.cost - T.comp + T.gasCost + T.waterCost;
    const pnet = Pv ? Pv.cost - Pv.comp + Pv.gasCost + Pv.waterCost : null;
    const st = [
      ...(m.hasCost ? [[L('electricity'), esc(F.money(T.cost)), P.grid], [L('comp_short'), `− ${esc(F.money(T.comp))}`, P.export]] : []),
      ...(hasGas ? [[L('gas'), esc(F.money(T.gasCost)), P.gas]] : []),
      ...(hasWater ? [[L('water'), esc(F.money(T.waterCost)), P.water]] : []),
      [L('total_net'), `${esc(F.money(net))} ${this.delta(net, pnet, false)}`, null],
    ];
    const series = [
      { name: L('electricity'), color: P.grid, stack: 'c', data: B.map((b) => b.cost) },
      { name: L('gas'), color: P.gas, stack: 'c', data: B.map((b) => b.gasCost) },
      { name: L('water'), color: P.water, stack: 'c', data: B.map((b) => b.waterCost) },
      { name: L('comp_long'), color: P.export, stack: 'n', data: B.map((b) => -b.comp), neg: true },
    ].filter((s) => anyNonZero(s.data));
    const small = sum(B, (b) => b.cost + b.gasCost) < 50 * B.length;
    return `<div class="stats">${st.map(([l, v, c]) => `<div>${c ? `<i style="background:${c}"></i>` : ''}${esc(l)}<b>${v}</b></div>`).join('')}</div>` +
      legendHtml(series) + this.chart('c', {
        height: 230, labels: D.buckets.map((b) => b.label), titles: D.buckets.map((b) => b.title), series,
        yFmt: (v) => F.money(v, small ? 2 : 0), valFmt: (v, s) => (s.neg ? `− ${F.money(v)}` : F.money(v)),
        footer: (i) => `<div class="ft"><span>${esc(L('net_short'))}</span><b>${esc(F.money(B[i].cost - B[i].comp + B[i].gasCost + B[i].waterCost))}</b></div>`,
      });
  }
}
registerCard('energyplus-costs-card', EnergyPlusCostsCard, 'EnergyPlus costs', 'Electricity, gas and water costs and feed-in compensation per hour, day or month.');
