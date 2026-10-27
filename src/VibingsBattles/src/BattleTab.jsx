// Battle tab: choose between two items, draw, skip, undo.

import { backend, fetchSmartPair, preloadPair, categoryFilter, CATEGORY_BY_ID } from "./api.js";
import { emptyMemory } from "./pairing.js";
import { usePerformance } from "./perf.js";
import { Icon, formatDelta, formatStreak, useItemMedia } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button } = PluginApi.libraries.Bootstrap;
const Mousetrap = PluginApi.libraries.Mousetrap;
const { faArrowLeft, faArrowRight, faEquals, faForward, faRotateLeft, faUpRightFromSquare, faBan, faCrown, faPlay } =
  PluginApi.libraries.FontAwesomeSolid;

const DEFAULT_RESULT_DELAY_MS = 700;
// Shortest result display per animation level, so an animation can finish.
const ANIMATION_MS = { off: 0, subtle: 500, epic: 1100 };
const KEYS = ["left", "right", "down", "space", "enter", "u", "backspace"];

const OUTCOME_CLASS = {
  a: { a: "win", b: "loss" },
  b: { a: "loss", b: "win" },
  draw: { a: "draw", b: "draw" },
  skip: { a: "skip", b: "skip" },
};
const STAMP = { win: "WINNER", loss: "K.O.", draw: "DRAW" };

// The whole picture is shown (contain); a blurred copy fills the empty
// space so portrait and landscape media both look intentional.
function Media({ cat, item, hoverVideo }) {
  const [hover, setHover] = React.useState(false);
  const { image, video, fallback } = useItemMedia(cat, item);
  const cls = ["vb-media", cat.contain && !fallback && "logo"].filter(Boolean).join(" ");
  return (
    <div className={cls} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {image && <img className="vb-media-bg" src={image} alt="" aria-hidden="true" />}
      {hover && hoverVideo && video ? (
        <video className="vb-media-fg" src={video} autoPlay muted loop playsInline />
      ) : (
        image && <img className="vb-media-fg" src={image} alt="" loading="eager" />
      )}
      {fallback && <span className="vb-badge" title="No image in Stash; showing one from its library">From library</span>}
    </div>
  );
}

// Confetti burst: fixed directions with a little jitter, made once per card.
function Particles({ count = 22 }) {
  const parts = React.useMemo(() => Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 110 + Math.random() * 140;
    return {
      "--dx": `${Math.cos(angle) * dist}px`,
      "--dy": `${Math.sin(angle) * dist - 40}px`,
      "--rot": `${Math.round(Math.random() * 720 - 360)}deg`,
      "--delay": `${Math.round(Math.random() * 120)}ms`,
      "--hue": i % 3,
    };
  }), [count]);
  return <div className="vb-particles">{parts.map((style, i) => <i key={i} style={style} />)}</div>;
}

function CardFx({ outcome, level, effects }) {
  if (!outcome || outcome === "skip" || level !== "epic") return null;
  return (
    <div className={`vb-fx vb-fx-${outcome}`} aria-hidden="true">
      {outcome === "win" && effects && <div className="vb-shine" />}
      {outcome === "loss" && <div className="vb-slash" />}
      {outcome === "win" && <Icon icon={faCrown} className="vb-crown" />}
      <div className="vb-stamp">{STAMP[outcome]}</div>
      {outcome === "win" && effects && <Particles />}
    </div>
  );
}

function BattleCard({ cat, item, stats, side, outcome, delta, disabled, onChoose, onBan, animation, perf }) {
  const cls = ["vb-card", `vb-side-${side}`, outcome].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} disabled={disabled} onClick={onChoose}>
      <div style={{ position: "relative" }}>
        <Media cat={cat} item={item} hoverVideo={perf.hoverVideo} />
        <span className="vb-key">{side === "a" ? "←" : "→"}</span>
        <span className="vb-card-tools">
          {onBan && (
            <span role="button" tabIndex={-1} className="vb-tool" title="Blacklist: never show this item in battles"
              onClick={(e) => { e.stopPropagation(); onBan(); }}>
              <Icon icon={faBan} />
            </span>
          )}
          <a className="vb-tool" href={cat.href(item.id)} target="_blank" rel="noreferrer" title="Open in a new tab"
            onClick={(e) => e.stopPropagation()}>
            <Icon icon={faUpRightFromSquare} />
          </a>
        </span>
        <CardFx outcome={outcome} level={animation} effects={perf.effects} />
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

