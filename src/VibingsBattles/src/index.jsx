// Vibings Battles v2 — UI.
//
// Battle view: pick a category, choose between two items (left / right /
// draw / skip), undo the last battle, and sync the resulting rating100
// values to Stash. All scoring happens in the Python backend; pair
// selection lives in pairing.js. This file renders and forwards decisions.

import { pickPair, rememberPair, emptyMemory } from "./pairing.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { NavLink } = PluginApi.libraries.ReactRouterDOM;
const { Button } = PluginApi.libraries.Bootstrap;
const Mousetrap = PluginApi.libraries.Mousetrap;
const { faTrophy, faArrowLeft, faArrowRight, faEquals, faForward, faRotateLeft, faUpRightFromSquare } =
  PluginApi.libraries.FontAwesomeSolid;

const LOG = "[Vibings Battles]";
const PLUGIN_ID = "VibingsBattles";
// Not under /plugin/: the Stash server owns that prefix for plugin assets,
// so a direct load or refresh there returns a plain 404.
const ROUTE = "/vibings-battles";
const RESULT_DELAY_MS = 700;

// ===========================================================================
// Backend + GraphQL
// ===========================================================================

async function graphql(query, variables = {}) {
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
async function backend(operation, args = {}) {
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

const CATEGORIES = [
  {
    id: "scenes",
    label: "Scenes",
    find: "findScenes",
    listKey: "scenes",
    update: "sceneUpdate",
    updateInput: "SceneUpdateInput",
    fields: "id title date rating100 o_counter files { basename duration } paths { screenshot preview } studio { name } performers { id name }",
    title: (it) => it.title || basename(it.files?.[0]?.basename) || `Scene ${it.id}`,
    subtitle: (it) => [it.studio?.name, it.performers?.map((p) => p.name).join(", "), it.date].filter(Boolean).join(" · "),
    image: (it) => it.paths?.screenshot,
    video: (it) => it.paths?.preview,
    href: (it) => `/scenes/${it.id}`,
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
    subtitle: (it) => [it.studio?.name, it.performers?.map((p) => p.name).join(", "), it.date].filter(Boolean).join(" · "),
    // Animated files only animate from the original; stills use the thumbnail.
    image: (it) => (/\.(gif|webp|apng)$/i.test(it.visual_files?.[0]?.basename || "") ? it.paths?.image : it.paths?.thumbnail),
    href: (it) => `/images/${it.id}`,
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
    href: (it) => `/performers/${it.id}`,
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
    href: (it) => `/studios/${it.id}`,
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
    href: (it) => `/groups/${it.id}`,
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
    href: (it) => `/galleries/${it.id}`,
  },
];
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

async function fetchCounts() {
  const parts = CATEGORIES.map((c) => `${c.id}: ${c.find}(filter: { per_page: 0 }) { count }`);
  const data = await graphql(`query VibingsBattlesCounts { ${parts.join(" ")} }`);
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, data[c.id].count]));
}

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

// Stash fails the whole by-ids query if one id no longer exists (e.g. a
// deleted performer that is still in the battle log). Find which ones are gone.
async function findMissingIds(cat, ids) {
  const missing = [];
  for (const id of ids) {
    try {
      const [item] = await fetchItemsById(cat, [id]);
      if (!item) missing.push(String(id));
    } catch {
      missing.push(String(id));
    }
  }
  return missing;
}

// Choose and load the next pair. `ctx` holds ranked items, session memory
// and known-missing ids; returns { pair, memory }.
async function fetchSmartPair(cat, ctx) {
  const sample = await fetchSample(cat);
  let memory = ctx.memory;
  for (let attempt = 0; attempt < 4; attempt++) {
    let ids = pickPair(ctx.ranked, sample, { ...memory, missing: ctx.missing, initialRating: ctx.initialRating });
    if (!ids && memory.pairList.length) {
      memory = emptyMemory(); // every pair was recent: forget and try again
      ids = pickPair(ctx.ranked, sample, { missing: ctx.missing, initialRating: ctx.initialRating });
    }
    if (!ids) throw new Error(`${cat.label}: at least two items are needed for a battle.`);
    try {
      const pair = await fetchItemsById(cat, ids);
      if (pair.every(Boolean)) return { pair, memory: rememberPair(memory, ids[0], ids[1]) };
    } catch (e) {
      console.warn(LOG, "pair fetch failed, checking for deleted items", ids, e);
    }
    const gone = await findMissingIds(cat, ids);
    if (!gone.length) throw new Error(`${cat.label}: could not load items ${ids.join(", ")}.`);
    gone.forEach((id) => ctx.missing.add(id));
  }
  throw new Error(`${cat.label}: could not find a valid pair.`);
}

