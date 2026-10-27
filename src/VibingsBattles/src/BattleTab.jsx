// Battle tab: choose between two items, draw, skip, undo.

import { backend, fetchSmartPair, CATEGORY_BY_ID } from "./api.js";
import { emptyMemory } from "./pairing.js";
import { Icon, formatDelta, formatStreak, useItemMedia } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button } = PluginApi.libraries.Bootstrap;
const Mousetrap = PluginApi.libraries.Mousetrap;
const { faArrowLeft, faArrowRight, faEquals, faForward, faRotateLeft, faUpRightFromSquare } =
  PluginApi.libraries.FontAwesomeSolid;

const DEFAULT_RESULT_DELAY_MS = 700;
const KEYS = ["left", "right", "down", "space", "u", "backspace"];

const OUTCOME_CLASS = {
  a: { a: "win", b: "loss" },
  b: { a: "loss", b: "win" },
  draw: { a: "draw", b: "draw" },
  skip: { a: null, b: null },
};

// The whole picture is shown (contain); a blurred copy fills the empty
// space so portrait and landscape media both look intentional.
function Media({ cat, item }) {
  const [hover, setHover] = React.useState(false);
  const { image, video, fallback } = useItemMedia(cat, item);
  const cls = ["vb-media", cat.contain && !fallback && "logo"].filter(Boolean).join(" ");
  return (
    <div className={cls} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {image && <img className="vb-media-bg" src={image} alt="" aria-hidden="true" />}
      {hover && video ? (
        <video className="vb-media-fg" src={video} autoPlay muted loop playsInline />
      ) : (
        image && <img className="vb-media-fg" src={image} alt="" loading="eager" />
      )}
      {fallback && <span className="vb-badge" title="No image in Stash; showing one from its library">From library</span>}
    </div>
  );
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
          href={cat.href(item.id)}
          target="_blank"
          rel="noreferrer"
          title="Open in a new tab"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon icon={faUpRightFromSquare} />
        </a>
        {delta != null && (
          <div className={`vb-delta ${delta > 0 ? "vb-up" : delta < 0 ? "vb-down" : ""}`}>{formatDelta(delta)}</div>
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
              {stats.streak !== 0 && <span>Streak <b>{formatStreak(stats.streak)}</b></span>}
            </>
          ) : (
            <span>Unranked</span>
          )}
        </div>
      </div>
    </button>
  );
}

const ref = (cat, it) => ({
  id: it.id,
  name: cat.title(it),
  ...(cat.hasPerformers ? { performers: (it.performers || []).map((p) => ({ id: p.id, name: p.name })) } : {}),
});