export function BattleTab({ active, catId, onCategory, settings, saveSettings, sync, notifyError, onBattle }) {
  const toast = PluginApi.hooks.useToast();
  const { options: perf } = usePerformance();
  const [stats, setStatsState] = React.useState({}); // item id -> backend stats for the active category
  const [pair, setPair] = React.useState(null);
  const [phase, setPhase] = React.useState("idle"); // idle | loading | ready | busy | result | error
  const [error, setError] = React.useState(null);
  const [result, setResult] = React.useState(null); // { result, delta: [a, b] }
  const [waiting, setWaiting] = React.useState(false); // result shown, waiting for "Next"
  const [session, setSession] = React.useState(0);
  const history = React.useRef([]); // [{ seq, catId, pair }] for undo
  const restoreRef = React.useRef(null); // pair to show after an undo switches category
  const loadToken = React.useRef(0);
  const nextRef = React.useRef(null); // prefetched next pair (a promise)
  const timerRef = React.useRef(null);
  // Refs read by async pair loading, which must see the latest values.
  const statsRef = React.useRef({});
  const memoryRef = React.useRef(emptyMemory()); // recently shown pairs/items
  const missingRef = React.useRef(new Set()); // ids deleted from Stash
  const perfCacheRef = React.useRef(new Map()); // item id -> performer ids
  const settingsRef = React.useRef(null);
  settingsRef.current = settings;
  const perfRef = React.useRef(perf);
  perfRef.current = perf;

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
  const ui = settings?.ui || {};
  const animation = ui.animations || "epic";
  const autoContinue = ui.autoContinue !== false;
  const resultDelay = Math.max(ui.resultDelayMs ?? DEFAULT_RESULT_DELAY_MS, ANIMATION_MS[animation] ?? 0);

  // Fetch (but do not show) a pair; with preloading its pictures start downloading.
  const fetchNext = React.useCallback((category) => {
    const s = settingsRef.current;
    return fetchSmartPair(category, {
      ranked: Object.values(statsRef.current),
      memory: memoryRef.current,
      missing: missingRef.current,
      initialRating: s?.elo?.initial ?? 1500,
      filter: categoryFilter(s, category.id),
      noDuplicatePerformer: s?.pairing?.noDuplicatePerformer,
      perfCache: perfCacheRef.current,
    }).then((out) => {
      if (perfRef.current.preload) preloadPair(category, out.pair);
      return out;
    });
  }, []);

  const cancelPending = () => {
    loadToken.current++;
    clearTimeout(timerRef.current);
    nextRef.current = null;
    setWaiting(false);
  };

  const loadPair = React.useCallback(async (category, pending = null) => {
    const token = ++loadToken.current;
    clearTimeout(timerRef.current);
    nextRef.current = null;
    setWaiting(false);
    setPhase("loading");
    setResult(null);
    try {
      const { pair: next, memory } = await (pending || fetchNext(category));
      if (token !== loadToken.current) return; // a newer request won
      memoryRef.current = memory;
      setPair(next);
      setPhase("ready");
    } catch (e) {
      if (token !== loadToken.current) return;
      setError(e.message);
      setPhase("error");
    }
  }, [fetchNext]);

  // Category chosen in the side panel (or restored by undo).
  React.useEffect(() => {
    if (!catId) return;
    cancelPending();
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

  React.useEffect(() => () => clearTimeout(timerRef.current), []);

  const next = React.useCallback(() => {
    if (cat && phase === "result") loadPair(cat, nextRef.current);
  }, [cat, phase, loadPair]);

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
      // The next pair loads while the result animates.
      const pending = fetchNext(cat);
      pending.catch(() => {}); // reported when shown
      nextRef.current = pending;
      if (outcome === "skip") {
        timerRef.current = setTimeout(() => loadPair(cat, pending), animation === "off" ? 0 : 220);
      } else if (autoContinue) {
        timerRef.current = setTimeout(() => loadPair(cat, pending), resultDelay);
      } else {
        setWaiting(true);
      }
    } catch (e) {
      notifyError("Could not save battle", e);
      setPhase("ready");
    }
  }, [phase, pair, cat, sync, loadPair, fetchNext, notifyError, setStats, resultDelay, autoContinue, animation, onBattle]);

  const undo = React.useCallback(async () => {
    if (phase === "busy") return;
    cancelPending();
    setPhase("busy");
    try {
      const out = await backend("undo");
      sync(out.changed);
      onBattle?.();
      const last = history.current[history.current.length - 1];
      const undone = out.undone;
      toast.success(`Undid ${undone.type === "arena" ? "arena fight" : "battle"} #${undone.seq}`);
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
        // Undid an entry from another view or device: refresh stats, keep going.
        if (cat) await loadStats(cat.id);
        setResult(null);
        setPhase(pair ? "ready" : "idle");
      }
    } catch (e) {
      notifyError("Undo failed", e);
      setPhase(pair ? "ready" : cat ? "error" : "idle");
    }
  }, [phase, pair, cat, catId, sync, toast, notifyError, loadStats, onBattle, onCategory]);

  // Blacklist an item from its card; the pair is replaced right away.
  const ban = React.useCallback(async (item) => {
    if (!cat || !saveSettings) return;
    const current = settingsRef.current?.filters?.[cat.id] || {};
    const blacklist = [...(current.blacklist || []).filter((r) => String(r.id) !== String(item.id)), { id: String(item.id), name: cat.title(item) }];
    const out = await saveSettings({ filters: { [cat.id]: { ...current, blacklist } } }, { silent: true });
    if (!out) return;
    toast.success(`${cat.title(item)} blacklisted. Undo it in Settings → Filters.`);
    if (phase === "ready" || phase === "result") loadPair(cat);
  }, [cat, saveSettings, toast, phase, loadPair]);

  // Keyboard shortcuts only while this tab is visible.
  const keyHandlers = React.useRef({});
  keyHandlers.current = { decide, undo, next, waiting };
  React.useEffect(() => {
    if (!active) return undefined;
    const bind = (keys, fn) => Mousetrap.bind(keys, (e) => { e.preventDefault(); fn(); });
    bind("left", () => keyHandlers.current.decide("a"));
    bind("right", () => keyHandlers.current.decide("b"));
    bind("down", () => keyHandlers.current.decide("draw"));
    bind("space", () => (keyHandlers.current.waiting ? keyHandlers.current.next() : keyHandlers.current.decide("skip")));
    bind("enter", () => keyHandlers.current.next());
    bind(["u", "backspace"], () => keyHandlers.current.undo());
    return () => Mousetrap.unbind(KEYS);
  }, [active]);

  const outcomeFor = (side) => (phase === "result" && result ? OUTCOME_CLASS[result.result][side] : null);
  const deltaFor = (side) =>
    phase === "result" && result && result.result !== "skip" ? result.delta[side === "a" ? 0 : 1] : null;
  const canDecide = phase === "ready";
  const arenaCls = ["vb-arena", `vb-anim-${animation}`, phase === "result" && result && `vb-clash-${result.result}`].filter(Boolean).join(" ");

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
          <div className={arenaCls}>
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
                onBan={saveSettings && canDecide ? () => ban(pair[i]) : null}
                animation={animation}
                perf={perf}
              />
            ))}
            {animation !== "off" && <div className="vb-vs" aria-hidden="true">VS</div>}
          </div>
          <div className="vb-actions">
            {waiting ? (
              <Button variant="primary" onClick={next} title="Next pair (Space / Enter)" className="vb-next">
                <Icon icon={faPlay} /> <span className="vb-btn-label">Next</span> <kbd>Space</kbd>
              </Button>
            ) : (
              <>
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
              </>
            )}
            <Button variant="outline-secondary" disabled={phase === "busy"} onClick={undo} title="Undo (U)">
              <Icon icon={faRotateLeft} /> <span className="vb-btn-label">Undo</span> <kbd>U</kbd>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
