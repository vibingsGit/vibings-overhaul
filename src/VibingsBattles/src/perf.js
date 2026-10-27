// Performance options. They depend on the device (a phone or an old laptop
// wants less than a desktop), so they are stored per browser, not on the
// server like the other settings.

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const STORAGE_KEY = "vibings-battles-performance";
const EVENT = "vibings-battles-performance";

export const PERF_OPTIONS = {
  blur: { label: "Blurred backgrounds", help: "Blurred copy of the picture behind it. Blurring large images is the heaviest effect." },
  hoverVideo: { label: "Video previews on hover", help: "Plays a scene's preview while the pointer is over it." },
  effects: { label: "Animation effects", help: "Confetti, light sweeps, attack trails and screen shake in battle animations and the arena." },
  preload: { label: "Preload the next pair", help: "Loads the next pair while the result is shown, so it appears instantly." },
};

export const PERF_PRESETS = {
  high: { blur: true, hoverVideo: true, effects: true, preload: true },
  low: { blur: false, hoverVideo: false, effects: false, preload: true },
};

/** A device that is likely to struggle: few cores, little memory, or reduced motion wanted. */
export function detectLowEnd() {
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
    if (navigator.deviceMemory && navigator.deviceMemory <= 4) return true;
  } catch { /* unknown: assume capable */ }
  return false;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && typeof raw === "object") return { mode: raw.mode || "auto", custom: { ...PERF_PRESETS.high, ...raw.custom } };
  } catch { /* storage unavailable or invalid */ }
  return { mode: "auto", custom: { ...PERF_PRESETS.high } };
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT));
}

export function resolvePerf(state) {
  if (state.mode === "custom") return state.custom;
  if (state.mode === "high" || state.mode === "low") return PERF_PRESETS[state.mode];
  return detectLowEnd() ? PERF_PRESETS.low : PERF_PRESETS.high;
}

/** { mode, options, custom, lowEnd, setMode, setOption } shared by every component. */
export function usePerformance() {
  const [state, setState] = React.useState(load);
  React.useEffect(() => {
    const onChange = () => setState(load());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  const setMode = (mode) => save({ ...state, mode, custom: mode === "custom" ? resolvePerf(state) : state.custom });
  const setOption = (key, value) => save({ mode: "custom", custom: { ...resolvePerf(state), [key]: value } });
  return { mode: state.mode, options: resolvePerf(state), lowEnd: detectLowEnd(), setMode, setOption };
}

/** CSS classes for the page root that switch effects off. */
export function perfClasses(options) {
  return [!options.blur && "vb-perf-noblur", !options.effects && "vb-perf-nofx"].filter(Boolean).join(" ");
}
