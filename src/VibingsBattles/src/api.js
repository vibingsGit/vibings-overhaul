// Stash GraphQL + Python backend access, and per-category definitions.

import { pickPair, rememberPair, emptyMemory } from "./pairing.js";

export const LOG = "[Vibings Battles]";
export const VERSION = "2.1.0"; // must match settings.yml (checked by tests)
const PLUGIN_ID = "VibingsBattles";

export async function graphql(query, variables = {}) {
  const resp = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
  return json.data;
}

// Calls the Python backend. Backend errors arrive as GraphQL errors and are thrown.
export async function backend(operation, args = {}) {
  const data = await graphql(
    `mutation VibingsBattlesOp($args: Map) { runPluginOperation(plugin_id: "${PLUGIN_ID}", args: $args) }`,
    { args: { operation, ...args } }
  );
  return data?.runPluginOperation ?? null;
}

// ===========================================================================
// Categories
// ===========================================================================

const basename = (path) => (path ? String(path).split(/[/\\]/).pop() : "");

// Fallback media sources for items whose own image is Stash's placeholder.
const SCENES_OF = (key) => ({
  find: "findScenes", listKey: "scenes", filterArg: "scene_filter", filterType: "SceneFilterType", key,
  fields: "paths { screenshot preview }", image: (it) => it.paths?.screenshot, video: (it) => it.paths?.preview,
});
const IMAGES_OF = (key) => ({
  find: "findImages", listKey: "images", filterArg: "image_filter", filterType: "ImageFilterType", key,
  fields: "paths { thumbnail }", image: (it) => it.paths?.thumbnail,
});
const performerList = (it) => it.performers?.map((p) => p.name).join(", ");

export const CATEGORIES = [
  {
    id: "scenes",
    label: "Scenes",
    find: "findScenes",
    listKey: "scenes",
    update: "sceneUpdate",
    updateInput: "SceneUpdateInput",
    fields: "id title date rating100 o_counter files { basename duration } paths { screenshot preview } studio { name } performers { id name }",
    title: (it) => it.title || basename(it.files?.[0]?.basename) || `Scene ${it.id}`,
    subtitle: (it) => [it.studio?.name, performerList(it), it.date].filter(Boolean).join(" · "),
    image: (it) => it.paths?.screenshot,
    video: (it) => it.paths?.preview,
    href: (id) => `/scenes/${id}`,
    hasPerformers: true,
  },
  {
    id: "images",
    label: "Images",
    find: "findImages",
    listKey: "images",
    update: "imageUpdate",
    updateInput: "ImageUpdateInput",
    fields: "id title date rating100 o_counter visual_files { ... on BaseFile { basename } } paths { thumbnail image } studio { name } performers { id name }",
    title: (it) => it.title || it.visual_files?.[0]?.basename || `Image ${it.id}`,
    subtitle: (it) => [it.studio?.name, performerList(it), it.date].filter(Boolean).join(" · "),
    // Animated files only animate from the original; stills use the thumbnail.
    image: (it) => (/\.(gif|webp|apng)$/i.test(it.visual_files?.[0]?.basename || "") ? it.paths?.image : it.paths?.thumbnail),
    thumb: (it) => it.paths?.thumbnail,
    href: (id) => `/images/${id}`,
    hasPerformers: true,
  },
  {
    id: "performers",
    label: "Performers",
    find: "findPerformers",
    listKey: "performers",
    update: "performerUpdate",
    updateInput: "PerformerUpdateInput",
    fields: "id name disambiguation rating100 o_counter image_path scene_count",
    title: (it) => it.name + (it.disambiguation ? ` (${it.disambiguation})` : ""),
    subtitle: (it) => `${it.scene_count} scenes`,
    image: (it) => it.image_path,
    href: (id) => `/performers/${id}`,
    portrait: true,
    fallback: [SCENES_OF("performers"), IMAGES_OF("performers")],
  },
  {
    id: "studios",
    label: "Studios",
    find: "findStudios",
    listKey: "studios",
    update: "studioUpdate",
    updateInput: "StudioUpdateInput",
    fields: "id name rating100 o_counter image_path scene_count",
    title: (it) => it.name,
    subtitle: (it) => `${it.scene_count} scenes`,
    image: (it) => it.image_path,
    href: (id) => `/studios/${id}`,
    contain: true,
    fallback: [SCENES_OF("studios"), IMAGES_OF("studios")],
  },
  {
    id: "groups",
    label: "Groups",
    find: "findGroups",
    listKey: "groups",
    update: "groupUpdate",
    updateInput: "GroupUpdateInput",
    fields: "id name date rating100 o_counter front_image_path scene_count",
    title: (it) => it.name,
    subtitle: (it) => [`${it.scene_count} scenes`, it.date].filter(Boolean).join(" · "),
    image: (it) => it.front_image_path,
    href: (id) => `/groups/${id}`,
    portrait: true,
    fallback: [SCENES_OF("groups")],
  },
  {
    id: "galleries",
    label: "Galleries",
    find: "findGalleries",
    listKey: "galleries",
    update: "galleryUpdate",
    updateInput: "GalleryUpdateInput",
    fields: "id title date rating100 image_count paths { cover } files { basename } folder { path } studio { name } performers { id name }",
    title: (it) => it.title || it.files?.[0]?.basename || basename(it.folder?.path) || `Gallery ${it.id}`,
    subtitle: (it) => [it.studio?.name, `${it.image_count} images`, it.date].filter(Boolean).join(" · "),
    image: (it) => it.paths?.cover,
    href: (id) => `/galleries/${id}`,
    fallback: [IMAGES_OF("galleries")],
  },
];
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export async function fetchCounts() {
  const parts = CATEGORIES.map((c) => `${c.id}: ${c.find}(filter: { per_page: 0 }) { count }`);
  const data = await graphql(`query VibingsBattlesCounts { ${parts.join(" ")} }`);
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, data[c.id].count]));
}

