// Arena tab: an auto battler. Performers chosen by the arena settings fight
// a free-for-all; the user only watches. The fight is simulated up front
// (arena.js) and played back here.

import { backend, pickArenaFighters, CATEGORY_BY_ID } from "./api.js";
import { simulateArena, describeArenaEvent, arenaDeltas, fighterPower, ordinal, MAX_HP } from "./arena.js";
import { usePerformance } from "./perf.js";
import { Icon, formatDelta, useItemMedia } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, ButtonGroup } = PluginApi.libraries.Bootstrap;
const { faPlay, faShuffle, faRotateRight, faForwardFast, faRotateLeft, faCrown, faSkull, faGear } =
  PluginApi.libraries.FontAwesomeSolid;

const PERFORMERS = CATEGORY_BY_ID.performers;
const STEP_MS = 620; // one event at 1x speed
const SPEEDS = [1, 2, 4];
const SELECTION_LABEL = { random: "random performers", top: "top rated", close: "similar Elo" };

function Avatar({ fighter }) {
  const { image } = useItemMedia(PERFORMERS, fighter.item, { thumb: true });
  return image ? <img src={image} alt="" draggable={false} /> : <div className="vb-avatar-empty">{fighter.name[0]}</div>;
}

// Positions on an ellipse inside the stage, in px.
function useLayout(stageRef, n) {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stageRef.current]);
  const { w, h } = size;
  // Phones get smaller fighters so names do not overlap.
  const factor = (n <= 4 ? 0.26 : n <= 8 ? 0.2 : n <= 12 ? 0.16 : 0.13) * (w < 500 ? 0.8 : 1);
  const fsize = Math.round(Math.max(40, Math.min(150, Math.min(w, h) * factor)));
  const rx = Math.max(0, w / 2 - fsize * 0.75);
  const ry = Math.max(0, h / 2 - fsize * 0.85);
  const pos = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: w / 2 + rx * Math.cos(a), y: h / 2 + ry * Math.sin(a) };
  });
  return { pos, fsize, w, h };
}

function Lineup({ fighters, power }) {
  return (
    <div className="vb-lineup">
      {fighters.map((f, i) => (
        <div key={f.id} className="vb-lineup-card">
          <div className="vb-avatar"><Avatar fighter={f} /></div>
          <div className="vb-lineup-name" title={f.name}>{f.name}</div>
          <div className="vb-muted vb-lineup-elo">Elo {Math.round(f.elo)}{power ? ` · power ${Math.round(power[i] * 100)}%` : ""}</div>
        </div>
      ))}
    </div>
  );
}

