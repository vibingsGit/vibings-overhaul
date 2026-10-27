// Watches Stash's own O mutations, wherever they come from (the scene page's
// O button, the History tab, the image page, the lightbox, this plugin), and
// stores the detail of each new O. Stash's Apollo client is shared by the
// whole UI, so wrapping its mutate() sees every O change without touching
// Stash's buttons.

import { LOG, backend, normTs, newestTs } from "./api.js";
import { getSettings } from "./settings.js";
import { currentPosition, imageViewSeconds } from "./player.js";
import { addedO, setEvents, syncHistory, setDuration, getScene } from "./store.js";

const PluginApi = window.PluginApi;

// Source of the next SceneAddO this plugin starts ("player" / "panel").
let nextSource = null;
export const markNextSource = (source) => { nextSource = source; };

const opName = (doc) => doc?.definitions?.find((d) => d.kind === "OperationDefinition")?.name?.value;

const HANDLERS = {
  SceneAddO: {
    before(vars) {
      const source = nextSource;
      nextSource = null;
      return { pos: currentPosition(vars.id), explicit: !!(vars.times && [].concat(vars.times).length), source };
    },
    async after(vars, data, ctx) {
      const history = data?.sceneAddO?.history;
      if (!history) return;
      const id = String(vars.id);
      // Os added for a chosen date (History tab) have no video position.
      const at = ctx.explicit ? normTs([].concat(vars.times)[0]) : newestTs(history);
      const s = getSettings();
      const timed = at && ctx.pos && !ctx.explicit && s.recordPosition;
      addedO(id, history, timed ? null : at); // a timed O flashes once its position is stored
      if (!timed) return;
      if (ctx.pos.d) setDuration(id, ctx.pos.d);
      const out = await backend("record_scene", { sceneId: id, at, t: ctx.pos.t, d: ctx.pos.d, src: ctx.source || "stash" });
      setEvents(id, out.events, at);
      console.info(LOG, `O on scene ${id} at ${ctx.pos.t.toFixed(1)} s`);
    },
  },
  SceneDeleteO: {
    after: (vars, data) => data?.sceneDeleteO && syncHistory(vars.id, data.sceneDeleteO.history),
  },
  SceneResetO: {
    after: (vars, data) => data?.sceneResetO !== undefined && syncHistory(vars.id, []),
  },
  ImageIncrementO: {
    before: (vars) => ({ view: imageViewSeconds(vars.id) }),
    async after(vars, data, ctx) {
      const count = data?.imageIncrementO;
      if (typeof count !== "number" || !getSettings().imageSessions || ctx.view == null) return;
      await backend("record_image", { imageId: String(vars.id), at: normTs(new Date()), view: ctx.view, oCounter: count });
      console.info(LOG, `O on image ${vars.id} after ${ctx.view} s`);
    },
  },
  ImageDecrementO: {
    after: (vars, data) => typeof data?.imageDecrementO === "number" &&
      backend("sync_image", { imageId: String(vars.id), oCounter: data.imageDecrementO, removeNewest: true }),
  },
  ImageResetO: {
    after: (vars, data) => data?.imageResetO !== undefined && backend("sync_image", { imageId: String(vars.id), oCounter: 0 }),
  },
};

export function getClient() {
  return PluginApi.utils?.StashService?.getClient?.() || null;
}

export function installTracker() {
  const client = getClient();
  if (!client) {
    console.warn(LOG, "Stash's GraphQL client is not available; Os are not tracked");
    return false;
  }
  if (client.__vibingsBetterOs) return true;
  const original = client.mutate;
  client.mutate = function (options) {
    const handler = HANDLERS[opName(options?.mutation)];
    if (!handler) return original.call(this, options);
    const vars = options.variables || {};
    let ctx = {};
    try { ctx = handler.before?.(vars) || {}; } catch (e) { console.warn(LOG, e); }
    const result = original.call(this, options);
    Promise.resolve(result)
      .then((res) => handler.after(vars, res?.data, ctx))
      .catch((e) => console.warn(LOG, "could not store O detail:", e?.message || e));
    return result;
  };
  client.__vibingsBetterOs = true;
  return true;
}

// ---------------------------------------------------------------- Actions

// Same cache updates as Stash's own O buttons, so its counters change at once.
function sceneCacheUpdate(id, key) {
  return (cache, res) => {
    const history = res?.data?.[key]?.history;
    if (!history) return;
    cache.modify({
      id: cache.identify({ __typename: "Scene", id: String(id) }),
      fields: { o_history: () => history, o_counter: () => history.length },
    });
    cache.modify({ fields: { stats: (_, { DELETE }) => DELETE } });
  };
}

/** Adds an O to a scene now; the tracker stores its video position. */
export async function addSceneO(sceneId, source) {
  const client = getClient();
  markNextSource(source);
  return client.mutate({
    mutation: PluginApi.GQL.SceneAddODocument,
    variables: { id: String(sceneId) },
    update: sceneCacheUpdate(sceneId, "sceneAddO"),
  });
}

/** Removes one O from the scene (Stash's count and history). */
export async function deleteSceneO(sceneId, at) {
  const client = getClient();
  return client.mutate({
    mutation: PluginApi.GQL.SceneDeleteODocument,
    variables: { id: String(sceneId), times: [at] },
    update: sceneCacheUpdate(sceneId, "sceneDeleteO"),
  });
}

/** Sets (or replaces) the video position of an existing O. */
export async function setScenePosition(sceneId, at, t) {
  const d = getScene(sceneId).duration;
  const out = await backend("record_scene", { sceneId: String(sceneId), at, t, d, src: "manual" });
  setEvents(sceneId, out.events, at);
}

/** Forgets the video position; the O stays and becomes a classic O. */
export async function clearScenePosition(sceneId, at) {
  const out = await backend("clear_scene_time", { sceneId: String(sceneId), at });
  setEvents(sceneId, out.events);
}
