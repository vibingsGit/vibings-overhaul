// Scene card for the rows under the player: hovering plays the scene's
// preview and moving the pointer sideways scrubs it; right click / long
// press opens Play next, Add to up next, … The bar at the bottom shows how
// far the scene was watched (full and dim when it has been played).

import { fmtTime, sceneTitle } from "./format.js";
import { Icons } from "./icons.jsx";
import { useContextMenu } from "./ContextMenu.jsx";
import { playNext, addToQueue, removeFromQueue, sceneUrl } from "./queue.js";
import { copy } from "./store.js";
import { useSettings } from "./settings.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Link } = PluginApi.libraries.ReactRouterDOM;

export const CARD_FIELDS = "id title o_counter play_count rating100 resume_time paths { screenshot preview } performers { id name } studio { id name } tags { id name } files { path duration }";

export function SceneCard({ scene, badge, inUpNext, current }) {
  const settings = useSettings();
  const [hover, setHover] = React.useState(false);
  const [scrub, setScrub] = React.useState(null); // 0–1 while the pointer moves over the picture
  const timer = React.useRef(null);
  const previewRef = React.useRef(null);
  const ctx = useContextMenu();
  const d = scene.files?.[0]?.duration || 0;
  const resumed = d > 0 && scene.resume_time > 0 ? Math.min(100, (scene.resume_time / d) * 100) : 0;
  const played = scene.play_count > 0;
  const onThumbMove = (e) => {
    const v = previewRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setScrub(x);
    v.currentTime = x * v.duration;
  };

  const items = () => [
    { label: "Play next", icon: <Icons.Next />, onClick: () => playNext(scene.id) },
    { label: "Add to up next", icon: <Icons.Queue />, onClick: () => addToQueue(scene.id) },
    inUpNext && { label: "Remove from up next", icon: <Icons.Trash />, danger: true, onClick: () => removeFromQueue(scene.id) },
    { separator: true },
    { label: "Open in a new tab", icon: <Icons.External />, onClick: () => window.open("/scenes/" + scene.id, "_blank", "noopener") },
    { label: "Copy link", icon: <Icons.Link />, onClick: () => copy(location.origin + "/scenes/" + scene.id) },
  ];

  return (
    <div className={"vbs-card" + (current ? " vbs-card-current" : "")}
      onMouseEnter={() => { timer.current = setTimeout(() => setHover(true), 350); }}
      onMouseLeave={() => { clearTimeout(timer.current); setHover(false); }}
      onContextMenu={(e) => ctx.open(e, items())} {...ctx.longPress(items)}>
      <Link to={sceneUrl(scene.id)} className="vbs-card-link" draggable={false}>
        <div className="vbs-card-thumb" onMouseMove={hover ? onThumbMove : undefined} onMouseLeave={() => setScrub(null)}>
          {scene.paths?.screenshot ? <img src={scene.paths.screenshot} alt="" loading="lazy" draggable={false} /> : <div className="vbs-card-empty" />}
          {hover && settings.cards.preview && scene.paths?.preview && <video ref={previewRef} src={scene.paths.preview} autoPlay muted loop playsInline />}
          {scrub != null && <span className="vbs-card-scrub" style={{ left: scrub * 100 + "%" }} />}
          {d > 0 && <span className="vbs-card-duration">{fmtTime(scrub != null ? scrub * d : d)}</span>}
          {badge && <span className="vbs-card-badge">{badge}</span>}
          <span className="vbs-card-stats">
            {played && <span title={scene.play_count + (scene.play_count === 1 ? " play" : " plays")}><Icons.Eye /> {scene.play_count}</span>}
            {scene.o_counter > 0 && <span className="vbs-card-o"><Icons.Drop /> {scene.o_counter}</span>}
          </span>
          {(resumed > 0 || played) && <span className={"vbs-card-progress" + (resumed > 0 ? "" : " vbs-card-done")} style={{ width: (resumed || 100) + "%" }} />}
        </div>
        <div className="vbs-card-title" title={sceneTitle(scene)}>{sceneTitle(scene)}</div>
        <div className="vbs-card-sub">{(scene.performers || []).map((p) => p.name).join(", ") || scene.studio?.name || " "}</div>
      </Link>
      <button type="button" className="vbs-card-more" aria-label="More" onClick={(e) => ctx.open(e, items())}>⋯</button>
      {ctx.element}
    </div>
  );
}

/** A horizontally scrolling row of cards with arrow buttons. */
export function CardRow({ children, empty }) {
  const ref = React.useRef(null);
  // The mouse wheel scrolls the row sideways; at either end it scrolls the page as usual.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY * 1.5 });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  const scroll = (dir) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  if (!React.Children.count(children)) return <div className="vbs-empty">{empty}</div>;
  return (
    <div className="vbs-row-wrap">
      <button type="button" className="vbs-row-arrow vbs-row-left" onClick={() => scroll(-1)} aria-label="Scroll left"><Icons.Back /></button>
      <div className="vbs-row" ref={ref}>{children}</div>
      <button type="button" className="vbs-row-arrow vbs-row-right" onClick={() => scroll(1)} aria-label="Scroll right"><Icons.Forward /></button>
    </div>
  );
}
