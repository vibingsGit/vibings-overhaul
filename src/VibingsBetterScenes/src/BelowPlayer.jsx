// Under the player: up next, scenes to continue, recommendations, more with
// the performers, the scene's markers as chapters, filters and file info.

import { LOG, graphql } from "./api.js";
import { fmtTime, scoreScenes } from "./format.js";
import { SceneCard, CardRow, CARD_FIELDS } from "./SceneCard.jsx";
import { SpriteThumb, useSprites } from "./Timeline.jsx";
import { getDevice, setDevice, useSettings, saveSettings } from "./settings.js";
import { useStore, seek, setState } from "./store.js";
import { FiltersPanel } from "./FiltersPanel.jsx";
import { useUpNext } from "./queue.js";
import { Icons } from "./icons.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Link } = PluginApi.libraries.ReactRouterDOM;

const FIND = "query VibingsBetterScenesFind($filter: FindFilterType, $scene_filter: SceneFilterType, $ids: [Int!]) { findScenes(filter: $filter, scene_filter: $scene_filter, scene_ids: $ids) { scenes { " + CARD_FIELDS + " } } }";
const random = () => "random_" + Math.floor(Math.random() * 1e8);

async function findScenes(sceneFilter, perPage, sort = random()) {
  const d = await graphql(FIND, { filter: { per_page: perPage, sort, direction: "DESC" }, scene_filter: sceneFilter });
  return d.findScenes.scenes;
}