// Write rating100 changes reported by the backend to Stash in one request.
async function syncRatings(changed) {
  if (!changed?.length) return 0;
  const defs = [];
  const fields = [];
  const vars = {};
  changed.forEach((c, i) => {
    const cat = CATEGORY_BY_ID[c.category];
    if (!cat) return;
    defs.push(`$i${i}: ${cat.updateInput}!`);
    fields.push(`r${i}: ${cat.update}(input: $i${i}) { id }`);
    vars[`i${i}`] = { id: String(c.id), rating100: c.rating100 ?? null };
  });
  if (!fields.length) return 0;
  await graphql(`mutation VibingsBattlesSync(${defs.join(", ")}) { ${fields.join(" ")} }`, vars);
  return fields.length;
}

// ===========================================================================
// Styles
// ===========================================================================

const STYLE_ID = "vibings-battles-styles";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    :root {
      --vibings-battles-accent: #f5a623;
      --vibings-battles-win: #3fb950;
      --vibings-battles-loss: #f85149;
      --vibings-battles-draw: #8b949e;
      --vibings-battles-surface: rgba(255, 255, 255, 0.04);
      --vibings-battles-surface-hover: rgba(255, 255, 255, 0.08);
      --vibings-battles-border: rgba(255, 255, 255, 0.12);
      --vibings-battles-muted: #9aa4af;
      --vibings-battles-radius: 12px;
      --vibings-battles-media-height: min(62vh, 640px);
      --vibings-battles-transition: 0.18s ease;
    }
    .vb-page { padding: 16px 20px 40px; max-width: 1600px; margin: 0 auto; }
    .vb-header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-bottom: 16px; }
    .vb-header h1 { margin: 0; font-size: 1.6rem; }
    .vb-header .vb-spacer { flex: 1; }
    .vb-muted { color: var(--vibings-battles-muted); }
    .vb-switch { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }

    .vb-cats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
    .vb-cat {
      border: 1px solid var(--vibings-battles-border); background: var(--vibings-battles-surface);
      color: inherit; border-radius: 999px; padding: 6px 14px; cursor: pointer;
      transition: background var(--vibings-battles-transition), border-color var(--vibings-battles-transition);
    }
    .vb-cat:hover:not(:disabled) { background: var(--vibings-battles-surface-hover); }
    .vb-cat.active { border-color: var(--vibings-battles-accent); color: var(--vibings-battles-accent); }
    .vb-cat:disabled { opacity: 0.4; cursor: default; }
    .vb-cat .vb-count { margin-left: 6px; font-size: 0.8em; color: var(--vibings-battles-muted); }

    .vb-arena { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 760px) { .vb-arena { grid-template-columns: 1fr; } }

    .vb-card {
      position: relative; display: flex; flex-direction: column; text-align: left;
      border: 2px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius);
      background: var(--vibings-battles-surface); color: inherit; overflow: hidden; padding: 0;
      cursor: pointer; transition: border-color var(--vibings-battles-transition), transform var(--vibings-battles-transition), opacity var(--vibings-battles-transition);
    }
    .vb-card:hover:not(:disabled) { border-color: var(--vibings-battles-accent); transform: translateY(-2px); }
    .vb-card:disabled { cursor: default; }
    .vb-card.win { border-color: var(--vibings-battles-win); }
    .vb-card.loss { border-color: var(--vibings-battles-loss); opacity: 0.55; }
    .vb-card.draw { border-color: var(--vibings-battles-draw); }

    .vb-media { position: relative; height: var(--vibings-battles-media-height); background: #000; }
    .vb-media img, .vb-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .vb-media.contain img { object-fit: contain; padding: 24px; }
    .vb-media.portrait img { object-position: top; }
    .vb-key {
      position: absolute; top: 10px; left: 10px; padding: 2px 8px; border-radius: 6px;
      background: rgba(0, 0, 0, 0.65); font-size: 0.8rem; color: #fff;
    }
    .vb-open {
      position: absolute; top: 10px; right: 10px; padding: 4px 8px; border-radius: 6px;
      background: rgba(0, 0, 0, 0.65); color: #fff;
    }
    .vb-open:hover { color: var(--vibings-battles-accent); }
    .vb-delta {
      position: absolute; inset: auto 0 0 0; padding: 10px; text-align: center; font-size: 1.6rem; font-weight: 700;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.8)); color: #fff;
    }
    .vb-delta.up { color: var(--vibings-battles-win); }
    .vb-delta.down { color: var(--vibings-battles-loss); }

    .vb-info { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .vb-title { font-weight: 600; font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .vb-sub { font-size: 0.85rem; color: var(--vibings-battles-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.2em; }
    .vb-stats { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.85rem; color: var(--vibings-battles-muted); }
    .vb-stats b { color: var(--bs-body-color, #fff); font-weight: 600; }

    .vb-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; }
    .vb-actions .btn { display: inline-flex; align-items: center; gap: 8px; }
    .vb-actions kbd { font-size: 0.75em; opacity: 0.8; }
    .vb-status { text-align: center; padding: 60px 20px; }
    .vb-error { color: var(--vibings-battles-loss); }
  `;
  document.head.appendChild(style);
}

// ===========================================================================
// Components
// ===========================================================================

function Icon({ icon }) {
  return <PluginApi.components.Icon icon={icon} />;
}

function Media({ cat, item }) {
  const [hover, setHover] = React.useState(false);
  const video = cat.video?.(item);
  const cls = ["vb-media", cat.contain && "contain", cat.portrait && "portrait"].filter(Boolean).join(" ");
  return (
    <div className={cls} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {hover && video ? (
        <video src={video} autoPlay muted loop playsInline />
      ) : (
        <img src={cat.image(item)} alt="" loading="eager" />
      )}
    </div>
  );
}

function formatDelta(d) {
  const r = Math.round(d);
  return r > 0 ? `+${r}` : String(r);
}

function BattleCard({ cat, item, stats, side, outcome, delta, disabled, onChoose }) {
  const cls = ["vb-card", outcome].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onChoose}>
      <div style={{ position: "relative" }}>
        <Media cat={cat} item={item} />
        <span className="vb-key">{side === "a" ? "←" : "→"}</span>
        <a
          className="vb-open"
          href={cat.href(item)}
          target="_blank"
          rel="noreferrer"
          title="Open in a new tab"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon icon={faUpRightFromSquare} />
        </a>
        {delta != null && (
          <div className={`vb-delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>{formatDelta(delta)}</div>
        )}
      </div>
      <div className="vb-info">
        <div className="vb-title" title={cat.title(item)}>{cat.title(item)}</div>
        <div className="vb-sub">{cat.subtitle(item)}</div>
        <div className="vb-stats">
          {stats ? (
            <>
              <span>Elo <b>{Math.round(stats.rating)}</b></span>
              <span>Rating <b>{stats.rating100 ?? "–"}</b></span>
              <span>W-L-D <b>{stats.wins}-{stats.losses}-{stats.draws}</b></span>
              {stats.streak !== 0 && (
                <span>Streak <b>{stats.streak > 0 ? `${stats.streak}W` : `${-stats.streak}L`}</b></span>
              )}
            </>
          ) : (
            <span>Unranked</span>
          )}
        </div>
      </div>
    </button>
  );
}

