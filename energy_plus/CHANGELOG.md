# Changelog

## 0.4.0
- The app is now called **EnergyPlus** everywhere (app store, sidebar and page title),
  in line with the EnergyPlus cards and ClimatePlus. The internal slug stays
  `energy_plus`, so updating keeps your installation and settings.

## 0.3.2
- Live flow: the warning banner is removed; issues are only marked on the sensor itself
  (⏱ with its age for stale sensors, "apparaten > huis ?" on *Niet apart gemeten* when the devices add up
  to more than the home).

## 0.3.1
- Live flow: warning when the measured devices together use more power than the whole
  home (solar + grid), instead of silently showing 0 W for "Niet apart gemeten" (now "?").
- Live flow: sensors that show power but have not reported for more than 5 minutes are
  marked with ⏱ and their age; the warning names them as the likely cause.

## 0.3.0
- Annual bill forecast (*jaarafrekening-voorspeller*): enter your monthly payment, fixed
  costs and the start of your billing year in the dashboard; Energie+ predicts the refund
  or extra payment and advises a monthly amount. Settings are stored in the app's own
  `/data` folder.
- Appliance cycles: washing machine, dryer and dishwasher runs detected from hourly
  energy statistics, with runs per week, kWh and cost per run, share in daltarief,
  usual start time and a "running now" badge when a power sensor is available.
- Prices: historic cost statistics now take precedence over the fixed price, so past
  periods are valued at the prices that applied then.

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
