// Stash GraphQL access, the saves this plugin makes, and keeping Stash's
// own cached scene data up to date after them.

export const LOG = "[Vibings Play Tracking Fix]";
export const VERSION = "1.0.0"; // must match settings.yml (checked by tests)
export const PLUGIN_ID = "VibingsPlayTrackingFix";

const PluginApi = window.PluginApi;

// keepalive lets the last save finish while the page is being closed.
export async function graphql(query, variables = {}, { keepalive = false } = {}) {
  const resp = await fetch("/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    keepalive,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join(", "));
  return json.data;
}

// Calls the Python backend. Backend errors arrive as GraphQL errors and are thrown.
export async function backend(operation, args = {}, { keepalive = false } = {}) {
  const data = await graphql(
    "mutation VibingsPlayTrackingOp($args: Map) { runPluginOperation(plugin_id: " + JSON.stringify(PLUGIN_ID) + ", args: $args) }",
    { args: { operation, ...args } },
    { keepalive }
  );
  return data?.runPluginOperation ?? null;
}

/** Whether "Track activity" is on in Stash's interface settings. */
export async function stashTracksActivity() {
  const data = await graphql("query VibingsPlayTrackingConfig { configuration { ui } }");
  return data?.configuration?.ui?.trackActivity !== false;
}

function cache() {
  return PluginApi?.utils?.StashService?.getClient?.()?.cache || null;
}

// Same cache changes Stash makes after its own SceneSaveActivity / SceneAddPlay,
// so the scene page and lists show the new numbers without a reload.
export function updateCache(sceneId, fields) {
  const c = cache();
  if (!c) return;
  try {
    c.modify({ id: c.identify({ __typename: "Scene", id: String(sceneId) }), fields });
    c.evict({ id: "ROOT_QUERY", fieldName: "stats" });
    c.gc();
  } catch (e) {
    console.warn(LOG, "could not update cached scene", e);
  }
}

export async function saveActivity(sceneId, playDuration, resume, { keepalive = false } = {}) {
  await graphql(
    "mutation VibingsPlayTrackingSave($id: ID!, $resume_time: Float, $playDuration: Float) { sceneSaveActivity(id: $id, resume_time: $resume_time, playDuration: $playDuration) }",
    { id: String(sceneId), resume_time: resume, playDuration },
    { keepalive }
  );
  updateCache(sceneId, {
    resume_time: () => resume,
    play_duration: (old) => (Number(old) || 0) + playDuration,
  });
}

export async function addPlay(sceneId) {
  const data = await graphql(
    "mutation VibingsPlayTrackingPlay($id: ID!) { sceneAddPlay(id: $id) { count history } }",
    { id: String(sceneId) }
  );
  const history = data?.sceneAddPlay?.history || [];
  updateCache(sceneId, {
    play_count: () => data?.sceneAddPlay?.count ?? history.length,
    play_history: () => history,
    last_played_at: (old) => history[0] ?? old,
  });
  return data?.sceneAddPlay;
}

/** Seconds -> "1 h 05 min", "4 min", "35 s". */
export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return s + " s";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60);
  return h + " h " + String(m % 60).padStart(2, "0") + " min";
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return "–";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

export function timeAgo(value) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

export const fmtNumber = (n) => (Number(n) || 0).toLocaleString("en-US");
