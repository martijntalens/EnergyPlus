// Generates the content of each card repository (dist, hacs.json, README, CI, licence):
//   node build.mjs && node make-repos.mjs <output-folder>
// Screenshots are added separately to <output-folder>/<tag>/images/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(dir, "repos"));
const VERSION = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
const LICENSE = fs.readFileSync(path.join(dir, "..", "LICENSE"), "utf8");

const COMMON_OPTIONS = `title: Mijn titel                 # empty string hides the header
period: day                      # day | week | month | year (start view)
show_navigation: true            # period buttons and ‹ › in the card
energy_date_selection: false     # follow the date picker of the Energy dashboard`;

const CARDS = [
  {
    tag: "energyplus-kpi-card", name: "EnergyPlus key figures card", pick: "EnergyPlus key figures",
    intro: "Key figures of your energy use in one card: home consumption, grid import and return, solar production, self-sufficiency, net electricity cost, gas and water — each with the change versus the previous period (compared at the same point in time while a period is still running).",
    options: `${COMMON_OPTIONS}
compare: true                    # show the change versus the previous period
tiles:                           # which tiles, in this order (default: all available)
  - home
  - grid_in
  - export
  - solar
  - self_sufficiency
  - net_cost
  - gas
  - water`,
    notes: "Tiles for which there is no data (e.g. battery without a battery) are hidden automatically.",
  },
  {
    tag: "energyplus-live-flow-card", name: "EnergyPlus live energy flow card", pick: "EnergyPlus live energy flow",
    intro: "Animated live power flow from the grid and your solar panels to your home, and from your home to every device with a power sensor. The remainder is shown as *Not measured separately*.",
    options: `title: Live energiestroom
grid_power: sensor.p1_power              # W or kW; positive = import, negative = return
grid_power_export: sensor.p1_power_production   # optional separate return sensor
solar_power: sensor.inverter_power
battery_power: sensor.battery_power      # optional; positive = discharging
battery_soc: sensor.battery_level        # optional
show_devices: true
stale_minutes: 5                         # mark sensors without a new reading after this time
device_power:                            # only when a power sensor is not found automatically
  sensor.washer_energy: sensor.washer_power`,
    notes: `- Power sensors set in the Energy dashboard settings are used automatically.
- For each device in the Energy dashboard the card looks for a power sensor on the same Home Assistant device (smart plugs usually have both an energy and a power sensor), then for a sensor named like \`…_power\`.
- **Sensor checks.** A sensor that shows power but has not reported for longer than \`stale_minutes\` is marked with ⏱ and its age. When the devices together use more than the home in total (solar + grid), *Not measured separately* shows "devices > home ?": the sensors disagree (a slow cloud integration, a grid sensor that measures one phase, or devices counted twice).
- On narrow screens the devices are shown as a list below the diagram.`,
    noPeriod: true,
  },
  {
    tag: "energyplus-devices-card", name: "EnergyPlus devices card", pick: "EnergyPlus devices",
    intro: "Consumption and cost per device from the Energy dashboard, as a ranking with share of the total or as a stacked timeline. Nested devices (*included in*) are indented, and *Not measured separately* is shown explicitly.",
    options: `${COMMON_OPTIONS}
view: list                       # list | chart (can also be switched in the card)
show_cost: true`,
    notes: "**Cost per device** = consumption × the price of the rate that applied in that hour (tariff 1 = off-peak/dal, tariff 2 = peak/piek). Prices come from the cost statistics of the Energy dashboard; without cost statistics the fixed price or price entity from the Energy settings is used. Solar energy used directly is valued at the same rate.",
  },
  {
    tag: "energyplus-solar-card", name: "EnergyPlus solar card", pick: "EnergyPlus solar",
    intro: "Where your solar energy went: used directly, stored in the battery or returned to the grid, with self-consumption, the best hour/day and the solar forecast (Forecast.Solar, Solcast, …) when it is configured in the Energy dashboard.",
    options: COMMON_OPTIONS,
    notes: "The forecast line is shown for the day and week views.",
  },
  {
    tag: "energyplus-costs-card", name: "EnergyPlus costs card", pick: "EnergyPlus costs",
    intro: "Electricity, gas and water costs and the feed-in compensation per hour, day or month, with the net total and the change versus the previous period.",
    options: `${COMMON_OPTIONS}
compare: true`,
    notes: "Costs come from the cost statistics of the Energy dashboard, so set all-in prices there (including energy tax and VAT).",
  },
  {
    tag: "energyplus-tariff-card", name: "EnergyPlus off-peak and peak card", pick: "EnergyPlus off-peak and peak",
    intro: "Import and return per meter register — tariff 1 = off-peak (*daltarief*), tariff 2 = peak (*piektarief*) — with net, price per kWh, cost and compensation, plus a chart over time.",
    options: COMMON_OPTIONS,
    notes: "Registers are recognised by name (*tarif 1*, *tariff 2*, *low*, *normal*, …); otherwise the first grid source is off-peak and the second is peak.",
  },
  {
    tag: "energyplus-cycles-card", name: "EnergyPlus appliance cycles card", pick: "EnergyPlus appliance cycles",
    intro: "Runs of your washing machine, dryer, dishwasher and oven, detected from hourly energy statistics: number of runs, runs per week, kWh and cost per run, share at the off-peak rate, usual start time and last run, plus a chart of start times with the off-peak hours marked. With a power sensor the card shows when an appliance is running now.",
    options: `${COMMON_OPTIONS.replace("period: day   ", "period: week  ")}
devices:                         # optional: which Energy dashboard devices (energy statistic ids)
  - sensor.washer_energy
  - sensor.dishwasher_energy`,
    notes: "Without `devices` the card picks devices whose name contains *was*, *droger*, *vaatwas*, *oven*, *magnetron*, *airfryer* (or *wash*, *dryer*, *dish*). A run is a sequence of hours above the device's standby level; one quiet hour inside a run is allowed. Because hourly statistics are used, two programmes right after each other can count as one run.",
  },
];

