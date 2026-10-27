// Stash GraphQL access: plain queries, batched counts and paginated lists.

export const LOG = "[Vibings Stats]";
export const VERSION = "2.0.0"; // must match settings.yml (checked by tests)
export const PLUGIN_ID = "VibingsStats";

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

// What each category's find query, list key and filter type are called.
export const ENTITY = {
  scenes: { find: "findScenes", list: "scenes", filter: "scene_filter", type: "SceneFilterType" },
  images: { find: "findImages", list: "images", filter: "image_filter", type: "ImageFilterType" },
  galleries: { find: "findGalleries", list: "galleries", filter: "gallery_filter", type: "GalleryFilterType" },
  performers: { find: "findPerformers", list: "performers", filter: "performer_filter", type: "PerformerFilterType" },
  studios: { find: "findStudios", list: "studios", filter: "studio_filter", type: "StudioFilterType" },
  groups: { find: "findGroups", list: "groups", filter: "group_filter", type: "GroupFilterType" },
  tags: { find: "findTags", list: "tags", filter: "tag_filter", type: "TagFilterType" },
  markers: { find: "findSceneMarkers", list: "scene_markers", filter: "scene_marker_filter", type: "SceneMarkerFilterType" },
};

const BATCH = 40; // counts per request

/**
 * Many counts in few requests. specs = { key: [entity, filter] }.
 * Returns { key: count | null }; a spec Stash rejects (e.g. a filter value
 * this Stash version does not know) becomes null without failing the rest.
 */
export async function countMany(specs) {
  const entries = Object.entries(specs);
  const out = {};
  const run = async (chunk) => {
    const defs = [];
    const fields = [];
    const vars = {};
    chunk.forEach(([, [entity, filter]], i) => {
      const e = ENTITY[entity];
      defs.push(`$f${i}: ${e.type}`);
      fields.push(`c${i}: ${e.find}(${e.filter}: $f${i}, filter: { per_page: 0 }) { count }`);
      vars[`f${i}`] = filter || {};
    });
    try {
      const data = await graphql(`query VibingsStatsCounts(${defs.join(", ")}) { ${fields.join(" ")} }`, vars);
      chunk.forEach(([key], i) => { out[key] = data[`c${i}`]?.count ?? null; });
    } catch (e) {
      if (chunk.length === 1) {
        console.warn(LOG, "count failed", chunk[0][0], e.message);
        out[chunk[0][0]] = null;
        return;
      }
      const mid = Math.ceil(chunk.length / 2);
      await run(chunk.slice(0, mid));
      await run(chunk.slice(mid));
    }
  };
  const batches = [];
  for (let i = 0; i < entries.length; i += BATCH) batches.push(run(entries.slice(i, i + BATCH)));
  await Promise.all(batches);
  return out;
}

/**
 * Several small find queries in one request.
 * specs = { key: [entity, findFilter, fields, entityFilter?] } -> { key: items[] }.
 */
export async function findMany(specs) {
  const entries = Object.entries(specs);
  const defs = [];
  const fields = [];
  const vars = {};
  entries.forEach(([, [entity, filter, sel, ef]], i) => {
    const e = ENTITY[entity];
    defs.push(`$p${i}: FindFilterType`, `$f${i}: ${e.type}`);
    fields.push(`r${i}: ${e.find}(filter: $p${i}, ${e.filter}: $f${i}) { ${e.list} { ${sel} } }`);
    vars[`p${i}`] = filter;
    vars[`f${i}`] = ef || {};
  });
  const data = await graphql(`query VibingsStatsFind(${defs.join(", ")}) { ${fields.join(" ")} }`, vars);
  return Object.fromEntries(entries.map(([key, [entity]], i) => [key, data[`r${i}`]?.[ENTITY[entity].list] || []]));
}

/** Every item of an entity, in pages, reporting progress(done, total). */
export async function fetchAll(entity, fields, onProgress, pageSize = 1000) {
  const e = ENTITY[entity];
  const items = [];
  let total = null;
  for (let page = 1; total == null || items.length < total; page++) {
    const data = await graphql(
      `query VibingsStatsAll($f: FindFilterType) { ${e.find}(filter: $f) { count ${e.list} { ${fields} } } }`,
      { f: { page, per_page: pageSize, sort: "id", direction: "ASC" } }
    );
    const res = data[e.find];
    total = res.count;
    items.push(...res[e.list]);
    onProgress?.(items.length, total);
    if (!res[e.list].length) break;
  }
  return items;
}

// ---------------------------------------------------------------- Plugin settings

const CONFIG_MIRROR = "vibings-stats-config"; // read synchronously by the /stats redirect

export const DEFAULT_CONFIG = { keepNativeStatsPage: false, cacheMinutes: 15 };

export function cachedConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_MIRROR)) }; } catch { return { ...DEFAULT_CONFIG }; }
}

function mirror(config) {
  try { localStorage.setItem(CONFIG_MIRROR, JSON.stringify(config)); } catch { /* storage unavailable */ }
}

/** Settings from Stash's plugin configuration (Settings → Plugins → Vibings Stats). */
export async function loadConfig() {
  const data = await graphql(`query VibingsStatsConfig { configuration { plugins } }`);
  const raw = data.configuration.plugins?.[PLUGIN_ID] || {};
  const config = {
    keepNativeStatsPage: raw.keepNativeStatsPage === true,
    cacheMinutes: Number.isFinite(raw.cacheMinutes) && raw.cacheMinutes >= 0 ? raw.cacheMinutes : DEFAULT_CONFIG.cacheMinutes,
  };
  mirror(config);
  return config;
}

export async function saveConfig(config) {
  await graphql(
    `mutation VibingsStatsConfigure($input: Map!) { configurePlugin(plugin_id: "${PLUGIN_ID}", input: $input) }`,
    { input: config }
  );
  mirror(config);
  return config;
}

/** Another plugin's Python backend (raw interface). */
export async function pluginOperation(pluginId, args) {
  const data = await graphql(
    `mutation VibingsStatsPluginOp($args: Map) { runPluginOperation(plugin_id: ${JSON.stringify(pluginId)}, args: $args) }`,
    { args }
  );
  return data.runPluginOperation;
}
