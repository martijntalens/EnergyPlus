# Changelog

## 0.2.0
- Live energy flow per device: animated flows from the home to every device that has a
  power sensor (found automatically on the same Home Assistant device, or set via the
  `device_power_entities` option). Compact list view on phones.
- Devices: cost per device, valued at the tariff that applied at that moment (dal/piek).
- Tariffs: meter register 1 is shown as *daltarief*, register 2 as *piektarief*.
- New "Dal- en piektarief" card (consumption, feed-in, net, price and cost per tariff)
  replaces the average-price chart.
- Insights: more insights (dal/piek share and shift savings, cheapest day, weekend vs
  weekdays, night use, untracked share, own-roof share, water per person); netting
  (*salderen*) insight removed.
- New "Leuke feitjes" card with fun comparisons.
- Load-profile heatmap removed.
- New option `household_size`.

## 0.1.0
- First release: sidebar panel with KPIs, Sankey energy flow, energy balance, devices,
  solar, costs, average price per kWh, tariff split, load-profile heatmap, insights,
  gas, water, yearly calendar heatmap and an optional live power-flow view.