function Stage({ fighters, sim, step, speed, effects }) {
  const stageRef = React.useRef(null);
  const bodyRefs = React.useRef([]);
  const { pos, fsize, w, h } = useLayout(stageRef, fighters.length);
  const shown = step; // number of events played
  const ev = shown > 0 ? sim.events[shown - 1] : null;
  const hp = shown > 0 ? sim.hp[shown - 1] : fighters.map(() => MAX_HP);
  const out = new Map(); // fighter index -> place, for knocked out fighters
  sim.events.slice(0, shown).forEach((e) => e.type === "ko" && out.set(e.to, e.place));
  const winner = ev?.type === "win" ? ev.id : null;

  // Attack motion: the attacker lunges at the target, the target recoils.
  React.useEffect(() => {
    if (!ev || (ev.type !== "hit" && ev.type !== "miss")) return;
    const a = bodyRefs.current[ev.from];
    const t = bodyRefs.current[ev.to];
    const pa = pos[ev.from];
    const pt = pos[ev.to];
    if (!a || !t || !pa || !pt) return;
    const dur = Math.max(160, 300 / speed);
    const dx = (pt.x - pa.x) * 0.3;
    const dy = (pt.y - pa.y) * 0.3;
    a.animate?.([{ transform: "translate(0,0)" }, { transform: `translate(${dx}px,${dy}px) scale(1.08)` }, { transform: "translate(0,0)" }],
      { duration: dur, easing: "ease-out" });
    if (ev.type === "hit") {
      t.animate?.([
        { transform: "translate(0,0)", filter: "none" },
        { transform: `translate(${dx * 0.25}px,${dy * 0.25}px)`, filter: "brightness(1.8) saturate(0.4) sepia(1) hue-rotate(-50deg)" },
        { transform: "translate(0,0)", filter: "none" },
      ], { duration: dur * 1.2, delay: dur * 0.35, easing: "ease-out" });
      if (ev.crit && effects) {
        stageRef.current?.animate?.([
          { transform: "translate(0,0)" }, { transform: "translate(-6px,3px)" }, { transform: "translate(5px,-4px)" },
          { transform: "translate(-3px,2px)" }, { transform: "translate(0,0)" },
        ], { duration: 260, delay: dur * 0.35 });
      }
    } else {
      t.animate?.([{ transform: "translate(0,0)" }, { transform: `translate(${-dy * 0.3}px,${dx * 0.3}px)` }, { transform: "translate(0,0)" }],
        { duration: dur, delay: dur * 0.2, easing: "ease-out" });
    }
  }, [shown]);

  // Floating texts of the last few events; each keeps its own key so its
  // animation runs once and ends invisible.
  const floats = [];
  for (let i = Math.max(0, shown - 6); i < shown; i++) {
    const e = sim.events[i];
    if (e.type === "hit") floats.push({ key: i, at: e.to, text: e.crit ? `${e.dmg}!` : String(e.dmg), cls: e.crit ? "crit" : "dmg" });
    if (e.type === "miss") floats.push({ key: i, at: e.to, text: "MISS", cls: "miss" });
    if (e.type === "ko") floats.push({ key: i, at: e.to, text: "K.O.", cls: "ko" });
  }

  return (
    <div className={`vb-stage${winner != null ? " vb-stage-done" : ""}`} ref={stageRef}>
      <div className="vb-stage-floor" />
      {effects && ev && ev.type === "hit" && pos[ev.from] && (
        <svg className="vb-stage-fx" width={w} height={h} key={`trail-${shown}`} aria-hidden="true">
          <line x1={pos[ev.from].x} y1={pos[ev.from].y} x2={pos[ev.to].x} y2={pos[ev.to].y}
            className={`vb-trail${ev.crit ? " crit" : ""}`} style={{ animationDuration: `${Math.max(200, 420 / speed)}ms` }} />
        </svg>
      )}
      {fighters.map((f, i) => {
        const p = winner === i ? { x: w / 2, y: h / 2 } : pos[i];
        if (!p) return null;
        const place = out.get(i);
        const pct = (hp[i] / MAX_HP) * 100;
        const cls = ["vb-fighter", place && "out", winner === i && "winner", ev && (ev.from === i || ev.to === i) && "active"]
          .filter(Boolean).join(" ");
        return (
          <div key={f.id} className={cls} style={{ left: p.x, top: p.y, width: fsize, "--fsize": `${fsize}px` }}>
            <div className="vb-fighter-body" ref={(el) => { bodyRefs.current[i] = el; }}>
              {winner === i && <Icon icon={faCrown} className="vb-fighter-crown" />}
              <div className="vb-avatar"><Avatar fighter={f} /></div>
              {place && <span className="vb-place"><Icon icon={faSkull} /> {ordinal(place)}</span>}
            </div>
            <div className="vb-hp"><div className={`vb-hp-fill${pct <= 25 ? " low" : pct <= 50 ? " mid" : ""}`} style={{ width: `${pct}%` }} /></div>
            <div className="vb-fighter-name" title={f.name}>{f.name}</div>
          </div>
        );
      })}
      {floats.map((fl) => pos[fl.at] && (
        <div key={fl.key} className={`vb-float ${fl.cls}`} style={{ left: pos[fl.at].x, top: pos[fl.at].y - fsize * 0.45 }}>{fl.text}</div>
      ))}
      {winner != null && effects && <div className="vb-stage-confetti" aria-hidden="true">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ "--i": i }} />)}</div>}
    </div>
  );
}

