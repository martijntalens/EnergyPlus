# EnergyPlus dashboard cards — source

Source of the EnergyPlus dashboard cards. All seven cards are built into one file and
published in their own repository,
[energyplus-cards](https://github.com/martijntalens/energyplus-cards), separate from
the app so the Home Assistant Marketplace (HACS) can install them in one download:
`custom:energyplus-kpi-card`, `-live-flow-card`, `-devices-card`, `-solar-card`,
`-costs-card`, `-tariff-card` and `-cycles-card`.

The cards do not need the EnergyPlus app: they read the Energy dashboard
configuration and statistics through the logged-in user's Home Assistant connection.

## Layout

```
src/core.js        shared code: data loading, calculations, SVG charts, base card
src/<card>.js      one file per card
build.mjs          builds dist/energyplus-cards.js: core + all cards in one self-contained file
make-repo.mjs      writes the content of the energyplus-cards repository (dist, README, hacs.json, CI)
test/harness.html  test page that emulates Home Assistant with the EnergyPlus demo data
```

## Build and release

```bash
cd cards
node build.mjs                          # -> dist/energyplus-cards.js
node make-repo.mjs ../../energyplus-cards
```

Bump `version` in `package.json` first. Screenshots for the READMEs are made from
`test/harness.html` (serve the repository root, e.g. `python3 -m http.server`, and open
`/cards/test/harness.html?cards=solar&theme=dark`).