const ci = (tag) => `name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  card:
    name: Card
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: "22"
      - name: Check JavaScript syntax
        run: node --check dist/${tag}.js
      - name: Check hacs.json
        run: |
          node -e '
            const fs = require("fs");
            const cfg = JSON.parse(fs.readFileSync("hacs.json", "utf8"));
            if (!cfg.name || !cfg.filename) throw new Error("hacs.json needs name and filename");
            if (!fs.existsSync("dist/" + cfg.filename)) throw new Error("dist/" + cfg.filename + " is missing");
            console.log("ok");
          '
`;

const readme = (c) => `# ${c.name}

${c.intro}

| Light theme | Dark theme |
|---|---|
| ![${c.name}, light theme](https://raw.githubusercontent.com/martijntalens/${c.tag}/main/images/screenshot-light.png) | ![${c.name}, dark theme](https://raw.githubusercontent.com/martijntalens/${c.tag}/main/images/screenshot-dark.png) |

*Sample data.*

The card is part of the [EnergyPlus](https://github.com/martijntalens/EnergyPlus)
project, but works on its own: the EnergyPlus app does not need to be installed or
running. It uses the configuration of the Home Assistant **Energy dashboard**
(*Settings → Dashboards → Energy*), so set that up first.

## Installation

### Marketplace (formerly HACS) — recommended

1. In Home Assistant open **Marketplace** and choose **Add from a GitHub link**.
2. Enter \`https://github.com/martijntalens/${c.tag}\` and click **Add**.
3. Find **${c.name}**, download it and reload the browser when asked.

On an older HACS version: open **⋮ → Custom repositories**, add the same link
with type **Dashboard**, then download the card.

### Manual

1. Download [\`dist/${c.tag}.js\`](dist/${c.tag}.js) and copy it to the \`www\`
   folder in your Home Assistant configuration folder.
2. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**, enter
   \`/local/${c.tag}.js\` and choose **JavaScript module**.
3. Reload the browser.

## Usage

Edit a dashboard, **Add card** and pick **${c.pick}**, or add it in YAML:

\`\`\`yaml
type: custom:${c.tag}
\`\`\`

All options are optional:

\`\`\`yaml
type: custom:${c.tag}
${c.options}
\`\`\`

${c.notes}
${c.noPeriod ? "" : `
### Period

Each card has its own period buttons (day, week, month, year) and ‹ › to step back
in time. With \`energy_date_selection: true\` the card follows the date picker of
the Energy dashboard instead (add the *Energy date picker* card to the same
dashboard). This uses the energy data of the Home Assistant frontend, which is not
an official interface for custom cards; if it stops working, the card falls back to
its own period buttons.
`}
The card follows the language of your Home Assistant (Dutch or English) and its
light or dark theme.

## Privacy

The card only reads the Energy dashboard configuration, long-term statistics and
entity states through your own Home Assistant connection. It makes no external
requests and changes nothing in Home Assistant.

## License

MIT — see [LICENSE](LICENSE).
`;

for (const c of CARDS) {
  const r = path.join(out, c.tag);
  fs.mkdirSync(path.join(r, "dist"), { recursive: true });
  fs.mkdirSync(path.join(r, "images"), { recursive: true });
  fs.mkdirSync(path.join(r, ".github", "workflows"), { recursive: true });
  fs.copyFileSync(path.join(dir, "dist", `${c.tag}.js`), path.join(r, "dist", `${c.tag}.js`));
  fs.writeFileSync(path.join(r, "hacs.json"), JSON.stringify({ name: c.name, filename: `${c.tag}.js`, homeassistant: "2024.8.0", render_readme: true }, null, 2) + "\n");
  fs.writeFileSync(path.join(r, "README.md"), readme(c));
  fs.writeFileSync(path.join(r, "LICENSE"), LICENSE);
  fs.writeFileSync(path.join(r, ".gitattributes"), "* text=auto eol=lf\n*.png binary\n");
  fs.writeFileSync(path.join(r, ".gitignore"), ".DS_Store\nThumbs.db\n.idea/\n.vscode/\nnode_modules/\n");
  fs.writeFileSync(path.join(r, ".github", "workflows", "ci.yaml"), ci(c.tag));
  console.log(`${c.tag}  v${VERSION}`);
}
