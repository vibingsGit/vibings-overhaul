// Stats for nerds: live numbers of the video element and the file, and
// graphs of the bitrate, the audio spectrum and the frame rate.

import { fmtTime, fmtBytes } from "./format.js";
import { Icons } from "./icons.jsx";
import { audioGraph } from "./audio.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

function bufferedAhead(v) {
  for (let i = 0; i < (v?.buffered?.length || 0); i++) {
    if (v.currentTime >= v.buffered.start(i) && v.currentTime <= v.buffered.end(i)) return v.buffered.end(i) - v.currentTime;
  }
  return 0;
}

const fmtMs = (s) => {
  const t = Math.max(0, s || 0);
  return fmtTime(t) + "." + String(Math.floor((t % 1) * 100)).padStart(2, "0");
};

// A canvas sized to its box (also on high-DPI screens); draw(ctx, w, h) runs every frame.
function Graph({ draw, height = 70, deps = [] }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    let raf = 0;
    const ctx = c.getContext("2d");
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (h / 4) * i);
        ctx.lineTo(w, (h / 4) * i);
        ctx.stroke();
      }
      draw(ctx, w, h, performance.now());
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, deps);
  return <canvas ref={ref} className="vbs-graph" style={{ height }} />;
}

function line(ctx, samples, w, h, max, colour, fill) {
  if (samples.length < 2) return;
  const step = w / (samples.length - 1);
  ctx.beginPath();
  samples.forEach((v, i) => (i ? ctx.lineTo(i * step, h - (v / max) * h) : ctx.moveTo(0, h - (v / max) * h)));
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (fill) {
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function text(ctx, str, x, y, colour) {
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = colour;
  ctx.fillText(str, x, y);
}

function BitrateGraph({ video }) {
  const s = React.useRef({ samples: [], prev: null, last: 0 });
  const draw = (ctx, w, h, now) => {
    const st = s.current;
    if (now - st.last >= 250) {
      st.last = now;
      // Decoded bytes where the browser reports them, else the growth of the buffer × the file's average rate.
      const bytes = video.webkitVideoDecodedByteCount != null ? video.webkitVideoDecodedByteCount + (video.webkitAudioDecodedByteCount || 0) : null;
      if (bytes != null && st.prev && bytes >= st.prev.bytes) {
        const kbps = ((bytes - st.prev.bytes) * 8) / ((now - st.prev.time) / 1000) / 1000;
        if (kbps >= 0 && kbps < 1e6) st.samples.push(kbps);
        if (st.samples.length > 160) st.samples.shift();
      }
      if (bytes != null) st.prev = { bytes, time: now };
    }
    if (video.webkitVideoDecodedByteCount == null) return text(ctx, "This browser does not report decoded bytes", 8, h / 2 + 4, "rgba(255,255,255,0.45)");
    if (st.samples.length < 2) return text(ctx, "Waiting for playback…", 8, h / 2 + 4, "rgba(255,255,255,0.45)");
    const max = Math.max(...st.samples, 2000);
    line(ctx, st.samples, w, h, max, "#7eb3ff", "rgba(126,179,255,0.18)");
    text(ctx, st.samples[st.samples.length - 1].toFixed(0) + " kbps", 8, 13, "rgba(207,225,255,0.9)");
    text(ctx, "peak " + max.toFixed(0), 8, 25, "rgba(255,255,255,0.45)");
  };
  return <Graph draw={draw} deps={[video]} />;
}

function SpectrumGraph({ video }) {
  const [on, setOn] = React.useState(false);
  if (!on) {
    return (
      <div className="vbs-graph vbs-graph-off" style={{ height: 96 }}>
        <button type="button" className="vbs-mini" onClick={() => setOn(true)}>Show the audio spectrum</button>
        <span className="vbs-dim vbs-small">Routes the sound through the browser's audio engine until the page is reloaded.</span>
      </div>
    );
  }
  return <SpectrumCanvas video={video} />;
}

function SpectrumCanvas({ video }) {
  const g = React.useMemo(() => audioGraph(video), [video]);
  const bufs = React.useMemo(() => g && {
    fl: new Uint8Array(g.left.frequencyBinCount), fr: new Uint8Array(g.right.frequencyBinCount),
    tl: new Uint8Array(g.left.fftSize), tr: new Uint8Array(g.right.fftSize),
  }, [g]);
  const db = (arr) => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) { const x = (arr[i] - 128) / 128; sum += x * x; }
    const rms = Math.sqrt(sum / arr.length);
    return rms > 0 ? (20 * Math.log10(rms)).toFixed(1) + " dB" : "-∞ dB";
  };
  const draw = (ctx, w, h) => {
    if (!g) return text(ctx, "The audio spectrum is not available", 8, h / 2, "rgba(255,255,255,0.45)");
    g.left.getByteFrequencyData(bufs.fl);
    g.right.getByteFrequencyData(bufs.fr);
    g.left.getByteTimeDomainData(bufs.tl);
    g.right.getByteTimeDomainData(bufs.tr);
    const ch = (h - 18) / 2;
    [[bufs.fl, 18, 0], [bufs.fr, 18 + ch, 15]].forEach(([data, y0, shift]) => {
      const bars = Math.min(data.length, 96);
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor(Math.pow(i / bars, 1.6) * data.length)] / 255;
        ctx.fillStyle = "hsl(" + (190 + (i / bars) * 130 + shift) + ", 78%, " + (22 + v * 45) + "%)";
        ctx.fillRect(i * bw + 0.5, y0 + ch - v * ch * 0.95, Math.max(1, bw - 1), v * ch * 0.95);
      }
    });
    text(ctx, "L  " + db(bufs.tl), 6, 12, "rgba(207,225,255,0.9)");
    text(ctx, "R  " + db(bufs.tr), w - 76, 12, "rgba(255,138,163,0.9)");
  };
  return <Graph draw={draw} height={110} deps={[g]} />;
}

