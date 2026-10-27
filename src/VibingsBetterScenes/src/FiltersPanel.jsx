// Video and audio filters, under the player. They apply to this page; with
// "Keep for the next scenes" they stay on when the scene changes, and a
// scene can remember its own. Named presets are saved on the server.

import { VIDEO_DEFAULTS, isDefaultVideo } from "./filters.js";
import { AUDIO_DEFAULTS, isDefaultAudio } from "./audio.js";
import { useStore, setState, getState } from "./store.js";
import { getDevice, setDevice, useLibrary, updateLibrary } from "./settings.js";
import { toast } from "./store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const VIDEO_SLIDERS = [
  ["brightness", "Brightness", 0, 200, 1, "%"],
  ["contrast", "Contrast", 0, 200, 1, "%"],
  ["gamma", "Gamma", 20, 300, 1, "%"],
  ["saturation", "Saturation", 0, 300, 1, "%"],
  ["hue", "Hue", -180, 180, 1, "°"],
  ["warmth", "Warmth", 0, 200, 1, "%"],
  ["red", "Red", 0, 200, 1, "%"],
  ["green", "Green", 0, 200, 1, "%"],
  ["blue", "Blue", 0, 200, 1, "%"],
  ["sharpen", "Sharpen", 0, 100, 1, "%"],
  ["blur", "Blur", 0, 10, 0.5, " px"],
  ["zoom", "Zoom", 50, 300, 1, "%"],
  ["stretch", "Stretch", 50, 200, 1, "%"],
];

const AUDIO_SLIDERS = [
  ["boost", "Volume boost", 1, 4, 0.05, "×"],
  ["bass", "Bass", -15, 15, 0.5, " dB"],
  ["mid", "Mids", -15, 15, 0.5, " dB"],
  ["treble", "Treble", -15, 15, 0.5, " dB"],
  ["balance", "Balance", -1, 1, 0.05, ""],
];

function Slider({ id, label, min, max, step, unit, value, def, onChange }) {
  const changed = value !== def;
  return (
    <div className={"vbs-slider" + (changed ? " vbs-changed" : "")}>
      <label htmlFor={"vbs-f-" + id}>{label}</label>
      <input id={"vbs-f-" + id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} onDoubleClick={() => onChange(def)} />
      <button type="button" className="vbs-slider-value" onClick={() => onChange(def)} title="Reset">
        {id === "balance" ? (value === 0 ? "centre" : value < 0 ? "L " + Math.round(-value * 100) : "R " + Math.round(value * 100)) : value + unit}
      </button>
    </div>
  );
}

export function setFilters(kind, changes) {
  const f = getState().filters;
  setState({ filters: { ...f, [kind]: { ...f[kind], ...changes } } });
}

const saveError = (e) => toast("Could not save: " + e.message, true);

function Presets({ filters }) {
  const library = useLibrary();
  const [name, setName] = React.useState("");
  const [chosen, setChosen] = React.useState("");
  const save = () => {
    const n = name.trim();
    if (!n) return;
    updateLibrary((l) => ({ ...l, presets: [...l.presets.filter((p) => p.name !== n), { name: n, video: filters.video, audio: filters.audio }] }))
      .then(() => { setName(""); setChosen(n); toast("Preset saved"); }).catch(saveError);
  };
  const apply = (n) => {
    setChosen(n);
    const p = library.presets.find((x) => x.name === n);
    if (p) setState({ filters: { video: { ...(p.video || {}) }, audio: { ...(p.audio || {}) } } });
  };
  const remove = () => updateLibrary((l) => ({ ...l, presets: l.presets.filter((p) => p.name !== chosen) })).then(() => setChosen("")).catch(saveError);
  return (
    <div className="vbs-presets">
      <select className="vbs-input" value={chosen} onChange={(e) => apply(e.target.value)} aria-label="Preset">
        <option value="">{library.presets.length ? "Presets…" : "No presets yet"}</option>
        {library.presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
      </select>
      {chosen && <button type="button" className="vbs-link-btn vbs-danger" onClick={remove}>Delete</button>}
      <span className="vbs-grow" />
      <input className="vbs-input" placeholder="Preset name" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }} />
      <button type="button" className="vbs-mini" disabled={!name.trim()} onClick={save}>Save preset</button>
    </div>
  );
}

