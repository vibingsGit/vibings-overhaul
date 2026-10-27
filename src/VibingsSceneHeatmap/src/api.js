// Stash GraphQL + Python backend access.

export const LOG = "[Vibings Scene Heatmap]";
export const VERSION = "1.0.0"; // must match settings.yml (checked by tests)
export const PLUGIN_ID = "VibingsSceneHeatmap";

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
    "mutation VibingsSceneHeatmapOp($args: Map) { runPluginOperation(plugin_id: " + JSON.stringify(PLUGIN_ID) + ", args: $args) }",
    { args: { operation, ...args } },
    { keepalive }
  );
  return data?.runPluginOperation ?? null;
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return "–";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return s + " s";
  const m = Math.round(s / 60);
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0") + " min";
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
