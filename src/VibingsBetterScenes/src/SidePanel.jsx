// The side panel. Stash renders it in place of its ScenePage (the title,
// toolbar and tabs next to the player). Tabs: Overview (this plugin's
// view), Queue, and Stash (Stash's own scene page with all its tabs: edit,
// markers, file info, history and tabs other plugins add).

import { LOG, mutate, updateScene, addSceneO } from "./api.js";
import { fmtTime, fmtDuration, fmtBytes, fmtAgo, sceneTitle, age, activityWeeks } from "./format.js";
import { Icons } from "./icons.jsx";
import { QueuePanel } from "./QueuePanel.jsx";
import { useStore, setState, seek, toast } from "./store.js";
import { getDevice, setDevice } from "./settings.js";
import { usePlugins, useBattleRanking, betterOs } from "./integrations.js";
import { Dialog, SafeBox } from "./ui.jsx";
import { QuickEdit } from "./QuickEdit.jsx";
import { QuickBattle } from "./QuickBattle.jsx";

export { Dialog };

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Link } = PluginApi.libraries.ReactRouterDOM;
const C = PluginApi.components;

function Section({ title, children, extra }) {
  return (
    <section className="vbs-section">
      <div className="vbs-section-head"><h4>{title}</h4>{extra}</div>
      {children}
    </section>
  );
}

function Rating({ scene }) {
  const set = (value) => updateScene(scene.id, { rating100: value ?? null }).catch((e) => toast(e.message, true));
  if (C.RatingSystem) return <C.RatingSystem value={scene.rating100} onSetRating={set} clickToRate withoutContext />;
  const stars = Math.round((scene.rating100 || 0) / 20);
  return (
    <span className="vbs-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= stars ? "vbs-on" : ""} onClick={() => set(n === stars ? null : n * 20)} aria-label={n + " stars"}>
          {n <= stars ? <Icons.Star /> : <Icons.StarOff />}
        </button>
      ))}
    </span>
  );
}

function Toolbar({ scene, onTab }) {
  const [busy, setBusy] = React.useState(false);
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { console.warn(LOG, e); toast(e.message, true); } finally { setBusy(false); }
  };
  return (
    <div className="vbs-toolbar">
      <Rating scene={scene} />
      <span className="vbs-grow" />
      <button type="button" className="vbs-chip" title="Plays — open the history" onClick={() => onTab("stash")}>
        <Icons.Eye /> {scene.play_count || 0}
      </button>
      <button type="button" className="vbs-chip vbs-chip-o" disabled={busy} title="Add an O" onClick={() => run(() => addSceneO(scene.id))}>
        <Icons.Drop /> {scene.o_counter || 0}
      </button>
      <button type="button" className={"vbs-chip" + (scene.organized ? " vbs-chip-on" : "")} disabled={busy}
        title={scene.organized ? "Organized" : "Not organized"} onClick={() => run(() => updateScene(scene.id, { organized: !scene.organized }))}>
        <Icons.Check />
      </button>
    </div>
  );
}

