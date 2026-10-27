// "Battle this scene": a Vibings Battles battle between this scene and a
// similar one, without leaving the page. The result is recorded by Battles
// like any other battle.

import { LOG, graphql, updateSceneCache } from "./api.js";
import { fmtTime, sceneTitle, scoreScenes } from "./format.js";
import { Icons } from "./icons.jsx";
import { battleRanking, recordSceneBattle } from "./integrations.js";
import { toast } from "./store.js";
import { Dialog } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const FIELDS = "id title rating100 o_counter paths { screenshot } files { path duration } performers { id name } studio { id name } tags { id }";
const FIND = "query VibingsBetterScenesOpponents($filter: FindFilterType, $scene_filter: SceneFilterType) { findScenes(filter: $filter, scene_filter: $scene_filter) { scenes { " + FIELDS + " } } }";

const random = () => "random_" + Math.floor(Math.random() * 1e8);
const find = async (sceneFilter, perPage) =>
  (await graphql(FIND, { filter: { per_page: perPage, sort: random() }, scene_filter: sceneFilter })).findScenes.scenes;

/** A similar scene (shared performers, tags or studio), not one already met in this dialog. */
async function pickOpponent(scene, met) {
  const performers = (scene.performers || []).map((p) => String(p.id));
  const tags = (scene.tags || []).map((t) => String(t.id)).slice(0, 10);
  const lists = await Promise.all([
    performers.length ? find({ performers: { value: performers, modifier: "INCLUDES" } }, 25) : [],
    tags.length ? find({ tags: { value: tags, modifier: "INCLUDES" } }, 25) : [],
    scene.studio?.id ? find({ studios: { value: [String(scene.studio.id)], modifier: "INCLUDES" } }, 15) : [],
  ]);
  const ranked = scoreScenes(scene, lists.flat()).map((x) => x.scene).filter((s) => !met.has(String(s.id)));
  const pool = ranked.slice(0, 10);
  if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  const any = (await find(null, 10)).filter((s) => String(s.id) !== String(scene.id) && !met.has(String(s.id)));
  return any[0] || null;
}

function Side({ scene, stats, delta, onPick, picked, busy }) {
  return (
    <button type="button" className={"vbs-battle-side" + (picked ? " vbs-battle-won" : "")} disabled={busy} onClick={onPick}>
      <span className="vbs-battle-img">
        {scene.paths?.screenshot ? <img src={scene.paths.screenshot} alt="" /> : <span className="vbs-card-empty" />}
        {scene.files?.[0]?.duration > 0 && <span className="vbs-card-duration">{fmtTime(scene.files[0].duration)}</span>}
      </span>
      <span className="vbs-battle-title">{sceneTitle(scene)}</span>
      <span className="vbs-dim vbs-small">
        {stats ? Math.round(stats.rating) + " Elo · #" + stats.rank : "Not battled yet"}
        {delta != null && <strong className={delta >= 0 ? "vbs-up" : "vbs-down"}> {delta >= 0 ? "+" : ""}{delta.toFixed(1)}</strong>}
      </span>
    </button>
  );
}

export function QuickBattle({ scene, onClose }) {
  const [opponent, setOpponent] = React.useState(null);
  const [ranking, setRanking] = React.useState(null);
  const [result, setResult] = React.useState(null); // { result, delta: [a, b] }
  const [busy, setBusy] = React.useState(true);
  const [count, setCount] = React.useState(0);
  const met = React.useRef(new Set([String(scene.id)]));

  const load = React.useCallback(async () => {
    setBusy(true);
    setResult(null);
    try {
      const [o, r] = await Promise.all([pickOpponent(scene, met.current), battleRanking("scenes").catch(() => null)]);
      if (o) met.current.add(String(o.id));
      setOpponent(o);
      setRanking(r);
    } catch (e) {
      console.warn(LOG, e);
      toast("Could not find an opponent: " + e.message, true);
    } finally {
      setBusy(false);
    }
  }, [scene.id]);
  React.useEffect(() => { load(); }, [load]);

  const decide = async (outcome) => {
    if (!opponent || busy) return;
    setBusy(true);
    try {
      const out = await recordSceneBattle(scene, opponent, outcome);
      setResult({ result: outcome, delta: out.entry?.delta || [0, 0] });
      setCount((n) => n + 1);
      const mine = (out.changed || []).find((c) => c.category === "scenes" && String(c.id) === String(scene.id));
      if (mine) updateSceneCache(scene.id, { rating100: () => mine.rating100 ?? null });
      setRanking(await battleRanking("scenes").catch(() => ranking));
    } catch (e) {
      toast("Could not save the battle: " + e.message, true);
    } finally {
      setBusy(false);
    }
  };

  // 1 / 2 pick, D draw, N next opponent.
  React.useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (!result && (k === "1" || k === "arrowleft")) { e.preventDefault(); e.stopPropagation(); decide("a"); }
      else if (!result && (k === "2" || k === "arrowright")) { e.preventDefault(); e.stopPropagation(); decide("b"); }
      else if (!result && k === "d") { e.preventDefault(); e.stopPropagation(); decide("draw"); }
      else if (k === "n" || (result && k === "enter")) { e.preventDefault(); e.stopPropagation(); load(); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  return (
    <Dialog title={"Battle · " + sceneTitle(scene)} onClose={onClose} wide>
      {!opponent && !busy ? <p className="vbs-dim">No other scene to battle against.</p> : (
        <>
          <p className="vbs-dim vbs-small">Which is better? Recorded in Vibings Battles. Keys: 1 / 2, D draw, N next opponent.</p>
          <div className="vbs-battle">
            <Side scene={scene} stats={ranking?.get(String(scene.id))} delta={result ? result.delta[0] : null}
              picked={result?.result === "a"} busy={busy || !!result} onPick={() => decide("a")} />
            <span className="vbs-battle-vs">vs</span>
            {opponent ? (
              <Side scene={opponent} stats={ranking?.get(String(opponent.id))} delta={result ? result.delta[1] : null}
                picked={result?.result === "b"} busy={busy || !!result} onPick={() => decide("b")} />
            ) : <div className="vbs-battle-side vbs-empty">Finding an opponent…</div>}
          </div>
          <div className="vbs-modal-actions">
            {count > 0 && <span className="vbs-dim vbs-small">{count} {count === 1 ? "battle" : "battles"}</span>}
            <span className="vbs-grow" />
            {!result && <button type="button" className="vbs-button" disabled={busy || !opponent} onClick={() => decide("draw")}>Draw</button>}
            <button type="button" className={"vbs-button" + (result ? " vbs-button-primary" : "")} disabled={busy} onClick={load}>
              <Icons.Trophy /> {result ? "Next opponent" : "Another opponent"}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}
