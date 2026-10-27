// Shared "Vibings Overhaul" section for Stash's Settings → Tools page.
//
// Every Vibings plugin bundles this module and calls registerToolsPanel().
// The registry lives on window, so whichever plugin loads first installs
// the Stash patch and all plugins show up in the same section, each in its
// own collapsible panel.
//
// Stash only exposes the inside of each Tools card ("SettingsToolsSection")
// as a patch point. We add an invisible anchor there; the anchor in the
// last Tools card inserts an empty container after its section and renders
// our section into it with a React portal. No Stash element is moved.

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const ReactDOM = PluginApi.ReactDOM;
const { Card, Button, Badge } = PluginApi.libraries.Bootstrap;
const { Link } = PluginApi.libraries.ReactRouterDOM;

const REGISTRY_API = 1;
const CONTAINER_ID = "vibings-overhaul-tools";
const OPEN_KEY = "vibings-overhaul-tools-open";

function getRegistry() {
  if (!window.VibingsOverhaul) {
    window.VibingsOverhaul = { api: REGISTRY_API, panels: [], listeners: new Set(), toolsPatched: false };
  }
  return window.VibingsOverhaul;
}

/**
 * Register a plugin panel.
 * panel = { id, title, version, href?, order?, Component }
 * Component renders the plugin's settings; it is mounted only while expanded.
 */
export function registerToolsPanel(panel) {
  const reg = getRegistry();
  reg.panels = [...reg.panels.filter((p) => p.id !== panel.id), panel].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title)
  );
  reg.listeners.forEach((fn) => fn());
  if (!reg.toolsPatched) {
    reg.toolsPatched = true;
    PluginApi.patch.after("SettingsToolsSection", (...args) => {
      const result = args[args.length - 1];
      return [result, <ToolsAnchor key="vibings-overhaul-anchor" />];
    });
  }
}

function usePanels() {
  const reg = getRegistry();
  const [, force] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    reg.listeners.add(force);
    return () => reg.listeners.delete(force);
  }, []);
  return reg.panels;
}

function loadOpen() {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || {}; } catch { return {}; }
}
function saveOpen(open) {
  try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch { /* storage unavailable */ }
}

// Rendered inside every Tools card; only the one in the last card acts.
function ToolsAnchor() {
  const ref = React.useRef(null);
  const [container, setContainer] = React.useState(null);

  React.useLayoutEffect(() => {
    const section = ref.current?.closest(".setting-section");
    if (!section || document.getElementById(CONTAINER_ID)) return undefined;
    let next = section.nextElementSibling;
    while (next && !next.classList.contains("setting-section")) next = next.nextElementSibling;
    if (next) return undefined; // not the last Tools section
    const el = document.createElement("div");
    el.id = CONTAINER_ID;
    section.after(el);
    setContainer(el);
    return () => el.remove();
  }, []);

  return (
    <>
      <span ref={ref} hidden />
      {container && ReactDOM.createPortal(<OverhaulSection />, container)}
    </>
  );
}

function OverhaulSection() {
  const panels = usePanels();
  const [open, setOpen] = React.useState(loadOpen);
  const toggle = (id) => setOpen((o) => {
    const next = { ...o, [id]: !o[id] };
    saveOpen(next);
    return next;
  });

  return (
    <div className="setting-section" id="vibings-overhaul">
      <h1>Vibings Overhaul</h1>
      <Card>
        {panels.map((p) => (
          <div key={p.id} className="vibings-tools-panel">
            <div className="setting">
              <div>
                <h3>
                  {p.title} <Badge variant="secondary">v{p.version}</Badge>
                </h3>
                {p.description && <div className="sub-heading">{p.description}</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {p.href && <Link className="btn btn-secondary btn-sm" to={p.href}>Open</Link>}
                <Button variant="secondary" size="sm" onClick={() => toggle(p.id)} aria-expanded={!!open[p.id]}>
                  {open[p.id] ? "Hide settings" : "Settings"}
                </Button>
              </div>
            </div>
            {open[p.id] && (
              <div className="vibings-tools-body" style={{ padding: "4px 0 16px" }}>
                <p.Component />
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