function PerformerList({ performers, battles }) {
  const [favs, setFavs] = React.useState({});
  const toggle = async (p) => {
    const next = !(favs[p.id] ?? p.favorite);
    setFavs((f) => ({ ...f, [p.id]: next }));
    try {
      await mutate("PerformerUpdateDocument", { input: { id: String(p.id), favorite: next } });
    } catch (e) {
      setFavs((f) => ({ ...f, [p.id]: !next }));
      toast(e.message, true);
    }
  };
  return (
    <div className={"vbs-performers" + (performers.length > 3 ? " vbs-performers-compact" : "")}>
      {performers.map((p) => {
        const fav = favs[p.id] ?? p.favorite;
        const b = battles?.get(String(p.id));
        const a = age(p.birthdate);
        return (
          <div key={p.id} className="vbs-performer">
            <Link to={"/performers/" + p.id} className="vbs-performer-img">
              {p.image_path ? <img src={p.image_path} alt="" loading="lazy" /> : <span />}
            </Link>
            <div className="vbs-performer-text">
              <Link to={"/performers/" + p.id} className="vbs-performer-name">{p.name}</Link>
              <span className="vbs-dim vbs-small">
                {[a != null ? a + " y" : null, p.country, p.disambiguation].filter(Boolean).join(" · ")}
              </span>
              {b && <span className="vbs-small vbs-elo" title={`${b.wins} wins, ${b.losses} losses`}><Icons.Trophy /> {Math.round(b.rating)} · #{b.rank}</span>}
            </div>
            <button type="button" className={"vbs-icon-btn vbs-fav" + (fav ? " vbs-on" : "")} onClick={() => toggle(p)}
              title={fav ? "Favourite" : "Add to favourites"}>{fav ? <Icons.Star /> : <Icons.StarOff />}</button>
          </div>
        );
      })}
    </div>
  );
}

// Os without Vibings Better Os: Stash's own O history.
function ClassicOs({ scene }) {
  const history = [...(scene.o_history || [])].sort().reverse();
  const remove = (at) => mutate("SceneDeleteODocument", { id: String(scene.id), times: [at] }, (cache, { data }) => {
    const r = data?.sceneDeleteO;
    if (r) cache.modify({ id: cache.identify({ __typename: "Scene", id: String(scene.id) }), fields: { o_counter: () => r.count, o_history: () => r.history } });
  }).catch((e) => toast(e.message, true));
  if (!history.length) return <p className="vbs-dim vbs-small">No Os yet.</p>;
  return (
    <ul className="vbs-o-list">
      {history.map((at) => (
        <li key={at}>
          <span>{new Date(at).toLocaleString()}</span><span className="vbs-dim">{fmtAgo(at)}</span>
          <button type="button" className="vbs-icon-btn vbs-danger" onClick={() => remove(at)} aria-label="Remove this O"><Icons.Close /></button>
        </li>
      ))}
    </ul>
  );
}

// The latest O and the count; "Show all" opens the full list.
function useBetterOsScene(sceneId) {
  const [state, setLocal] = React.useState(null);
  React.useEffect(() => {
    const api = betterOs();
    if (!api) return undefined;
    const key = String(sceneId);
    setLocal(api.getScene(key));
    if (!api.getScene(key).loaded) api.loadScene(key);
    return api.onScene((changed) => { if (changed === key || changed === "*") setLocal(api.getScene(key)); });
  }, [sceneId]);
  return state;
}

function OsSummary({ scene }) {
  const [open, setOpen] = React.useState(false);
  const os = betterOs();
  const state = useBetterOsScene(scene.id);
  const history = [...(state?.loaded ? state.history : scene.o_history || [])].sort().reverse();
  const events = new Map((state?.events || []).map((e) => [e.at, e]));
  const latest = history[0];
  const ev = latest && events.get(latest);
  const timed = history.filter((at) => events.get(at)?.t != null).length;
  return (
    <div className="vbs-os">
      <div className="vbs-os-head">
        <span><strong>{history.length}</strong> {history.length === 1 ? "O" : "Os"}{os && history.length ? <span className="vbs-dim"> · {timed} with position</span> : null}</span>
        <button type="button" className="vbs-link-btn" onClick={() => addSceneO(scene.id).catch((e) => toast(e.message, true))}><Icons.Plus /> Add</button>
      </div>
      {latest ? (
        <div className="vbs-os-latest">
          <span className="vbs-os-label">Latest</span>
          <span>{new Date(latest).toLocaleString()} <span className="vbs-dim">· {fmtAgo(latest)}</span></span>
          {ev?.t != null ? (
            <button type="button" className="vbs-chip vbs-chip-o vbs-chip-small2" onClick={() => seek(ev.t)} title="Play from here"><Icons.Drop /> {fmtTime(ev.t)}</button>
          ) : <span className="vbs-dim vbs-small">classic</span>}
        </div>
      ) : <p className="vbs-dim vbs-small">No Os yet. The O button stores the moment of the video.</p>}
      {history.length > 0 && <button type="button" className="vbs-link-btn" onClick={() => setOpen(true)}>Show all Os</button>}
      {open && (
        <Dialog title={"Os · " + sceneTitle(scene)} onClose={() => setOpen(false)} wide>
          {os?.OsPanel ? <os.OsPanel scene={scene} /> : <ClassicOs scene={scene} />}
        </Dialog>
      )}
    </div>
  );
}

function ActivityGrid({ scene }) {
  const weeks = activityWeeks(scene.play_history, scene.o_history, 26);
  const max = Math.max(1, ...weeks.flat().map((d) => d.plays));
  const level = (n) => (n ? Math.min(4, Math.ceil((n / max) * 4)) : 0);
  return (
    <div className="vbs-activity">
      <div className="vbs-activity-grid">
        {weeks.map((col, w) => (
          <div key={w} className="vbs-activity-col">
            {col.map((d) => (
              <span key={d.key} className={"vbs-day vbs-l" + level(d.plays) + (d.os ? " vbs-day-o" : "") + (d.future ? " vbs-day-future" : "")}
                title={d.key + ": " + d.plays + (d.plays === 1 ? " play" : " plays") + (d.os ? ", " + d.os + (d.os === 1 ? " O" : " Os") : "")} />
            ))}
          </div>
        ))}
      </div>
      <div className="vbs-activity-legend vbs-dim">
        <span>Last 26 weeks</span><span className="vbs-grow" />
        <span>Less</span>{[0, 1, 2, 3, 4].map((l) => <span key={l} className={"vbs-day vbs-l" + l} />)}<span>More</span>
        <span className="vbs-day vbs-day-o" /> <span>O</span>
      </div>
    </div>
  );
}

function BattlesCard({ scene }) {
  const [battle, setBattle] = React.useState(false);
  const [n, setN] = React.useState(0); // reloads the ranking after battles
  const ranking = useBattleRanking("scenes", true, n);
  const b = ranking?.get(String(scene.id));
  return (
    <div className="vbs-battles">
      <Icons.Trophy />
      {b ? (
        <span><strong>{Math.round(b.rating)}</strong> Elo · rank {b.rank} of {b.total} · {b.wins}–{b.losses}{b.draws ? "–" + b.draws : ""}</span>
      ) : <span className="vbs-dim">Not battled yet</span>}
      <span className="vbs-grow" />
      <button type="button" className="vbs-link-btn" onClick={() => setBattle(true)} title="Battle this scene against a similar one">Battle</button>
      <Link to="/vibings-battles?cat=scenes" className="vbs-link-btn">Battles</Link>
      {battle && <QuickBattle scene={scene} onClose={() => { setBattle(false); setN((x) => x + 1); }} />}
    </div>
  );
}

function Details({ scene }) {
  const [open, setOpen] = React.useState(false);
  const [grid, setGrid] = React.useState(() => getDevice().activityGrid !== false);
  const toggleGrid = () => { setGrid(!grid); setDevice({ activityGrid: !grid }); };
  const f = scene.files?.[0] || {};
  const rows = [
    scene.studio && ["Studio", <Link to={"/studios/" + scene.studio.id}>{scene.studio.name}</Link>],
    scene.date && ["Date", scene.date],
    scene.director && ["Director", scene.director],
    scene.code && ["Code", scene.code],
    scene.groups?.length && ["Groups", scene.groups.map((g, i) => <React.Fragment key={g.group.id}>{i ? ", " : ""}<Link to={"/groups/" + g.group.id}>{g.group.name}</Link></React.Fragment>)],
    scene.galleries?.length && ["Galleries", scene.galleries.map((g, i) => <React.Fragment key={g.id}>{i ? ", " : ""}<Link to={"/galleries/" + g.id}>{g.title || "Gallery " + g.id}</Link></React.Fragment>)],
    ["Played", <>{`${scene.play_count || 0} times · ${fmtDuration(scene.play_duration)}${scene.last_played_at ? " · last " + fmtAgo(scene.last_played_at) : ""}`}{" "}
      <button type="button" className="vbs-link-btn" onClick={toggleGrid}>{grid ? "Hide activity" : "Show activity"}</button></>],
    scene.resume_time > 0 && ["Resume at", <button type="button" className="vbs-link-btn" onClick={() => seek(scene.resume_time)}>{fmtTime(scene.resume_time)}</button>],
    ["File", `${f.width || "?"}×${f.height || "?"} · ${f.video_codec || "?"} · ${fmtBytes(f.size)}`],
    ["Added", new Date(scene.created_at).toLocaleDateString() + (scene.updated_at ? " · updated " + fmtAgo(scene.updated_at) : "")],
  ].filter(Boolean);
  return (
    <>
      {scene.details && (
        <p className={"vbs-description" + (open ? " vbs-open" : "")} onClick={() => setOpen(!open)}>{scene.details}</p>
      )}
      <dl className="vbs-dl">
        {rows.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
      </dl>
      {grid && <ActivityGrid scene={scene} />}
      {scene.urls?.length > 0 && (
        <div className="vbs-urls">
          {scene.urls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" title={u}><Icons.External /> {u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</a>)}
        </div>
      )}
    </>
  );
}

function Overview({ scene, onTab }) {
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => setEditing(false), [scene.id]);
  const plugins = usePlugins();
  const battlesOn = !!plugins.VibingsBattles?.enabled;
  const perfRanking = useBattleRanking("performers", battlesOn && (scene.performers || []).length > 0);
  const os = betterOs();
  const f = scene.files?.[0] || {};
  const sub = [
    scene.date,
    f.duration ? fmtTime(f.duration) : null,
    f.height ? f.height + "p" : null,
    f.frame_rate ? Math.round(f.frame_rate) + " fps" : null,
  ].filter(Boolean);
  return (
    <div className="vbs-overview">
      <header className="vbs-head">
        {scene.studio?.image_path && (
          <Link to={"/studios/" + scene.studio.id} className="vbs-studio-logo" title={scene.studio.name}><img src={scene.studio.image_path} alt={scene.studio.name} /></Link>
        )}
        <h3 className="vbs-title">{sceneTitle(scene)}</h3>
        <button type="button" className={"vbs-icon-btn vbs-edit-btn" + (editing ? " vbs-on" : "")} onClick={() => setEditing(!editing)} title="Quick edit"><Icons.Pencil /></button>
        <div className="vbs-sub">{sub.join(" · ")}</div>
      </header>
      {editing && <QuickEdit scene={scene} onDone={() => setEditing(false)} />}
      <Toolbar scene={scene} onTab={onTab} />
      {battlesOn && <BattlesCard scene={scene} />}
      {scene.performers?.length > 0 && (
        <Section title="Performers"><PerformerList performers={scene.performers} battles={perfRanking} /></Section>
      )}
      {scene.tags?.length > 0 && (
        <Section title="Tags">
          <div className="vbs-tags">
            {scene.tags.map((t) => <Link key={t.id} to={"/tags/" + t.id} className="vbs-tag">{t.name}</Link>)}
          </div>
        </Section>
      )}
      <Section title="Os"><OsSummary scene={scene} /></Section>
      <Section title="Details"><Details scene={scene} /></Section>
    </div>
  );
}

const TABS = [["overview", "Overview"], ["queue", "Queue"], ["stash", "Stash"]];

export function SidePanel({ props, Original }) {
  const { scene } = props;
  const [tab, setTabState] = React.useState(() => (TABS.some(([id]) => id === getDevice().sideTab) ? getDevice().sideTab : "overview"));
  const [stashMounted, setStashMounted] = React.useState(tab === "stash");
  const panel = useStore((s) => s.panel);
  const setTab = (id) => {
    setTabState(id);
    setDevice({ sideTab: id });
    if (id === "stash") setStashMounted(true);
  };

  // Stash's queue props, for the player and the queue tab.
  React.useEffect(() => {
    setState({
      queue: {
        scenes: props.queueScenes || [],
        start: props.queueStart,
        hasMore: props.queueHasMoreScenes,
        continuePlaylist: props.continuePlaylist,
        setContinuePlaylist: props.setContinuePlaylist,
        onNext: props.onQueueNext,
        onPrevious: props.onQueuePrevious,
        onRandom: props.onQueueRandom,
        onSceneClicked: props.onQueueSceneClicked,
        onMoreScenes: props.onQueueMoreScenes,
        onLessScenes: props.onQueueLessScenes,
      },
    });
  }, [props.queueScenes, props.queueStart, props.queueHasMoreScenes, props.continuePlaylist]);

  React.useEffect(() => { if (panel === "queue") { setTab("queue"); setState({ panel: null }); } }, [panel]);

  React.useEffect(() => {
    document.title = sceneTitle(scene) + " | Stash";
  }, [scene.id, scene.title]);

  return (
    <aside className="vbs-side">
      <div className="vbs-tabs vbs-side-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={"vbs-tab" + (tab === id ? " vbs-tab-on" : "")} onClick={() => setTab(id)}>
            {label}{id === "queue" && props.queueScenes?.length ? <span className="vbs-count">{props.queueScenes.length}</span> : null}
          </button>
        ))}
      </div>
      <div className="vbs-side-body">
        {tab === "overview" && <Overview scene={scene} onTab={setTab} />}
        {tab === "queue" && <QueuePanel scene={scene} />}
        {stashMounted && (
          <div className="vbs-stash-page" hidden={tab !== "stash"}>
            <div className="row"><Original {...props} /></div>
          </div>
        )}
      </div>
    </aside>
  );
}

export function ShortcutsHelp({ shortcuts }) {
  const panel = useStore((s) => s.panel);
  if (panel !== "help") return null;
  return (
    <Dialog title="Keyboard shortcuts" onClose={() => setState({ panel: null })}>
      <dl className="vbs-keys">
        {shortcuts.map(([k, d]) => <React.Fragment key={k}><dt><kbd>{k}</kbd></dt><dd>{d}</dd></React.Fragment>)}
      </dl>
    </Dialog>
  );
}
