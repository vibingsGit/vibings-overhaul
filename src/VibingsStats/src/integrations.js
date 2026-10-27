// Statistics from the other Vibings Overhaul plugins. Each adapter runs only
// when its plugin is installed and enabled; a failing adapter only marks its
// own plugin as failed.

import { graphql, pluginOperation } from "./api.js";
import { overhaulPluginStates } from "../../_shared/overhaul-plugins.js";

const BATTLE_TOP_CATEGORIES = 3; // categories with the most ranked items

/** Vibings Play Tracking Fix's summary: start date, mode and counts; null when not in use. */
export async function playTrackingSummary() {
  const ping = await pluginOperation("VibingsPlayTrackingFix", { operation: "ping" });
  return { installedAt: ping.installedAt, mode: ping.mode, estimate: ping.estimate, counts: ping.counts, dataBytes: ping.dataBytes };
}

const ADAPTERS = {
  VibingsPlayTrackingFix: playTrackingSummary,
  async VibingsBetterOs() {
    const ping = await pluginOperation("VibingsBetterOs", { operation: "ping" });
    return { counts: ping.counts, dataBytes: ping.dataBytes };
  },
  async VibingsBattles() {
    const op = (operation, args = {}) => pluginOperation("VibingsBattles", { operation, ...args });
    const [summary, recent] = await Promise.all([
      op("summary", { tzOffset: new Date().getTimezoneOffset() }),
      op("recent_log", { limit: 8 }),
    ]);
    const cats = Object.entries(summary.categories).filter(([, c]) => c.items > 0)
      .sort((a, b) => b[1].items - a[1].items).slice(0, BATTLE_TOP_CATEGORIES).map(([id]) => id);
    const tops = await Promise.all(cats.map((category) => op("get_items", { category })));
    return {
      summary,
      recent,
      top: Object.fromEntries(cats.map((c, i) => [c, (tops[i] || []).slice(0, 5)
        .map((it) => ({ id: it.id, name: it.name, rating: it.rating, wins: it.wins, losses: it.losses, arenaWins: it.arenaWins }))])),
    };
  },
};

/** [{ id, name, route, installed, enabled, version, planned, stats?, error? }] */
export async function loadIntegrations() {
  const plugins = await overhaulPluginStates(graphql);
  return Promise.all(plugins.map(async (p) => {
    const adapter = ADAPTERS[p.id];
    if (!adapter || !p.enabled) return { ...p, hasStats: !!adapter };
    try {
      return { ...p, hasStats: true, stats: await adapter() };
    } catch (e) {
      return { ...p, hasStats: true, error: e.message || String(e) };
    }
  }));
}
