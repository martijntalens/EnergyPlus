/* EnergyPlus solar card: where your solar energy went, with the forecast when available. */
class EnergyPlusSolarCard extends EnergyPlusBase {
  static get titleKey() { return 't_solar'; }
  static get defaults() { return {}; }
  static getConfigForm() { return EnergyPlusBase.formSchema(); }
  getCardSize() { return 5; }
  async loadData(ctx) {
    const D = await super.loadData(ctx);
    D.fc = null;
    if (ctx.m.hasSolar && (this._period === 'day' || this._period === 'week') && D.end > Date.now() - 2 * 864e5) {
      const f = await cachedWS(this._hass, { type: 'energy/solar_forecast' }, 900e3).catch(() => null);
      if (f) {
        const starts = D.buckets.map((b) => b.start), fc = new Array(starts.length).fill(0);
        let any = false;
        for (const [entry, v] of Object.entries(f)) {
          if (ctx.m.forecast.length && !ctx.m.forecast.includes(entry)) continue;
          for (const [iso, wh] of Object.entries((v && v.wh_hours) || {})) {
            const ts = Date.parse(iso);
            if (ts < D.start || ts >= D.end) continue;
            const i = bucketIndex(starts, ts);
            if (i >= 0) (fc[i] += wh / 1000), (any = true);
          }
        }
        if (any) D.fc = fc;
      }
    }
    return D;
  }
  renderBody(D, ctx, P, F) {
    const L = this.L;
    if (!ctx.m.hasSolar) return `<div class="empty">${esc(L('no_data'))}</div>`;
    const T = D.C.total, B = D.C.buckets;
    const pi = B.reduce((bi, b, i) => (b.solar > (B[bi] ? B[bi].solar : 0) ? i : bi), 0);
    const st = [
      [L('production'), F.kwh(T.solar), P.solar],
      [L('direct'), F.kwh(T.solarToHome), P.solar],
      ...(ctx.m.hasBattery ? [[L('to_battery'), F.kwh(T.solarToBat), P.charge]] : []),
      [L('exported'), F.kwh(T.solarToGrid), P.export],
      [L('self_consumption'), F.pct((T.solar - T.solarToGrid) / T.solar), null],
      ...(T.solar > 0 ? [[L('best', { u: L(`unit_${this._period}`) }), `${D.buckets[pi].label} · ${F.kwh(B[pi].solar)}`, null]] : []),
      ...(D.fc ? [[L('forecast'), F.kwh(sum(D.fc)), null]] : []),
    ];
    const series = [
      { name: L('direct'), color: P.solar, stack: 's', data: B.map((b) => b.solarToHome) },
      { name: L('to_battery'), color: P.charge, stack: 's', data: B.map((b) => b.solarToBat) },
      { name: L('exported'), color: P.export, stack: 's', data: B.map((b) => b.solarToGrid) },
    ].filter((s) => anyNonZero(s.data));
    if (D.fc) series.push({ name: L('forecast'), color: 'var(--secondary-text-color)', type: 'line', dashed: true, data: D.fc });
    return `<div class="stats">${st.map(([l, v, c]) => `<div>${c ? `<i style="background:${c}"></i>` : ''}${esc(l)}<b>${esc(v)}</b></div>`).join('')}</div>` +
      legendHtml(series) + this.chart('c', { height: 230, labels: D.buckets.map((b) => b.label), titles: D.buckets.map((b) => b.title), series, yFmt: (v) => F.num(v, v % 1 ? 1 : 0), valFmt: (v) => F.kwh(v) });
  }
}
registerCard('energyplus-solar-card', EnergyPlusSolarCard, 'EnergyPlus solar', 'Solar production split into used directly, to battery and returned, with self-consumption and forecast.');