// ===========================================================================
// Media
// ===========================================================================

// Stash serves a generated placeholder (marked default=true) when an item has no image.
export const isPlaceholder = (url) => !url || /[?&]default=true/.test(url);

// Stable per-item seed so the same fallback picture is shown every time.
const seedFor = (id) => {
  let h = 7;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 99991;
  return h;
};

const fallbackCache = new Map(); // "cat:id" -> Promise<{ image, video } | null>

/**
 * A picture (and preview video, for scenes) from the item's own library,
 * used when its image is a placeholder: a performer's or studio's scenes,
 * a group's scenes, a gallery's images.
 */
export function fetchFallbackMedia(cat, id) {
  if (!cat.fallback) return Promise.resolve(null);
  const cacheKey = `${cat.id}:${id}`;
  if (!fallbackCache.has(cacheKey)) {
    fallbackCache.set(cacheKey, (async () => {
      for (const src of cat.fallback) {
        try {
          const data = await graphql(
            `query VibingsBattlesFallback($f: FindFilterType, $c: ${src.filterType}) { ${src.find}(filter: $f, ${src.filterArg}: $c) { ${src.listKey} { ${src.fields} } } }`,
            { f: { per_page: 1, sort: `random_${seedFor(id)}` }, c: { [src.key]: { value: [String(id)], modifier: "INCLUDES" } } }
          );
          const hit = data[src.find][src.listKey][0];
          if (hit) return { image: src.image(hit), video: src.video?.(hit) };
        } catch (e) {
          console.warn(LOG, "fallback media failed", cat.id, id, e);
        }
      }
      return null;
    })());
  }
  return fallbackCache.get(cacheKey);
}

// ===========================================================================
// Items
// ===========================================================================

const SAMPLE_SIZE = 40;

// Random ids from Stash; brings unranked items into the candidate pool.
async function fetchSample(cat) {
  const seed = Math.floor(Math.random() * 1e8);
  const data = await graphql(
    `query VibingsBattlesSample($f: FindFilterType) { ${cat.find}(filter: $f) { ${cat.listKey} { id } } }`,
    { f: { sort: `random_${seed}`, per_page: SAMPLE_SIZE } }
  );
  return data[cat.find][cat.listKey].map((it) => it.id);
}

