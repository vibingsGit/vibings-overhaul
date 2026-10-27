// All plugin CSS. Colours and sizes are :root variables so themes can
// override them without touching the rules.

const STYLE_ID = "vibings-battles-styles";

const CSS = `
  :root {
    --vibings-battles-accent: #f5a623;
    --vibings-battles-accent-soft: rgba(245, 166, 35, 0.14);
    --vibings-battles-win: #3fb950;
    --vibings-battles-loss: #f85149;
    --vibings-battles-draw: #8b949e;
    --vibings-battles-surface: rgba(255, 255, 255, 0.04);
    --vibings-battles-surface-hover: rgba(255, 255, 255, 0.08);
    --vibings-battles-border: rgba(255, 255, 255, 0.12);
    --vibings-battles-muted: #9aa4af;
    --vibings-battles-bar-bg: rgba(18, 23, 28, 0.94);
    --vibings-battles-radius: 12px;
    --vibings-battles-side-width: 240px;
    --vibings-battles-nav-height: 48.75px; /* Stash's navbar */
    --vibings-battles-media-height: min(64vh, 680px);
    --vibings-battles-thumb-size: 44px;
    --vibings-battles-transition: 0.18s ease;
  }

  /* Layout: side panel + main panel */
  .vb-layout {
    display: grid; grid-template-columns: var(--vibings-battles-side-width) minmax(0, 1fr);
    gap: 20px; align-items: start; padding: 12px 20px 40px; max-width: 1760px; margin: 0 auto;
  }
  .vb-mainpanel { min-width: 0; }
  .vb-muted { color: var(--vibings-battles-muted); }

  /* Grid children must be allowed to shrink below their content width,
     otherwise the scrolling category row stretches the page on phones. */
  .vb-side {
    min-width: 0;
    position: sticky; top: calc(var(--vibings-battles-nav-height) + 12px);
    max-height: calc(100vh - var(--vibings-battles-nav-height) - 24px); overflow-y: auto; scrollbar-width: thin;
    display: flex; flex-direction: column; gap: 18px; padding: 14px;
    border: 1px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius);
    background: var(--vibings-battles-surface);
  }
  .vb-side-title { display: flex; align-items: center; gap: 10px; font-size: 1.25rem; font-weight: 700; padding: 2px 6px; }
  .vb-side-title svg { color: var(--vibings-battles-accent); }
  .vb-side-heading {
    font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--vibings-battles-muted); margin: 0 6px 6px;
  }
  .vb-views, .vb-catlist { display: flex; flex-direction: column; gap: 2px; }
  .vb-view, .vb-catitem {
    display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    padding: 8px 10px; border: none; border-radius: 8px; background: none; color: var(--vibings-battles-muted);
    transition: background var(--vibings-battles-transition), color var(--vibings-battles-transition);
  }
  .vb-view svg, .vb-catitem svg { width: 1.1em; flex-shrink: 0; }
  .vb-view:hover, .vb-catitem:hover:not(:disabled) { background: var(--vibings-battles-surface-hover); color: inherit; }
  .vb-view.active, .vb-catitem.active { background: var(--vibings-battles-accent-soft); color: var(--vibings-battles-accent); font-weight: 600; }
  .vb-catitem:disabled { opacity: 0.4; }
  .vb-catname { flex: 1; min-width: 0; }
  .vb-catcount { font-size: 0.8rem; font-variant-numeric: tabular-nums; }
  .vb-side .custom-switch { margin: 0 6px; }
  .vb-shortcut { display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; padding: 2px 6px; color: var(--vibings-battles-muted); }
  .vb-shortcut kbd, .vb-actions kbd { font-size: 0.75em; }

  .vb-main-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; margin-bottom: 12px; }
  .vb-main-head h2 { margin: 0; font-size: 1.35rem; }
  .vb-status { text-align: center; padding: 60px 20px; }
  .vb-error { color: var(--vibings-battles-loss); }
  .vb-up { color: var(--vibings-battles-win); }
  .vb-down { color: var(--vibings-battles-loss); }

  /* Battle */
  .vb-arena { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .vb-card {
    position: relative; display: flex; flex-direction: column; text-align: left; min-width: 0;
    border: 2px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius);
    background: var(--vibings-battles-surface); color: inherit; overflow: hidden; padding: 0;
    cursor: pointer; transition: border-color var(--vibings-battles-transition), transform var(--vibings-battles-transition), opacity var(--vibings-battles-transition);
  }
  .vb-card:hover:not(:disabled) { border-color: var(--vibings-battles-accent); transform: translateY(-2px); }
  .vb-card:disabled { cursor: default; }
  .vb-card.win { border-color: var(--vibings-battles-win); }
  .vb-card.loss { border-color: var(--vibings-battles-loss); opacity: 0.55; }
  .vb-card.draw { border-color: var(--vibings-battles-draw); }
  .vb-media { position: relative; height: var(--vibings-battles-media-height); background: #000; overflow: hidden; }
  .vb-media-bg {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    filter: blur(28px) brightness(0.45); transform: scale(1.15);
  }
  .vb-media-fg { position: relative; display: block; width: 100%; height: 100%; object-fit: contain; }
  .vb-media.logo .vb-media-bg { display: none; }
  .vb-media.logo .vb-media-fg { padding: 24px; }
  .vb-key, .vb-open, .vb-badge {
    position: absolute; z-index: 1; padding: 2px 8px; border-radius: 6px;
    background: rgba(0, 0, 0, 0.65); font-size: 0.8rem; color: #fff;
  }
  .vb-key { top: 10px; left: 10px; }
  .vb-open { top: 10px; right: 10px; padding: 4px 8px; }
  .vb-open:hover { color: var(--vibings-battles-accent); }
  .vb-badge { bottom: 10px; left: 10px; color: var(--vibings-battles-muted); }
  .vb-delta {
    position: absolute; z-index: 2; inset: auto 0 0 0; padding: 10px; text-align: center; font-size: 1.6rem; font-weight: 700;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.85)); color: #fff;
  }
  .vb-info { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .vb-title { font-weight: 600; font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vb-sub { font-size: 0.85rem; color: var(--vibings-battles-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.2em; }
  .vb-stats { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.85rem; color: var(--vibings-battles-muted); }
  .vb-stats b { color: inherit; font-weight: 600; }
  .vb-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; }
  .vb-actions .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }

  /* Leaderboard */
  .vb-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
  .vb-toolbar .form-control { width: auto; }
  .vb-scroll { overflow-x: auto; }
  .vb-table { width: 100%; border-collapse: collapse; }
  .vb-table th { font-weight: 600; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vibings-battles-muted); }
  .vb-table th, .vb-table td { padding: 6px 10px; border-bottom: 1px solid var(--vibings-battles-border); text-align: left; white-space: nowrap; }
  .vb-table .vb-num { text-align: right; font-variant-numeric: tabular-nums; }
  .vb-table tbody tr { cursor: pointer; }
  .vb-table tbody tr:hover { background: var(--vibings-battles-surface-hover); }
  .vb-table .vb-name { max-width: 420px; overflow: hidden; text-overflow: ellipsis; }
  .vb-thumb {
    width: var(--vibings-battles-thumb-size); height: var(--vibings-battles-thumb-size); border-radius: 6px;
    object-fit: cover; background: var(--vibings-battles-surface); display: block;
  }
  .vb-thumb.contain { object-fit: contain; }
  .vb-rank { color: var(--vibings-battles-muted); width: 3em; }
  .vb-rank.top { color: var(--vibings-battles-accent); font-weight: 700; }
  .vb-pager { display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 12px; }
  .vb-modal-top { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
  .vb-modal-img { width: 160px; max-height: 220px; border-radius: 8px; background: #000; }

  /* Stats */
  .vb-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .vb-statcard {
    border: 1px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius);
    background: var(--vibings-battles-surface); padding: 12px 14px; min-width: 0;
  }
  .vb-statcard .vb-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vibings-battles-muted); }
  .vb-statcard .vb-value { font-size: 1.5rem; font-weight: 700; margin-top: 2px; }
  .vb-statcard .vb-note { font-size: 0.8rem; color: var(--vibings-battles-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vb-section { margin-bottom: 28px; }
  .vb-section h3 { font-size: 1.05rem; margin-bottom: 10px; }
  .vb-chart { width: 100%; height: 160px; display: block; }
  .vb-chart .vb-bar { fill: var(--vibings-battles-accent); }
  .vb-chart .vb-bar-skip { fill: var(--vibings-battles-draw); opacity: 0.5; }
  .vb-chart text { fill: var(--vibings-battles-muted); font-size: 10px; }

  /* Settings */
  .vb-form { max-width: 820px; }
  .vb-form fieldset { border: 1px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius); padding: 14px 18px; margin-bottom: 18px; }
  .vb-form legend { font-size: 1rem; font-weight: 600; width: auto; padding: 0 6px; margin: 0; }
  .vb-field { display: grid; grid-template-columns: 200px 140px 1fr; gap: 6px 14px; align-items: center; margin: 10px 0; }
  .vb-field .vb-help { font-size: 0.8rem; color: var(--vibings-battles-muted); }
  .vb-danger { border-color: var(--vibings-battles-loss) !important; }
  .vb-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 10px 0; }

  /* Version + status */
  .vb-side-footer {
    display: flex; align-items: center; gap: 8px; margin-top: auto; padding: 6px; border: none; background: none;
    color: var(--vibings-battles-muted); font-size: 0.78rem; text-align: left; border-radius: 8px;
  }
  .vb-side-footer:hover { background: var(--vibings-battles-surface-hover); }
  .vb-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: var(--vibings-battles-draw); flex-shrink: 0; vertical-align: middle; }
  .vb-dot-ok, .vb-dot-info { background: var(--vibings-battles-win); }
  .vb-dot-warn { background: var(--vibings-battles-accent); }
  .vb-dot-error { background: var(--vibings-battles-loss); }
  .vb-dot-pending { opacity: 0.5; }
  .vb-state-ok { color: var(--vibings-battles-win); }
  .vb-state-info { color: var(--vibings-battles-muted); }
  .vb-state-warn { color: var(--vibings-battles-accent); }
  .vb-state-error { color: var(--vibings-battles-loss); }
  .vb-version { font-weight: normal; font-size: 0.85rem; margin-left: 6px; }
  .vb-checks td { white-space: normal; vertical-align: top; }
  .vb-check-label, .vb-check-state { white-space: nowrap !important; font-weight: 600; }
  .vb-check-detail { color: var(--vibings-battles-muted); width: 100%; }

  /* Inside Stash's Settings → Tools card */
  .vb-tools { padding: 0 4px; }
  .vb-tools .vb-form { max-width: none; }

  /* Tablet and phone: the side panel becomes a top bar */
  @media (max-width: 991.98px) {
    .vb-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 8px 10px 24px; }
    .vb-side { position: static; max-height: none; overflow: visible; gap: 10px; padding: 8px; }
    .vb-side-title, .vb-side-heading, .vb-shortcuts, .vb-side-footer { display: none; }
    .vb-views { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
    .vb-view { flex-direction: column; gap: 2px; padding: 6px 4px; font-size: 0.75rem; text-align: center; }
    .vb-catlist {
      flex-direction: row; gap: 6px; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch;
    }
    .vb-catlist::-webkit-scrollbar { display: none; }
    .vb-catitem {
      flex: 0 0 auto; width: auto; gap: 6px; padding: 4px 12px; border-radius: 999px;
      border: 1px solid var(--vibings-battles-border); white-space: nowrap;
    }
    .vb-catitem.active { border-color: var(--vibings-battles-accent); }
    .vb-field { grid-template-columns: minmax(0, 1fr); }
  }

  /* Phone */
  @media (max-width: 640px) {
    /* Both cards, the top bar and the action bar fit on one screen. */
    :root {
      --vibings-battles-media-height: max(130px, calc((100vh - 400px) / 2));
      --vibings-battles-media-height: max(130px, calc((100svh - 400px) / 2));
      --vibings-battles-thumb-size: 36px;
    }
    .vb-side { padding: 6px; gap: 8px; }
    .vb-view { padding: 4px 2px; }
    .vb-side .vb-sync { display: none; } /* also in Settings */
    .vb-main-head { margin-bottom: 8px; }
    .vb-main-head h2 { font-size: 1.15rem; }
    .vb-main-head .vb-muted { font-size: 0.85rem; }
    .vb-arena { grid-template-columns: minmax(0, 1fr); gap: 10px; }
    .vb-card:hover:not(:disabled) { transform: none; }
    .vb-info { padding: 6px 10px 8px; gap: 2px; }
    .vb-title { font-size: 0.95rem; }
    .vb-sub { display: none; }
    .vb-delta { font-size: 1.3rem; padding: 6px; }
    .vb-actions {
      position: sticky; bottom: 0; z-index: 5; flex-wrap: nowrap; gap: 6px; margin: 10px -10px 0; padding: 8px 10px;
      background: var(--vibings-battles-bar-bg); backdrop-filter: blur(8px); border-top: 1px solid var(--vibings-battles-border);
    }
    .vb-actions .btn { flex: 1; padding: 10px 0; }
    .vb-actions kbd, .vb-btn-label { display: none; }
    .vb-hide-sm { display: none; }
    .vb-table th, .vb-table td { padding: 6px; }
    .vb-table .vb-name { max-width: 34vw; }
    .vb-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .vb-modal-img { width: 100%; max-height: 40vh; }
    .vb-checks tr { display: grid; grid-template-columns: auto auto 1fr; }
    .vb-checks .vb-check-detail { grid-column: 1 / -1; padding-top: 0; }
  }
  /* Stash moves its navbar to the bottom on portrait phones */
  @media (max-width: 575.98px) and (orientation: portrait) {
    .vb-actions { bottom: var(--vibings-battles-nav-height); }
  }
  /* Touch devices have no keyboard shortcuts */
  @media (hover: none) {
    .vb-actions kbd, .vb-shortcuts { display: none; }
  }
`;

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
