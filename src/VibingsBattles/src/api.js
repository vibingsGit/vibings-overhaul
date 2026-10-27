// Stash GraphQL + Python backend access, and per-category definitions.

import { pickPair, rememberPair, emptyMemory } from "./pairing.js";

export const LOG = "[Vibings Battles]";
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
  },
];
export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export async function fetchCounts() {
  const parts = CATEGORIES.map((c) => `${c.id}: ${c.find}(filter: { per_page: 0 }) { count }`);
  const data = await graphql(`query VibingsBattlesCounts { ${parts.join(" ")} }`);
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, data[c.id].count]));
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
