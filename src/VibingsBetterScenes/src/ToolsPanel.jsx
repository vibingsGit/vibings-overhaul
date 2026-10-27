// Settings → Tools → Vibings Overhaul → Vibings Better Scenes.

import { LOG } from "./api.js";
import { useSettings, saveSettings, loadSettings } from "./settings.js";
import { usePlugins } from "./integrations.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Form, Alert } = PluginApi.libraries.Bootstrap;

function Toggle({ id, label, help, checked, onChange }) {
  return (
    <Form.Group className="vbs-tool-toggle">
      <Form.Check type="switch" id={id} label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {help && <Form.Text className="text-muted">{help}</Form.Text>}
    </Form.Group>
  );
}

const INTEGRATIONS = [
  ["VibingsBetterOs", "Vibings Better Os", "O positions on the timeline, the Os list with positions, the O button stores the position."],
  ["VibingsPlayTrackingFix", "Vibings Play Tracking Fix", "Play time and plays counted from the time the video really plays."],
  ["VibingsBattles", "Vibings Battles", "Elo and rank of the scene and its performers."],
  ["VibingsSceneHeatmap", "Vibings Scene Heatmap", "A curve of the most watched parts over the timeline."],
  ["VibingsStats", "Vibings Stats", "Statistics of your library."],
];

