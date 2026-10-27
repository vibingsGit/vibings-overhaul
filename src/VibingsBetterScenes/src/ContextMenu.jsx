// A right-click / long-press menu. items: [{ label, icon, hint, onClick,
// disabled, danger } | { separator: true }]. Rendered into the fullscreen
// element when there is one, so it also works in fullscreen.

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const ReactDOM = PluginApi.ReactDOM;

export function useFullscreenRoot() {
  const [root, setRoot] = React.useState(() => document.fullscreenElement || document.body);
  React.useEffect(() => {
    const update = () => setRoot(document.fullscreenElement || document.body);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  return root;
}

export function ContextMenu({ x, y, items, onClose }) {
  const ref = React.useRef(null);
  const root = useFullscreenRoot();
  const [pos, setPos] = React.useState({ left: x, top: y });

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y]);

  React.useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === "Escape") onClose(); };
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", close, true);
      document.addEventListener("contextmenu", close, true);
    });
    document.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close, true);
      document.removeEventListener("contextmenu", close, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div ref={ref} className="vbs-menu vbs-context" style={pos} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.filter(Boolean).map((it, i) => it.separator ? <div key={i} className="vbs-menu-sep" /> : (
        <button key={i} type="button" role="menuitem" className={"vbs-menu-item" + (it.danger ? " vbs-danger" : "")}
          disabled={it.disabled} onClick={() => { onClose(); it.onClick?.(); }}>
          <span className="vbs-menu-icon">{it.icon}</span>
          <span className="vbs-menu-label">{it.label}</span>
          {it.hint && <kbd>{it.hint}</kbd>}
        </button>
      ))}
    </div>,
    root
  );
}

/** Opens a menu at the pointer; also on a long press on touch screens. */
export function useContextMenu() {
  const [menu, setMenu] = React.useState(null);
  const timer = React.useRef(null);
  const open = (e, items) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const longPress = (items) => ({
    onTouchStart: (e) => {
      const t = e.touches[0];
      timer.current = setTimeout(() => setMenu({ x: t.clientX, y: t.clientY, items: typeof items === "function" ? items() : items }), 550);
    },
    onTouchEnd: () => clearTimeout(timer.current),
    onTouchMove: () => clearTimeout(timer.current),
  });
  const element = menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />;
  return { open, longPress, element };
}
