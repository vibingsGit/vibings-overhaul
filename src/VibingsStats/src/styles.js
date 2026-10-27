// All plugin CSS. Colours and sizes are :root variables so themes can
// override them without touching the rules.

const STYLE_ID = "vibings-stats-styles";

const CSS = `
  :root {
    --vibings-stats-accent: #f5a623;
    --vibings-stats-accent-soft: rgba(245, 166, 35, 0.14);
    --vibings-stats-good: #3fb950;
    --vibings-stats-bad: #f85149;
    --vibings-stats-info: #58a6ff;
    --vibings-stats-surface: rgba(255, 255, 255, 0.04);
    --vibings-stats-surface-hover: rgba(255, 255, 255, 0.08);
    --vibings-stats-border: rgba(255, 255, 255, 0.12);
    --vibings-stats-muted: #9aa4af;
    --vibings-stats-track: rgba(255, 255, 255, 0.08);
    --vibings-stats-radius: 12px;
    --vibings-stats-side-width: 230px;
    --vibings-stats-nav-height: 48.75px; /* Stash's navbar */
  }

  /* Layout: side panel + main panel */
  .vs-layout {
    display: grid; grid-template-columns: var(--vibings-stats-side-width) minmax(0, 1fr);
    gap: 20px; align-items: start; padding: 12px 20px 40px; max-width: 1760px; margin: 0 auto;
  }
  .vs-main { min-width: 0; }
  .vs-muted { color: var(--vibings-stats-muted); }
  .vs-side {
    min-width: 0; position: sticky; top: calc(var(--vibings-stats-nav-height) + 12px);
    max-height: calc(100vh - var(--vibings-stats-nav-height) - 24px); overflow-y: auto; scrollbar-width: thin;
    display: flex; flex-direction: column; gap: 16px; padding: 14px;
    border: 1px solid var(--vibings-stats-border); border-radius: var(--vibings-stats-radius); background: var(--vibings-stats-surface);
  }
  .vs-side-title { display: flex; align-items: center; gap: 10px; font-size: 1.25rem; font-weight: 700; padding: 2px 6px; }
  .vs-side-title svg { color: var(--vibings-stats-accent); }
  .vs-views { display: flex; flex-direction: column; gap: 2px; }
  .vs-view {
    display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none;
    border-radius: 8px; background: none; color: var(--vibings-stats-muted);
  }
  .vs-view svg { width: 1.1em; flex-shrink: 0; }
  .vs-view:hover { background: var(--vibings-stats-surface-hover); color: inherit; }
  .vs-view.active { background: var(--vibings-stats-accent-soft); color: var(--vibings-stats-accent); font-weight: 600; }
  .vs-side-load { font-size: 0.8rem; color: var(--vibings-stats-muted); padding: 0 6px; display: flex; flex-direction: column; gap: 6px; }
  .vs-side-load .btn { align-self: flex-start; }
  .vs-side-footer {
    display: flex; align-items: center; gap: 8px; margin-top: auto; padding: 6px; border: none; background: none;
    color: var(--vibings-stats-muted); font-size: 0.78rem; text-align: left; border-radius: 8px;
  }
  .vs-side-footer:hover { background: var(--vibings-stats-surface-hover); }

  .vs-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; margin-bottom: 14px; }
  .vs-head h2 { margin: 0; font-size: 1.35rem; }

  /* Grid of panels */
  .vs-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
  .vs-span-12 { grid-column: span 12; } .vs-span-8 { grid-column: span 8; } .vs-span-6 { grid-column: span 6; }
  .vs-span-4 { grid-column: span 4; } .vs-span-3 { grid-column: span 3; }
  .vs-panel {
    min-width: 0; padding: 14px 16px; border: 1px solid var(--vibings-stats-border);
    border-radius: var(--vibings-stats-radius); background: var(--vibings-stats-surface);
  }
  .vs-panel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; min-height: 1.5em; }
  .vs-panel-head h3 { font-size: 0.95rem; font-weight: 600; margin: 0; flex: 1; min-width: 0; }
  .vs-panel-state { font-size: 0.75rem; color: var(--vibings-stats-muted); display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .vs-panel-state .vs-error { color: var(--vibings-stats-bad); }
  .vs-section-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vibings-stats-muted); margin: 22px 0 10px; }
  .vs-section-title:first-child { margin-top: 0; }

  /* Stat cards */
  .vs-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .vs-card { min-width: 0; padding: 12px 14px; border: 1px solid var(--vibings-stats-border); border-radius: var(--vibings-stats-radius); background: var(--vibings-stats-surface); }
  a.vs-card { color: inherit; display: block; }
  a.vs-card:hover { border-color: var(--vibings-stats-accent); text-decoration: none; }
  .vs-card-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vibings-stats-muted); }
  .vs-card-value { font-size: 1.5rem; font-weight: 700; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
  .vs-card-note { font-size: 0.8rem; color: var(--vibings-stats-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vs-card.hero .vs-card-value { font-size: 1.9rem; color: var(--vibings-stats-accent); }

  /* Skeletons */
  .vs-skel { display: block; border-radius: 6px; background: linear-gradient(90deg, var(--vibings-stats-track), rgba(255,255,255,0.14), var(--vibings-stats-track)); background-size: 200% 100%; animation: vs-shimmer 1.2s linear infinite; }
  .vs-skel-value { width: 60%; height: 1.6rem; margin-top: 6px; }
  .vs-skel-rows { display: flex; flex-direction: column; gap: 8px; }
  .vs-skel-row { height: 14px; }
  @keyframes vs-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  .vs-progress { height: 3px; border-radius: 2px; background: var(--vibings-stats-track); overflow: hidden; margin-top: 8px; }
  .vs-progress > div { height: 100%; background: var(--vibings-stats-accent); transition: width 0.2s; }
  .vs-spin { width: 10px; height: 10px; border: 2px solid var(--vibings-stats-track); border-top-color: var(--vibings-stats-accent); border-radius: 50%; animation: vs-rot 0.8s linear infinite; }
  @keyframes vs-rot { to { transform: rotate(360deg); } }
  .vs-fade { animation: vs-fade 0.35s ease-out; }
  @keyframes vs-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  /* Bar lists */
  .vs-bars { display: flex; flex-direction: column; gap: 6px; }
  .vs-bar-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(40px, 1fr) auto; gap: 10px; align-items: center; font-size: 0.85rem; }
  .vs-bar-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vs-bar-label a { color: inherit; }
  .vs-bar-label a:hover { color: var(--vibings-stats-accent); }
  .vs-bar-track { height: 8px; border-radius: 4px; background: var(--vibings-stats-track); overflow: hidden; }
  .vs-bar-fill { height: 100%; border-radius: 4px; background: var(--vibings-stats-accent); transition: width 0.5s ease-out; }
  .vs-bar-value { font-variant-numeric: tabular-nums; color: var(--vibings-stats-muted); text-align: right; min-width: 3.5em; }
  .vs-rank { display: inline-block; width: 1.6em; color: var(--vibings-stats-muted); font-variant-numeric: tabular-nums; }

  /* Column charts */
  .vs-cols { display: flex; align-items: flex-end; gap: 2px; height: 150px; }
  .vs-col { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; position: relative; }
  .vs-col > div { width: 100%; min-height: 1px; border-radius: 3px 3px 0 0; background: var(--vibings-stats-accent); opacity: 0.85; transition: height 0.5s ease-out; }
  .vs-col:hover > div { opacity: 1; background: #ffc04d; }
  .vs-col-axis { display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--vibings-stats-muted); margin-top: 4px; }
  .vs-chart-max { font-size: 0.72rem; color: var(--vibings-stats-muted); margin-bottom: 4px; }
  .vs-col-tip {
    position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 3; display: none;
    padding: 3px 8px; border-radius: 6px; background: #000; color: #fff; font-size: 0.75rem; white-space: nowrap; pointer-events: none;
  }
  .vs-col:hover .vs-col-tip { display: block; }

  /* Split bar */
  .vs-split { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--vibings-stats-track); }
  .vs-split > div { height: 100%; transition: width 0.5s; }
  .vs-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font-size: 0.82rem; }
  .vs-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .vs-legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

  /* Heatmap: weekdays x hours */
  .vs-heat { display: grid; grid-template-columns: 2.4em repeat(24, minmax(0, 1fr)); gap: 2px; font-size: 0.68rem; color: var(--vibings-stats-muted); }
  .vs-heat-cell { aspect-ratio: 1; border-radius: 2px; background: var(--vibings-stats-accent); min-height: 8px; }
  .vs-heat-day { align-self: center; }
  .vs-heat-hour { text-align: center; }

  /* Meters (completeness) */
  .vs-meter-row { display: grid; grid-template-columns: minmax(80px, 30%) minmax(0, 1fr) 4.5em; gap: 10px; align-items: center; font-size: 0.85rem; margin: 5px 0; }
  .vs-meter-row .vs-bar-fill.good { background: var(--vibings-stats-good); }
  .vs-meter-row .vs-bar-fill.mid { background: var(--vibings-stats-accent); }
  .vs-meter-row .vs-bar-fill.bad { background: var(--vibings-stats-bad); }
  .vs-meter-row a { color: inherit; }

  /* Tables */
  .vs-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  .vs-table th { font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vibings-stats-muted); }
  .vs-table th, .vs-table td { padding: 6px 8px; border-bottom: 1px solid var(--vibings-stats-border); text-align: left; white-space: nowrap; }
  .vs-table .vs-num { text-align: right; font-variant-numeric: tabular-nums; }
  .vs-table .vs-name { max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
  .vs-note {
    margin: 0 0 14px; padding: 10px 14px; border-radius: 10px; color: var(--vibings-stats-muted);
    background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1);
  }
  .vs-warn-text { color: var(--vibings-stats-bad); }
  .vs-table a { color: inherit; }
  .vs-table a:hover { color: var(--vibings-stats-accent); }
  .vs-scroll { overflow-x: auto; }
  .vs-kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; font-size: 0.88rem; }
  .vs-kv dt { color: var(--vibings-stats-muted); font-weight: normal; }
  .vs-kv dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vs-kv dd a { color: inherit; }
  .vs-toggle { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--vibings-stats-track); }
  .vs-toggle button { border: none; background: none; color: var(--vibings-stats-muted); font-size: 0.75rem; padding: 2px 8px; border-radius: 6px; }
  .vs-toggle button.active { background: var(--vibings-stats-accent-soft); color: var(--vibings-stats-accent); font-weight: 600; }
  .vs-empty { color: var(--vibings-stats-muted); font-size: 0.85rem; padding: 6px 0; }

  /* Plugins */
  .vs-plugin-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .vs-plugin-head h3 { margin: 0; font-size: 1.05rem; }
  .vs-pill { font-size: 0.72rem; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--vibings-stats-border); color: var(--vibings-stats-muted); }
  .vs-pill.ok { border-color: var(--vibings-stats-good); color: var(--vibings-stats-good); }
  .vs-pill.warn { border-color: var(--vibings-stats-accent); color: var(--vibings-stats-accent); }

  /* Status */
  .vs-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--vibings-stats-muted); flex-shrink: 0; vertical-align: middle; }
  .vs-dot-ok, .vs-dot-info { background: var(--vibings-stats-good); }
  .vs-dot-warn { background: var(--vibings-stats-accent); }
  .vs-dot-error { background: var(--vibings-stats-bad); }
  .vs-dot-pending { opacity: 0.5; }
  .vs-state-ok { color: var(--vibings-stats-good); }
  .vs-state-info { color: var(--vibings-stats-muted); }
  .vs-state-warn { color: var(--vibings-stats-accent); }
  .vs-state-error { color: var(--vibings-stats-bad); }
  .vs-checks td { white-space: normal; vertical-align: top; }
  .vs-checks .vs-check-label, .vs-checks .vs-check-state { white-space: nowrap; font-weight: 600; }
  .vs-checks .vs-check-detail { color: var(--vibings-stats-muted); width: 100%; }
  .vs-field { display: grid; grid-template-columns: 220px 160px 1fr; gap: 6px 14px; align-items: center; margin: 10px 0; }
  .vs-help { font-size: 0.8rem; color: var(--vibings-stats-muted); }
  .vs-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 10px 0; }
  .vs-tools { padding: 0 4px 8px; }

  /* Tablet and phone: the side panel becomes a top bar */
  @media (max-width: 991.98px) {
    .vs-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 8px 10px 24px; }
    .vs-side { position: static; max-height: none; overflow: visible; padding: 8px; gap: 8px; }
    .vs-side-title, .vs-side-footer, .vs-side-load { display: none; }
    .vs-views { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
    .vs-view { flex-direction: column; gap: 2px; padding: 6px 2px; font-size: 0.72rem; text-align: center; }
    .vs-span-8, .vs-span-6, .vs-span-4 { grid-column: span 12; }
    .vs-span-3 { grid-column: span 6; }
    .vs-field { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 640px) {
    .vs-grid { gap: 10px; }
    .vs-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .vs-card { padding: 10px 12px; }
    .vs-card-value, .vs-card.hero .vs-card-value { font-size: 1.25rem; }
    .vs-panel { padding: 12px; }
    .vs-span-3 { grid-column: span 12; }
    .vs-cols { height: 110px; }
    .vs-bar-row { grid-template-columns: minmax(60px, 38%) minmax(0, 1fr) auto; gap: 8px; }
    .vs-table .vs-name { max-width: 46vw; }
    .vs-hide-sm { display: none; }
    .vs-checks tr { display: grid; grid-template-columns: auto auto 1fr; }
    .vs-checks .vs-check-detail { grid-column: 1 / -1; padding-top: 0; }
  }
  /* Stash moves its navbar to the bottom on portrait phones */
  @media (max-width: 575.98px) and (orientation: portrait) {
    .vs-layout { padding-bottom: calc(var(--vibings-stats-nav-height) + 24px); }
  }
`;

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