// While "remember for this scene" is on, changes are saved shortly after the last one.
function useRememberScene(sceneId, filters) {
  const library = useLibrary();
  const on = !!library.sceneFilters[String(sceneId)];
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    if (!on) return undefined;
    const t = setTimeout(() => {
      updateLibrary((l) => ({ ...l, sceneFilters: { ...l.sceneFilters, [String(sceneId)]: { video: filters.video, audio: filters.audio } } })).catch(saveError);
    }, 1200);
    return () => clearTimeout(t);
  }, [filters]);
  const toggle = () => updateLibrary((l) => {
    const sceneFilters = { ...l.sceneFilters };
    if (on) delete sceneFilters[String(sceneId)];
    else sceneFilters[String(sceneId)] = { video: filters.video, audio: filters.audio };
    return { ...l, sceneFilters };
  }).then(() => toast(on ? "The scene no longer remembers its filters" : "The scene remembers these filters")).catch(saveError);
  return [on, toggle];
}

export function FiltersPanel({ scene }) {
  const filters = useStore((s) => s.filters);
  const [keep, setKeep] = React.useState(() => !!getDevice().keepFilters);
  const [remember, toggleRemember] = useRememberScene(scene?.id, filters);
  const v = { ...VIDEO_DEFAULTS, ...filters.video };
  const a = { ...AUDIO_DEFAULTS, ...filters.audio };
  return (
    <div className="vbs-filters-wrap">
    <Presets filters={filters} />
    <div className="vbs-filters">
      <div className="vbs-filters-col">
        <div className="vbs-filters-head">
          <h4>Video</h4>
          {!isDefaultVideo(v) && <button type="button" className="vbs-link-btn" onClick={() => setState({ filters: { ...filters, video: {} } })}>Reset</button>}
        </div>
        {VIDEO_SLIDERS.map(([id, label, min, max, step, unit]) => (
          <Slider key={id} id={id} label={label} min={min} max={max} step={step} unit={unit} value={v[id]} def={VIDEO_DEFAULTS[id]}
            onChange={(x) => setFilters("video", { [id]: x })} />
        ))}
        <div className="vbs-filter-buttons">
          <span>Rotate</span>
          {[0, 90, 180, 270].map((r) => (
            <button key={r} type="button" className={"vbs-mini" + (v.rotate === r ? " vbs-selected" : "")} onClick={() => setFilters("video", { rotate: r })}>{r}°</button>
          ))}
          <button type="button" className={"vbs-mini" + (v.flipH ? " vbs-selected" : "")} onClick={() => setFilters("video", { flipH: !v.flipH })}>Mirror</button>
          <button type="button" className={"vbs-mini" + (v.flipV ? " vbs-selected" : "")} onClick={() => setFilters("video", { flipV: !v.flipV })}>Flip</button>
        </div>
      </div>
      <div className="vbs-filters-col">
        <div className="vbs-filters-head">
          <h4>Audio</h4>
          {!isDefaultAudio(a) && <button type="button" className="vbs-link-btn" onClick={() => setState({ filters: { ...filters, audio: { ...AUDIO_DEFAULTS } } })}>Reset</button>}
        </div>
        {AUDIO_SLIDERS.map(([id, label, min, max, step, unit]) => (
          <Slider key={id} id={id} label={label} min={min} max={max} step={step} unit={unit} value={a[id]} def={AUDIO_DEFAULTS[id]}
            onChange={(x) => setFilters("audio", { [id]: x })} />
        ))}
        <label className="vbs-filter-check"><input type="checkbox" checked={a.compressor} onChange={() => setFilters("audio", { compressor: !a.compressor })} /> Even out loud and quiet parts</label>
        <label className="vbs-filter-check"><input type="checkbox" checked={a.mono} onChange={() => setFilters("audio", { mono: !a.mono })} /> Mono</label>
        <p className="vbs-dim vbs-small">Audio filters route the sound through the browser's audio engine; it stays that way until the page is reloaded.</p>
        <label className="vbs-filter-check vbs-keep"><input type="checkbox" checked={keep}
          onChange={() => { setKeep(!keep); setDevice({ keepFilters: !keep }); }} /> Keep filters for the next scenes</label>
        {scene && <label className="vbs-filter-check"><input type="checkbox" checked={remember} onChange={toggleRemember} /> Remember these filters for this scene</label>}
      </div>
    </div>
    </div>
  );
}