async function scenesByIds(ids) {
  if (!ids.length) return [];
  const d = await graphql(FIND, { filter: { per_page: -1 }, ids: ids.map(Number) });
  const byId = new Map(d.findScenes.scenes.map((s) => [String(s.id), s]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/** Runs load() when key changes; { data, loading }. Results are kept per key for the session. */
const cache = new Map();
function useLoad(key, load) {
  const [state, setLocal] = React.useState(() => ({ data: cache.get(key) || null, loading: !cache.has(key) }));
  React.useEffect(() => {
    if (cache.has(key)) { setLocal({ data: cache.get(key), loading: false }); return undefined; }
    let live = true;
    setLocal({ data: null, loading: true });
    load().then((data) => {
      cache.set(key, data);
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      if (live) setLocal({ data, loading: false });
    }).catch((e) => {
      console.warn(LOG, e);
      if (live) setLocal({ data: [], loading: false });
    });
    return () => { live = false; };
  }, [key]);
  return state;
}

function UpNext({ scene }) {
  const upNext = useUpNext();
  const queue = useStore((s) => s.queue);
  const { data: upScenes } = useLoad("up:" + upNext.join(","), () => scenesByIds(upNext));
  const scenes = queue?.scenes || [];
  const i = scenes.findIndex((s) => String(s.id) === String(scene.id));
  const following = i >= 0 ? scenes.slice(i + 1, i + 25) : scenes.slice(0, 24);
  const cards = [
    ...(upScenes || []).map((s, n) => <SceneCard key={"u" + s.id} scene={s} badge={n === 0 ? "Next" : "Up next"} inUpNext />),
    ...following.map((s) => <SceneCard key={"q" + s.id} scene={s} />),
  ];
  return <CardRow empty={queue?.scenes?.length ? "This is the last scene of the queue" : "No queue: open a scene from a list, or right click a scene and choose Play next"}>{cards}</CardRow>;
}

function ContinueWatching({ scene }) {
  const { data, loading } = useLoad("cont:" + scene.id, async () => (
    await findScenes({ resume_time: { value: 0, modifier: "GREATER_THAN" } }, 31, "last_played_at")
  ).filter((s) => String(s.id) !== String(scene.id)).slice(0, 30));
  if (loading) return <div className="vbs-empty">Finding scenes…</div>;
  return <CardRow empty="Nothing to continue: scenes left halfway show up here">{(data || []).map((s) => <SceneCard key={s.id} scene={s} />)}</CardRow>;
}

const WEIGHTS = [["performers", "Performers"], ["studio", "Studio"], ["tags", "Tags"]];

function Tune({ rec }) {
  const save = (partial) => saveSettings({ recommend: partial });
  return (
    <div className="vbs-tune">
      <label className="vbs-filter-check"><input type="checkbox" checked={rec.hideWatched} onChange={() => save({ hideWatched: !rec.hideWatched })} /> Hide watched scenes</label>
      {WEIGHTS.map(([id, label]) => (
        <label key={id} className="vbs-tune-weight">{label}
          <select className="vbs-input" value={rec[id]} onChange={(e) => save({ [id]: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n === 0 ? "ignore" : "× " + n}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

function Recommended({ scene, tuning }) {
  const rec = useSettings().recommend;
  const key = "rec:" + scene.id + ":" + [rec.hideWatched, rec.performers, rec.studio, rec.tags].join(",");
  const { data, loading } = useLoad(key, async () => {
    const performers = rec.performers ? (scene.performers || []).map((p) => String(p.id)) : [];
    const tags = rec.tags ? (scene.tags || []).map((t) => String(t.id)).slice(0, 15) : [];
    const studio = rec.studio ? scene.studio?.id : null;
    const unwatched = rec.hideWatched ? { play_count: { value: 0, modifier: "EQUALS" } } : {};
    const lists = await Promise.all([
      performers.length ? findScenes({ ...unwatched, performers: { value: performers, modifier: "INCLUDES" } }, 40) : [],
      tags.length ? findScenes({ ...unwatched, tags: { value: tags, modifier: "INCLUDES" } }, 40) : [],
      studio ? findScenes({ ...unwatched, studios: { value: [String(studio)], modifier: "INCLUDES" } }, 30) : [],
      findScenes(rec.hideWatched ? unwatched : null, 30, "o_counter"),
    ]);
    const ranked = scoreScenes(scene, lists.flat(), rec)
      .map((x) => x.scene)
      .filter((s) => !rec.hideWatched || !(s.play_count > 0));
    const top = ranked.slice(0, 8);
    const rest = ranked.slice(8, 60).sort(() => Math.random() - 0.5).slice(0, 16);
    return [...top, ...rest];
  });
  return (
    <>
      {tuning && <Tune rec={rec} />}
      {loading ? <div className="vbs-empty">Finding scenes…</div>
        : <CardRow empty="No recommendations">{(data || []).map((s) => <SceneCard key={s.id} scene={s} />)}</CardRow>}
    </>
  );
}

function Performers({ scene }) {
  const performers = scene.performers || [];
  const { data, loading } = useLoad("perf:" + scene.id, () => Promise.all(performers.map(async (p) => ({
    performer: p,
    scenes: (await findScenes({ performers: { value: [String(p.id)], modifier: "INCLUDES" } }, 21)).filter((s) => String(s.id) !== String(scene.id)).slice(0, 20),
  }))));
  if (!performers.length) return <div className="vbs-empty">No performers in this scene</div>;
  if (loading) return <div className="vbs-empty">Finding scenes…</div>;
  return (data || []).map(({ performer, scenes }) => (
    <div key={performer.id} className="vbs-perf-row">
      <Link to={"/performers/" + performer.id} className="vbs-perf-head">
        {performer.image_path && <img src={performer.image_path} alt="" />}
        <span>{performer.name}</span>
      </Link>
      <CardRow empty={"No other scenes with " + performer.name}>{scenes.map((s) => <SceneCard key={s.id} scene={s} />)}</CardRow>
    </div>
  ));
}

function Chapters({ scene }) {
  const sprites = useSprites(scene);
  const video = useStore((s) => s.video);
  const markers = [...(scene.scene_markers || [])].sort((a, b) => a.seconds - b.seconds);
  if (!markers.length) return <div className="vbs-empty">No markers. Add them in the Stash tab → Markers.</div>;
  return (
    <CardRow>
      {markers.map((m) => (
        <button key={m.id} type="button" className="vbs-chapter" onClick={() => { seek(m.seconds); video?.play().catch(() => {}); }}>
          <SpriteThumb sprites={sprites} t={m.seconds} width={176} />
          <span className="vbs-chapter-time">{fmtTime(m.seconds)}{m.end_seconds ? "–" + fmtTime(m.end_seconds) : ""}</span>
          <span className="vbs-chapter-title">{m.title || m.primary_tag?.name}</span>
          {m.title && m.primary_tag?.name && <span className="vbs-chapter-tag">{m.primary_tag.name}</span>}
        </button>
      ))}
    </CardRow>
  );
}

function FileInfo({ scene }) {
  // Stash loads this panel lazily; ask for it first.
  const loadable = PluginApi.loadableComponents?.SceneFileInfoPanel;
  const loading = PluginApi.hooks?.useLoadComponents ? PluginApi.hooks.useLoadComponents(loadable ? [loadable] : []) : false;
  const Panel = PluginApi.components.SceneFileInfoPanel;
  if (loading) return <div className="vbs-empty">Loading…</div>;
  if (!Panel) return <div className="vbs-empty">File info is not available in this Stash version</div>;
  return <div className="vbs-fileinfo"><Panel scene={scene} /></div>;
}

const VIEWS = [
  ["next", "Up next", UpNext],
  ["continue", "Continue watching", ContinueWatching],
  ["recommended", "Recommended", Recommended],
  ["performers", "Performers", Performers],
  ["chapters", "Markers", Chapters],
  ["filters", "Filters", FiltersPanel],
  ["file", "File info", FileInfo],
];

// The scrollbar is hidden; a fade at the top or bottom shows there is more.
function useScrollFade() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      el.classList.toggle("vbs-more-up", el.scrollTop > 2);
      el.classList.toggle("vbs-more-down", el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", update, { passive: true });
    return () => { ro.disconnect(); mo.disconnect(); el.removeEventListener("scroll", update); };
  }, []);
  return ref;
}

export function BelowPlayer({ scene }) {
  const [view, setView] = React.useState(() => (VIEWS.some(([id]) => id === getDevice().below) ? getDevice().below : "next"));
  const choose = (id) => { setView(id); setDevice({ below: id }); };
  // The player's menu can open a view here (Filters).
  const requested = useStore((s) => s.below);
  React.useEffect(() => {
    if (!requested) return;
    choose(requested);
    setState({ below: null });
    document.querySelector(".vbs-below")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [requested]);
  const filters = useStore((s) => s.filters);
  const filtersOn = Object.keys(filters.video).length > 0 || Object.keys(filters.audio).length > 0;
  const View = VIEWS.find(([id]) => id === view)[2];
  const [tuning, setTuning] = React.useState(false);
  const body = useScrollFade();
  return (
    <section className="vbs-below">
      <div className="vbs-tabs" role="tablist">
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={"vbs-tab" + (view === id ? " vbs-tab-on" : "")}
            onClick={() => choose(id)}>
            {label}{id === "chapters" && scene.scene_markers?.length ? <span className="vbs-count">{scene.scene_markers.length}</span> : null}
            {id === "filters" && filtersOn ? <span className="vbs-dot" title="Filters are on" /> : null}
          </button>
        ))}
        {view === "recommended" && (
          <button type="button" className={"vbs-tab vbs-tab-tool" + (tuning ? " vbs-tab-on" : "")} onClick={() => setTuning(!tuning)} title="Tune the recommendations">
            <Icons.Sliders /> Tune
          </button>
        )}
      </div>
      <div className="vbs-below-body" ref={body}><View scene={scene} tuning={tuning} /></div>
    </section>
  );
}
