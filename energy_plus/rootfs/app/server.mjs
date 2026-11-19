// Energie+ — backend for the Home Assistant app (add-on).
//
// Serves the dashboard over Ingress and relays a small, READ-ONLY set of
// Home Assistant WebSocket commands. The Supervisor token never leaves this
// process; the browser only talks to this server through Ingress.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.join(__dirname, "www");
const PORT = Number(process.env.PORT || 8099);
const TOKEN = process.env.SUPERVISOR_TOKEN || process.env.HA_TOKEN || "";
const HA_WS_URL = process.env.HA_WS_URL || "ws://supervisor/core/websocket";
const HA_API_URL = process.env.HA_API_URL || "http://supervisor/core/api";
const DEMO = process.env.DEMO === "1" || !TOKEN;
// Only the Supervisor Ingress proxy may reach us (unless explicitly opened for local dev).
const INGRESS_IPS = new Set(["172.30.32.2", "127.0.0.1", "::1", "::ffff:127.0.0.1", "::ffff:172.30.32.2"]);
const ALLOW_ANY_CLIENT = process.env.ALLOW_ANY_CLIENT === "1";

// Least privilege: read-only commands only. Nothing here can change HA state.
const ALLOWED_WS = new Set([
  "get_config",
  "energy/get_prefs",
  "energy/info",
  "energy/solar_forecast",
  "energy/fossil_energy_consumption",
  "recorder/statistics_during_period",
  "recorder/get_statistics_metadata",
]);

function readOptions() {
  try {
    return JSON.parse(fs.readFileSync("/data/options.json", "utf8"));
  } catch {
    return {};
  }
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------------------------------------------------------------------------
// Home Assistant WebSocket client (single shared connection, auto-reconnect)
// ---------------------------------------------------------------------------
class HAClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.ready = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  connect() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let authed = false;
      const fail = (err) => {
        this.ready = null;
        for (const { reject: rj } of this.pending.values()) rj(err);
        this.pending.clear();
        if (!authed) reject(err);
      };
      ws.addEventListener("message", (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: this.token }));
        } else if (msg.type === "auth_ok") {
          authed = true;
          log("Connected to Home Assistant", msg.ha_version || "");
          resolve(ws);
        } else if (msg.type === "auth_invalid") {
          fail(new Error("Home Assistant rejected the token"));
          ws.close();
        } else if (msg.type === "result" && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.success) p.resolve(msg.result);
          else p.reject(Object.assign(new Error(msg.error?.message || "HA error"), { code: msg.error?.code }));
        }
      });
      ws.addEventListener("close", () => fail(new Error("Connection to Home Assistant closed")));
      ws.addEventListener("error", () => fail(new Error("Cannot connect to Home Assistant")));
    });
    return this.ready;
  }

  async call(payload, timeoutMs = 60000) {
    const ws = await this.connect();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for ${payload.type}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ ...payload, id }));
    });
  }
}

const ha = DEMO ? null : new HAClient(HA_WS_URL, TOKEN);

