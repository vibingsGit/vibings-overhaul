// Stash GraphQL access and Stash's shared Apollo client.

export const LOG = "[Vibings Better Scenes]";
export const VERSION = "1.0.0"; // must match settings.yml (checked by tests)
export const PLUGIN_ID = "VibingsBetterScenes";

const PluginApi = window.PluginApi;

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

/** Another plugin's backend operation. */
export async function pluginOperation(pluginId, args) {
  const data = await graphql(
    "mutation VibingsBetterScenesOp($args: Map) { runPluginOperation(plugin_id: " + JSON.stringify(pluginId) + ", args: $args) }",
    { args }
  );
  return data?.runPluginOperation ?? null;
}

export const client = () => PluginApi.utils?.StashService?.getClient?.() || null;

/**
 * A Stash mutation through Stash's own Apollo client, so other plugins that
 * watch it (Vibings Better Os) see it and the cached scene updates.
 */
export async function mutate(documentName, variables, update) {
  const c = client();
  const doc = PluginApi.GQL?.[documentName];
  if (!c || !doc) throw new Error("Stash's GraphQL client is not available");
  const res = await c.mutate({ mutation: doc, variables, update });
  return res?.data;
}

/** Changes cached fields of a scene (after a mutation sent without Stash's hooks). */
export function updateSceneCache(sceneId, fields) {
  const cache = client()?.cache;
  if (!cache) return;
  try {
    cache.modify({ id: cache.identify({ __typename: "Scene", id: String(sceneId) }), fields });
  } catch (e) {
    console.warn(LOG, "could not update cached scene", e);
  }
}

export async function updateScene(sceneId, input) {
  const data = await mutate("SceneUpdateDocument", { input: { id: String(sceneId), ...input } });
  return data?.sceneUpdate;
}

export async function addSceneO(sceneId) {
  // Vibings Better Os stores the player position when it sees this mutation.
  if (window.VibingsBetterOs?.addSceneO) return window.VibingsBetterOs.addSceneO(sceneId, "player");
  return mutate("SceneAddODocument", { id: String(sceneId) }, (cache, { data }) => {
    const r = data?.sceneAddO;
    if (!r) return;
    cache.modify({
      id: cache.identify({ __typename: "Scene", id: String(sceneId) }),
      fields: { o_counter: () => r.count, o_history: () => r.history },
    });
  });
}

/**
 * A new Stash group holding the scenes in this order. Each scene keeps its
 * other groups. Returns the group's id.
 */
export async function createGroupFromScenes(name, ids) {
  const created = await graphql("mutation VibingsBetterScenesGroup($input: GroupCreateInput!) { groupCreate(input: $input) { id } }", { input: { name } });
  const groupId = created.groupCreate.id;
  const found = await graphql("query VibingsBetterScenesGroups($ids: [Int!]) { findScenes(scene_ids: $ids, filter: { per_page: -1 }) { scenes { id groups { group { id } scene_index } } } }", { ids: ids.map(Number) });
  const current = new Map(found.findScenes.scenes.map((s) => [String(s.id), s.groups || []]));
  const rows = ids.map(String).filter((id) => current.has(id));
  for (let start = 0; start < rows.length; start += 40) {
    const chunk = rows.slice(start, start + 40);
    const defs = chunk.map((_, i) => "$i" + i + ": SceneUpdateInput!").join(", ");
    const fields = chunk.map((_, i) => "s" + i + ": sceneUpdate(input: $i" + i + ") { id }").join(" ");
    const vars = {};
    chunk.forEach((id, i) => {
      const keep = current.get(id).filter((g) => String(g.group.id) !== String(groupId)).map((g) => ({ group_id: String(g.group.id), scene_index: g.scene_index ?? null }));
      vars["i" + i] = { id, groups: [...keep, { group_id: String(groupId), scene_index: start + i + 1 }] };
    });
    await graphql("mutation VibingsBetterScenesGroupScenes(" + defs + ") { " + fields + " }", vars);
  }
  return groupId;
}