export function BattleTab({ active, catId, onCategory, settings, sync, notifyError, onBattle }) {
  const toast = PluginApi.hooks.useToast();
  const [stats, setStatsState] = React.useState({}); // item id -> backend stats for the active category
  const [pair, setPair] = React.useState(null);
  const [phase, setPhase] = React.useState("idle"); // idle | loading | ready | busy | result | error
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null); // { result, delta: [a, b] }
  const [session, setSession] = React.useState(0);
  const history = React.useRef([]); // [{ seq, catId, pair }] for undo
  const restoreRef = React.useRef(null); // pair to show after an undo switches category
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

  const loadStats = React.useCallback(async (id) => {
    try {
      const items = await backend("get_items", { category: id });
      setStats(Object.fromEntries((items || []).map((it) => [it.id, it])));
    } catch (e) {
      notifyError("Could not load item stats", e);
      setStats({});
    }
  }, [notifyError, setStats]);

  const cat = catId ? CATEGORY_BY_ID[catId] : null;
  const resultDelay = settings?.ui?.resultDelayMs ?? DEFAULT_RESULT_DELAY_MS;

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

  // Category chosen in the side panel (or restored by undo).
  React.useEffect(() => {
    if (!catId) return;
    loadToken.current++; // cancel any pending pair load
    const restore = restoreRef.current?.catId === catId ? restoreRef.current : null;
    restoreRef.current = null;
    setPair(restore ? restore.pair : null);
    setResult(null);
    setError(null);
    setSession(0);
    memoryRef.current = emptyMemory();
    missingRef.current = new Set();
    loadStats(catId).then(() => {
      if (restore) setPhase("ready");
      else loadPair(CATEGORY_BY_ID[catId]);
    });
  }, [catId]);

  // Settings changes (e.g. Elo parameters) change every rating: refresh.
  React.useEffect(() => {
    if (catId) loadStats(catId);
  }, [settings]);

  const decide = React.useCallback(async (outcome) => {
    if (phase !== "ready" || !pair || !cat) return;
    const [a, b] = pair;
    setPhase("busy");
    try {
      const out = await backend("record", { category: cat.id, a: ref(cat, a), b: ref(cat, b), result: outcome });
      history.current.push({ seq: out.entry.seq, catId: cat.id, pair });
      if (history.current.length > 50) history.current.shift();
      setStats((s) => ({ ...s, [out.a.id]: out.a, [out.b.id]: out.b }));
      if (outcome !== "skip") setSession((n) => n + 1);
      sync(out.changed);
      onBattle?.();
      setResult({ result: outcome, delta: out.entry.delta });
      setPhase("result");
      setTimeout(() => loadPair(cat), outcome === "skip" ? 0 : resultDelay);
    } catch (e) {
      notifyError("Could not save battle", e);
      setPhase("ready");
    }
  }, [phase, pair, cat, sync, loadPair, notifyError, setStats, resultDelay, onBattle]);

  const undo = React.useCallback(async () => {
    if (phase === "busy") return;
    setPhase("busy");
    try {
      const out = await backend("undo");
      sync(out.changed);
      onBattle?.();
      const last = history.current[history.current.length - 1];
      const undone = out.undone;
      toast.success(`Undid battle #${undone.seq}`);
      if (last && last.seq === undone.seq) {
        history.current.pop();
        if (last.catId !== catId) {
          restoreRef.current = last; // the category effect shows this pair
          onCategory(last.catId);
          return;
        }
        await loadStats(last.catId);
        loadToken.current++; // cancel any pending pair load
        setPair(last.pair);
        setResult(null);
        if (undone.result !== "skip") setSession((n) => Math.max(0, n - 1));
        setPhase("ready");
      } else {
        // Undid a battle from another session/device: refresh stats, keep going.
        if (cat) await loadStats(cat.id);
        setPhase(pair ? "ready" : "idle");
      }
    } catch (e) {
      notifyError("Undo failed", e);
      setPhase(pair ? "ready" : cat ? "error" : "idle");
    }
  }, [phase, pair, cat, catId, sync, toast, notifyError, loadStats, onBattle, onCategory]);

  // Keyboard shortcuts only while this tab is visible.
  const keyHandlers = React.useRef({});
  keyHandlers.current = { decide, undo };
  React.useEffect(() => {
    if (!active) return undefined;
    const bind = (keys, fn) => Mousetrap.bind(keys, (e) => { e.preventDefault(); fn(); });
    bind("left", () => keyHandlers.current.decide("a"));
    bind("right", () => keyHandlers.current.decide("b"));
    bind("down", () => keyHandlers.current.decide("draw"));
    bind("space", () => keyHandlers.current.decide("skip"));
    bind(["u", "backspace"], () => keyHandlers.current.undo());
    return () => Mousetrap.unbind(KEYS);
  }, [active]);

  const outcomeFor = (side) => (phase === "result" && result ? OUTCOME_CLASS[result.result][side] : null);
  const deltaFor = (side) =>
    phase === "result" && result && result.result !== "skip" ? result.delta[side === "a" ? 0 : 1] : null;
  const canDecide = phase === "ready";

  return (
    <div className="vb-battle" style={active ? undefined : { display: "none" }}>
      {cat && (
        <div className="vb-main-head">
          <h2>{cat.label}</h2>
          <span className="vb-muted">{session} battles this session</span>
        </div>
      )}

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
            <Button variant="secondary" disabled={!canDecide} onClick={() => decide("a")} title="Left wins (←)">
              <Icon icon={faArrowLeft} /> <span className="vb-btn-label">Left wins</span> <kbd>←</kbd>
            </Button>
            <Button variant="secondary" disabled={!canDecide} onClick={() => decide("draw")} title="Draw (↓)">
              <Icon icon={faEquals} /> <span className="vb-btn-label">Draw</span> <kbd>↓</kbd>
            </Button>
            <Button variant="secondary" disabled={!canDecide} onClick={() => decide("skip")} title="Skip (Space)">
              <Icon icon={faForward} /> <span className="vb-btn-label">Skip</span> <kbd>Space</kbd>
            </Button>
            <Button variant="secondary" disabled={!canDecide} onClick={() => decide("b")} title="Right wins (→)">
              <span className="vb-btn-label">Right wins</span> <Icon icon={faArrowRight} /> <kbd>→</kbd>
            </Button>
            <Button variant="outline-secondary" disabled={phase === "busy"} onClick={undo} title="Undo (U)">
              <Icon icon={faRotateLeft} /> <span className="vb-btn-label">Undo</span> <kbd>U</kbd>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