function FrameGraph({ video }) {
  const s = React.useRef({ samples: [], prev: null, last: 0 });
  const draw = (ctx, w, h, now) => {
    const st = s.current;
    if (now - st.last >= 500) {
      st.last = now;
      const q = video.getVideoPlaybackQuality?.();
      if (q && st.prev) {
        const dt = (now - st.prev.time) / 1000;
        const df = q.totalVideoFrames - st.prev.frames;
        const dd = q.droppedVideoFrames - st.prev.dropped;
        st.samples.push({ fps: df / dt, drop: df > 0 ? (dd / df) * 100 : 0 });
        if (st.samples.length > 120) st.samples.shift();
      }
      if (q) st.prev = { frames: q.totalVideoFrames, dropped: q.droppedVideoFrames, time: now };
    }
    if (st.samples.length < 2) return text(ctx, "Waiting for playback…", 8, h / 2 + 4, "rgba(255,255,255,0.45)");
    const max = Math.max(60, ...st.samples.map((x) => x.fps));
    line(ctx, st.samples.map((x) => x.fps), w, h, max, "#7eb3ff");
    line(ctx, st.samples.map((x) => x.drop), w, h, 100, "rgba(233,69,96,0.9)");
    const last = st.samples[st.samples.length - 1];
    text(ctx, last.fps.toFixed(1) + " fps", 8, 13, "rgba(207,225,255,0.9)");
    text(ctx, last.drop.toFixed(2) + "% dropped", 8, 25, "rgba(255,138,163,0.9)");
  };
  return <Graph draw={draw} deps={[video]} />;
}

const NET = ["empty", "idle", "loading", "no source"];
const READY = ["nothing", "metadata", "current data", "future data", "enough data"];

export function NerdStats({ video, scene, stream, onClose }) {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const f = scene.files?.[0] || {};
  const q = video?.getVideoPlaybackQuality?.();
  const d = video?.duration || 0;
  const rows = [
    ["Time", video ? fmtMs(video.currentTime) + " / " + fmtMs(d) : "–"],
    ["Progress", d ? ((video.currentTime / d) * 100).toFixed(2) + " %" : "–"],
    ["Stream", stream ? (stream.label || stream.mime_type || "–") + (stream.mime_type ? " · " + stream.mime_type : "") : "–"],
    ["Viewport / video", video ? video.clientWidth + "×" + video.clientHeight + " / " + video.videoWidth + "×" + video.videoHeight : "–"],
    ["Playback rate", video ? video.playbackRate.toFixed(2) + "×" : "–"],
    ["Volume", video ? Math.round(video.volume * 100) + " %" + (video.muted ? " (muted)" : "") : "–"],
    ["Buffered ahead", bufferedAhead(video).toFixed(2) + " s"],
    ["Network state", video ? NET[video.networkState] || video.networkState : "–"],
    ["Ready state", video ? READY[video.readyState] || video.readyState : "–"],
    ["Total frames", q ? q.totalVideoFrames.toLocaleString() : "–"],
    ["Dropped frames", q ? q.droppedVideoFrames.toLocaleString() + " (" + (q.totalVideoFrames ? ((q.droppedVideoFrames / q.totalVideoFrames) * 100).toFixed(2) : "0.00") + " %)" : "–"],
    ["Video codec", f.video_codec || "–"],
    ["Audio codec", f.audio_codec || "–"],
    ["Bit rate", f.bit_rate ? (f.bit_rate / 1e6).toFixed(2) + " Mbps" : "–"],
    ["Frame rate", f.frame_rate ? f.frame_rate + " fps" : "–"],
    ["Dimensions", f.width ? f.width + "×" + f.height : "–"],
    ["File size", fmtBytes(f.size)],
    ["Path", f.path || "–"],
  ];
  return (
    <div className="vbs-nerds" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="vbs-nerds-head">
        <strong>Stats for nerds</strong>
        <button type="button" className="vbs-nerds-close" onClick={onClose} aria-label="Close"><Icons.Close /></button>
      </div>
      <div className="vbs-nerds-graphs">
        <div><span>Bitrate (decoded)</span><BitrateGraph video={video} /></div>
        <div><span>Audio spectrum</span><SpectrumGraph video={video} /></div>
        <div><span>Frame rate &amp; dropped frames</span><FrameGraph video={video} /></div>
      </div>
      <div className="vbs-nerds-rows">
        {rows.map(([k, v]) => <div key={k}><span>{k}</span><span title={String(v)}>{v}</span></div>)}
      </div>
    </div>
  );
}
