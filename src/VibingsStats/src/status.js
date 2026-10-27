// Status checks: this plugin, Stash, and every Vibings Overhaul plugin.

import { graphql, VERSION, PLUGIN_ID, cachedConfig } from "./api.js";
import { overhaulPluginStates } from "../../_shared/overhaul-plugins.js";
import { datasetStates } from "./store.js";

const STATE_ORDER = { ok: 0, info: 0, warn: 1, error: 2 };
export const worstState = (checks) =>
  checks.reduce((w, c) => (STATE_ORDER[c.state] > STATE_ORDER[w] ? c.state : w), "ok");

function storageBytes() {
  let n = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith("vibings-stats")) n += k.length + (localStorage.getItem(k) || "").length;
    }
  } catch { /* storage unavailable */ }
  return n * 2; // UTF-16
}

/** [{ id, label, state: "ok" | "info" | "warn" | "error", detail }] */
export async function runStatusChecks() {
  const checks = [{ id: "ui", label: "UI", state: "ok", detail: `Vibings Stats v${VERSION}` }];

  let plugins = null;
  const t0 = performance.now();
  try {
    const data = await graphql(`query VibingsStatsStatus { version { version } }`);
    const ms = Math.round(performance.now() - t0);
    checks.push({ id: "stash", label: "Stash", state: "ok", detail: `${data.version.version} · GraphQL ${ms} ms` });
    plugins = await overhaulPluginStates(graphql);
  } catch (e) {
    checks.push({ id: "stash", label: "Stash", state: "error", detail: e.message });
  }

  if (plugins) {
    for (const p of plugins) {
      if (p.id === PLUGIN_ID) {
        checks.push(!p.installed
          ? { id: p.id, label: p.name, state: "error", detail: "Stash does not list VibingsStats." }
          : p.version !== VERSION
            ? { id: p.id, label: p.name, state: "warn", detail: `Stash lists v${p.version}, UI is v${VERSION} (development build or pending update).` }
            : { id: p.id, label: p.name, state: "ok", detail: `v${p.version} · this plugin` });
      } else if (p.installed) {
        checks.push({ id: p.id, label: p.name, state: p.enabled ? "ok" : "info", detail: `v${p.version} · ${p.enabled ? "enabled" : "disabled"}` });
      } else {
        checks.push({ id: p.id, label: p.name, state: "info", detail: p.planned ? "Not released yet" : "Not installed" });
      }
    }
  }

  const config = cachedConfig();
  checks.push({
    id: "page", label: "Statistics page", state: "info",
    detail: config.keepNativeStatsPage ? "Stash's own page is kept; Vibings Stats is at /vibings-stats" : "Stash's Statistics link opens Vibings Stats",
  });

  const states = datasetStates();
  const failed = states.filter((d) => d.error);
  const loaded = states.filter((d) => d.data);
  checks.push({
    id: "data", label: "Statistics data", state: failed.length ? "warn" : "ok",
    detail: failed.length
      ? `${failed.length} failed: ${failed.map((d) => d.label).join(", ")}`
      : `${loaded.length ? `${loaded.length}/${states.length} loaded` : "Not loaded in this browser yet (open the Stats page)"}` +
        ` · cache ${(storageBytes() / 1024).toFixed(0)} KB, kept ${config.cacheMinutes} min`,
  });
  return checks;
}
