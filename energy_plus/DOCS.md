# Energie+

Energie+ adds an **extra** energy dashboard to the Home Assistant sidebar. It does not
replace or change the built-in Energy dashboard: it reads the same configuration
(*Settings → Dashboards → Energy*) and the same long-term statistics, and shows them in
more detail.

## What you get

| Section | Details |
|---|---|
| KPI tiles | Home consumption, grid import/export, solar, self-sufficiency, battery, net cost, fossil-free share, gas, water — each with change vs the previous period (measured at the same point in time for the running period). |
| Live energy flow | Animated power flow between grid, solar, home and **every device** with a power sensor (see *Live flow per device*). |
| Sankey diagram | Where your energy came from and where it went, down to individual devices (including nested devices / "included in"). |
| Energy balance | Stacked bars per hour/day/month: solar → home, battery → home, grid → home, export and battery charging, plus a dashed line for the previous period. Table view and CSV export. |
| Devices | Ranking with share of total and **cost per device**, or a stacked timeline. "Not separately measured" is shown explicitly. |
| Solar | Direct use, to battery, exported, self-consumption, best hour/day and the solar forecast (Forecast.Solar / Solcast, if configured). |
| Costs | Electricity, gas, water costs and feed-in compensation. |
| Dal- en piektarief | Consumption, feed-in, net, price and cost per meter register: tariff 1 = *daltarief* (off-peak), tariff 2 = *piektarief* (peak). |
| Insights | Standby load and its yearly cost, dal/piek share and what shifting the washing machine, dryer and dishwasher would save, peak and cheapest moments, top consumer, untracked share, weekend vs weekdays, night use, self-consumption, water per person. |
| Fun facts | Your consumption translated into phone charges, cups of tea, EV kilometres, LED lamps, CO₂ saved by solar, showers and a comparison with an average Dutch household (rounded rules of thumb). |
| Annual bill forecast | Predicts your *jaarafrekening*: expected yearly cost (variable + fixed − energy tax reduction) against your monthly payments, with an advised monthly amount. |
| Appliance cycles | Washing machine, dryer, dishwasher (and oven/airfryer) runs: count, per week, kWh and cost per run, share in daltarief, usual start time, last run, "running now". |
| Year calendar | Daily consumption heatmap; click a day to open it. |

## Options

All options are optional.

| Option | Description |
|---|---|
| `grid_power_entity` | Live grid power in W/kW. Positive = import, negative = export. |
| `grid_power_export_entity` | Separate export power sensor (e.g. DSMR/P1 "power production"). When set, grid = import − export. |
| `solar_power_entity` | Live solar power. |
| `battery_power_entity` | Live battery power. Positive = discharging, negative = charging. |
| `battery_soc_entity` | Battery state of charge in %. |
| `co2_signal_entity` | Fossil-fuel percentage sensor (Electricity Maps / CO2 Signal). Auto-detected when empty. |
| `live_refresh_seconds` | Refresh interval of the live view (2–60 s). |
| `household_size` | Number of people, for water use per person (0 = unknown). |
| `device_power_entities` | Only when a device's power sensor is not found automatically. One entry per device: `energy_sensor=power_sensor`. |

If the power sensors are configured in the Energy dashboard itself (newer HA versions),
Energie+ picks them up automatically. Without a grid power sensor the live card is hidden.

### Live flow per device

For every device in the Energy dashboard's *Individual devices* list, Energie+ looks for a
live power sensor (W/kW) in this order:

1. The power sensor set for that device in the Energy settings (newer HA versions).
2. The `device_power_entities` option.
3. A power sensor on the same Home Assistant device as the energy sensor (smart plugs such
   as Shelly, Tasmota, Zigbee plugs usually expose both).

Devices without a power sensor are left out of the live view. The remainder of the home's
power is shown as *Niet apart gemeten*.

```yaml
device_power_entities:
  - sensor.wasmachine_energy=sensor.wasmachine_power
  - sensor.vaatwasser_energy=sensor.vaatwasser_power
```

### Annual bill forecast

Click **Instellen** on the card and enter, all including VAT:

| Field | Where to find it |
|---|---|
| Start afrekenjaar | Start date of your billing year (contract or last annual bill) |
| Termijnbedrag per maand | Your monthly advance payment for electricity + gas |
| Vaste kosten stroom / gas per maand | Standing charge (*vastrecht*) + grid operator costs (*netbeheerkosten*) |
| Vermindering energiebelasting per jaar | On your annual bill |

The values are stored only in this app's `/data` folder on your Home Assistant (included
in Home Assistant backups). Variable costs come from the cost statistics of the Energy
dashboard, so set all-in prices there (including energy tax and VAT).

Forecast method: the remaining days of the billing year use the same days of last year,
scaled by how this year compares to last year so far (limited to ×0.6–×1.5). Without a
year of history the average so far is used, which does not account for seasonal gas use.

### Appliance cycles

Devices whose name contains *was*, *droger*, *vaatwas*, *oven*, *airfryer* (or English
equivalents) are analysed. A run is a sequence of hours above the device's standby level;
one quiet hour inside a run is allowed. Because hourly statistics are used, two programs
that run directly after each other can be counted as one run. The "running now" badge
needs a live power sensor (see *Live flow per device*).

### Cost per device

Cost = device consumption × the price of the tariff that applied in that hour (dal or
piek). The tariff is taken from which meter register moved; if no register moved (e.g.
everything came from solar) the usual Dutch schedule is used (dal: 23:00–07:00 and
weekends). Prices per tariff come from the cost statistics (cost ÷ kWh for the period shown),
so price changes over time are respected; when there are no cost statistics, the fixed
price or price entity from the Energy settings is used. Solar energy used directly is valued at the same tariff.

### Example for a Dutch P1 (DSMR) meter

```yaml
grid_power_entity: sensor.electricity_meter_power_consumption
grid_power_export_entity: sensor.electricity_meter_power_production
solar_power_entity: sensor.inverter_ac_power
```

## Security and privacy

- **Read-only.** The backend only relays these WebSocket commands to Home Assistant:
  `get_config`, `energy/get_prefs`, `energy/info`, `energy/solar_forecast`,
  `energy/fossil_energy_consumption`, `recorder/statistics_during_period`,
  `recorder/get_statistics_metadata`. Everything else is rejected with HTTP 403.
  To find device power sensors the backend also reads the entity registry
  (`config/entity_registry/list_for_display`) and the current states; it only returns the
  matching sensor IDs to the browser.
- The Supervisor token stays inside the app container; the browser never receives it.
- Only reachable through Home Assistant Ingress (requests from other IPs are refused),
  so Home Assistant's own login and user access apply. No ports are exposed.
- No data leaves your Home Assistant: no cloud, no analytics, ECharts is bundled locally.
  The CSV export is generated in your browser.

## Notes

- Times are shown in the browser's time zone. Use a browser in the same time zone as
  Home Assistant for exact day boundaries.
- Day/week/month views use hourly statistics; the year view uses daily statistics.
- The split of flows (e.g. how much solar went to the battery) is calculated per hour from
  the meter readings, the same way the built-in dashboard does it.