async function haRest(p) {
  const res = await fetch(`${HA_API_URL}${p}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HA REST ${p} -> ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

function send(res, status, body, type = "application/json") {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(data);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

async function handleApi(req, res, url) {
  const route = url.pathname.replace(/^.*\/api\//, "");

  if (route === "bootstrap" && req.method === "GET") {
    const o = readOptions();
    return send(res, 200, {
      demo: DEMO,
      options: {
        grid_power_entity: o.grid_power_entity || "",
        grid_power_export_entity: o.grid_power_export_entity || "",
        solar_power_entity: o.solar_power_entity || "",
        battery_power_entity: o.battery_power_entity || "",
        battery_soc_entity: o.battery_soc_entity || "",
        co2_signal_entity: o.co2_signal_entity || "",
        live_refresh_seconds: o.live_refresh_seconds || 5,
        household_size: o.household_size || 0,
        device_power_entities: Array.isArray(o.device_power_entities) ? o.device_power_entities : [],
      },
    });
  }

  if (DEMO) return send(res, 409, { error: "demo mode" });

  if (route === "ws" && req.method === "POST") {
    const body = await readBody(req);
    if (!body || !ALLOWED_WS.has(body.type)) return send(res, 403, { error: "Command not allowed" });
    const { id, ...payload } = body; // never let the client pick the message id
    const result = await ha.call(payload);
    return send(res, 200, result);
  }

  if (route === "states" && req.method === "GET") {
    const ids = (url.searchParams.get("ids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => ENTITY_RE.test(s))
      .slice(0, 60);
    const out = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const s = await haRest(`/states/${id}`);
          // Data minimisation: only what the dashboard needs.
          out[id] = {
            state: s.state,
            unit: s.attributes?.unit_of_measurement || null,
            name: s.attributes?.friendly_name || id,
            last_updated: s.last_updated,
          };
        } catch {
          out[id] = null;
        }
      })
    );
    return send(res, 200, out);
  }

  if (route === "autodetect" && req.method === "GET") {
    // Find a CO2 / fossil-fuel-percentage sensor (Electricity Maps / CO2 Signal).
    const states = await haRest("/states");
    const co2 = states
      .map((s) => s.entity_id)
      .filter((id) => id.startsWith("sensor.") && /fossil_fuel_percentage|fossil_fuel/.test(id));
    return send(res, 200, { co2_signal_entity: co2[0] || "" });
  }

  if (route === "device_power" && req.method === "POST") {
    // For each energy sensor, find a power sensor (W/kW) on the same HA device.
    const body = await readBody(req);
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter((s) => typeof s === "string" && ENTITY_RE.test(s)).slice(0, 100);
    const [reg, states] = await Promise.all([
      ha.call({ type: "config/entity_registry/list_for_display" }).catch(() => null),
      haRest("/states"),
    ]);
    const deviceOf = new Map();
    for (const e of reg?.entities || []) if (e.ei && e.di) deviceOf.set(e.ei, e.di);
    const isPower = (s) =>
      s.entity_id.startsWith("sensor.") &&
      (s.attributes?.device_class === "power" || /^(k|M)?W$/.test(s.attributes?.unit_of_measurement || "")) &&
      !/_returned|_export|_production|_productie|teruglever/.test(s.entity_id);
    const power = states.filter(isPower).map((s) => s.entity_id);
    const powerSet = new Set(power);
    const out = {};
    for (const id of ids) {
      const dev = deviceOf.get(id);
      let match = dev ? power.filter((p) => deviceOf.get(p) === dev) : [];
      if (match.length > 1) match = match.filter((p) => /power|vermogen|_w$/.test(p)).concat(match);
      if (!match.length) {
        // Name heuristic: sensor.x_energy -> sensor.x_power
        const guess = id.replace(/_(today_|total_)?(energy|energie|consumption|verbruik)(_total|_today)?$/, "_power");
        if (guess !== id && powerSet.has(guess)) match = [guess];
      }
      if (match[0]) out[id] = match[0];
    }
    return send(res, 200, out);
  }

  return send(res, 404, { error: "Not found" });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!rel || rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(WWW, rel));
  if (!file.startsWith(WWW + path.sep)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback (Ingress paths always end in /)
      return fs.readFile(path.join(WWW, "index.html"), (e2, idx) =>
        e2 ? send(res, 404, "Not found", "text/plain") : send(res, 200, idx, MIME[".html"])
      );
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": file.includes(`${path.sep}vendor${path.sep}`) ? "public, max-age=604800" : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const remote = req.socket.remoteAddress || "";
  if (!ALLOW_ANY_CLIENT && !INGRESS_IPS.has(remote)) {
    return send(res, 403, "Only accessible via Home Assistant Ingress", "text/plain");
  }
  const url = new URL(req.url, "http://localhost");
  try {
    if (/\/api\//.test(url.pathname)) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    log("Error:", err.message);
    return send(res, 502, { error: err.message });
  }
});

server.listen(PORT, () => {
  log(`Energie+ listening on :${PORT}${DEMO ? " (DEMO mode — no Home Assistant token)" : ""}`);
  if (ha) ha.connect().catch((e) => log("Initial HA connection failed:", e.message));
});