async function fetchItemsById(cat, ids) {
  const data = await graphql(
    `query VibingsBattlesItems($ids: [ID!]) { ${cat.find}(ids: $ids) { ${cat.listKey} { ${cat.fields} } } }`,
    { ids }
  );
  const byId = new Map(data[cat.find][cat.listKey].map((it) => [String(it.id), it]));
  return ids.map((id) => byId.get(String(id)));
}

/**
 * Fetch items by id, tolerating ids that no longer exist in Stash (Stash
 * fails the whole query if one is missing). Returns { items: Map, missing: [] }.
 */
export async function fetchItemsSafe(cat, ids) {
  const items = new Map();
  if (!ids.length) return { items, missing: [] };
  try {
    const list = await fetchItemsById(cat, ids);
    list.forEach((it, i) => it && items.set(String(ids[i]), it));
    return { items, missing: ids.filter((id) => !items.has(String(id))).map(String) };
  } catch (e) {
    console.warn(LOG, "batch fetch failed, retrying one by one", e);
  }
  const missing = [];
  for (const id of ids) {
    try {
      const [it] = await fetchItemsById(cat, [id]);
      if (it) items.set(String(id), it);
      else missing.push(String(id));
    } catch {
      missing.push(String(id));
    }
  }
  return { items, missing };
}

// Choose and load the next pair. `ctx` holds ranked items, session memory
// and known-missing ids; returns { pair, memory }.
export async function fetchSmartPair(cat, ctx) {
  const sample = await fetchSample(cat);
  let memory = ctx.memory;
  for (let attempt = 0; attempt < 4; attempt++) {
    let ids = pickPair(ctx.ranked, sample, { ...memory, missing: ctx.missing, initialRating: ctx.initialRating });
    if (!ids && memory.pairList.length) {
      memory = emptyMemory(); // every pair was recent: forget and try again
      ids = pickPair(ctx.ranked, sample, { missing: ctx.missing, initialRating: ctx.initialRating });
    }
    if (!ids) throw new Error(`${cat.label}: at least two items are needed for a battle.`);
    const { items, missing } = await fetchItemsSafe(cat, ids);
    if (!missing.length) return { pair: ids.map((id) => items.get(String(id))), memory: rememberPair(memory, ids[0], ids[1]) };
    missing.forEach((id) => ctx.missing.add(id));
  }
  throw new Error(`${cat.label}: could not find a valid pair.`);
}

// ===========================================================================
// Rating sync
// ===========================================================================

const SYNC_CHUNK = 100;

/**
 * Write rating100 values reported by the backend to Stash, batched with
 * aliases. Items deleted from Stash are skipped. Returns the number written.
 */
export async function syncRatings(changed, onProgress) {
  const rows = (changed || []).filter((c) => CATEGORY_BY_ID[c.category]);
  let done = 0;
  for (let start = 0; start < rows.length; start += SYNC_CHUNK) {
    const chunk = rows.slice(start, start + SYNC_CHUNK);
    try {
      await syncChunk(chunk);
    } catch (e) {
      // One missing item fails the batch; fall back to one by one and skip the missing.
      console.warn(LOG, "sync batch failed, retrying one by one", e);
      for (const row of chunk) {
        try {
          await syncChunk([row]);
        } catch (err) {
          console.warn(LOG, "sync skipped", row, err.message);
        }
      }
    }
    done += chunk.length;
    if (onProgress) onProgress(done, rows.length);
  }
  return rows.length;
}

async function syncChunk(rows) {
  const defs = [];
  const fields = [];
  const vars = {};
  rows.forEach((c, i) => {
    const cat = CATEGORY_BY_ID[c.category];
    defs.push(`$i${i}: ${cat.updateInput}!`);
    fields.push(`r${i}: ${cat.update}(input: $i${i}) { id }`);
    vars[`i${i}`] = { id: String(c.id), rating100: c.rating100 ?? null };
  });
  await graphql(`mutation VibingsBattlesSync(${defs.join(", ")}) { ${fields.join(" ")} }`, vars);
}

