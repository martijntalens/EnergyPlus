// Generates the content of the energyplus-cards repository (dist, hacs.json, README, CI, licence):
//   node build.mjs && node make-repos.mjs <output-folder>
// Screenshots are added separately to <output-folder>/images/<card>-light.png / -dark.png.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(dir, "repo"));
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

const REPO = "energyplus-cards";
const short = (tag) => tag.replace(/^energyplus-|-card$/g, "");
const ci = `name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  cards:
    name: Cards
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: "22"
      - name: Check JavaScript syntax
        run: node --check dist/${REPO}.js
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
const img = (c, theme) => `https://raw.githubusercontent.com/martijntalens/${REPO}/main/images/${short(c.tag)}-${theme}.png`;
const section = (c) => `## ${c.pick.replace(/^EnergyPlus /, "").replace(/^./, (x) => x.toUpperCase())}

\`type: custom:${c.tag}\`

${c.intro}

| Light theme | Dark theme |
|---|---|
| ![${c.pick}, light theme](${img(c, "light")}) | ![${c.pick}, dark theme](${img(c, "dark")}) |

All options are optional:

\`\`\`yaml
type: custom:${c.tag}
${c.options}
\`\`\`

${c.notes}
`;
const readme = `# EnergyPlus cards

Seven Home Assistant dashboard cards that show your energy use in more detail than the
built-in Energy dashboard — in one download:

| Card | Type |
|---|---|
${CARDS.map((c) => `| [${c.pick.replace(/^EnergyPlus /, "").replace(/^./, (x) => x.toUpperCase())}](#${c.pick.replace(/^EnergyPlus /, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}) | \`custom:${c.tag}\` |`).join("\n")}

*Screenshots show sample data.*

The cards are part of the [EnergyPlus](https://github.com/martijntalens/EnergyPlus)
project, but work on their own: the EnergyPlus app does not need to be installed or
running. They use the configuration of the Home Assistant **Energy dashboard**
(*Settings → Dashboards → Energy*), so set that up first.

## Installation

### Marketplace (formerly HACS) — recommended

1. In Home Assistant open **Marketplace** and choose **Add from a GitHub link**.
2. Enter \`https://github.com/martijntalens/${REPO}\` and click **Add**.
3. Find **EnergyPlus cards**, download it and reload the browser when asked.

On an older HACS version: open **⋮ → Custom repositories**, add the same link with type
**Dashboard**, then download.

### Manual

1. Download [\`dist/${REPO}.js\`](dist/${REPO}.js) and copy it to the \`www\` folder in
   your Home Assistant configuration folder.
2. Go to **Settings → Dashboards → ⋮ → Resources → Add resource**, enter
   \`/local/${REPO}.js\` and choose **JavaScript module**.
3. Reload the browser.

## Usage

Edit a dashboard, **Add card** and search for **EnergyPlus**. Every card has a visual
editor; the YAML options are listed per card below.

### Period

The period cards have their own buttons (day, week, month, year) and ‹ › to step back
in time. With \`energy_date_selection: true\` a card follows the date picker of the
Energy dashboard instead (add the *Energy date picker* card to the same dashboard).
This uses the energy data of the Home Assistant frontend, which is not an official
interface for custom cards; if it is not available, the card uses its own buttons.

Several EnergyPlus cards on one dashboard share the data they load.

${CARDS.map(section).join("\n")}
## Language and theme

The cards follow the language of your Home Assistant (Dutch or English) and its light
or dark theme.

## Privacy

The cards only read the Energy dashboard configuration, long-term statistics and entity
states through your own Home Assistant connection. They make no external requests and
change nothing in Home Assistant.

## License

MIT — see [LICENSE](LICENSE).
`;

fs.mkdirSync(path.join(out, "dist"), { recursive: true });
fs.mkdirSync(path.join(out, "images"), { recursive: true });
fs.mkdirSync(path.join(out, ".github", "workflows"), { recursive: true });
fs.copyFileSync(path.join(dir, "dist", `${REPO}.js`), path.join(out, "dist", `${REPO}.js`));
fs.writeFileSync(path.join(out, "hacs.json"), JSON.stringify({ name: "EnergyPlus cards", filename: `${REPO}.js`, homeassistant: "2024.8.0", render_readme: true }, null, 2) + "\n");
fs.writeFileSync(path.join(out, "README.md"), readme);
fs.writeFileSync(path.join(out, "LICENSE"), LICENSE);
fs.writeFileSync(path.join(out, ".gitattributes"), "* text=auto eol=lf\n*.png binary\n");
fs.writeFileSync(path.join(out, ".gitignore"), ".DS_Store\nThumbs.db\n.idea/\n.vscode/\nnode_modules/\n");
fs.writeFileSync(path.join(out, ".github", "workflows", "ci.yaml"), ci);
console.log(`${REPO}  v${VERSION}, ${CARDS.length} cards`);
