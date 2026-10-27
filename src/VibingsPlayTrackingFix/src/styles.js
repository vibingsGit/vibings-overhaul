// All plugin CSS. Colours are :root variables so themes can override them.

const STYLE_ID = "vibings-play-tracking-styles";

const CSS = `
  :root {
    --vibings-play-tracking-accent: #4aa3df;
    --vibings-play-tracking-muted: #9aa4af;
    --vibings-play-tracking-surface: rgba(255, 255, 255, 0.04);
    --vibings-play-tracking-border: rgba(255, 255, 255, 0.12);
    --vibings-play-tracking-up: #3fb950;
    --vibings-play-tracking-down: #f0883e;
  }

  /* Scene page, History tab */
  .vpt-scene {
    display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 4px 0 14px; padding: 10px 14px; border-radius: 8px;
    background: var(--vibings-play-tracking-surface); border: 1px solid var(--vibings-play-tracking-border);
  }
  .vpt-scene-item { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
  .vpt-scene-label { font-size: 12px; color: var(--vibings-play-tracking-muted); }
  .vpt-scene-value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .vpt-scene-note { font-size: 12px; color: var(--vibings-play-tracking-muted); }

  /* Settings → Tools panel */
  .vpt-tools { padding: 0 1rem; }
  .vpt-tool-section { padding: 10px 0 14px; border-top: 1px solid var(--vibings-play-tracking-border); }
  .vpt-tool-section:first-of-type { border-top: 0; }
  .vpt-tool-section h6 { font-weight: 600; margin-bottom: 8px; }
  .vpt-tool-toggle { margin-bottom: 8px; }
  .vpt-tool-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .vpt-tool-num { width: 5.5em; }
  .vpt-tool-select { width: auto; }
  .vpt-tool-date { width: auto; }
  .vpt-tool-stats { margin: 6px 0 0; }
  .vpt-tool-table { margin: 8px 0 4px; }
  .vpt-tool-table td { vertical-align: middle; }
  .vpt-name { max-width: 0; width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vpt-nowrap { white-space: nowrap; }
  .vpt-up { color: var(--vibings-play-tracking-up); }
  .vpt-down { color: var(--vibings-play-tracking-down); }
  .vpt-warn { color: var(--vibings-play-tracking-down); }
  .vpt-danger, .vpt-danger:hover { color: #f85149 !important; }
  .vpt-mode { margin: 8px 0; padding: 8px 12px; border-radius: 6px; background: var(--vibings-play-tracking-surface); border-left: 3px solid var(--vibings-play-tracking-accent); }
  .vpt-plan { margin-top: 8px; }
  .vpt-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 10px; }
  .vpt-choice { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--vibings-play-tracking-border); }
`;

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