export function ToolsPanel() {
  const s = useSettings();
  const plugins = usePlugins();
  const [error, setError] = React.useState(null);
  React.useEffect(() => { loadSettings(); }, []);
  const save = (partial) => {
    setError(null);
    saveSettings(partial).catch((e) => { console.warn(LOG, e); setError(e.message); });
  };
  const num = (value, lo, hi, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
  };

  return (
    <div className="vbs-tools">
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
      <div className="vbs-tool-section">
        <h6>Scene page</h6>
        <Toggle id="vbs-enabled" label="Use the Better Scenes page" checked={s.enabled}
          help="Off: Stash's own scene page and player." onChange={(v) => save({ enabled: v })} />
        <Toggle id="vbs-theater" label="Theater mode by default" checked={s.layout.theater}
          help="The player uses the full width and the side panel goes below it. T switches it for the page." onChange={(v) => save({ layout: { theater: v } })} />
        <Toggle id="vbs-below" label="Up next, recommendations and markers under the player" checked={s.layout.below}
          onChange={(v) => save({ layout: { below: v } })} />
      </div>
      <div className="vbs-tool-section">
        <h6>Player</h6>
        <Toggle id="vbs-autoplay" label="Start playing when a scene opens" checked={s.player.autoplay} onChange={(v) => save({ player: { autoplay: v } })} />
        <Toggle id="vbs-doubletap" label="Double tap the sides to seek (touch screens)" checked={s.player.doubleTap} onChange={(v) => save({ player: { doubleTap: v } })} />
        <Toggle id="vbs-gestures" label="Swipe gestures (touch screens)" checked={s.player.gestures}
          help="Swipe sideways on the video for the next or previous scene; in fullscreen swipe up or down for the volume." onChange={(v) => save({ player: { gestures: v } })} />
        <Toggle id="vbs-rotate" label="Turn the screen to the video in fullscreen (phones)" checked={s.player.rotate} onChange={(v) => save({ player: { rotate: v } })} />
        <Toggle id="vbs-mini" label="Mini player" checked={s.player.miniPlayer}
          help="Leaving the scene page while the video plays keeps it playing in a small player in the corner." onChange={(v) => save({ player: { miniPlayer: v } })} />
        <Toggle id="vbs-ambient" label="Ambient light" checked={s.player.ambient}
          help="The video's colours glow softly around the player." onChange={(v) => save({ player: { ambient: v } })} />
        <Toggle id="vbs-normalize" label="Even out loudness" checked={s.player.normalize}
          help="Measures the loudness while playing and turns quiet scenes up and loud ones down. Routes the sound through the browser's audio engine until the page is reloaded." onChange={(v) => save({ player: { normalize: v } })} />
        <Toggle id="vbs-hottest" label="Start from the most watched part (Vibings Scene Heatmap)" checked={s.player.startHottest}
          help="When a scene has no resume point. H jumps there at any time." onChange={(v) => save({ player: { startHottest: v } })} />
        <div className="vbs-tool-row">
          <Form.Label htmlFor="vbs-step" className="mb-0">Seek step</Form.Label>
          <Form.Control id="vbs-step" size="sm" type="number" min={1} max={120} className="vbs-tool-num" defaultValue={s.player.seekStep} key={"s" + s.player.seekStep}
            onBlur={(e) => save({ player: { seekStep: num(e.target.value, 1, 120, 10) } })} />
          <span>seconds; hide the controls after</span>
          <Form.Control id="vbs-hide" size="sm" type="number" min={1} max={30} step={0.5} className="vbs-tool-num" defaultValue={s.player.controlsHide} key={"h" + s.player.controlsHide}
            aria-label="Seconds before the controls hide" onBlur={(e) => save({ player: { controlsHide: num(e.target.value, 1, 30, 2.5) } })} />
          <span>seconds</span>
        </div>
      </div>
      <div className="vbs-tool-section">
        <h6>Timeline</h6>
        <Toggle id="vbs-thumbs" label="Thumbnail preview" checked={s.timeline.thumbnails} onChange={(v) => save({ timeline: { thumbnails: v } })} />
        <Toggle id="vbs-markers" label="Scene markers" checked={s.timeline.markers} onChange={(v) => save({ timeline: { markers: v } })} />
        <Toggle id="vbs-os" label="O positions (Vibings Better Os)" checked={s.timeline.os} onChange={(v) => save({ timeline: { os: v } })} />
        <Toggle id="vbs-heatmap" label="Interactive heatmap" checked={s.timeline.heatmap} onChange={(v) => save({ timeline: { heatmap: v } })} />
        <Toggle id="vbs-most" label="Most watched parts (Vibings Scene Heatmap)" checked={s.timeline.mostWatched} onChange={(v) => save({ timeline: { mostWatched: v } })} />
        <Toggle id="vbs-chapters" label="Markers split the timeline into chapters" checked={s.timeline.chapters}
          help="The chapter's name shows next to the time and while hovering the timeline." onChange={(v) => save({ timeline: { chapters: v } })} />
      </div>
      <div className="vbs-tool-section">
        <h6>Queue</h6>
        <Toggle id="vbs-repeat" label="Repeat the queue after its last scene" checked={s.queue.repeat} onChange={(v) => save({ queue: { repeat: v } })} />
      </div>
      <div className="vbs-tool-section">
        <h6>Scene cards and recommendations</h6>
        <Toggle id="vbs-preview" label="Play the preview while hovering a card" checked={s.cards.preview}
          help="Moving the pointer sideways over the picture scrubs the preview." onChange={(v) => save({ cards: { preview: v } })} />
        <Toggle id="vbs-hidewatched" label="Hide watched scenes from the recommendations" checked={s.recommend.hideWatched} onChange={(v) => save({ recommend: { hideWatched: v } })} />
        <div className="vbs-tool-row">
          <span>Weights: shared performer</span>
          <Form.Control size="sm" type="number" min={0} max={10} className="vbs-tool-num" defaultValue={s.recommend.performers} key={"p" + s.recommend.performers}
            aria-label="Weight of a shared performer" onBlur={(e) => save({ recommend: { performers: num(e.target.value, 0, 10, 5) } })} />
          <span>same studio</span>
          <Form.Control size="sm" type="number" min={0} max={10} className="vbs-tool-num" defaultValue={s.recommend.studio} key={"st" + s.recommend.studio}
            aria-label="Weight of the same studio" onBlur={(e) => save({ recommend: { studio: num(e.target.value, 0, 10, 3) } })} />
          <span>shared tag</span>
          <Form.Control size="sm" type="number" min={0} max={10} className="vbs-tool-num" defaultValue={s.recommend.tags} key={"t" + s.recommend.tags}
            aria-label="Weight of a shared tag" onBlur={(e) => save({ recommend: { tags: num(e.target.value, 0, 10, 1) } })} />
        </div>
      </div>
      <div className="vbs-tool-section">
        <h6>Other Vibings plugins</h6>
        <ul className="vbs-tool-list">
          {INTEGRATIONS.map(([id, name, what]) => {
            const p = plugins[id];
            const state = !p ? "…" : !p.installed ? "not installed" : !p.enabled ? "disabled" : "in use";
            return <li key={id}><strong>{name}</strong> <span className={"vbs-pill" + (state === "in use" ? " vbs-pill-on" : "")}>{state}</span><br /><span className="text-muted">{what}</span></li>;
          })}
        </ul>
      </div>
    </div>
  );
}
