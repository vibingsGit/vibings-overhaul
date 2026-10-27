// All plugin CSS. Colours and sizes are :root variables so themes can
// override them without touching the rules.

const STYLE_ID = "vibings-battles-styles";

const CSS = `
  :root {
    --vibings-battles-accent: #f5a623;
    --vibings-battles-win: #3fb950;
    --vibings-battles-loss: #f85149;
    --vibings-battles-draw: #8b949e;
    --vibings-battles-surface: rgba(255, 255, 255, 0.04);
    --vibings-battles-surface-hover: rgba(255, 255, 255, 0.08);
    --vibings-battles-border: rgba(255, 255, 255, 0.12);
    --vibings-battles-muted: #9aa4af;
    --vibings-battles-radius: 12px;
    --vibings-battles-media-height: min(62vh, 640px);
    --vibings-battles-thumb-size: 44px;
    --vibings-battles-transition: 0.18s ease;
  }

  /* Page + tabs */
  .vb-page { padding: 16px 20px 40px; max-width: 1600px; margin: 0 auto; }
  .vb-header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin-bottom: 16px; }
  .vb-header h1 { margin: 0; font-size: 1.6rem; }
  .vb-spacer { flex: 1; }
  .vb-muted { color: var(--vibings-battles-muted); }
  .vb-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--vibings-battles-border); margin-bottom: 18px; overflow-x: auto; }
  .vb-tab {
    background: none; border: none; color: var(--vibings-battles-muted); padding: 8px 16px; cursor: pointer;
    border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap;
  }
  .vb-tab:hover { color: inherit; }
  .vb-tab.active { color: inherit; border-bottom-color: var(--vibings-battles-accent); font-weight: 600; }
  .vb-switch { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }

  /* Category pills */
  .vb-cats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
  .vb-cat {
    border: 1px solid var(--vibings-battles-border); background: var(--vibings-battles-surface);
    color: inherit; border-radius: 999px; padding: 6px 14px; cursor: pointer;
    transition: background var(--vibings-battles-transition), border-color var(--vibings-battles-transition);
  }
  .vb-cat:hover:not(:disabled) { background: var(--vibings-battles-surface-hover); }
  .vb-cat.active { border-color: var(--vibings-battles-accent); color: var(--vibings-battles-accent); }
  .vb-cat:disabled { opacity: 0.4; cursor: default; }
  .vb-cat .vb-count { margin-left: 6px; font-size: 0.8em; color: var(--vibings-battles-muted); }

  /* Battle */
  .vb-arena { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 760px) { .vb-arena { grid-template-columns: 1fr; } }
  .vb-card {
    position: relative; display: flex; flex-direction: column; text-align: left;
    border: 2px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius);
    background: var(--vibings-battles-surface); color: inherit; overflow: hidden; padding: 0;
    cursor: pointer; transition: border-color var(--vibings-battles-transition), transform var(--vibings-battles-transition), opacity var(--vibings-battles-transition);
  }
  .vb-card:hover:not(:disabled) { border-color: var(--vibings-battles-accent); transform: translateY(-2px); }
  .vb-card:disabled { cursor: default; }
  .vb-card.win { border-color: var(--vibings-battles-win); }
  .vb-card.loss { border-color: var(--vibings-battles-loss); opacity: 0.55; }
  .vb-card.draw { border-color: var(--vibings-battles-draw); }
  .vb-media { position: relative; height: var(--vibings-battles-media-height); background: #000; }
  .vb-media img, .vb-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .vb-media.contain img { object-fit: contain; padding: 24px; }
  .vb-media.portrait img { object-position: top; }
  .vb-key, .vb-open {
    position: absolute; top: 10px; padding: 2px 8px; border-radius: 6px;
    background: rgba(0, 0, 0, 0.65); font-size: 0.8rem; color: #fff;
  }
  .vb-key { left: 10px; }
  .vb-open { right: 10px; padding: 4px 8px; }
  .vb-open:hover { color: var(--vibings-battles-accent); }
  .vb-delta {
    position: absolute; inset: auto 0 0 0; padding: 10px; text-align: center; font-size: 1.6rem; font-weight: 700;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8)); color: #fff;
  }
  .vb-up { color: var(--vibings-battles-win); }
  .vb-down { color: var(--vibings-battles-loss); }
  .vb-info { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .vb-title { font-weight: 600; font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vb-sub { font-size: 0.85rem; color: var(--vibings-battles-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 1.2em; }
  .vb-stats { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.85rem; color: var(--vibings-battles-muted); }
  .vb-stats b { color: inherit; font-weight: 600; }
  .vb-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 16px; }
  .vb-actions .btn { display: inline-flex; align-items: center; gap: 8px; }
  .vb-actions kbd { font-size: 0.75em; opacity: 0.8; }
  .vb-status { text-align: center; padding: 60px 20px; }
  .vb-error { color: var(--vibings-battles-loss); }

  /* Leaderboard */
  .vb-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
  .vb-toolbar .form-control { width: auto; }
  .vb-table { width: 100%; border-collapse: collapse; }
  .vb-table th { font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vibings-battles-muted); }
  .vb-table th, .vb-table td { padding: 6px 10px; border-bottom: 1px solid var(--vibings-battles-border); text-align: left; white-space: nowrap; }
  .vb-table td.vb-num, .vb-table th.vb-num { text-align: right; font-variant-numeric: tabular-nums; }
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
  .vb-scroll { overflow-x: auto; }

  /* Stats */
  .vb-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .vb-statcard {
    border: 1px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius);
    background: var(--vibings-battles-surface); padding: 12px 14px;
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
  .vb-form { max-width: 760px; }
  .vb-form fieldset { border: 1px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius); padding: 14px 18px; margin-bottom: 18px; }
  .vb-form legend { font-size: 1rem; font-weight: 600; width: auto; padding: 0 6px; margin: 0; }
  .vb-field { display: grid; grid-template-columns: 220px 140px 1fr; gap: 6px 14px; align-items: center; margin: 10px 0; }
  @media (max-width: 760px) { .vb-field { grid-template-columns: 1fr; } }
  .vb-field .vb-help { font-size: 0.8rem; color: var(--vibings-battles-muted); }
  .vb-danger { border-color: var(--vibings-battles-loss) !important; }
  .vb-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 10px 0; }
`;

export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
