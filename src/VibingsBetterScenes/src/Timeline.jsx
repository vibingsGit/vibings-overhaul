// The player's timeline: played and buffered parts, scene markers, O
// positions, the A/B loop, an interactive heatmap and a thumbnail preview.
// Drag (mouse or touch) to scrub; the preview follows the pointer.

import { fmtTime, parseSpriteVtt, cueAt } from "./format.js";
import { chapterAt } from "./logic.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const spriteCache = new Map(); // vtt url -> Promise<{ url, cues } | null>

function loadSprites(scene) {
  const vtt = scene?.paths?.vtt;
  const sprite = scene?.paths?.sprite;
  if (!vtt || !sprite) return Promise.resolve(null);
  if (!spriteCache.has(vtt)) {
    spriteCache.set(vtt, fetch(vtt)
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => {
        const cues = parseSpriteVtt(text);
        return cues.length ? { url: sprite, cues } : null;
      })
      .catch(() => null));
  }
  return spriteCache.get(vtt);
}

export function useSprites(scene, enabled = true) {
  const [sprites, setSprites] = React.useState(null);
  React.useEffect(() => {
    setSprites(null);
    if (!enabled) return undefined;
    let live = true;
    loadSprites(scene).then((s) => live && setSprites(s));
    return () => { live = false; };
  }, [scene?.paths?.vtt, enabled]);
  return sprites;
}

export function SpriteThumb({ sprites, t, width = 160 }) {
  const cue = sprites && cueAt(sprites.cues, t);
  if (!cue) return <div className="vbs-thumb vbs-thumb-empty" style={{ width, height: width * 9 / 16 }} />;
  const scale = width / cue.w;
  // The sprite cell at its own size, scaled to the wanted width.
  return (
    <div className="vbs-thumb" style={{ width, height: cue.h * scale }}>
      <div style={{
        width: cue.w, height: cue.h, transform: "scale(" + scale + ")", transformOrigin: "0 0",
        backgroundImage: "url(" + JSON.stringify(sprites.url) + ")", backgroundPosition: (-cue.x) + "px " + (-cue.y) + "px",
      }} />
    </div>
  );
}

// Stable colour per marker tag.
function tagColour(name) {
  let h = 0;
  for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) % 360;
  return "hsl(" + h + ", 70%, 60%)";
}

const pct = (t, d) => (d > 0 ? Math.max(0, Math.min(100, (t / d) * 100)) : 0) + "%";

export function Timeline({ scene, duration, current, buffered, oEvents, loop, settings, sprites, onSeek, onScrub, chapters = [] }) {
  const ref = React.useRef(null);
  const [hover, setHover] = React.useState(null); // { t, x }
  const [drag, setDrag] = React.useState(null); // t while dragging
  const markers = settings.markers ? scene.scene_markers || [] : [];
  const heatmap = settings.heatmap && scene.interactive && scene.paths?.interactive_heatmap;

  const timeAt = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, clientX - r.left));
    return { t: duration > 0 ? (x / r.width) * duration : 0, x };
  };

  const onPointerDown = (e) => {
    if (!duration || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = timeAt(e.clientX);
    setDrag(p.t);
    setHover(p);
    onScrub?.(true);
  };
  const onPointerMove = (e) => {
    if (!duration) return;
    const p = timeAt(e.clientX);
    setHover(p);
    if (drag != null) setDrag(p.t);
  };
  const onPointerUp = (e) => {
    if (drag == null) return;
    const p = timeAt(e.clientX);
    setDrag(null);
    onScrub?.(false);
    onSeek(p.t);
    if (e.pointerType !== "mouse") setHover(null);
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 1 : 5;
    if (e.key === "ArrowLeft") { e.preventDefault(); e.stopPropagation(); onSeek(current - step); }
    if (e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); onSeek(current + step); }
  };

  const shown = drag != null ? drag : current;
  const hoverMarker = hover && markers.find((m) =>
    Math.abs(m.seconds - hover.t) < duration * 0.01 || (m.end_seconds && hover.t >= m.seconds && hover.t <= m.end_seconds));
  const hoverChapter = hover && chapters.length ? chapterAt(chapters, hover.t) : null;
  const hoverLabel = hoverMarker ? hoverMarker.title || hoverMarker.primary_tag?.name : hoverChapter?.title;
  const width = ref.current?.clientWidth || 0;
  const previewW = 168;
  const previewLeft = hover ? Math.max(previewW / 2, Math.min(width - previewW / 2, hover.x)) : 0;

  return (
    <div className={"vbs-timeline" + (drag != null ? " vbs-dragging" : "") + (chapters.length ? " vbs-has-chapters" : "")} ref={ref}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={() => { setDrag(null); onScrub?.(false); }}
      onPointerLeave={(e) => { if (drag == null && e.pointerType === "mouse") setHover(null); }}
      role="slider" tabIndex={0} aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(duration || 0)}
      aria-valuenow={Math.round(shown || 0)} aria-valuetext={fmtTime(shown)} onKeyDown={onKeyDown}>
      {heatmap && <img className="vbs-heatmap" src={heatmap} alt="" draggable={false} />}
      {settings.mostWatched && window.VibingsSceneHeatmap?.Curve && (
        <div className="vbs-hm"><window.VibingsSceneHeatmap.Curve sceneId={scene.id} /></div>
      )}
      <div className="vbs-track">
        {buffered.map(([s, e], i) => <div key={i} className="vbs-buffered" style={{ left: pct(s, duration), width: pct(e - s, duration) }} />)}
        {loop.ab.enabled && loop.ab.end > loop.ab.start && (
          <div className="vbs-ab" style={{ left: pct(loop.ab.start, duration), width: pct(loop.ab.end - loop.ab.start, duration) }} />
        )}
        <div className="vbs-played" style={{ width: pct(shown, duration) }} />
        {markers.map((m) => m.end_seconds && m.end_seconds > m.seconds ? (
          <div key={m.id} className="vbs-marker-range" style={{ left: pct(m.seconds, duration), width: pct(m.end_seconds - m.seconds, duration), background: tagColour(m.primary_tag?.name) }} />
        ) : (
          <div key={m.id} className="vbs-marker" style={{ left: pct(m.seconds, duration), background: tagColour(m.primary_tag?.name) }} />
        ))}
        {chapters.filter((c) => c.start > 0).map((c) => (
          <div key={"c" + c.marker.id} className="vbs-chapter-gap" style={{ left: pct(c.start, duration) }} />
        ))}
      </div>
      {settings.os && oEvents.map((o) => (
        <div key={o.at} className={"vbs-o-mark" + (o.fresh ? " vbs-o-new" : "")} style={{ left: pct(o.t, duration) }}
          title={"O at " + fmtTime(o.t)} />
      ))}
      <div className="vbs-handle" style={{ left: pct(shown, duration) }} />
      {hover && duration > 0 && (
        <div className="vbs-preview" style={{ left: previewLeft }}>
          {settings.thumbnails && sprites && <SpriteThumb sprites={sprites} t={hover.t} width={previewW} />}
          <div className="vbs-preview-text">
            {hoverLabel && <span className="vbs-preview-marker">{hoverLabel}</span>}
            <span>{fmtTime(drag != null ? drag : hover.t)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