const OUTCOME_CLASS = {
  a: { a: "win", b: "loss" },
  b: { a: "loss", b: "win" },
  draw: { a: "draw", b: "draw" },
  skip: { a: null, b: null },
};

function BattlePage() {
  const toast = PluginApi.hooks.useToast();
  const [settings, setSettings] = React.useState(null);
  const [counts, setCounts] = React.useState({});
  const [catId, setCatId] = React.useState(null);
  const [stats, setStatsState] = React.useState({}); // item id -> backend stats for the active category
  const [pair, setPair] = React.useState(null);
  const [phase, setPhase] = React.useState("idle"); // idle | loading | ready | busy | result | error
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null); // { result, delta: [a, b] }
  const [session, setSession] = React.useState(0);
  const history = React.useRef([]); // [{ seq, catId, pair }] for undo
  const loadToken = React.useRef(0);
  // Refs read by async pair loading, which must see the latest values.
  const statsRef = React.useRef({});
  const memoryRef = React.useRef(emptyMemory()); // recently shown pairs/items
  const missingRef = React.useRef(new Set()); // ids deleted from Stash
  const settingsRef = React.useRef(null);
  settingsRef.current = settings;

  const setStats = React.useCallback((next) => {
    const value = typeof next === "function" ? next(statsRef.current) : next;
    statsRef.current = value;
    setStatsState(value);
  }, []);

  const cat = catId ? CATEGORY_BY_ID[catId] : null;
  const syncEnabled = settings?.ui?.syncRatings !== false;

  const notifyError = React.useCallback((msg, e) => {
    console.warn(LOG, msg, e);
    toast.error(`${msg}: ${e?.message || e}`);
  }, [toast]);

  React.useEffect(() => {
    injectStyles();
    backend("get_settings").then(setSettings).catch((e) => notifyError("Could not load settings", e));
    fetchCounts().then(setCounts).catch((e) => console.warn(LOG, "counts failed", e));
  }, []);

  const loadPair = React.useCallback(async (category) => {
    const token = ++loadToken.current;
    setPhase("loading");
    setResult(null);
    try {
      const { pair: next, memory } = await fetchSmartPair(category, {
        ranked: Object.values(statsRef.current),
        memory: memoryRef.current,
        missing: missingRef.current,
        initialRating: settingsRef.current?.elo?.initial ?? 1500,
      });
      if (token !== loadToken.current) return; // a newer request won
      memoryRef.current = memory;
      setPair(next);
      setPhase("ready");
    } catch (e) {
      if (token !== loadToken.current) return;
      setError(e.message);
      setPhase("error");
    }
  }, []);

  const selectCategory = React.useCallback(async (id) => {
    const category = CATEGORY_BY_ID[id];
    setCatId(id);
    setPair(null);
    setError(null);
    setSession(0);
    memoryRef.current = emptyMemory();
    missingRef.current = new Set();
    try {
      const items = await backend("get_items", { category: id });
      setStats(Object.fromEntries((items || []).map((it) => [it.id, it])));
    } catch (e) {
      notifyError("Could not load item stats", e);
      setStats({});
    }
    loadPair(category);
  }, [loadPair, notifyError, setStats]);

  const sync = React.useCallback(async (changed) => {
    if (!syncEnabled || !changed?.length) return;
    try {
      await syncRatings(changed);
    } catch (e) {
      notifyError("Rating sync to Stash failed", e);
    }
  }, [syncEnabled, notifyError]);

  const decide = React.useCallback(async (outcome) => {
    if (phase !== "ready" || !pair || !cat) return;
    const [a, b] = pair;
    setPhase("busy");
    try {
      const out = await backend("record", {
        category: cat.id,
        a: { id: a.id, name: cat.title(a) },
        b: { id: b.id, name: cat.title(b) },
        result: outcome,
      });
      history.current.push({ seq: out.entry.seq, catId: cat.id, pair });
      if (history.current.length > 50) history.current.shift();
      setStats((s) => ({ ...s, [out.a.id]: out.a, [out.b.id]: out.b }));
      if (outcome !== "skip") setSession((n) => n + 1);
      sync(out.changed);
      setResult({ result: outcome, delta: out.entry.delta });
      setPhase("result");
      setTimeout(() => loadPair(cat), outcome === "skip" ? 0 : RESULT_DELAY_MS);
    } catch (e) {
      notifyError("Could not save battle", e);
      setPhase("ready");
    }
  }, [phase, pair, cat, sync, loadPair, notifyError, setStats]);

  const undo = React.useCallback(async () => {
    if (phase === "busy") return;
    setPhase("busy");
    try {
      const out = await backend("undo");
      sync(out.changed);
      const last = history.current[history.current.length - 1];
      const undone = out.undone;
      toast.success(`Undid battle #${undone.seq}`);
      if (last && last.seq === undone.seq) {
        history.current.pop();
        if (last.catId !== catId) setCatId(last.catId);
        const items = await backend("get_items", { category: last.catId });
        setStats(Object.fromEntries((items || []).map((it) => [it.id, it])));
        loadToken.current++; // cancel any pending pair load
        setPair(last.pair);
        setResult(null);
        if (undone.result !== "skip") setSession((n) => Math.max(0, n - 1));
        setPhase("ready");
      } else if (cat) {
        // Undid a battle from another session/device: refresh stats, keep going.
        const items = await backend("get_items", { category: cat.id });
        setStats(Object.fromEntries((items || []).map((it) => [it.id, it])));
        setPhase(pair ? "ready" : "idle");
      } else {
        setPhase("idle");
      }
    } catch (e) {
      notifyError("Undo failed", e);
      setPhase(pair ? "ready" : cat ? "error" : "idle");
    }
  }, [phase, pair, cat, catId, sync, toast, notifyError, setStats]);

  const toggleSync = async () => {
    const ui = { ...(settings?.ui || {}), syncRatings: !syncEnabled };
    try {
      const out = await backend("save_settings", { settings: { ui } });
      setSettings(out.settings);
    } catch (e) {
      notifyError("Could not save settings", e);
    }
  };

  // Keyboard shortcuts while this page is mounted.
  const keyHandlers = React.useRef({});
  keyHandlers.current = { decide, undo };
  React.useEffect(() => {
    const bind = (keys, fn) => Mousetrap.bind(keys, (e) => { e.preventDefault(); fn(); });
    bind("left", () => keyHandlers.current.decide("a"));
    bind("right", () => keyHandlers.current.decide("b"));
    bind("down", () => keyHandlers.current.decide("draw"));
    bind("space", () => keyHandlers.current.decide("skip"));
    bind(["u", "backspace"], () => keyHandlers.current.undo());
    return () => Mousetrap.unbind(["left", "right", "down", "space", "u", "backspace"]);
  }, []);

  React.useEffect(() => {
    document.title = "Battles | Stash";
  }, []);

  const outcomeFor = (side) => (phase === "result" && result ? OUTCOME_CLASS[result.result][side] : null);
  const deltaFor = (side) =>
    phase === "result" && result && result.result !== "skip" ? result.delta[side === "a" ? 0 : 1] : null;
  const canDecide = phase === "ready";

  return (
    <div className="vb-page">
      <div className="vb-header">
        <h1>Battles</h1>
        {cat && <span className="vb-muted">{session} battles this session</span>}
        <span className="vb-spacer" />
        <label className="vb-switch" title="Write the resulting rating to the item's Stash rating">
          <input type="checkbox" checked={syncEnabled} disabled={!settings} onChange={toggleSync} />
          Sync ratings to Stash
        </label>
      </div>

      <div className="vb-cats">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`vb-cat${c.id === catId ? " active" : ""}`}
            disabled={counts[c.id] != null && counts[c.id] < 2}
            onClick={() => selectCategory(c.id)}
          >
            {c.label}
            {counts[c.id] != null && <span className="vb-count">{counts[c.id]}</span>}
          </button>
        ))}
      </div>

      {!cat && <div className="vb-status vb-muted">Choose a category to start.</div>}
      {cat && phase === "error" && (
        <div className="vb-status">
          <p className="vb-error">{error}</p>
          <Button variant="secondary" onClick={() => loadPair(cat)}>Try again</Button>
        </div>
      )}
      {cat && !pair && phase === "loading" && <div className="vb-status vb-muted">Loading…</div>}

      {cat && pair && phase !== "error" && (
        <>
          <div className="vb-arena">
            {["a", "b"].map((side, i) => (
              <BattleCard
                key={`${side}-${pair[i].id}`}
                cat={cat}
                item={pair[i]}
                stats={stats[pair[i].id]}
                side={side}
                outcome={outcomeFor(side)}
                delta={deltaFor(side)}
                disabled={!canDecide}
                onChoose={() => decide(side)}
              />
            ))}
          </div>
          <div className="vb-actions">
            <Button variant="secondary" disabled={!canDecide} onClick={() => decide("a")}>
              <Icon icon={faArrowLeft} /> Left wins <kbd>←</kbd>
            </Button>
            <Button variant="secondary" disabled={!canDecide} onClick={() => decide("draw")}>
              <Icon icon={faEquals} /> Draw <kbd>↓</kbd>
            </Button>
            <Button variant="secondary" disabled={!canDecide} onClick={() => decide("skip")}>
              <Icon icon={faForward} /> Skip <kbd>Space</kbd>
            </Button>
            <Button variant="secondary" disabled={!canDecide} onClick={() => decide("b")}>
              Right wins <Icon icon={faArrowRight} /> <kbd>→</kbd>
            </Button>
            <Button variant="outline-secondary" disabled={phase === "busy"} onClick={undo}>
              <Icon icon={faRotateLeft} /> Undo <kbd>U</kbd>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Navigation entry
// ===========================================================================

function NavItem() {
  return (
    <div className="col-4 col-sm-3 col-md-2 col-lg-auto nav-link" key="vibings-battles">
      <NavLink to={ROUTE} activeClassName="active" exact>
        <Button className="minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center">
          <PluginApi.components.Icon icon={faTrophy} className="nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0" />
          <span>Battles</span>
        </Button>
      </NavLink>
    </div>
  );
}

// stash-plugin-builder imports and calls the default export.
export default function main() {
  PluginApi.register.route(ROUTE, BattlePage);
  PluginApi.patch.before("MainNavBar.MenuItems", (props) => [
    { ...props, children: [...React.Children.toArray(props.children), <NavItem key="vibings-battles" />] },
  ]);
  console.log(LOG, "registered", ROUTE);
}
