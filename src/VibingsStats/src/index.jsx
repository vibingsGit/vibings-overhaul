// Vibings Stats — UI entry.
//
// Stash's /stats route cannot be patched, so the plugin has its own page at
// /vibings-stats and sends /stats there before Stash's page is drawn (the
// redirect lives in the navbar, which is mounted on every page, so it works
// whichever page you come from). Statistics load per dataset; every panel
// appears as soon as its data is ready, and the rest load in the background.

import { LOG, VERSION, cachedConfig, loadConfig } from "./api.js";
import { injectStyles } from "./styles.js";
import { registerDatasets, prefetchAll, useAllDatasets, refreshAll } from "./store.js";
import { DATASETS } from "./datasets.js";
import { registerToolsPanel } from "../../_shared/overhaul-tools.jsx";
import { Icon, RefreshButton, timeAgo } from "./ui.jsx";
import { Overview } from "./views/Overview.jsx";
import { Activity } from "./views/Activity.jsx";
import { Library } from "./views/Library.jsx";
import { People } from "./views/People.jsx";
import { Ratings } from "./views/Ratings.jsx";
import { Health } from "./views/Health.jsx";
import { Plugins } from "./views/Plugins.jsx";
import { Os } from "./views/Os.jsx";
import { Status, useStatus, StatusDot } from "./views/Status.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { useHistory, useLocation } = PluginApi.libraries.ReactRouterDOM;
const {
  faChartPie, faGauge, faFire, faDroplet, faPhotoFilm, faUsers, faStar, faHeartPulse, faPuzzlePiece, faGear,
} = PluginApi.libraries.FontAwesomeSolid;

const ROUTE = "/vibings-stats";

const VIEWS = [
  { id: "overview", label: "Overview", icon: faGauge, Component: Overview },
  { id: "activity", label: "Activity", icon: faFire, Component: Activity },
  { id: "os", label: "Os", icon: faDroplet, Component: Os },
  { id: "library", label: "Library", icon: faPhotoFilm, Component: Library },
  { id: "people", label: "People", icon: faUsers, Component: People },
  { id: "ratings", label: "Ratings", icon: faStar, Component: Ratings },
  { id: "health", label: "Health", icon: faHeartPulse, Component: Health },
  { id: "plugins", label: "Plugins", icon: faPuzzlePiece, Component: Plugins },
  { id: "status", label: "Status", icon: faGear, Component: Status },
];

function LoadState() {
  const list = useAllDatasets();
  const [busy, setBusy] = React.useState(false);
  const loading = list.filter((d) => d.loading).length;
  const oldest = list.filter((d) => d.updatedAt).reduce((m, d) => Math.min(m, d.updatedAt), Infinity);
  return (
    <div className="vs-side-load">
      <span>
        {loading ? `Loading ${list.length - loading}/${list.length}…` : oldest !== Infinity ? `Updated ${timeAgo(oldest)}` : ""}
      </span>
      <RefreshButton busy={busy || loading > 0} label="Refresh"
        onClick={async () => { setBusy(true); try { await refreshAll(); } finally { setBusy(false); } }} />
    </div>
  );
}

function StatsPage() {
  const history = useHistory();
  const location = useLocation();
  const { state: status } = useStatus();
  const params = new URLSearchParams(location.search);
  const view = VIEWS.find((v) => v.id === params.get("view")) || VIEWS[0];
  const setView = (id) => history.replace({ search: id === "overview" ? "" : `?view=${id}` });

  React.useEffect(() => {
    injectStyles();
    document.title = "Statistics | Stash";
    // The open view asks for its own data first; the rest follows quietly.
    const t = setTimeout(() => prefetchAll(), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="vs-layout">
      <aside className="vs-side">
        <div className="vs-side-title"><Icon icon={faChartPie} /> Stats</div>
        <nav className="vs-views" aria-label="Statistics views">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={`vs-view${v.id === view.id ? " active" : ""}`}
              aria-current={v.id === view.id ? "page" : undefined} onClick={() => setView(v.id)}>
              <Icon icon={v.icon} /> <span>{v.label}</span>
            </button>
          ))}
        </nav>
        <LoadState />
        <button type="button" className="vs-side-footer" onClick={() => setView("status")} title="Version and status">
          <StatusDot state={status} /> <span>Vibings Stats v{VERSION}</span>
        </button>
      </aside>
      <main className="vs-main">
        <div className="vs-head"><h2>{view.label}</h2></div>
        <view.Component />
      </main>
    </div>
  );
}

// ===========================================================================
// /stats -> /vibings-stats
// ===========================================================================

// Rendered inside the navbar on every page. useLayoutEffect runs before the
// browser paints, so Stash's own statistics page never flashes.
function StatsRedirect() {
  const location = useLocation();
  const history = useHistory();
  React.useLayoutEffect(() => {
    if (/^\/stats\/?$/.test(location.pathname) && !cachedConfig().keepNativeStatsPage) {
      history.replace({ pathname: ROUTE, search: location.search });
    }
  }, [location.pathname]);
  return null;
}

// ===========================================================================
// Stash Settings → Tools → Vibings Overhaul panel
// ===========================================================================

function StatsToolsPanel() {
  injectStyles();
  return <div className="vs-tools"><Status /></div>;
}

// stash-plugin-builder imports and calls the default export.
export default function main() {
  registerDatasets(DATASETS);
  PluginApi.register.route(ROUTE, StatsPage);
  PluginApi.patch.before("MainNavBar.MenuItems", (props) => [
    { ...props, children: [...React.Children.toArray(props.children), <StatsRedirect key="vibings-stats-redirect" />] },
  ]);
  registerToolsPanel({
    id: "vibings-stats",
    title: "Vibings Stats",
    version: VERSION,
    description: "A fast, detailed statistics page for your Stash library.",
    href: ROUTE,
    order: 20,
    Component: StatsToolsPanel,
  });
  // Keep the redirect setting in sync with the server (read synchronously later).
  loadConfig().catch((e) => console.warn(LOG, "could not read settings", e));
  console.log(LOG, "registered", ROUTE);
}
