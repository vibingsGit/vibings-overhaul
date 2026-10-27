// The player's Web Audio chain, made only when something needs it (an audio
// filter, loudness levelling or the spectrum in Stats for nerds):
//
//   video → level → boost → bass → mid → treble → compressor → balance → mono → out
//         ↘ meter (loudness)                                              ↘ L/R analysers
//
// Once a video element is connected to an AudioContext its sound always goes
// through it, so the context is resumed whenever the video plays (a context
// left suspended would mean silence).

import { LOG } from "./api.js";
import { normalizeGain, loudnessMeter } from "./logic.js";

const graphs = new WeakMap();

export const AUDIO_DEFAULTS = { boost: 1, bass: 0, mid: 0, treble: 0, compressor: false, balance: 0, mono: false };

export function isDefaultAudio(a) {
  return Object.entries(AUDIO_DEFAULTS).every(([k, v]) => (a?.[k] ?? v) === v);
}

export function hasAudioGraph(video) {
  return !!video && graphs.has(video);
}

export function audioGraph(video) {
  if (!video) return null;
  if (graphs.has(video)) return graphs.get(video);
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(video);
    const level = ctx.createGain(); // loudness levelling
    const meter = Object.assign(ctx.createAnalyser(), { fftSize: 2048, smoothingTimeConstant: 0 });
    const boost = ctx.createGain();
    const bass = Object.assign(ctx.createBiquadFilter(), { type: "lowshelf" });
    bass.frequency.value = 200;
    const mid = Object.assign(ctx.createBiquadFilter(), { type: "peaking" });
    mid.frequency.value = 1000;
    mid.Q.value = 0.8;
    const treble = Object.assign(ctx.createBiquadFilter(), { type: "highshelf" });
    treble.frequency.value = 4000;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    const preComp = ctx.createGain(); // switch point: through the compressor or around it
    const postComp = ctx.createGain();
    const balance = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    const out = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    const left = Object.assign(ctx.createAnalyser(), { fftSize: 512, smoothingTimeConstant: 0.75 });
    const right = Object.assign(ctx.createAnalyser(), { fftSize: 512, smoothingTimeConstant: 0.75 });

    source.connect(level);
    source.connect(meter);
    level.connect(boost);
    boost.connect(bass);
    bass.connect(mid);
    mid.connect(treble);
    treble.connect(preComp);
    preComp.connect(postComp);
    postComp.connect(balance);
    balance.connect(out);
    out.connect(ctx.destination);
    out.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);

    const resume = () => { if (ctx.state === "suspended") ctx.resume().catch(() => {}); };
    video.addEventListener("play", resume);
    video.addEventListener("playing", resume);
    resume();

    const graph = { ctx, source, level, meter, boost, bass, mid, treble, compressor, preComp, postComp, balance, out, left, right, compressed: false, mono: false, levelling: null };
    graphs.set(video, graph);
    return graph;
  } catch (e) {
    console.warn(LOG, "audio filters are not available:", e.message);
    return null;
  }
}

/** Applies audio filter values; makes the chain only when a value is not the default. */
export function applyAudio(video, values) {
  const a = { ...AUDIO_DEFAULTS, ...(values || {}) };
  if (!hasAudioGraph(video) && isDefaultAudio(a)) return;
  const g = audioGraph(video);
  if (!g) return;
  const t = g.ctx.currentTime;
  g.boost.gain.setTargetAtTime(a.boost, t, 0.02);
  g.bass.gain.setTargetAtTime(a.bass, t, 0.02);
  g.mid.gain.setTargetAtTime(a.mid, t, 0.02);
  g.treble.gain.setTargetAtTime(a.treble, t, 0.02);
  if (g.balance.pan) g.balance.pan.setTargetAtTime(a.balance, t, 0.02);
  if (a.compressor !== g.compressed) {
    g.preComp.disconnect();
    if (a.compressor) {
      g.preComp.connect(g.compressor);
      g.compressor.connect(g.postComp);
    } else {
      g.compressor.disconnect();
      g.preComp.connect(g.postComp);
    }
    g.compressed = a.compressor;
  }
  if (a.mono !== g.mono) {
    // One channel mixed into both speakers.
    g.out.channelCount = a.mono ? 1 : 2;
    g.out.channelCountMode = a.mono ? "explicit" : "max";
    g.out.channelInterpretation = "speakers";
    g.mono = a.mono;
  }
}

/**
 * Loudness levelling: the level of what has played of the scene is measured
 * and a gain brings it near one target, so quiet and loud scenes play at
 * about the same volume. on = false puts the gain back to 1.
 */
export function setLevelling(video, on) {
  if (!on && !hasAudioGraph(video)) return;
  const g = audioGraph(video);
  if (!g) return;
  if (!on) {
    if (g.levelling) {
      clearInterval(g.levelling.timer);
      video.removeEventListener("loadstart", g.levelling.reset);
      g.levelling = null;
    }
    g.level.gain.setTargetAtTime(1, g.ctx.currentTime, 0.3);
    return;
  }
  if (g.levelling) return;
  const meter = loudnessMeter(80);
  const buf = new Float32Array(g.meter.fftSize);
  const reset = () => { meter.reset(); g.level.gain.setTargetAtTime(1, g.ctx.currentTime, 0.05); };
  const timer = setInterval(() => {
    if (video.paused) return;
    g.meter.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    meter.add(Math.sqrt(sum / buf.length));
    const db = meter.db;
    if (db != null) g.level.gain.setTargetAtTime(normalizeGain(db), g.ctx.currentTime, 1.5);
  }, 250);
  video.addEventListener("loadstart", reset);
  g.levelling = { timer, reset };
}
