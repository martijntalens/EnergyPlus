// Builds one self-contained JavaScript file per EnergyPlus card (no dependencies):
//   node build.mjs            -> cards/dist/<tag>.js
// Each card lives in its own GitHub repository; copy dist/<tag>.js to <repo>/dist/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const CARDS = [
  { tag: "energyplus-kpi-card", src: "kpi.js", title: "EnergyPlus key figures card" },
  { tag: "energyplus-live-flow-card", src: "live.js", title: "EnergyPlus live energy flow card" },
  { tag: "energyplus-devices-card", src: "devices.js", title: "EnergyPlus devices card" },
  { tag: "energyplus-solar-card", src: "solar.js", title: "EnergyPlus solar card" },
  { tag: "energyplus-costs-card", src: "costs.js", title: "EnergyPlus costs card" },
  { tag: "energyplus-tariff-card", src: "tariff.js", title: "EnergyPlus off-peak and peak card" },
  { tag: "energyplus-cycles-card", src: "cycles.js", title: "EnergyPlus appliance cycles card" },
];
const VERSION = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
const core = fs.readFileSync(path.join(dir, "src/core.js"), "utf8").replace("__VERSION__", VERSION);
fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
for (const c of CARDS) {
  const body = fs.readFileSync(path.join(dir, "src", c.src), "utf8");
  const out = `/*
 * ${c.title} for Home Assistant dashboards — v${VERSION}
 * Part of EnergyPlus: https://github.com/martijntalens/EnergyPlus
 * Reads the Energy dashboard configuration and statistics of Home Assistant.
 * Read-only, no external requests. Generated file — edit cards/src in the EnergyPlus repository.
 *
 *   type: custom:${c.tag}
 */
(() => {
'use strict';
${core}
${body}
})();
`;
  fs.writeFileSync(path.join(dir, "dist", `${c.tag}.js`), out);
  console.log(`dist/${c.tag}.js  ${(out.length / 1024).toFixed(1)} kB`);
}
