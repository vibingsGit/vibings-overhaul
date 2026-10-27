// All plugin CSS. Colours and sizes are :root variables so themes can
// override them without touching the rules.

const STYLE_ID = "vibings-better-scenes-styles";

const CSS = `
  :root {
    --vibings-better-scenes-accent: #4aa3df;
    --vibings-better-scenes-accent-rgb: 74, 163, 223;
    --vibings-better-scenes-o: #e94560;
    --vibings-better-scenes-o-rgb: 233, 69, 96;
    --vibings-better-scenes-text: #e6e9ee;
    --vibings-better-scenes-muted: #9aa4af;
    --vibings-better-scenes-surface: rgba(255, 255, 255, 0.045);
    --vibings-better-scenes-surface-2: rgba(255, 255, 255, 0.08);
    --vibings-better-scenes-border: rgba(255, 255, 255, 0.1);
    --vibings-better-scenes-menu-bg: rgba(20, 22, 28, 0.97);
    --vibings-better-scenes-radius: 10px;
    --vibings-better-scenes-side-width: 400px;
    --vibings-better-scenes-track: 5px;
    --vibings-better-scenes-track-hover: 9px;
  }

  /* ---------------------------------------------------------------- Layout */
  /* The player column's wrappers are flattened so the player, the side panel
     and the views under the player are placed as areas of one grid. */
  .row:has(> .vbs-side) {
    display: grid; grid-template-columns: minmax(0, 1fr) var(--vibings-better-scenes-side-width);
    grid-template-areas: "player side" "below side"; grid-template-rows: auto minmax(0, 1fr);
    gap: 0 16px; margin: 0; padding: 12px 8px 12px; align-items: start;
  }
  .row:has(> .vbs-side) > .scene-player-container, .row:has(> .vbs-side) .vbs-player-column { display: contents; }
  .row:has(> .vbs-side) .vbs-player { grid-area: player; }
  .row:has(> .vbs-side) .vbs-below { grid-area: below; min-width: 0; }
  .row:has(> .vbs-side) > .vbs-side { grid-area: side; }

  /* Default view on wide screens: everything fits the window, the page does
     not scroll; the views under the player and the side panel scroll inside. */
  @media (min-width: 1200px) {
    html:has(> body.vbs-fit), body.vbs-fit { overflow: hidden !important; }
    body.vbs-fit .row:has(> .vbs-side) { height: calc(100vh - var(--vbs-top, 56px)); align-items: stretch; }
    body.vbs-fit .vbs-player { max-height: calc(100vh - var(--vbs-top, 56px) - 250px); align-self: start; }
    body.vbs-fit .vbs-below { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    body.vbs-fit .vbs-below > .vbs-tabs { flex: none; }
    body.vbs-fit .vbs-below-body { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; }
    body.vbs-fit .vbs-side { position: static; max-height: none; height: 100%; }
  }
  body.vbs-theater .row:has(> .vbs-side) { grid-template-areas: "player player" "below side"; grid-template-rows: auto auto; padding-top: 0; }
  body.vbs-theater .vbs-side { max-height: none; position: static; margin-top: 14px; }
  @media (max-width: 1199px) {
    .row:has(> .vbs-side), body.vbs-theater .row:has(> .vbs-side) {
      grid-template-columns: minmax(0, 1fr); grid-template-areas: "player" "side" "below"; grid-template-rows: auto;
      padding: 0 0 24px; gap: 0; margin: 0 -15px;
    }
    .row:has(> .vbs-side) .vbs-side { position: static; max-height: none; margin: 8px 0 0; padding: 0 12px; }
    .row:has(> .vbs-side) .vbs-below { padding: 0 12px; }
  }

  /* Scrollbars stay hidden under the player (a fade shows there is more) and
     thin elsewhere. */
  .vbs-row, .vbs-tabs, .vbs-below-body, .vbs-below-body * { scrollbar-width: none; }
  .vbs-row::-webkit-scrollbar, .vbs-tabs::-webkit-scrollbar, .vbs-below-body::-webkit-scrollbar, .vbs-below-body *::-webkit-scrollbar { display: none; }
  .vbs-below-body.vbs-more-down { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 28px), transparent); }
  .vbs-below-body.vbs-more-up { -webkit-mask-image: linear-gradient(to top, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to top, #000 calc(100% - 28px), transparent); }
  .vbs-below-body.vbs-more-up.vbs-more-down { -webkit-mask-image: linear-gradient(to bottom, transparent, #000 28px, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to bottom, transparent, #000 28px, #000 calc(100% - 28px), transparent); }
  .vbs-side-body, .vbs-modal { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
  .vbs-side-body::-webkit-scrollbar { width: 6px; }
  .vbs-side-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }

  .vbs-icon { display: inline-block; vertical-align: -0.125em; flex: none; }
  .vbs-grow { flex: 1 1 auto; }
  .vbs-dim { color: var(--vibings-better-scenes-muted); }
  .vbs-small { font-size: 12px; }
  .vbs-empty { color: var(--vibings-better-scenes-muted); padding: 18px 4px; }
  .vbs-danger, .vbs-danger:hover { color: #f85149 !important; }
  .vbs-link-btn { background: none; border: 0; color: var(--vibings-better-scenes-accent); padding: 0 2px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
  .vbs-link-btn:hover { text-decoration: underline; }
  .vbs-icon-btn { background: none; border: 0; color: inherit; padding: 4px 6px; border-radius: 6px; cursor: pointer; line-height: 1; opacity: 0.8; }
  .vbs-icon-btn:hover:not(:disabled) { background: var(--vibings-better-scenes-surface-2); opacity: 1; }
  .vbs-icon-btn:disabled { opacity: 0.3; cursor: default; }
  .vbs-count { margin-left: 6px; font-size: 11px; padding: 1px 6px; border-radius: 999px; background: var(--vibings-better-scenes-surface-2); }

  /* ---------------------------------------------------------------- Player */
  .vbs-player-column { min-width: 0; }
  .vbs-player {
    position: relative; background: #000; border-radius: var(--vibings-better-scenes-radius); overflow: hidden;
    aspect-ratio: 16 / 9; max-height: calc(100vh - 140px); width: 100%; user-select: none; -webkit-user-select: none;
    touch-action: manipulation; color: #fff;
  }
  body.vbs-theater .vbs-player { max-height: calc(100vh - 80px); border-radius: 0; }
  .vbs-player.vbs-fullscreen { max-height: none; border-radius: 0; aspect-ratio: auto; height: 100%; }
  .vbs-player video { width: 100%; height: 100%; display: block; object-fit: contain; background: #000; outline: none; }
  .vbs-player.vbs-idle { cursor: none; }
  @media (max-width: 1199px) { .vbs-player { border-radius: 0; max-height: 70vh; } }

  .vbs-bigplay {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 76px; height: 76px; border-radius: 50%;
    border: 0; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 32px; display: grid; place-items: center; cursor: pointer;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.25); transition: transform 0.15s, background 0.15s;
  }
  .vbs-bigplay:hover { transform: translate(-50%, -50%) scale(1.08); background: rgba(var(--vibings-better-scenes-accent-rgb), 0.85); }
  .vbs-spinner {
    position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
    border: 3px solid rgba(255,255,255,0.25); border-top-color: #fff; animation: vbs-spin 0.8s linear infinite; pointer-events: none;
  }
  @keyframes vbs-spin { to { transform: rotate(360deg); } }
  .vbs-ripple {
    position: absolute; top: 0; bottom: 0; width: 38%; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 4px; font-size: 26px; pointer-events: none; background: rgba(255,255,255,0.12); animation: vbs-fade 0.7s ease-out both;
  }
  .vbs-ripple span { font-size: 13px; font-weight: 600; }
  .vbs-ripple-left { left: 0; border-radius: 0 50% 50% 0; }
  .vbs-ripple-right { right: 0; border-radius: 50% 0 0 50%; }
  @keyframes vbs-fade { 0% { opacity: 0; } 20% { opacity: 1; } 100% { opacity: 0; } }
  .vbs-o-pop {
    position: absolute; left: 50%; top: 38%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 16px; border-radius: 999px; background: rgba(18,18,22,0.85); font-weight: 600; font-size: 18px; pointer-events: none;
    border: 1px solid rgba(var(--vibings-better-scenes-o-rgb), 0.8); box-shadow: 0 0 24px rgba(var(--vibings-better-scenes-o-rgb), 0.5);
    animation: vbs-pop 2.2s cubic-bezier(0.2, 1.4, 0.4, 1) both;
  }
  .vbs-o-pop .vbs-icon { color: var(--vibings-better-scenes-o); }
  @keyframes vbs-pop {
    0% { opacity: 0; transform: translate(-50%, 14px) scale(0.6); } 14% { opacity: 1; transform: translate(-50%, -4px) scale(1.08); }
    24% { transform: translate(-50%, 0) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -22px); }
  }
  .vbs-overlay-title {
    position: absolute; left: 0; right: 0; top: 0; padding: 14px 18px 40px; font-size: 17px; font-weight: 600;
    background: linear-gradient(rgba(0,0,0,0.65), transparent); transition: opacity 0.25s; pointer-events: none;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .vbs-nerds {
    position: absolute; left: 12px; top: 12px; z-index: 4; width: min(440px, calc(100% - 24px)); max-height: calc(100% - 90px); overflow: auto;
    padding: 10px 12px; background: rgba(0,0,0,0.8); border-radius: 8px; font: 12px/1.55 ui-monospace, monospace; cursor: auto;
  }
  .vbs-nerds-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-family: inherit; }
  .vbs-nerds-close { background: none; border: 0; color: #fff; cursor: pointer; }
  .vbs-nerds-graphs { display: grid; gap: 8px; margin-bottom: 8px; }
  .vbs-nerds-graphs > div > span { color: #9fb3c8; font-size: 11px; }
  .vbs-graph { display: block; width: 100%; background: rgba(255,255,255,0.04); border-radius: 4px; }
  .vbs-graph-off { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 6px; padding: 8px; }
  .vbs-nerds-rows div { display: flex; gap: 12px; justify-content: space-between; }
  .vbs-nerds-rows div span:first-child { color: #9fb3c8; flex: none; }
  .vbs-nerds-rows div span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; text-align: right; }
  .vbs-controls {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 12px 6px; z-index: 3;
    background: linear-gradient(transparent, rgba(0,0,0,0.75) 60%); transition: opacity 0.25s;
  }
  .vbs-idle .vbs-controls, .vbs-idle .vbs-overlay-title { opacity: 0; pointer-events: none; }
  .vbs-bar { display: flex; align-items: center; gap: 2px; min-height: 40px; }
  .vbs-btn {
    background: none; border: 0; color: #fff; height: 38px; min-width: 38px; padding: 0 8px; border-radius: 8px; font-size: 18px;
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer; opacity: 0.92;
  }
  .vbs-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); opacity: 1; }
  .vbs-btn:disabled { opacity: 0.35; cursor: default; }
  .vbs-btn.vbs-on { color: var(--vibings-better-scenes-accent); }
  .vbs-btn-main { font-size: 22px; }
  .vbs-btn-text { font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .vbs-btn-o .vbs-icon { color: var(--vibings-better-scenes-o); }
  .vbs-btn-o span { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .vbs-bump { animation: vbs-bump 0.6s cubic-bezier(0.2, 1.6, 0.4, 1); }
  @keyframes vbs-bump { 40% { transform: scale(1.35); } }
  .vbs-nav { position: relative; display: inline-flex; }
  .vbs-nav-preview {
    position: absolute; left: 0; bottom: calc(100% + 10px); width: 240px; padding: 8px; display: flex; flex-direction: column; gap: 3px;
    background: var(--vibings-better-scenes-menu-bg); border: 1px solid var(--vibings-better-scenes-border); border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.55); pointer-events: none; z-index: 5; color: var(--vibings-better-scenes-text);
  }
  .vbs-nav-preview img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; }
  .vbs-nav-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vibings-better-scenes-muted); }
  .vbs-nav-title { font-weight: 600; font-size: 13px; line-height: 1.3; }
  .vbs-nav-sub { font-size: 12px; color: var(--vibings-better-scenes-muted); }
  @media (hover: none) { .vbs-nav-preview { display: none; } }
  .vbs-volume { display: flex; align-items: center; }
  .vbs-volume input { width: 0; opacity: 0; transition: width 0.2s, opacity 0.2s; accent-color: #fff; cursor: pointer; }
  .vbs-volume:hover input, .vbs-volume input:focus { width: 84px; opacity: 1; margin: 0 6px; }
  .vbs-time { font-size: 13px; margin-left: 6px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .vbs-chip-small { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(255,255,255,0.15); margin-right: 4px; white-space: nowrap; }
  @media (max-width: 576px) {
    .vbs-hide-sm, .vbs-volume, .vbs-chip-small { display: none; }
    .vbs-btn { min-width: 34px; height: 36px; padding: 0 4px; font-size: 17px; }
    .vbs-time { font-size: 12px; margin-left: 2px; }
    .vbs-bigplay { width: 60px; height: 60px; font-size: 24px; }
    .vbs-controls { padding: 18px 6px 2px; }
  }

  /* ---------------------------------------------------------------- Timeline */
  .vbs-timeline { position: relative; height: 22px; display: flex; align-items: center; cursor: pointer; touch-action: none; outline: none; }
  .vbs-heatmap { position: absolute; left: 0; right: 0; bottom: 15px; height: 12px; width: 100%; opacity: 0.75; pointer-events: none; border-radius: 3px; }
  .vbs-hm { position: absolute; left: 0; right: 0; top: 50%; height: 0; pointer-events: none; }
  .vbs-player:hover .vbs-hm .vsh-curve, .vbs-dragging .vbs-hm .vsh-curve { opacity: 0.7; }
  .vbs-idle .vbs-hm .vsh-curve { opacity: 0 !important; }
  .vbs-track {
    position: relative; width: 100%; height: var(--vibings-better-scenes-track); border-radius: 999px; background: rgba(255,255,255,0.2);
    transition: height 0.12s;
  }
  .vbs-timeline:hover .vbs-track, .vbs-dragging .vbs-track, .vbs-timeline:focus-visible .vbs-track { height: var(--vibings-better-scenes-track-hover); }
  .vbs-buffered { position: absolute; top: 0; bottom: 0; background: rgba(255,255,255,0.3); border-radius: 999px; }
  .vbs-played { position: absolute; left: 0; top: 0; bottom: 0; background: var(--vibings-better-scenes-accent); border-radius: 999px; }
  .vbs-ab { position: absolute; top: -2px; bottom: -2px; background: rgba(255, 210, 80, 0.35); border-left: 2px solid #ffd250; border-right: 2px solid #ffd250; }
  .vbs-marker { position: absolute; top: -1px; bottom: -1px; width: 4px; margin-left: -2px; border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,0.5); }
  .vbs-marker-range { position: absolute; top: 0; bottom: 0; opacity: 0.55; }
  .vbs-o-mark {
    position: absolute; top: 50%; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; pointer-events: none;
    background: var(--vibings-better-scenes-o); box-shadow: 0 0 0 2px rgba(0,0,0,0.55), 0 0 8px rgba(var(--vibings-better-scenes-o-rgb), 0.8);
  }
  .vbs-o-new { animation: vbs-o-in 1.1s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
  @keyframes vbs-o-in { 0% { transform: scale(0); } 40% { transform: scale(2.6); } 100% { transform: scale(1); } }
  .vbs-handle {
    position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.6); transform: scale(0); transition: transform 0.12s; pointer-events: none;
  }
  .vbs-timeline:hover .vbs-handle, .vbs-dragging .vbs-handle { transform: scale(1); }
  .vbs-preview {
    position: absolute; bottom: 26px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none;
  }
  .vbs-thumb { overflow: hidden; border-radius: 6px; background: #111; box-shadow: 0 4px 18px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.25); }
  .vbs-thumb-empty { display: none; }
  .vbs-chapter .vbs-thumb-empty { display: block; }
  .vbs-preview-text { display: flex; flex-direction: column; align-items: center; padding: 2px 8px; border-radius: 6px; background: rgba(0,0,0,0.8); font-size: 13px; font-variant-numeric: tabular-nums; }
  .vbs-preview-marker { font-size: 12px; font-weight: 600; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ---------------------------------------------------------------- Menus */
  .vbs-dropdown { position: relative; }
  .vbs-menu {
    background: var(--vibings-better-scenes-menu-bg); color: var(--vibings-better-scenes-text); border: 1px solid var(--vibings-better-scenes-border);
    border-radius: 10px; padding: 6px; min-width: 170px; box-shadow: 0 10px 30px rgba(0,0,0,0.55); font-size: 14px; z-index: 1060;
  }
  .vbs-menu-up { position: absolute; right: 0; bottom: calc(100% + 6px); max-height: 60vh; overflow: auto; }
  .vbs-menu-wide { min-width: 230px; }
  .vbs-context { position: fixed; min-width: 220px; }
  .vbs-menu-item {
    display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; border: 0; background: none; color: inherit;
    border-radius: 6px; text-align: left; cursor: pointer;
  }
  .vbs-menu-item:hover:not(:disabled) { background: var(--vibings-better-scenes-surface-2); }
  .vbs-menu-item:disabled { opacity: 0.4; cursor: default; }
  .vbs-menu-item.vbs-selected { color: var(--vibings-better-scenes-accent); font-weight: 600; }
  .vbs-menu-icon { width: 18px; display: inline-flex; justify-content: center; opacity: 0.85; }
  .vbs-menu-label { flex: 1; }
  .vbs-menu kbd { font-size: 11px; padding: 1px 6px; border-radius: 4px; background: var(--vibings-better-scenes-surface-2); color: var(--vibings-better-scenes-muted); }
  .vbs-menu-sep { height: 1px; background: var(--vibings-better-scenes-border); margin: 5px 4px; }
  .vbs-menu-heading { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vibings-better-scenes-muted); padding: 4px 10px; }
  .vbs-menu-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; margin: 0; cursor: pointer; white-space: nowrap; }
  .vbs-rates { flex-wrap: wrap; gap: 4px; white-space: normal; }
  .vbs-mini.vbs-selected { border-color: var(--vibings-better-scenes-accent); color: var(--vibings-better-scenes-accent); }
  .vbs-menu-hint { font-size: 11px; color: var(--vibings-better-scenes-muted); padding: 2px 10px 4px; }
  .vbs-mini { border: 1px solid var(--vibings-better-scenes-border); background: var(--vibings-better-scenes-surface-2); color: inherit; border-radius: 6px; padding: 3px 10px; font-size: 12px; font-variant-numeric: tabular-nums; }
  .vbs-toast {
    position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%); z-index: 2000; padding: 8px 16px; border-radius: 999px;
    background: rgba(20,22,28,0.95); color: #fff; border: 1px solid var(--vibings-better-scenes-border); box-shadow: 0 6px 20px rgba(0,0,0,0.5);
    animation: vbs-fade 2.2s ease-out both; pointer-events: none; font-size: 14px;
  }
  .vbs-toast-error { border-color: rgba(248, 81, 73, 0.7); }

  /* ---------------------------------------------------------------- Under the player */
  .vbs-below { margin-top: 14px; }
  .vbs-tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--vibings-better-scenes-border); }
  .vbs-tab {
    background: none; border: 0; color: var(--vibings-better-scenes-muted); padding: 8px 12px; font-weight: 600; font-size: 14px;
    border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; cursor: pointer;
  }
  .vbs-tab:hover { color: var(--vibings-better-scenes-text); }
  .vbs-tab-on { color: var(--vibings-better-scenes-text); border-bottom-color: var(--vibings-better-scenes-accent); }
  .vbs-below-body { padding-top: 12px; }
  .vbs-row-wrap { position: relative; }
  .vbs-row { display: flex; gap: 12px; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; align-items: flex-start; }
  .vbs-row-arrow {
    position: absolute; top: 34%; z-index: 2; width: 34px; height: 34px; border-radius: 50%; border: 0; display: none; place-items: center;
    background: rgba(20,22,28,0.85); color: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.5); cursor: pointer;
  }
  .vbs-row-wrap:hover .vbs-row-arrow { display: grid; }
  .vbs-row-left { left: -6px; } .vbs-row-right { right: -6px; }
  @media (hover: none) { .vbs-row-wrap:hover .vbs-row-arrow { display: none; } }
  .vbs-card { position: relative; flex: none; width: 220px; scroll-snap-align: start; }
  .vbs-card-link { display: block; color: inherit; text-decoration: none !important; }
  .vbs-card-thumb { position: relative; width: 100%; height: 0; padding-top: 56.25%; border-radius: 8px; overflow: hidden; background: var(--vibings-better-scenes-surface); }
  .vbs-card-thumb img, .vbs-card-thumb video { position: absolute; left: 0; top: 0; width: 100% !important; height: 100% !important; max-width: none; object-fit: cover; }
  .vbs-card-link:hover .vbs-card-thumb { box-shadow: 0 0 0 2px var(--vibings-better-scenes-accent); }
  .vbs-card-current .vbs-card-thumb { box-shadow: 0 0 0 2px var(--vibings-better-scenes-accent); }
  .vbs-card-duration, .vbs-card-badge, .vbs-card-o {
    position: absolute; padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,0.75); color: #fff; font-size: 12px; font-variant-numeric: tabular-nums;
  }
  .vbs-card-duration { right: 6px; bottom: 6px; }
  .vbs-card-badge { left: 6px; top: 6px; background: rgba(var(--vibings-better-scenes-accent-rgb), 0.9); font-weight: 600; }
  .vbs-card-o { left: 6px; bottom: 6px; } .vbs-card-o .vbs-icon { color: var(--vibings-better-scenes-o); }
  .vbs-card-progress { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--vibings-better-scenes-o); }
  .vbs-card-title { margin-top: 6px; font-weight: 600; font-size: 14px; line-height: 1.3; height: 2.6em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .vbs-card-sub { font-size: 12px; color: var(--vibings-better-scenes-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vbs-card-more {
    position: absolute; right: 4px; top: 4px; width: 28px; height: 28px; border-radius: 50%; border: 0; background: rgba(0,0,0,0.6);
    color: #fff; opacity: 0; transition: opacity 0.15s; line-height: 1; cursor: pointer;
  }
  .vbs-card:hover .vbs-card-more { opacity: 1; }
  @media (hover: none) { .vbs-card-more { opacity: 1; } .vbs-card { width: 170px; } }
  .vbs-perf-row { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 12px; align-items: start; }
  .vbs-perf-row + .vbs-perf-row { margin-top: 14px; }
  @media (max-width: 600px) { .vbs-perf-row { grid-template-columns: minmax(0, 1fr); gap: 0; } }
  .vbs-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--vibings-better-scenes-accent); margin-left: 6px; vertical-align: middle; }
  .vbs-fileinfo { font-size: 14px; overflow-wrap: anywhere; }
  .vbs-fileinfo dl { margin: 0; }
  .vbs-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 8px 32px; }
  .vbs-filters-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .vbs-filters-head h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vibings-better-scenes-muted); margin: 0; font-weight: 700; }
  .vbs-slider { display: grid; grid-template-columns: 96px minmax(0, 1fr) 64px; align-items: center; gap: 10px; font-size: 13px; min-height: 28px; }
  .vbs-slider label { margin: 0; color: var(--vibings-better-scenes-muted); }
  .vbs-slider.vbs-changed label { color: var(--vibings-better-scenes-text); }
  .vbs-slider input[type=range] {
    width: 100%; height: 4px; margin: 0; -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.15); border-radius: 2px; outline: none; cursor: pointer;
  }
  .vbs-slider input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.5); }
  .vbs-slider input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 0; }
  .vbs-changed input[type=range]::-webkit-slider-thumb { background: var(--vibings-better-scenes-accent); }
  .vbs-changed input[type=range]::-moz-range-thumb { background: var(--vibings-better-scenes-accent); }
  .vbs-slider-value { background: none; border: 0; color: var(--vibings-better-scenes-muted); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; padding: 0; cursor: pointer; }
  .vbs-changed .vbs-slider-value { color: var(--vibings-better-scenes-accent); }
  .vbs-filter-buttons { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; font-size: 13px; }
  .vbs-filter-buttons span { color: var(--vibings-better-scenes-muted); width: 96px; }
  .vbs-filter-check { display: flex; align-items: center; gap: 8px; margin: 6px 0 0; font-size: 13px; }
  .vbs-keep { margin-top: 10px; }
  .vbs-svg-defs { position: absolute; width: 0; height: 0; overflow: hidden; }
  .vbs-menu-select { justify-content: space-between; }
  .vbs-menu-select select { max-width: 150px; background: var(--vibings-better-scenes-surface-2); color: inherit; border: 1px solid var(--vibings-better-scenes-border); border-radius: 6px; padding: 2px 4px; }
  .vbs-menu-select select option { background: #1b1e24; }
  .vbs-perf-head { display: flex; flex-direction: column; align-items: center; gap: 6px; padding-top: 4px; font-weight: 600; font-size: 13px; line-height: 1.25; text-align: center; color: inherit; overflow-wrap: anywhere; }
  .vbs-perf-head img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; object-position: top; }
  @media (max-width: 600px) {
    .vbs-perf-head { flex-direction: row; text-align: left; padding: 0; margin-bottom: 8px; font-size: 14px; }
    .vbs-perf-head img { width: 30px; height: 30px; }
  }
  .vbs-chapter {
    flex: none; width: 176px; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 0; border: 0;
    background: none; color: inherit; text-align: left; cursor: pointer; scroll-snap-align: start;
  }
  .vbs-chapter .vbs-thumb { box-shadow: none; border: 0; }
  .vbs-chapter:hover .vbs-thumb { box-shadow: 0 0 0 2px var(--vibings-better-scenes-accent); }
  .vbs-chapter-time { font-size: 12px; color: var(--vibings-better-scenes-accent); font-variant-numeric: tabular-nums; margin-top: 4px; }
  .vbs-chapter-title { font-weight: 600; font-size: 14px; }
  .vbs-chapter-tag { font-size: 12px; color: var(--vibings-better-scenes-muted); }

  /* ---------------------------------------------------------------- Side panel */
  .vbs-side {
    position: sticky; top: 64px; max-height: calc(100vh - 76px); display: flex; flex-direction: column; min-width: 0;
    background: var(--vibings-better-scenes-surface); border: 1px solid var(--vibings-better-scenes-border); border-radius: var(--vibings-better-scenes-radius);
  }
  .vbs-side-tabs { padding: 0 8px; flex: none; }
  .vbs-side-body { overflow-y: auto; padding: 12px 14px 16px; min-height: 0; }
  @media (max-width: 1199px) { .vbs-side { background: none; border: 0; } .vbs-side-body { padding: 12px 2px; } }
  .vbs-head { display: grid; grid-template-columns: 1fr auto auto; gap: 2px 10px; }
  .vbs-edit-btn { grid-column: 3; grid-row: 1; align-self: start; }
  .vbs-title { grid-column: 1; margin: 0; font-size: 1.3rem; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
  .vbs-sub { grid-column: 1; color: var(--vibings-better-scenes-muted); font-size: 13px; }
  .vbs-studio-logo { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
  .vbs-studio-logo img { max-width: 90px; max-height: 40px; object-fit: contain; }
  .vbs-toolbar { display: flex; align-items: center; gap: 6px; margin: 10px 0 4px; flex-wrap: wrap; }
  .vbs-chip {
    display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 999px; font-size: 14px;
    border: 1px solid var(--vibings-better-scenes-border); background: var(--vibings-better-scenes-surface-2); color: inherit; cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .vbs-chip:hover:not(:disabled) { border-color: var(--vibings-better-scenes-accent); }
  .vbs-chip-o .vbs-icon { color: var(--vibings-better-scenes-o); }
  .vbs-chip-on { color: #3fb950; border-color: rgba(63,185,80,0.6); }
  .vbs-stars button { background: none; border: 0; color: #f5c518; padding: 0 1px; font-size: 18px; cursor: pointer; }
  .vbs-battles {
    display: flex; align-items: center; gap: 8px; margin: 10px 0; padding: 8px 12px; border-radius: 8px; font-size: 13px;
    background: rgba(245, 197, 24, 0.08); border: 1px solid rgba(245, 197, 24, 0.25);
  }
  .vbs-battles > .vbs-icon { color: #f5c518; } .vbs-battles .vbs-link-btn { margin-left: auto; }
  .vbs-section { margin-top: 16px; }
  .vbs-section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .vbs-section-head h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vibings-better-scenes-muted); margin: 0; font-weight: 700; }
  .vbs-performers { display: grid; gap: 8px; }
  .vbs-performer { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 10px; align-items: center; }
  .vbs-performers-compact .vbs-performer { grid-template-columns: 40px minmax(0, 1fr) auto; }
  .vbs-performer-img img, .vbs-performer-img span { display: block; width: 56px; height: 72px; border-radius: 8px; object-fit: cover; object-position: top; background: var(--vibings-better-scenes-surface-2); }
  .vbs-performers-compact .vbs-performer-img img, .vbs-performers-compact .vbs-performer-img span { width: 40px; height: 40px; border-radius: 50%; }
  .vbs-performer-text { display: flex; flex-direction: column; min-width: 0; }
  .vbs-performer-name { font-weight: 600; color: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vbs-elo { color: #f5c518; display: inline-flex; align-items: center; gap: 4px; }
  .vbs-fav { color: var(--vibings-better-scenes-muted); font-size: 16px; } .vbs-fav.vbs-on { color: #f5c518; opacity: 1; }
  .vbs-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .vbs-tag { padding: 3px 10px; border-radius: 999px; background: var(--vibings-better-scenes-surface-2); color: inherit; font-size: 13px; text-decoration: none !important; }
  .vbs-tag:hover { background: rgba(var(--vibings-better-scenes-accent-rgb), 0.25); }
  .vbs-os-head { display: flex; align-items: center; justify-content: space-between; }
  .vbs-os-latest { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; margin: 8px 0; padding: 8px 10px; border-radius: 8px; background: var(--vibings-better-scenes-surface-2); font-size: 13px; }
  .vbs-os-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--vibings-better-scenes-muted); }
  .vbs-chip-small2 { height: 26px; font-size: 13px; padding: 0 8px; }
  .vbs-modal.vbs-modal-wide { width: min(760px, 100%); }
  .vbs-activity { margin-top: 10px; }
  .vbs-activity-grid { display: flex; gap: 3px; }
  .vbs-activity-col { display: flex; flex-direction: column; gap: 3px; flex: 1 1 0; min-width: 0; }
  .vbs-day { display: block; aspect-ratio: 1; width: 100%; max-width: 13px; border-radius: 2px; background: rgba(255,255,255,0.07); }
  .vbs-activity-legend .vbs-day { width: 10px; height: 10px; display: inline-block; }
  .vbs-l1 { background: rgba(var(--vibings-better-scenes-accent-rgb), 0.35); }
  .vbs-l2 { background: rgba(var(--vibings-better-scenes-accent-rgb), 0.55); }
  .vbs-l3 { background: rgba(var(--vibings-better-scenes-accent-rgb), 0.78); }
  .vbs-l4 { background: var(--vibings-better-scenes-accent); }
  .vbs-day-o { box-shadow: inset 0 0 0 2px var(--vibings-better-scenes-o); }
  .vbs-day-future { visibility: hidden; }
  .vbs-activity-legend { display: flex; align-items: center; gap: 3px; font-size: 11px; margin-top: 6px; }
  .vbs-o-list { list-style: none; margin: 0; padding: 0; }
  .vbs-o-list li { display: flex; align-items: center; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--vibings-better-scenes-border); font-size: 13px; }
  .vbs-o-list li span:nth-child(2) { margin-left: auto; }
  .vbs-description { white-space: pre-wrap; font-size: 14px; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; margin-bottom: 10px; }
  .vbs-description.vbs-open { display: block; }
  .vbs-dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px 12px; font-size: 13px; margin: 0; }
  .vbs-dl dt { color: var(--vibings-better-scenes-muted); font-weight: 400; }
  .vbs-dl dd { margin: 0; overflow-wrap: anywhere; }
  .vbs-urls { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 8px; font-size: 13px; }
  .vbs-stash-page .row { margin: 0; display: block; }
  .vbs-stash-page .scene-tabs { max-width: 100%; flex: none; width: 100%; padding: 0; }
  .vbs-stash-page .scene-divider { display: none !important; }
  .vbs-overview .vbo-panel { padding-top: 0; }

  /* ---------------------------------------------------------------- Queue */
  .vbs-q-section + .vbs-q-section { margin-top: 18px; }
  .vbs-q-head { display: flex; align-items: center; justify-content: space-between; }
  .vbs-q-head h4 { font-size: 15px; margin: 0; }
  .vbs-q-toggles { display: flex; flex-direction: column; gap: 2px; margin: 0 0 14px; font-size: 13px; }
  .vbs-q-toggles label { display: flex; align-items: center; gap: 8px; margin: 0; }
  .vbs-q-list { list-style: none; margin: 6px 0 0; padding: 0; }
  .vbs-q-row { display: grid; grid-template-columns: 14px 22px minmax(0, 1fr) auto; align-items: center; gap: 6px; padding: 4px; border-radius: 8px; }
  .vbs-q-grip { cursor: grab; touch-action: none; color: var(--vibings-better-scenes-muted); opacity: 0.5; font-size: 16px; line-height: 1; user-select: none; text-align: center; }
  .vbs-q-row:hover .vbs-q-grip { opacity: 1; }
  .vbs-q-dragging { opacity: 0.45; }
  .vbs-q-drop { height: 3px; margin: 2px 0; border-radius: 2px; background: var(--vibings-better-scenes-accent); list-style: none; }
  .vbs-q-hint { list-style: none; font-size: 12px; color: var(--vibings-better-scenes-muted); padding: 10px; border: 1px dashed var(--vibings-better-scenes-border); border-radius: 8px; }
  .vbs-q-row:hover { background: var(--vibings-better-scenes-surface-2); }
  .vbs-q-current { background: rgba(var(--vibings-better-scenes-accent-rgb), 0.15); }
  .vbs-q-index { font-size: 12px; color: var(--vibings-better-scenes-muted); text-align: center; font-variant-numeric: tabular-nums; }
  .vbs-q-current .vbs-q-index { color: var(--vibings-better-scenes-accent); }
  .vbs-q-main { display: flex; gap: 8px; align-items: center; min-width: 0; color: inherit; text-decoration: none !important; }
  .vbs-q-main img, .vbs-q-noimg { width: 96px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; flex: none; background: var(--vibings-better-scenes-surface-2); }
  .vbs-q-text { display: flex; flex-direction: column; min-width: 0; }
  .vbs-q-title { font-size: 13px; font-weight: 600; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .vbs-q-sub { font-size: 12px; color: var(--vibings-better-scenes-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vbs-q-actions { display: flex; }
  .vbs-q-more { margin: 8px 0; }

  /* ---------------------------------------------------------------- Modal */
  .vbs-modal-back { position: fixed; inset: 0; z-index: 1050; background: rgba(0,0,0,0.55); display: grid; place-items: center; padding: 16px; }
  .vbs-modal { background: #15171d; border: 1px solid var(--vibings-better-scenes-border); border-radius: 12px; padding: 14px 18px; width: min(460px, 100%); max-height: 90vh; overflow: auto; }
  .vbs-modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .vbs-modal-head h4 { margin: 0; font-size: 17px; }
  .vbs-keys { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; font-size: 14px; }
  .vbs-keys dt { font-weight: 400; white-space: nowrap; } .vbs-keys dd { margin: 0; }
  .vbs-keys kbd { font-size: 12px; }

  /* ---------------------------------------------------------------- Tools panel */
  .vbs-tools { padding: 0 1rem; }
  .vbs-tool-section { padding: 10px 0 14px; border-top: 1px solid var(--vibings-better-scenes-border); }
  .vbs-tool-section:first-of-type { border-top: 0; }
  .vbs-tool-section h6 { font-weight: 600; margin-bottom: 8px; }
  .vbs-tool-toggle { margin-bottom: 8px; }
  .vbs-tool-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .vbs-tool-num { width: 5.5em; }
  .vbs-tool-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .vbs-pill { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: var(--vibings-better-scenes-surface-2); margin-left: 6px; }
  .vbs-pill-on { background: rgba(63,185,80,0.2); color: #3fb950; }

  /* ---------------------------------------------------------------- Player extras */
  .vbs-player { transition: box-shadow 0.8s ease; }
  .vbs-chapter-gap { position: absolute; top: -2px; bottom: -2px; width: 3px; margin-left: -1.5px; background: #000; pointer-events: none; }
  .vbs-has-chapters .vbs-marker { display: none; }
  .vbs-chapter-now {
    background: none; border: 0; color: rgba(255,255,255,0.85); font-size: 13px; padding: 0 6px; max-width: 240px; cursor: pointer;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .vbs-chapter-now:hover { color: #fff; }
  .vbs-frame-btns { display: inline-flex; margin-left: 4px; }
  .vbs-frame-btns .vbs-btn { min-width: 32px; font-size: 16px; }
  .vbs-sleep { display: inline-flex; align-items: center; gap: 4px; border: 0; color: #fff; cursor: pointer; }
  .vbs-menu-select { justify-content: space-between; }
  .vbs-menu-select span { display: inline-flex; align-items: center; gap: 6px; }
  .vbs-menu-select select, .vbs-input {
    background: rgba(255,255,255,0.06); color: inherit; border: 1px solid var(--vibings-better-scenes-border); border-radius: 6px;
    padding: 4px 8px; font-size: 13px; min-width: 0;
  }
  .vbs-menu-select select option, select.vbs-input option { background: #1c1f26; color: #e6e9ee; }
  .vbs-input:focus { outline: none; border-color: var(--vibings-better-scenes-accent); }
  .vbs-invalid { border-color: #f85149 !important; }
  .vbs-button {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; font-size: 14px; cursor: pointer;
    border: 1px solid var(--vibings-better-scenes-border); background: var(--vibings-better-scenes-surface-2); color: inherit; text-decoration: none;
  }
  .vbs-button:hover:not(:disabled) { border-color: var(--vibings-better-scenes-accent); color: inherit; text-decoration: none; }
  .vbs-button:disabled { opacity: 0.45; cursor: default; }
  .vbs-button-primary { background: var(--vibings-better-scenes-accent); border-color: var(--vibings-better-scenes-accent); color: #0b0d10; font-weight: 600; }
  .vbs-button-primary:hover:not(:disabled) { color: #0b0d10; filter: brightness(1.1); }
  .vbs-modal-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .vbs-shot { display: block; width: 100%; max-height: 60vh; object-fit: contain; border-radius: 8px; background: #000; margin-bottom: 4px; }
  .vbs-quick-marker {
    position: absolute; right: 12px; top: 12px; z-index: 5; width: min(320px, calc(100% - 24px)); display: grid; gap: 8px; padding: 10px 12px;
    background: var(--vibings-better-scenes-menu-bg); color: var(--vibings-better-scenes-text); border: 1px solid var(--vibings-better-scenes-border);
    border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.55); font-size: 14px; cursor: auto; user-select: text;
  }
  .vbs-qm-head { display: flex; align-items: center; gap: 6px; }
  .vbs-qm-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .vbs-qm-select { color: #111; }
  .vbs-qm-actions { display: flex; align-items: center; gap: 8px; }
  .vbs-swipe {
    position: absolute; left: 50%; top: 50%; margin: -28px 0 0 -90px; width: 180px; height: 56px; display: flex; align-items: center; justify-content: center;
    gap: 10px; border-radius: 999px; background: rgba(0,0,0,0.65); font-weight: 600; pointer-events: none; z-index: 4;
  }
  .vbs-swipe-no { opacity: 0.55; }
  @media (pointer: coarse) {
    .vbs-player video { touch-action: pan-y; }
    .vbs-player.vbs-fullscreen video { touch-action: none; }
  }

  /* ---------------------------------------------------------------- Mini player */
  .vbs-mini-player {
    position: fixed; right: 16px; bottom: 16px; z-index: 1040; width: min(380px, calc(100vw - 32px)); border-radius: 10px; overflow: hidden;
    background: #000; color: #fff; box-shadow: 0 12px 40px rgba(0,0,0,0.65); border: 1px solid rgba(255,255,255,0.12);
    animation: vbs-mini-in 0.25s ease-out both;
  }
  @keyframes vbs-mini-in { from { opacity: 0; transform: translateY(20px) scale(0.96); } }
  .vbs-mini-video { aspect-ratio: 16 / 9; cursor: pointer; background: #000; }
  .vbs-mini-video video { width: 100%; height: 100%; display: block; object-fit: contain; }
  .vbs-mini-bar { display: flex; align-items: center; gap: 2px; padding: 2px 4px; background: rgba(20,22,28,0.97); }
  .vbs-mini-bar .vbs-btn { min-width: 34px; height: 34px; font-size: 16px; }
  .vbs-mini-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; padding: 0 4px; }
  .vbs-mini-title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vbs-mini-time { font-size: 11px; color: #9aa4af; font-variant-numeric: tabular-nums; }
  .vbs-mini-track { height: 4px; background: rgba(255,255,255,0.15); cursor: pointer; }
  .vbs-mini-track div { height: 100%; background: var(--vibings-better-scenes-accent); }
  @media (max-width: 576px) { .vbs-mini-player { width: 62vw; right: 8px; bottom: 8px; } .vbs-mini-time { display: none; } }

  /* ---------------------------------------------------------------- Cards, views, queue, edit, battle */
  .vbs-card-stats { position: absolute; left: 6px; bottom: 7px; display: flex; gap: 4px; }
  .vbs-card-stats > span { position: static; color: #fff; display: inline-flex; align-items: center; gap: 3px; padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,0.75); font-size: 12px; }
  .vbs-card-done { opacity: 0.45; }
  .vbs-card-scrub { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: rgba(255,255,255,0.85); pointer-events: none; }
  .vbs-tab-tool { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
  .vbs-tune { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-bottom: 10px; font-size: 13px; }
  .vbs-tune .vbs-filter-check { margin: 0; }
  .vbs-tune-weight { display: inline-flex; align-items: center; gap: 6px; margin: 0; }
  .vbs-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
  .vbs-presets .vbs-input { max-width: 180px; }
  .vbs-q-save { display: flex; gap: 6px; margin-bottom: 8px; }
  .vbs-q-save .vbs-input { flex: 1; }
  .vbs-q-save .vbs-mini { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .vbs-saved-queues { list-style: none; padding: 0; margin: 0; display: grid; gap: 2px; }
  .vbs-saved-queues li { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; }
  .vbs-saved-queues li:hover { background: var(--vibings-better-scenes-surface); }
  .vbs-saved-name { flex: 1; min-width: 0; color: inherit; font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vbs-edit { display: grid; gap: 8px; padding: 10px; margin: 10px 0; border: 1px solid var(--vibings-better-scenes-border); border-radius: 10px; background: var(--vibings-better-scenes-surface); }
  .vbs-edit-field { display: grid; gap: 3px; margin: 0; font-size: 13px; }
  .vbs-edit-field > span { color: var(--vibings-better-scenes-muted); font-size: 12px; }
  .vbs-edit-field .vbs-input { width: 100%; font-size: 14px; }
  .vbs-edit .vbs-modal-actions { margin-top: 2px; }
  .vbs-battles { flex-wrap: wrap; }
  .vbs-battles > span:not(.vbs-grow) { white-space: nowrap; }
  .vbs-battles .vbs-link-btn { white-space: nowrap; }
  .vbs-battle { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: stretch; }
  .vbs-battle-vs { align-self: center; font-weight: 700; color: var(--vibings-better-scenes-muted); }
  .vbs-battle-side {
    display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 8px; border-radius: 10px; cursor: pointer; color: inherit;
    border: 2px solid var(--vibings-better-scenes-border); background: var(--vibings-better-scenes-surface); transition: border-color 0.15s, transform 0.15s;
  }
  .vbs-battle-side:hover:not(:disabled) { border-color: var(--vibings-better-scenes-accent); transform: translateY(-2px); }
  .vbs-battle-side:disabled { cursor: default; }
  .vbs-battle-won { border-color: #3fb950 !important; }
  .vbs-battle-img { position: relative; display: block; aspect-ratio: 16 / 9; border-radius: 6px; overflow: hidden; background: #111; }
  .vbs-battle-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .vbs-battle-title { font-weight: 600; font-size: 14px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .vbs-up { color: #3fb950; } .vbs-down { color: #f85149; }
  @media (max-width: 576px) { .vbs-battle { grid-template-columns: 1fr 1fr; gap: 8px; } .vbs-battle-vs { display: none; } .vbs-battle-side { padding: 6px; } }

  @media (prefers-reduced-motion: reduce) {
    .vbs-o-pop, .vbs-o-new, .vbs-bump, .vbs-ripple, .vbs-toast { animation-duration: 0.01s; }
  }
`;

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}