function Results({ fighters, sim, entry, record }) {
  const deltas = entry?.delta;
  const podium = sim.ranking.slice(0, 3);
  return (
    <div className="vb-results">
      <div className="vb-podium">
        {[1, 0, 2].filter((p) => podium[p] != null).map((p) => {
          const f = fighters[podium[p]];
          return (
            <div key={f.id} className={`vb-podium-spot vb-p${p + 1}`}>
              {p === 0 && <Icon icon={faCrown} className="vb-podium-crown" />}
              <div className="vb-avatar"><Avatar fighter={f} /></div>
              <div className="vb-lineup-name" title={f.name}>{f.name}</div>
              <div className="vb-podium-block">{ordinal(p + 1)}</div>
            </div>
          );
        })}
      </div>
      <div className="vb-scroll">
        <table className="vb-table">
          <thead>
            <tr><th>#</th><th>Performer</th><th className="vb-num">K.O.s</th><th className="vb-num">Elo</th><th className="vb-num">Change</th></tr>
          </thead>
          <tbody>
            {sim.ranking.map((fi, place) => {
              const f = fighters[fi];
              const d = deltas?.[place];
              return (
                <tr key={f.id} style={{ cursor: "default" }}>
                  <td className={`vb-rank${place < 3 ? " top" : ""}`}>{place + 1}</td>
                  <td className="vb-name"><a href={PERFORMERS.href(f.id)} target="_blank" rel="noreferrer">{f.name}</a></td>
                  <td className="vb-num">{sim.kills[fi]}</td>
                  <td className="vb-num">{Math.round(f.elo + (d || 0))}</td>
                  <td className={`vb-num ${d > 0 ? "vb-up" : d < 0 ? "vb-down" : ""}`}>{d != null ? formatDelta(d) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!record && <p className="vb-muted">Exhibition fight: ratings were not changed (Settings → Arena → Record results).</p>}
    </div>
  );
}

export function ArenaTab({ active, settings, sync, notifyError, onBattle, onOpenSettings }) {
  const toast = PluginApi.hooks.useToast();
  const { options: perf } = usePerformance();
  const [fighters, setFighters] = React.useState(null);
  const [phase, setPhase] = React.useState("idle"); // idle | loading | setup | fight | done | error
  const [error, setError] = React.useState(null);
  const [sim, setSim] = React.useState(null);
  const [step, setStep] = React.useState(0);
  const [speed, setSpeed] = React.useState(null);
  const [entry, setEntry] = React.useState(null); // recorded backend entry
  const [busy, setBusy] = React.useState(false);
  const finishedRef = React.useRef(false);
  const arena = settings?.arena;
  const currentSpeed = speed ?? arena?.speed ?? 1;

  const newLineup = React.useCallback(async () => {
    if (!settings) return;
    setPhase("loading");
    setSim(null);
    setEntry(null);
    try {
      const ranked = await backend("get_items", { category: "performers" });
      setFighters(await pickArenaFighters(settings, ranked || []));
      setPhase("setup");
    } catch (e) {
      setError(e.message);
      setPhase("error");
    }
  }, [settings]);

  // First visit: pick a lineup.
  React.useEffect(() => {
    if (active && settings && phase === "idle") newLineup();
  }, [active, settings, phase, newLineup]);

  const power = React.useMemo(() => {
    if (!fighters || !arena) return null;
    const mean = fighters.reduce((sum, f) => sum + f.elo, 0) / fighters.length;
    return fighters.map((f) => fighterPower(f.elo, mean, arena.eloInfluence));
  }, [fighters, arena?.eloInfluence]);

  const start = () => {
    finishedRef.current = false;
    setEntry(null);
    setSim(simulateArena(fighters, { eloInfluence: arena.eloInfluence }));
    setStep(0);
    setPhase("fight");
  };

  const finish = React.useCallback(async (s) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase("done");
    if (!arena.record) return;
    try {
      const out = await backend("record_arena", {
        ranking: s.ranking.map((i) => ({ id: fighters[i].id, name: fighters[i].name })),
        kills: s.ranking.map((i) => s.kills[i]),
      });
      setEntry(out.entry);
      sync(out.changed);
      onBattle?.();
    } catch (e) {
      notifyError("Could not save the arena result", e);
    }
  }, [arena, fighters, sync, onBattle, notifyError]);

  // Play the events back. Paused while the tab is hidden.
  React.useEffect(() => {
    if (phase !== "fight" || !sim || !active) return undefined;
    if (step >= sim.events.length) {
      finish(sim);
      return undefined;
    }
    const ev = sim.events[step];
    const base = STEP_MS / currentSpeed;
    const wait = step === 0 ? 500 : ev.type === "ko" ? base * 1.5 : ev.type === "miss" ? base * 0.7 : base;
    const t = setTimeout(() => setStep((n) => n + 1), wait);
    return () => clearTimeout(t);
  }, [phase, sim, step, currentSpeed, active, finish]);

  const skip = () => {
    setStep(sim.events.length);
  };

  const undo = async () => {
    if (!entry) return;
    setBusy(true);
    try {
      const [last] = await backend("recent_log", { limit: 1 });
      if (last?.seq !== entry.seq) throw new Error("newer battles were recorded after this fight");
      const out = await backend("undo");
      sync(out.changed);
      onBattle?.();
      setEntry(null);
      toast.success("Arena result undone");
      setPhase("setup");
    } catch (e) {
      notifyError("Undo failed", e);
    } finally {
      setBusy(false);
    }
  };

  if (!active) return null;
  const n = fighters?.length || 0;
  const deltas = arena ? arenaDeltas(n || arena.fighters, arena.winBonus, arena.lossPenalty) : [];
  const feed = sim ? sim.events.slice(Math.max(0, step - 6), step).reverse() : [];
  const name = (i) => fighters[i].name;

  return (
    <div className="vb-arena-view">
      <div className="vb-main-head">
        <h2>Arena</h2>
        {arena && (
          <span className="vb-muted">
            {n || arena.fighters} fighters · {SELECTION_LABEL[arena.selection]} · winner {formatDelta(arena.winBonus)}
            {n > 1 ? `, first out ${formatDelta(deltas[deltas.length - 1])}` : ""} · Elo influence {arena.eloInfluence}%
            {!arena.record && " · exhibition"}
          </span>
        )}
        <Button variant="link" size="sm" className="vb-head-link" onClick={onOpenSettings}><Icon icon={faGear} /> Arena settings</Button>
      </div>

      {(phase === "idle" || phase === "loading") && <div className="vb-status vb-muted">Choosing fighters…</div>}
      {phase === "error" && (
        <div className="vb-status">
          <p className="vb-error">{error}</p>
          <Button variant="secondary" onClick={newLineup}>Try again</Button>
        </div>
      )}

      {phase === "setup" && fighters && (
        <>
          <Lineup fighters={fighters} power={arena.eloInfluence ? power : null} />
          <div className="vb-actions vb-arena-actions">
            <Button variant="primary" onClick={start}><Icon icon={faPlay} /> Fight!</Button>
            <Button variant="secondary" onClick={newLineup}><Icon icon={faShuffle} /> <span className="vb-btn-label">New lineup</span></Button>
          </div>
        </>
      )}

      {(phase === "fight" || phase === "done") && sim && (
        <div className="vb-arena-fight">
          <Stage fighters={fighters} sim={sim} step={step} speed={currentSpeed} effects={perf.effects} />
          <div className="vb-arena-controls">
            {phase === "fight" ? (
              <>
                <ButtonGroup size="sm" aria-label="Speed">
                  {SPEEDS.map((s) => (
                    <Button key={s} variant={currentSpeed === s ? "primary" : "secondary"} onClick={() => setSpeed(s)}>{s}x</Button>
                  ))}
                </ButtonGroup>
                <Button size="sm" variant="secondary" onClick={skip}><Icon icon={faForwardFast} /> Skip to result</Button>
              </>
            ) : (
              <>
                <Button variant="primary" onClick={newLineup}><Icon icon={faShuffle} /> New fight</Button>
                <Button variant="secondary" onClick={start}><Icon icon={faRotateRight} /> Rematch</Button>
                {entry && <Button variant="outline-secondary" disabled={busy} onClick={undo}><Icon icon={faRotateLeft} /> Undo result</Button>}
              </>
            )}
          </div>
          {phase === "fight" && (
            <ol className="vb-feed" aria-live="polite">
              {feed.map((e, i) => (
                <li key={step - i} className={`vb-feed-${e.type}${e.crit ? " crit" : ""}`}>{describeArenaEvent(e, name)}</li>
              ))}
            </ol>
          )}
          {phase === "done" && <Results fighters={fighters} sim={sim} entry={entry} record={arena.record} />}
        </div>
      )}
    </div>
  );
}
