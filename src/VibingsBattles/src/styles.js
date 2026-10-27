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
  .vb-key, .vb-badge {
    position: absolute; z-index: 1; padding: 2px 8px; border-radius: 6px;
    background: rgba(0, 0, 0, 0.65); font-size: 0.8rem; color: #fff;
  }
  .vb-key { top: 10px; left: 10px; }
  .vb-card-tools { position: absolute; z-index: 3; top: 10px; right: 10px; display: flex; gap: 6px; }
  .vb-tool {
    padding: 4px 8px; border-radius: 6px; background: rgba(0, 0, 0, 0.65); color: #fff; font-size: 0.8rem; cursor: pointer; line-height: 1.2;
  }
  .vb-tool:hover { color: var(--vibings-battles-accent); }
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

  /* Battle animations. The VS badge sits between the cards. */
  .vb-arena { position: relative; }
  /* Entry animations slide cards sideways; never let that widen the page. */
  .vb-battle { overflow-x: clip; }
  .vb-vs {
    position: absolute; z-index: 4; left: 50%; top: calc(var(--vibings-battles-media-height) / 2); transform: translate(-50%, -50%);
    width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; pointer-events: none;
    font-weight: 900; font-style: italic; letter-spacing: -0.04em; color: #fff;
    background: radial-gradient(circle at 35% 30%, #ffcf6b, var(--vibings-battles-accent) 55%, #b4670a);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.55), 0 6px 18px rgba(0, 0, 0, 0.5);
  }
  .vb-anim-epic .vb-vs { animation: vb-vs-in 0.45s cubic-bezier(0.2, 1.8, 0.4, 1) both; }
  .vb-clash-a .vb-vs, .vb-clash-b .vb-vs, .vb-clash-draw .vb-vs { animation: vb-vs-clash 0.5s ease-out both; }
  .vb-clash-skip .vb-vs { opacity: 0; transition: opacity 0.15s; }
  @keyframes vb-vs-in { from { transform: translate(-50%, -50%) scale(0) rotate(-90deg); } to { transform: translate(-50%, -50%) scale(1) rotate(0); } }
  @keyframes vb-vs-clash {
    0% { transform: translate(-50%, -50%) scale(1); }
    35% { transform: translate(-50%, -50%) scale(1.6); box-shadow: 0 0 0 3px rgba(0,0,0,.55), 0 0 40px 14px rgba(245,166,35,.8); }
    100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.85; }
  }

  .vb-anim-epic .vb-card.vb-side-a { animation: vb-enter-a 0.4s cubic-bezier(0.2, 1, 0.3, 1) both; }
  .vb-anim-epic .vb-card.vb-side-b { animation: vb-enter-b 0.4s cubic-bezier(0.2, 1, 0.3, 1) both; }
  .vb-anim-subtle .vb-card { animation: vb-fade-in 0.25s ease-out both; }
  @keyframes vb-enter-a { from { opacity: 0; transform: translateX(-40px) rotate(-1.5deg); } to { opacity: 1; transform: none; } }
  @keyframes vb-enter-b { from { opacity: 0; transform: translateX(40px) rotate(1.5deg); } to { opacity: 1; transform: none; } }
  @keyframes vb-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes vb-enter-top { from { opacity: 0; transform: translateY(-24px); } to { opacity: 1; transform: none; } }
  @keyframes vb-enter-bottom { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }

  .vb-anim-subtle .vb-card.win, .vb-anim-epic .vb-card.win {
    animation: vb-win-pop 0.55s cubic-bezier(0.2, 1.6, 0.4, 1) both; z-index: 2;
    box-shadow: 0 0 0 1px var(--vibings-battles-win), 0 0 34px rgba(63, 185, 80, 0.45);
  }
  /* Only the picture and text fade, so the red K.O. effects keep their colour. */
  .vb-anim-subtle .vb-card.loss, .vb-anim-epic .vb-card.loss { opacity: 1; }
  .vb-anim-subtle .vb-card.loss :is(.vb-media img, .vb-media video, .vb-info),
  .vb-anim-epic .vb-card.loss :is(.vb-media img, .vb-media video, .vb-info) { filter: grayscale(0.85) brightness(0.6); transition: filter 0.4s; }
  .vb-anim-epic .vb-card.loss { animation: vb-shake 0.45s ease-out both; }
  .vb-anim-epic .vb-card.draw { animation: vb-draw-pulse 0.6s ease-out both; }
  .vb-anim-subtle .vb-card.skip, .vb-anim-epic .vb-card.skip { animation: vb-skip 0.22s ease-in forwards; }
  .vb-anim-subtle .vb-delta, .vb-anim-epic .vb-delta { animation: vb-delta-rise 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
  @keyframes vb-win-pop { 0% { transform: scale(1); } 45% { transform: scale(1.04) rotate(-0.4deg); } 100% { transform: scale(1.02); } }
  @keyframes vb-shake {
    0%, 100% { transform: translateX(0); } 15% { transform: translateX(-9px) rotate(-0.6deg); } 30% { transform: translateX(8px) rotate(0.5deg); }
    45% { transform: translateX(-6px); } 60% { transform: translateX(4px); } 75% { transform: translateX(-2px); }
  }
  @keyframes vb-draw-pulse { 0%, 100% { transform: scale(1); } 40% { transform: scale(0.97); box-shadow: 0 0 30px rgba(139, 148, 158, 0.5); } }
  @keyframes vb-skip { to { opacity: 0; transform: translateY(16px) scale(0.97); } }
  @keyframes vb-delta-rise { from { opacity: 0; transform: translateY(24px) scale(0.6); } to { opacity: 1; transform: none; } }

  .vb-fx { position: absolute; inset: 0; z-index: 2; pointer-events: none; overflow: hidden; }
  .vb-stamp {
    position: absolute; left: 50%; top: 42%; padding: 4px 18px; border: 4px solid currentColor; border-radius: 10px;
    font-size: clamp(1.4rem, 4vw, 2.6rem); font-weight: 900; letter-spacing: 0.08em; white-space: nowrap;
    background: rgba(0, 0, 0, 0.35); text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
    animation: vb-stamp 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) 0.08s both;
  }
  .vb-fx-win .vb-stamp { color: var(--vibings-battles-win); --stamp-rot: -8deg; }
  .vb-fx-loss .vb-stamp { color: var(--vibings-battles-loss); --stamp-rot: 7deg; }
  .vb-fx-draw .vb-stamp { color: #d0d7de; --stamp-rot: -4deg; }
  @keyframes vb-stamp {
    from { opacity: 0; transform: translate(-50%, -50%) scale(2.6) rotate(var(--stamp-rot)); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(var(--stamp-rot)); }
  }
  .vb-crown {
    position: absolute; left: 50%; top: 14%; font-size: 2.6rem; color: #ffd24a;
    filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.7)); animation: vb-crown 0.6s cubic-bezier(0.2, 1.5, 0.4, 1) both;
  }
  @keyframes vb-crown { from { opacity: 0; transform: translate(-50%, -120px) rotate(-25deg); } to { opacity: 1; transform: translate(-50%, 0) rotate(0); } }
  .vb-shine {
    position: absolute; inset: -20% -60%;
    background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.35) 50%, transparent 60%);
    animation: vb-shine 0.9s ease-out 0.1s both;
  }
  @keyframes vb-shine { from { transform: translateX(-60%); } to { transform: translateX(60%); } }
  /* Two red strokes drawn across the loser: an X */
  .vb-slash::before, .vb-slash::after {
    content: ""; position: absolute; left: 12%; right: 12%; top: 50%; height: 5px; margin-top: -2px; border-radius: 3px;
    background: var(--vibings-battles-loss); box-shadow: 0 0 14px var(--vibings-battles-loss);
  }
  .vb-slash::before { --slash-rot: -32deg; animation: vb-slash 0.22s ease-out both; }
  .vb-slash::after { --slash-rot: 32deg; animation: vb-slash 0.22s ease-out 0.14s both; }
  @keyframes vb-slash { from { transform: rotate(var(--slash-rot)) scaleX(0); } to { transform: rotate(var(--slash-rot)) scaleX(1); } }
  .vb-particles { position: absolute; left: 50%; top: 45%; }
  .vb-particles i {
    position: absolute; width: 9px; height: 14px; border-radius: 2px; opacity: 0;
    background: hsl(calc(38 + var(--hue) * 85), 90%, 60%);
    animation: vb-burst 1s cubic-bezier(0.15, 0.8, 0.3, 1) var(--delay) forwards;
  }
  @keyframes vb-burst {
    0% { opacity: 1; transform: translate(0, 0) rotate(0) scale(0.4); }
    80% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--dx), calc(var(--dy) + 60px)) rotate(var(--rot)) scale(1); }
  }
  .vb-next { min-width: 160px; }

  /* Performance switches (Settings → Performance) */
  .vb-perf-noblur .vb-media-bg { display: none; }
  .vb-perf-noblur .vb-media { background: #0b0d10; }
  .vb-perf-nofx .vb-particles, .vb-perf-nofx .vb-shine, .vb-perf-nofx .vb-stage-confetti, .vb-perf-nofx .vb-stage-floor { display: none; }
  @media (prefers-reduced-motion: reduce) {
    .vb-battle *, .vb-arena-view * { animation-duration: 0.01ms !important; animation-delay: 0s !important; transition: none !important; }
  }

  /* Arena (auto battler) */
  .vb-head-link { margin-left: auto; padding: 0; color: var(--vibings-battles-muted); }
  .vb-lineup { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
  .vb-lineup-card {
    display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 8px; min-width: 0; text-align: center;
    border: 1px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius); background: var(--vibings-battles-surface);
  }
  .vb-lineup-card .vb-avatar { width: 88px; height: 88px; }
  .vb-lineup-name { font-weight: 600; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vb-lineup-elo { font-size: 0.8rem; }
  .vb-avatar {
    position: relative; border-radius: 50%; overflow: hidden; background: #111; flex-shrink: 0;
    box-shadow: 0 0 0 3px var(--vibings-battles-border);
  }
  .vb-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }
  .vb-avatar-empty { width: 100%; height: 100%; display: grid; place-items: center; font-size: 1.6rem; font-weight: 700; color: var(--vibings-battles-muted); }
  .vb-arena-actions { justify-content: center; }
  .vb-arena-fight { display: grid; grid-template-columns: minmax(0, 1fr) 320px; grid-template-rows: auto 1fr; gap: 14px; align-items: start; }
  .vb-arena-fight .vb-stage { grid-column: 1; grid-row: 1 / span 2; }
  .vb-arena-controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .vb-stage {
    position: relative; height: min(70vh, 720px); min-height: 320px; overflow: hidden; user-select: none;
    border: 1px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius);
    background: radial-gradient(ellipse at 50% 55%, rgba(245, 166, 35, 0.10), transparent 60%), #0c0f13;
  }
  .vb-stage-floor {
    position: absolute; left: 50%; top: 50%; width: 70%; height: 55%; transform: translate(-50%, -50%); border-radius: 50%;
    border: 2px dashed rgba(245, 166, 35, 0.18); box-shadow: inset 0 0 80px rgba(245, 166, 35, 0.06);
  }
  .vb-stage-fx { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
  .vb-trail {
    stroke: var(--vibings-battles-accent); stroke-width: 3; stroke-linecap: round; stroke-dasharray: 1000; stroke-dashoffset: 1000;
    filter: drop-shadow(0 0 6px var(--vibings-battles-accent)); animation: vb-trail ease-out forwards;
  }
  .vb-trail.crit { stroke: #ffe066; stroke-width: 6; }
  @keyframes vb-trail { 0% { stroke-dashoffset: 1000; opacity: 1; } 55% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
  .vb-fighter {
    position: absolute; z-index: 2; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 4px;
    transition: left 0.8s cubic-bezier(0.3, 1.2, 0.4, 1), top 0.8s cubic-bezier(0.3, 1.2, 0.4, 1), opacity 0.5s, filter 0.5s;
  }
  .vb-fighter.active { z-index: 4; }
  .vb-fighter-body { position: relative; width: var(--fsize); height: var(--fsize); }
  .vb-fighter .vb-avatar { width: 100%; height: 100%; }
  .vb-fighter.active .vb-avatar { box-shadow: 0 0 0 3px var(--vibings-battles-accent), 0 0 18px rgba(245, 166, 35, 0.5); }
  .vb-fighter.out { opacity: 0.38; filter: grayscale(1); z-index: 1; }
  .vb-fighter.out .vb-fighter-body { animation: vb-ko 0.6s ease-in both; }
  @keyframes vb-ko { 0% { transform: rotate(0) scale(1); } 40% { transform: rotate(-18deg) scale(1.1); } 100% { transform: rotate(8deg) scale(0.82); } }
  .vb-place {
    position: absolute; left: 50%; bottom: -4px; transform: translateX(-50%); padding: 1px 8px; border-radius: 999px; white-space: nowrap;
    background: rgba(0, 0, 0, 0.8); color: #fff; font-size: 0.72rem; font-weight: 700;
  }
  .vb-hp { width: 100%; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
  .vb-hp-fill { height: 100%; background: var(--vibings-battles-win); transition: width 0.3s ease-out, background 0.3s; }
  .vb-hp-fill.mid { background: var(--vibings-battles-accent); }
  .vb-hp-fill.low { background: var(--vibings-battles-loss); }
  .vb-fighter-name { max-width: calc(var(--fsize) * 1.5); font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 3px #000; }
  .vb-fighter.winner { z-index: 5; opacity: 1; filter: none; }
  .vb-fighter.winner .vb-fighter-body { animation: vb-winner 0.9s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
  .vb-fighter.winner .vb-avatar { box-shadow: 0 0 0 4px #ffd24a, 0 0 50px rgba(255, 210, 74, 0.6); }
  .vb-fighter.winner .vb-fighter-name { font-size: 1rem; font-weight: 700; max-width: none; }
  .vb-fighter.winner .vb-hp { margin-top: calc(var(--fsize) * 0.26); }
  @keyframes vb-winner { from { transform: scale(1); } to { transform: scale(1.45); } }
  .vb-fighter-crown {
    position: absolute; left: 50%; top: -42%; z-index: 1; font-size: calc(var(--fsize) * 0.38); color: #ffd24a;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.7)); animation: vb-crown 0.7s cubic-bezier(0.2, 1.5, 0.4, 1) 0.4s both;
  }
  .vb-stage-done::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle at 50% 50%, rgba(255, 210, 74, 0.22), transparent 45%); animation: vb-fade-in 0.8s both;
  }
  .vb-float {
    position: absolute; z-index: 6; transform: translate(-50%, 0); pointer-events: none; font-weight: 900; font-size: 1.1rem;
    color: #fff; text-shadow: 0 2px 4px #000, 0 0 8px rgba(0, 0, 0, 0.8); animation: vb-float 0.9s ease-out forwards;
  }
  .vb-float.crit { color: #ffe066; font-size: 1.5rem; }
  .vb-float.miss { color: var(--vibings-battles-muted); font-size: 0.9rem; }
  .vb-float.ko { color: var(--vibings-battles-loss); font-size: 1.6rem; animation-duration: 1.3s; }
  @keyframes vb-float {
    0% { opacity: 0; transform: translate(-50%, 10px) scale(0.6); } 20% { opacity: 1; transform: translate(-50%, -6px) scale(1.15); }
    100% { opacity: 0; transform: translate(-50%, -46px) scale(1); }
  }
  .vb-stage-confetti { position: absolute; left: 50%; top: 45%; z-index: 4; pointer-events: none; }
  .vb-stage-confetti i {
    position: absolute; width: 8px; height: 13px; border-radius: 2px; opacity: 0;
    background: hsl(calc(var(--i) * 47), 85%, 60%);
    --a: calc(var(--i) * 10deg);
    animation: vb-confetti 1.6s cubic-bezier(0.15, 0.8, 0.3, 1) calc(var(--i) * 12ms) forwards;
  }
  @keyframes vb-confetti {
    0% { opacity: 1; transform: rotate(var(--a)) translateY(0) rotate(0); }
    85% { opacity: 1; }
    100% { opacity: 0; transform: rotate(var(--a)) translateY(-260px) rotate(540deg); }
  }
  .vb-feed { list-style: none; margin: 0; padding: 10px 12px; font-size: 0.85rem; min-height: 9em;
    border: 1px solid var(--vibings-battles-border); border-radius: var(--vibings-battles-radius); background: var(--vibings-battles-surface); }
  .vb-feed li { padding: 3px 0; color: var(--vibings-battles-muted); animation: vb-fade-in 0.25s both; }
  .vb-feed li:first-child { color: inherit; font-weight: 600; }
  .vb-feed .vb-feed-ko { color: var(--vibings-battles-loss); }
  .vb-feed .crit { color: #ffe066; }
  .vb-results { grid-column: 2; min-width: 0; }
  .vb-results .vb-table th, .vb-results .vb-table td { padding: 5px 6px; }
  .vb-results .vb-name { max-width: 130px; }
  .vb-podium { display: flex; align-items: flex-end; justify-content: center; gap: 8px; margin-bottom: 14px; }
  .vb-podium-spot { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 33%; min-width: 0; text-align: center; position: relative; }
  .vb-podium-spot .vb-avatar { width: 64px; height: 64px; }
  .vb-p1 .vb-avatar { width: 80px; height: 80px; box-shadow: 0 0 0 3px #ffd24a; }
  .vb-podium-crown { color: #ffd24a; font-size: 1.4rem; }
  .vb-podium-block { width: 100%; border-radius: 8px 8px 0 0; font-weight: 800; padding-top: 6px; background: var(--vibings-battles-surface-hover); }
  .vb-p1 .vb-podium-block { height: 70px; background: rgba(255, 210, 74, 0.22); }
  .vb-p2 .vb-podium-block { height: 50px; }
  .vb-p3 .vb-podium-block { height: 36px; }

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
  .vb-help { font-size: 0.8rem; color: var(--vibings-battles-muted); }
  .vb-filters > .vb-help { display: block; }
  .vb-danger { border-color: var(--vibings-battles-loss) !important; }
  .vb-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 10px 0; }

  .vb-settings-nav {
    position: sticky; top: var(--vibings-battles-nav-height); z-index: 6; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none;
    padding: 8px 0; margin-bottom: 8px; background: var(--vibings-battles-bar-bg); backdrop-filter: blur(6px);
  }
  .vb-settings-nav::-webkit-scrollbar { display: none; }
  .vb-settings-nav button {
    flex: 0 0 auto; padding: 3px 12px; border-radius: 999px; border: 1px solid var(--vibings-battles-border);
    background: none; color: var(--vibings-battles-muted); font-size: 0.85rem;
  }
  .vb-settings-nav button:hover { color: inherit; border-color: var(--vibings-battles-accent); }
  .vb-form fieldset, .vb-form > div[id] { scroll-margin-top: calc(var(--vibings-battles-nav-height) + 56px); }
  .vb-savebar { position: sticky; bottom: 0; z-index: 5; padding: 10px 0; margin: 0 0 10px; background: var(--vibings-battles-bar-bg); backdrop-filter: blur(6px); }
  .vb-filter-search { margin-top: 12px; }
  .vb-search-results { margin-top: 6px; max-height: 330px; overflow-y: auto; border: 1px solid var(--vibings-battles-border); border-radius: 8px; }
  .vb-search-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-bottom: 1px solid var(--vibings-battles-border); }
  .vb-search-row:last-child { border-bottom: none; }
  .vb-search-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vb-filter-lists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 14px; }
  .vb-filter-lists .vb-side-heading { margin-left: 0; }
  .vb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .vb-chip {
    display: inline-flex; align-items: center; gap: 4px; max-width: 100%; padding: 2px 4px 2px 10px; border-radius: 999px;
    border: 1px solid var(--vibings-battles-border); background: var(--vibings-battles-surface); font-size: 0.85rem;
  }
  .vb-chip a { color: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vb-chip button { border: none; background: none; color: var(--vibings-battles-muted); padding: 0 4px; }
  .vb-chip button:hover { color: var(--vibings-battles-loss); }
  .vb-dbinfo { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: 0.9rem; color: var(--vibings-battles-muted); margin: 4px 0 10px; }
  .vb-dbinfo b { color: var(--bs-body-color, #fff); }

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
    .vb-views { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
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
    .vb-arena-fight { grid-template-columns: minmax(0, 1fr); }
    .vb-arena-fight .vb-stage { grid-row: auto; }
    .vb-results { grid-column: 1; }
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
    .vb-vs { display: none; } /* would cover the card text when the cards are stacked */
    .vb-anim-epic .vb-card.vb-side-a { animation-name: vb-enter-top; }
    .vb-anim-epic .vb-card.vb-side-b { animation-name: vb-enter-bottom; }
    .vb-stamp { border-width: 3px; padding: 2px 12px; }
    .vb-crown { font-size: 1.8rem; top: 8%; }
    .vb-stage { height: min(118vw, 66svh); min-height: 300px; }
    .vb-lineup { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .vb-lineup-card { padding: 10px 4px; }
    .vb-lineup-card .vb-avatar { width: 60px; height: 60px; }
    .vb-lineup-name { font-size: 0.85rem; }
    .vb-feed { min-height: 0; max-height: 7.5em; overflow: hidden; }
    .vb-head-link { margin-left: 0; }
    .vb-filter-lists { grid-template-columns: minmax(0, 1fr); }

    .vb-checks .vb-check-detail { grid-column: 1 / -1; padding-top: 0; }
  }
  /* Stash moves its navbar to the bottom on portrait phones */
  @media (max-width: 575.98px) and (orientation: portrait) {
    .vb-actions, .vb-savebar { bottom: var(--vibings-battles-nav-height); }
    .vb-settings-nav { top: 0; }
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
