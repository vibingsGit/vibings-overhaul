// All plugin CSS. Colours and sizes are :root variables so themes can
// override them without touching the rules.

const STYLE_ID = "vibings-better-os-styles";

const CSS = `
  :root {
    --vibings-better-os-accent: #e94560;
    --vibings-better-os-accent-rgb: 233, 69, 96;
    --vibings-better-os-muted: #9aa4af;
    --vibings-better-os-surface: rgba(255, 255, 255, 0.04);
    --vibings-better-os-border: rgba(255, 255, 255, 0.12);
    --vibings-better-os-marker-width: 5px;
    --vibings-better-os-radius: 10px;
  }

  /* Timeline markers */
  .vbo-marker-layer { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
  .vbo-marker {
    position: absolute; top: 50%; width: var(--vibings-better-os-marker-width); height: 180%;
    min-height: 10px; transform: translate(-50%, -50%); border-radius: 2px;
    background: var(--vibings-better-os-accent);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45), 0 0 6px rgba(var(--vibings-better-os-accent-rgb), 0.7);
  }
  .vbo-marker-new { animation: vbo-marker-in 1.1s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
  @keyframes vbo-marker-in {
    0% { transform: translate(-50%, -50%) scale(0.2, 0.2); opacity: 0; }
    35% { transform: translate(-50%, -50%) scale(2.4, 1.8); opacity: 1;
          box-shadow: 0 0 0 1px rgba(0,0,0,.45), 0 0 18px 6px rgba(var(--vibings-better-os-accent-rgb), 0.9); }
    100% { transform: translate(-50%, -50%) scale(1, 1); }
  }

  /* Control bar button */
  .video-js .vbo-o-button {
    display: inline-flex; align-items: center; justify-content: center; gap: 3px;
    width: auto; min-width: 3em; padding: 0 6px; cursor: pointer; color: #fff;
  }
  .video-js .vbo-o-button svg { color: var(--vibings-better-os-accent); flex: none; }
  .video-js .vbo-o-button .vbo-o-count { font-size: 1.15em; font-weight: 600; font-variant-numeric: tabular-nums; }
  .video-js .vbo-o-button:hover svg { filter: drop-shadow(0 0 4px rgba(var(--vibings-better-os-accent-rgb), 0.9)); }
  .video-js .vbo-o-button:disabled { opacity: 0.6; cursor: default; }

  /* Pop-up when an O is added */
  .vbo-pop {
    position: absolute; z-index: 5; transform: translateX(-50%); pointer-events: none;
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px 6px 9px; border-radius: 999px;
    background: rgba(18, 18, 22, 0.88); color: #fff; font-weight: 600; font-size: 14px; white-space: nowrap;
    border: 1px solid rgba(var(--vibings-better-os-accent-rgb), 0.8);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45), 0 0 20px rgba(var(--vibings-better-os-accent-rgb), 0.45);
    animation: vbo-pop 2.2s cubic-bezier(0.2, 1.4, 0.4, 1) both;
  }
  .vbo-pop svg { color: var(--vibings-better-os-accent); }
  .vbo-pop-center { left: 50%; top: 42%; bottom: auto; font-size: 18px; }
  .vbo-pop-ring {
    position: absolute; left: 50%; top: 50%; width: 36px; height: 36px; margin: -18px 0 0 -18px;
    border-radius: 50%; border: 2px solid rgba(var(--vibings-better-os-accent-rgb), 0.9);
    animation: vbo-ring 0.9s ease-out both;
  }
  @keyframes vbo-pop {
    0% { opacity: 0; transform: translate(-50%, 14px) scale(0.6); }
    14% { opacity: 1; transform: translate(-50%, -4px) scale(1.08); }
    24% { transform: translate(-50%, 0) scale(1); }
    80% { opacity: 1; transform: translate(-50%, -6px); }
    100% { opacity: 0; transform: translate(-50%, -22px); }
  }
  @keyframes vbo-ring {
    0% { opacity: 0.9; transform: scale(0.4); }
    100% { opacity: 0; transform: scale(4); }
  }
  @media (prefers-reduced-motion: reduce) {
    .vbo-pop, .vbo-pop-ring, .vbo-marker-new, .vbo-row-new { animation-duration: 0.01s; }
  }

  /* Os tab */
  .vbo-panel { padding: 4px 0 12px; }
  .vbo-muted { color: var(--vibings-better-os-muted); }
  .vbo-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
  .vbo-tab-count { margin-left: 6px; }
  .vbo-error { color: #f85149; margin: 6px 0; }
  .vbo-empty { padding: 8px 0; }

  .vbo-strip {
    position: relative; height: 26px; margin: 4px 0 18px; border-radius: 6px;
    background: var(--vibings-better-os-surface); border: 1px solid var(--vibings-better-os-border);
  }
  .vbo-strip-dot {
    position: absolute; top: 50%; width: 12px; height: 12px; padding: 0; transform: translate(-50%, -50%);
    border-radius: 50%; border: 2px solid rgba(0, 0, 0, 0.4); cursor: pointer;
    background: var(--vibings-better-os-accent); box-shadow: 0 0 6px rgba(var(--vibings-better-os-accent-rgb), 0.7);
  }
  .vbo-strip-dot:hover { transform: translate(-50%, -50%) scale(1.3); }
  .vbo-strip-dot.vbo-marker-new { animation: vbo-dot-in 1s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
  @keyframes vbo-dot-in { 0% { transform: translate(-50%, -50%) scale(0); } 40% { transform: translate(-50%, -50%) scale(2); } 100% { transform: translate(-50%, -50%) scale(1); } }
  .vbo-strip-start, .vbo-strip-end { position: absolute; top: 100%; font-size: 11px; color: var(--vibings-better-os-muted); }
  .vbo-strip-start { left: 0; }
  .vbo-strip-end { right: 0; }

  .vbo-list { list-style: none; margin: 0; padding: 0; }
  .vbo-row {
    display: grid; grid-template-columns: 2.2em minmax(0, 1.3fr) minmax(0, 1fr) auto; align-items: center; gap: 8px;
    padding: 6px 4px; border-bottom: 1px solid var(--vibings-better-os-border);
  }
  .vbo-row-new { animation: vbo-row-in 1.6s ease-out both; }
  @keyframes vbo-row-in { 0% { background: rgba(var(--vibings-better-os-accent-rgb), 0.35); } 100% { background: transparent; } }
  .vbo-row-n { color: var(--vibings-better-os-muted); font-variant-numeric: tabular-nums; text-align: right; }
  .vbo-row-when { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .vbo-row-when .vbo-muted { font-size: 12px; }
  .vbo-pos {
    border: 0; background: rgba(var(--vibings-better-os-accent-rgb), 0.16); color: inherit; border-radius: 999px;
    padding: 2px 10px; font-variant-numeric: tabular-nums; white-space: nowrap; cursor: pointer;
  }
  .vbo-pos:hover { background: rgba(var(--vibings-better-os-accent-rgb), 0.3); }
  .vbo-classic { font-weight: 500; }
  .vbo-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; white-space: nowrap; }
  .vbo-row-actions .btn-minimal { padding: 2px 6px; color: #c9d1d9; opacity: 0.85; }
  .vbo-row-actions .btn-minimal:hover { opacity: 1; color: #fff; }
  .vbo-danger, .vbo-danger:hover { color: #f85149 !important; }
  .vbo-confirm { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
  .vbo-edit { display: flex; gap: 4px; }
  .vbo-edit input { width: 6.5em; }
  /* Narrow places (phones, side panels): the actions go on their own line. */
  .vbo-panel { container-type: inline-size; }
  @container (max-width: 520px) {
    .vbo-row { grid-template-columns: 1.6em minmax(0, 1fr) auto; }
    .vbo-row-actions { grid-column: 2 / -1; justify-content: flex-start; flex-wrap: wrap; }
    .vbo-confirm { flex-wrap: wrap; white-space: normal; }
  }
  @media (max-width: 576px) {
    .vbo-row { grid-template-columns: 1.6em minmax(0, 1fr) auto; }
    .vbo-row-actions { grid-column: 2 / -1; justify-content: flex-start; }
    .vbo-confirm { flex-wrap: wrap; white-space: normal; }
  }

  /* Settings → Tools panel */
  .vbo-tools { padding: 0 1rem; }
  .vbo-tool-section { padding: 10px 0 14px; border-top: 1px solid var(--vibings-better-os-border); }
  .vbo-tool-section:first-of-type { border-top: 0; }
  .vbo-tool-section h6 { font-weight: 600; margin-bottom: 8px; }
  .vbo-tool-toggle { margin-bottom: 8px; }
  .vbo-tool-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .vbo-tool-row .form-check { margin: 0; }
  .vbo-tool-num { width: 5.5em; }
  .vbo-tool-select { width: auto; }
  .vbo-tool-stats { margin-bottom: 6px; }
  .vbo-tool-table { margin: 8px 0 4px; }
  .vbo-tool-table td { vertical-align: middle; }
  .vbo-nowrap { white-space: nowrap; }
`;

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
