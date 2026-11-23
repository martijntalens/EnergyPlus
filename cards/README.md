# EnergyPlus dashboard cards — source

Source of the EnergyPlus dashboard cards. Every card is published in its **own**
repository (one card per repository, so the Home Assistant Marketplace / HACS can
install it):

| Card | Repository |
|---|---|
| Key figures | [energyplus-kpi-card](https://github.com/martijntalens/energyplus-kpi-card) |
| Live energy flow | [energyplus-live-flow-card](https://github.com/martijntalens/energyplus-live-flow-card) |
| Devices | [energyplus-devices-card](https://github.com/martijntalens/energyplus-devices-card) |
| Solar | [energyplus-solar-card](https://github.com/martijntalens/energyplus-solar-card) |
| Costs | [energyplus-costs-card](https://github.com/martijntalens/energyplus-costs-card) |
| Off-peak and peak | [energyplus-tariff-card](https://github.com/martijntalens/energyplus-tariff-card) |
| Appliance cycles | [energyplus-cycles-card](https://github.com/martijntalens/energyplus-cycles-card) |

The cards do not need the EnergyPlus app: they read the Energy dashboard
configuration and statistics through the logged-in user's Home Assistant connection.

## Layout

```
src/core.js        shared code: data loading, calculations, SVG charts, base card
src/<card>.js      one file per card
build.mjs          builds dist/<tag>.js: core + card in one self-contained file
make-repos.mjs     writes the content of each card repository (dist, README, hacs.json, CI)
test/harness.html  test page that emulates Home Assistant with the EnergyPlus demo data
```

## Build and release

```bash
cd cards
node build.mjs                          # -> dist/*.js
node make-repos.mjs ../../energyplus-cards
```

Bump `version` in `package.json` first. Screenshots for the READMEs are made from
`test/harness.html` (serve the repository root, e.g. `python3 -m http.server`, and open
`/cards/test/harness.html?cards=solar&theme=dark`).
