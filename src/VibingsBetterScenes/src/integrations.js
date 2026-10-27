// The other Vibings plugins: which are installed and enabled, and what this
// page uses from them.
//
// - Vibings Better Os: O positions on the timeline, its Os panel, O button
//   that stores the position (window.VibingsBetterOs).
// - Vibings Play Tracking Fix: play time and plays of this player
//   (window.VibingsPlayTracking); without it a fallback like Stash's own.
// - Vibings Battles: the scene's and performers' Elo and rank.
// - Vibings Stats: links to the statistics.

import { LOG, graphql, pluginOperation } from "./api.js";
import { overhaulPluginStates } from "../../_shared/overhaul-plugins.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

let states = null; // Promise<{ [id]: { installed, enabled, version } }>

export function pluginStates() {
  if (!states) {
    states = overhaulPluginStates(graphql)
      .then((list) => Object.fromEntries(list.map((p) => [p.id, p])))
      .catch((e) => {
        console.warn(LOG, "could not read the plugin list:", e.message);
        states = null;
        return {};
      });
  }
  return states;
}

/** { VibingsBattles: {enabled,…}, … } once loaded, else {}. */
export function usePlugins() {
  const [value, setValue] = React.useState({});
  React.useEffect(() => {
    let live = true;
    pluginStates().then((v) => live && setValue(v));
    return () => { live = false; };
  }, []);
  return value;
}

export const betterOs = () => window.VibingsBetterOs || null;
export const playTracking = () => window.VibingsPlayTracking || null;

// ---------------------------------------------------------------- Battles

const battleCache = new Map(); // category -> { at, promise }
const BATTLE_TTL = 60 * 1000;

/** Battles ranking of a category: Map id -> { rating, rank, wins, losses, draws, total }. */
export function battleRanking(category) {
  const hit = battleCache.get(category);
  if (hit && Date.now() - hit.at < BATTLE_TTL) return hit.promise;
  const promise = pluginOperation("VibingsBattles", { operation: "get_items", category })
    .then((items) => {
      const map = new Map();
      (items || []).forEach((it, i) => map.set(String(it.id), {
        rating: it.rating, rank: i + 1, total: items.length,
        wins: it.wins || 0, losses: it.losses || 0, draws: it.draws || 0,
      }));
      return map;
    })
    .catch((e) => {
      battleCache.delete(category);
      throw e;
    });
  battleCache.set(category, { at: Date.now(), promise });
  return promise;
}

export function useBattleRanking(category, enabled, reload = 0) {
  const [map, setMap] = React.useState(null);
  React.useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    battleRanking(category).then((m) => live && setMap(m)).catch(() => live && setMap(null));
    return () => { live = false; };
  }, [category, enabled, reload]);
  return map;
}

export const forgetBattleRanking = () => battleCache.clear();

let battleSync = null; // Promise<boolean>: does Battles write ratings to Stash
function battleSyncOn() {
  if (!battleSync) {
    battleSync = pluginOperation("VibingsBattles", { operation: "get_settings" })
      .then((s) => s?.ui?.syncRatings !== false)
      .catch(() => { battleSync = null; return false; });
  }
  return battleSync;
}

const SYNC = {
  scenes: ["SceneUpdateInput", "sceneUpdate"],
  performers: ["PerformerUpdateInput", "performerUpdate"],
};

/**
 * A battle between two scenes, recorded by Vibings Battles (result "a",
 * "b" or "draw"). Ratings that changed are written to Stash when Battles
 * syncs ratings. Returns Battles' answer ({ entry, a, b, changed }).
 */
export async function recordSceneBattle(a, b, result) {
  const ref = (s) => ({ id: String(s.id), name: s.title || "", performers: (s.performers || []).map((p) => ({ id: String(p.id), name: p.name })) });
  const out = await pluginOperation("VibingsBattles", { operation: "record", category: "scenes", a: ref(a), b: ref(b), result });
  forgetBattleRanking();
  const rows = (out?.changed || []).filter((c) => SYNC[c.category]);
  if (rows.length && (await battleSyncOn())) {
    for (let start = 0; start < rows.length; start += 100) {
      const chunk = rows.slice(start, start + 100);
      const defs = chunk.map((c, i) => "$i" + i + ": " + SYNC[c.category][0] + "!").join(", ");
      const fields = chunk.map((c, i) => "r" + i + ": " + SYNC[c.category][1] + "(input: $i" + i + ") { id }").join(" ");
      const vars = Object.fromEntries(chunk.map((c, i) => ["i" + i, { id: String(c.id), rating100: c.rating100 ?? null }]));
      try {
        await graphql("mutation VibingsBetterScenesBattleSync(" + defs + ") { " + fields + " }", vars);
      } catch (e) {
        console.warn(LOG, "could not write the new ratings:", e.message);
      }
    }
  }
  return out;
}