// ===========================================================================
// Status checks
// ===========================================================================

const STATE_ORDER = { ok: 0, info: 0, warn: 1, error: 2 };
export const worstState = (checks) =>
  checks.reduce((w, c) => (STATE_ORDER[c.state] > STATE_ORDER[w] ? c.state : w), "ok");

/**
 * Health of each part of the plugin. Returns
 * [{ id, label, state: "ok" | "info" | "warn" | "error", detail }].
 */
export async function runStatusChecks(settings) {
  const checks = [{ id: "ui", label: "UI", state: "ok", detail: `v${VERSION}` }];

  let ping = null;
  const t0 = performance.now();
  try {
    ping = await backend("ping");
    const ms = Math.round(performance.now() - t0);
    const mismatch = ping.version !== VERSION;
    checks.push({
      id: "backend",
      label: "Backend (Python)",
      state: mismatch ? "warn" : "ok",
      detail: mismatch
        ? `Backend v${ping.version || "?"} but UI v${VERSION}. Reload the page; if it persists, reinstall the plugin.`
        : `v${ping.version} · Python ${ping.python} · ${ms} ms`,
    });
  } catch (e) {
    checks.push({ id: "backend", label: "Backend (Python)", state: "error", detail: e.message });
  }

  if (ping) {
    const kb = (ping.dataBytes / 1024).toFixed(1);
    checks.push({
      id: "data",
      label: "Battle data",
      state: ping.corruptBackups ? "warn" : "ok",
      detail: `${ping.battles} battles · ${kb} KB · format v${ping.dataVersion}` +
        (ping.corruptBackups ? ` · ${ping.corruptBackups} unreadable data file(s) set aside next to the plugin` : ""),
    });
  }

  try {
    const data = await graphql(`query VibingsBattlesStatus { version { version } plugins { id version enabled } }`);
    const plugin = data.plugins.find((p) => p.id === "VibingsBattles");
    checks.push({ id: "stash", label: "Stash", state: "ok", detail: `${data.version.version} · GraphQL reachable` });
    checks.push(
      !plugin
        ? { id: "plugin", label: "Plugin registration", state: "error", detail: "Stash does not list VibingsBattles." }
        : plugin.version !== VERSION
          ? { id: "plugin", label: "Plugin registration", state: "warn", detail: `Stash lists v${plugin.version}, UI is v${VERSION} (development build or pending update).` }
          : { id: "plugin", label: "Plugin registration", state: "ok", detail: `v${plugin.version} · ${plugin.enabled ? "enabled" : "disabled"}` }
    );
  } catch (e) {
    checks.push({ id: "stash", label: "Stash", state: "error", detail: e.message });
  }

  try {
    const counts = await fetchCounts();
    const usable = CATEGORIES.filter((c) => counts[c.id] >= 2);
    const unusable = CATEGORIES.filter((c) => counts[c.id] < 2).map((c) => c.label);
    checks.push({
      id: "library",
      label: "Library",
      state: usable.length ? "ok" : "error",
      detail: `${usable.length}/${CATEGORIES.length} categories can battle` + (unusable.length ? ` (too few items: ${unusable.join(", ")})` : ""),
    });
  } catch (e) {
    checks.push({ id: "library", label: "Library", state: "error", detail: e.message });
  }

  if (settings) {
    const sync = settings.ui?.syncRatings !== false;
    const pb = settings.performerBonus;
    checks.push({ id: "sync", label: "Rating sync", state: "info", detail: sync ? "On — ratings are written to Stash" : "Off — Stash ratings are not touched" });
    checks.push({ id: "bonus", label: "Performer bonus", state: "info", detail: pb?.enabled ? `On — winner ${pb.winnerPct}%, loser ${pb.loserPct}%` : "Off" });
  }
  return checks;
}
