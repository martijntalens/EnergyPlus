// Builds dist/energyplus-cards.js: one self-contained file (no dependencies) with all
// EnergyPlus dashboard cards. Published in https://github.com/martijntalens/energyplus-cards
//   node build.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const CARDS = [
  { tag: "energyplus-kpi-card", src: "kpi.js", title: "Key figures" },
  { tag: "energyplus-live-flow-card", src: "live.js", title: "Live energy flow" },
  { tag: "energyplus-devices-card", src: "devices.js", title: "Devices" },
  { tag: "energyplus-solar-card", src: "solar.js", title: "Solar" },
  { tag: "energyplus-costs-card", src: "costs.js", title: "Costs" },
  { tag: "energyplus-tariff-card", src: "tariff.js", title: "Off-peak and peak" },
  { tag: "energyplus-cycles-card", src: "cycles.js", title: "Appliance cycles" },
];
const VERSION = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
const core = fs.readFileSync(path.join(dir, "src/core.js"), "utf8").replace("__VERSION__", VERSION);
const bodies = CARDS.map((c) => `/* ---------------- ${c.tag} ---------------- */\n` + fs.readFileSync(path.join(dir, "src", c.src), "utf8")).join("\n");
const out = `/*
 * EnergyPlus cards for Home Assistant dashboards — v${VERSION}
 * ${CARDS.map((c) => `custom:${c.tag}`).join("\n * ")}
 *
 * https://github.com/martijntalens/energyplus-cards — part of https://github.com/martijntalens/EnergyPlus
 * Reads the Energy dashboard configuration and statistics of Home Assistant.
 * Read-only, no external requests. Generated file — edit cards/src in the EnergyPlus repository.
 */
(() => {
'use strict';
if (window.__energyplusCardsLoaded) return;
window.__energyplusCardsLoaded = true;
${core}
${bodies}
console.info('%c ENERGYPLUS-CARDS %c ${VERSION} ', 'color:#fff;background:#eda100;font-weight:700', 'color:#eda100;background:transparent');
})();
`;
fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
for (const f of fs.readdirSync(path.join(dir, "dist"))) fs.rmSync(path.join(dir, "dist", f));
fs.writeFileSync(path.join(dir, "dist", "energyplus-cards.js"), out);
console.log(`dist/energyplus-cards.js  ${(out.length / 1024).toFixed(1)} kB, ${CARDS.length} cards`);
