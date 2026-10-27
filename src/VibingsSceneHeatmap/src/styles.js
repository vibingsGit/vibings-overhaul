// All plugin CSS. Colours are :root variables so themes can override them.

const STYLE_ID = "vibings-scene-heatmap-styles";

const CSS = `
  :root {
    --vibings-scene-heatmap-colour: #ffffff;
    --vibings-scene-heatmap-border: rgba(255, 255, 255, 0.12);
  }
  .vsh-curve { position: absolute; left: 0; right: 0; bottom: 100%; pointer-events: none; opacity: 0; transition: opacity 0.2s; }
  .vsh-curve svg { display: block; }
  .vsh-curve.vsh-always { opacity: 0.55; }

  /* Stash's player: the curve sits over the progress bar */
  .vsh-native { position: absolute; left: 0; right: 0; top: -4px; height: 0; pointer-events: none; }
  .video-js .vjs-progress-control:hover .vsh-curve, .video-js.vjs-scrubbing .vsh-curve { opacity: 0.8; }
  .video-js.vjs-user-inactive.vjs-playing .vsh-curve { opacity: 0 !important; }

  /* Settings → Tools panel */
  .vsh-tools { padding: 0 1rem; }
  .vsh-tool-section { padding: 10px 0 14px; border-top: 1px solid var(--vibings-scene-heatmap-border); }
  .vsh-tool-section:first-of-type { border-top: 0; }
  .vsh-tool-section h6 { font-weight: 600; margin-bottom: 8px; }
  .vsh-tool-toggle { margin-bottom: 8px; }
  .vsh-tool-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .vsh-tool-num { width: 5.5em; }
  .vsh-tool-select { width: auto; }
  .vsh-tool-table { margin: 8px 0 4px; }
  .vsh-tool-table td { vertical-align: middle; }
  .vsh-nowrap { white-space: nowrap; }
  .vsh-danger, .vsh-danger:hover { color: #f85149 !important; }
`;

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
