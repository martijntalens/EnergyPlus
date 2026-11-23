/* EnergyPlus tariff card: import and return per meter register (tariff 1 = dal, tariff 2 = piek). */
class EnergyPlusTariffCard extends EnergyPlusBase {
  static get titleKey() { return 't_tariff'; }
  static get defaults() { return {}; }
  static getConfigForm() { return EnergyPlusBase.formSchema(); }
  getCardSize() { return 6; }
  renderBody(D, ctx, P, F) {
    const m = ctx.m, L = this.L, T = D.C.total, B = D.C.buckets, keys = m.tariffKeys || [];
    if (!m.gridIn.length) return `<div class="empty">${esc(L('no_data'))}</div>`;
    const col = (k, dir) => (k === 'piek' ? (dir === 'in' ? P.piek : P.piekOut) : k === 'dal' || k === 'enkel' ? (dir === 'in' ? P.grid : P.export) : dir === 'in' ? P.d[6] : P.d[7]);
    const byKey = (map, list) => {
      const o = {};
      for (const g of list) o[g.tariff] = (o[g.tariff] || 0) + (map[g.id] || 0);
      return o;
    };
    const inK = byKey(T.tariffIn, m.gridIn), outK = byKey(T.tariffOut, m.gridOut), costK = byKey(T.costIn, m.gridIn), compK = byKey(T.compOut, m.gridOut);
    const prices = D.C.prices || {};
    const hasOut = m.gridOut.length > 0, hasMoney = D.C.havePrice || m.hasCost, hasComp = hasOut && m.hasCost;
    const costOf = (k) => (costK[k] ? costK[k] : prices[k] != null ? (inK[k] || 0) * prices[k] : null);
    const head = [L('tariff'), L('import'), ...(hasOut ? [L('feed_in'), L('net_short')] : []), ...(hasMoney ? [L('price_kwh'), L('costs')] : []), ...(hasComp ? [L('comp_short')] : [])];
    const rows = keys.map((k) => {
      const i = inK[k] || 0, o = outK[k] || 0, c = costOf(k);
      return `<tr><td><b><span class="sw" style="background:${col(k, 'in')}"></span>${esc(tariffName(this._hass, k))}</b></td><td>${esc(F.kwh(i))} <small>${esc(F.pct(i / (T.fromGrid || 1)))}</small></td>` +
        (hasOut ? `<td>${esc(F.kwh(o))}</td><td>${esc(F.kwh(i - o))}</td>` : '') +
        (hasMoney ? `<td>${prices[k] != null ? esc(F.money(prices[k], 3)) : '–'}</td><td>${c != null ? esc(F.money(c)) : '–'}</td>` : '') +
        (hasComp ? `<td>${compK[k] ? `− ${esc(F.money(compK[k]))}` : '–'}</td>` : '') + '</tr>';
    });
    const totalCost = sum(keys, (k) => costOf(k) || 0);
    rows.push(`<tr class="tot"><td>${esc(L('total'))}</td><td>${esc(F.kwh(T.fromGrid))}</td>` +
      (hasOut ? `<td>${esc(F.kwh(T.toGrid))}</td><td>${esc(F.kwh(T.fromGrid - T.toGrid))}</td>` : '') +
      (hasMoney ? `<td>${T.fromGrid > 0 && totalCost ? esc(F.money(totalCost / T.fromGrid, 3)) : '–'}</td><td>${esc(F.money(totalCost))}</td>` : '') +
      (hasComp ? `<td>− ${esc(F.money(T.comp))}</td>` : '') + '</tr>');
    const series = [
      ...keys.map((k) => ({ name: L('import_of', { t: tariffName(this._hass, k).toLowerCase() }), color: col(k, 'in'), stack: 'in', data: B.map((b) => byKey(b.tariffIn, m.gridIn)[k] || 0) })),
      ...keys.map((k) => ({ name: L('feed_in_of', { t: tariffName(this._hass, k).toLowerCase() }), color: col(k, 'out'), stack: 'out', data: B.map((b) => -(byKey(b.tariffOut, m.gridOut)[k] || 0)) })),
    ].filter((s) => anyNonZero(s.data));
    return `<div class="sub">${esc(L('tariff_sub'))}</div><div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` +
      legendHtml(series) + this.chart('c', { height: 210, labels: D.buckets.map((b) => b.label), titles: D.buckets.map((b) => b.title), series, yFmt: (v) => F.num(v, v % 1 ? 1 : 0), valFmt: (v) => F.kwh(v) });
  }
}
EnergyPlusTariffCard.style = `
  .sub { font-size: 12px; color: var(--ep-muted); margin: 0 0 6px; }
  tr.tot td { font-weight: 600; border-bottom: 0; }
  .legend { margin-top: 10px; }
`;
registerCard('energyplus-tariff-card', EnergyPlusTariffCard, 'EnergyPlus off-peak and peak', 'Import, return, price and cost per meter register (tariff 1 = off-peak, tariff 2 = peak).');
