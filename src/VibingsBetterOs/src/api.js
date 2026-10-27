// Stash GraphQL + Python backend access, and time formatting.

export const LOG = "[Vibings Better Os]";
export const VERSION = "1.1.0"; // must match settings.yml (checked by tests)
export const PLUGIN_ID = "VibingsBetterOs";

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
    "mutation VibingsBetterOsOp($args: Map) { runPluginOperation(plugin_id: " + JSON.stringify(PLUGIN_ID) + ", args: $args) }",
    { args: { operation, ...args } }
  );
  return data?.runPluginOperation ?? null;
}

/** Any timestamp -> Stash's o_history form, UTC whole seconds: 2026-10-24T10:10:10Z. */
export function normTs(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19) + "Z";
}

/** Newest entry of an o_history list. */
export function newestTs(history) {
  let best = null;
  for (const h of history || []) {
    const n = normTs(h);
    if (n && (!best || n > best)) best = n;
  }
  return best;
}

/** Seconds -> 4:05 or 1:02:03. */
export function fmtPos(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** "4:05", "1:02:03" or plain seconds -> seconds; null when unreadable. */
export function parsePos(text) {
  const parts = String(text ?? "").trim().split(":");
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function fmtDateTime(at) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(at) {
  const t = typeof at === "number" ? at : new Date(at).getTime();
  if (!Number.isFinite(t)) return "–";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const units = [[60, "minute"], [3600, "hour"], [86400, "day"], [2592000, "month"], [31536000, "year"]];
  let [div, name] = units[0];
  for (const u of units) if (s >= u[0]) [div, name] = u;
  const n = Math.floor(s / div);
  return `${n} ${name}${n === 1 ? "" : "s"} ago`;
}

export function fmtBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
