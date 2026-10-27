// Vibings Battles — UI entry.
//
// All scoring happens in the Python backend; this UI renders, forwards
// decisions and writes the resulting ratings to Stash. Layout: a side panel
// (views, categories, sync, shortcuts) and a main panel with the active
// view. Views live in their own modules; stash-plugin-builder bundles them.

import { LOG, VERSION, CATEGORIES, backend, fetchCounts } from "./api.js";
import { injectStyles } from "./styles.js";
import { useBattlesSettings } from "./useBattlesSettings.js";
import { useStatus, StatusDot } from "./StatusPanel.jsx";
import { registerToolsPanel } from "../../_shared/overhaul-tools.jsx";
import { Icon } from "./ui.jsx";
import { BattleTab } from "./BattleTab.jsx";
import { LeaderboardTab } from "./LeaderboardTab.jsx";
import { StatsTab } from "./StatsTab.jsx";
import { SettingsTab, scrollToSettings } from "./SettingsTab.jsx";
import { ArenaTab } from "./ArenaTab.jsx";
import { usePerformance, perfClasses } from "./perf.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { NavLink, useHistory, useLocation } = PluginApi.libraries.ReactRouterDOM;
const { Button, Form } = PluginApi.libraries.Bootstrap;
const { faTrophy, faBolt, faRankingStar, faChartColumn, faGear, faFilm, faImage, faUser, faBuilding, faLayerGroup, faImages, faShieldHalved } =
  PluginApi.libraries.FontAwesomeSolid;

// Not under /plugin/: the Stash server owns that prefix for plugin assets,
// so a direct load or refresh there returns a plain 404.
const ROUTE = "/vibings-battles";

const VIEWS = [
  { id: "battle", label: "Battle", icon: faBolt, usesCategory: true },
  { id: "arena", label: "Arena", icon: faShieldHalved },
  { id: "leaderboard", label: "Leaderboard", icon: faRankingStar, usesCategory: true },
  { id: "stats", label: "Stats", icon: faChartColumn },
  { id: "settings", label: "Settings", icon: faGear },
];

const CATEGORY_ICONS = {
  scenes: faFilm,
  images: faImage,
  performers: faUser,
  studios: faBuilding,
  groups: faLayerGroup,
  galleries: faImages,
};

const SHORTCUTS = [
  ["←", "Left wins"],
  ["→", "Right wins"],
  ["↓", "Draw"],
  ["Space", "Skip"],
  ["U", "Undo"],
];

function SidePanel({ view, onView, catId, onCategory, counts, ranked, syncEnabled, settingsLoaded, onToggleSync, status }) {
  const showCategories = VIEWS.find((v) => v.id === view)?.usesCategory;
  return (
    <aside className="vb-side">
      <div className="vb-side-title">
        <Icon icon={faTrophy} /> Battles
      </div>

      <nav className="vb-views" aria-label="Battles views">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className={`vb-view${view === v.id ? " active" : ""}`}
            aria-current={view === v.id ? "page" : undefined} onClick={() => onView(v.id)}>
            <Icon icon={v.icon} /> <span>{v.label}</span>
          </button>
        ))}
      </nav>

      {showCategories && (
        <div className="vb-side-section">
          <div className="vb-side-heading">Category</div>
          <div className="vb-catlist">
            {CATEGORIES.map((c) => {
              const total = counts[c.id];
              const disabled = view === "battle" && total != null && total < 2;
              return (
                <button key={c.id} type="button" disabled={disabled}
                  className={`vb-catitem${catId === c.id ? " active" : ""}`} onClick={() => onCategory(c.id)}>
                  <Icon icon={CATEGORY_ICONS[c.id]} />
                  <span className="vb-catname">{c.label}</span>
                  <span className="vb-catcount" title={`${ranked[c.id] || 0} ranked of ${total ?? "?"}`}>
                    {ranked[c.id] || 0}<span className="vb-muted">/{total ?? "…"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="vb-side-section vb-sync">
        <Form.Check type="switch" id="vb-sync-switch" checked={syncEnabled} disabled={!settingsLoaded}
          onChange={onToggleSync} label="Sync ratings to Stash" />
      </div>

      {view === "battle" && (
        <div className="vb-side-section vb-shortcuts">
          <div className="vb-side-heading">Shortcuts</div>
          {SHORTCUTS.map(([key, label]) => (
            <div key={key} className="vb-shortcut"><kbd>{key}</kbd><span>{label}</span></div>
          ))}
        </div>
      )}

      <button type="button" className="vb-side-footer" onClick={() => onView("settings")} title="Version and status (Settings)">
        <StatusDot state={status} /> <span>Vibings Battles v{VERSION}</span>
      </button>
    </aside>
  );
}

function BattlesPage() {
  const history = useHistory();
  const location = useLocation();
  const [counts, setCounts] = React.useState({});
  const [ranked, setRanked] = React.useState({});
  const [refreshKey, setRefreshKey] = React.useState(0); // bumps when battle data changes
  const bump = React.useCallback(() => setRefreshKey((k) => k + 1), []);
  const { settings, syncEnabled, saveSettings, toggleSync, sync, notifyError } = useBattlesSettings({ onChanged: bump });
  const { state: status } = useStatus(settings);
  const { options: perf } = usePerformance();

  const params = new URLSearchParams(location.search);
  const view = VIEWS.some((v) => v.id === params.get("view")) ? params.get("view") : "battle";
  const catId = CATEGORIES.some((c) => c.id === params.get("cat")) ? params.get("cat") : null;

  const setParams = React.useCallback((patch) => {
    const next = new URLSearchParams(history.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || (k === "view" && v === "battle")) next.delete(k);
      else next.set(k, v);
    }
    const search = next.toString();
    history.replace({ search: search ? `?${search}` : "" });
  }, [history]);
  const setView = (id) => setParams({ view: id });
  const openSettings = (section) => {
    setView("settings");
    scrollToSettings(section);
  };
  const setCategory = React.useCallback((id) => setParams({ cat: id }), [setParams]);

  React.useEffect(() => {
    injectStyles();
    document.title = "Battles | Stash";
    fetchCounts().then(setCounts).catch((e) => console.warn(LOG, "counts failed", e));
  }, []);

  // Ranked item counts for the side panel.
  React.useEffect(() => {
    backend("summary", { tzOffset: new Date().getTimezoneOffset() })
      .then((s) => setRanked(Object.fromEntries(Object.entries(s.categories).map(([k, v]) => [k, v.items]))))
      .catch((e) => console.warn(LOG, "summary failed", e));
  }, [refreshKey]);

  // The leaderboard needs a category: default to the one with most ranked items.
  React.useEffect(() => {
    if (view !== "leaderboard" || catId) return;
    const best = Object.entries(ranked).sort((a, b) => b[1] - a[1])[0];
    if (best) setCategory(best[0]);
  }, [view, catId, ranked]);

  return (
    <div className={`vb-layout ${perfClasses(perf)}`}>
      <SidePanel view={view} onView={setView} catId={catId} onCategory={setCategory} counts={counts} ranked={ranked}
        syncEnabled={syncEnabled} settingsLoaded={!!settings} onToggleSync={toggleSync} status={status} />
      <main className="vb-mainpanel">
        {/* The battle view stays mounted so switching views keeps the current pair. */}
        <BattleTab active={view === "battle"} catId={catId} onCategory={setCategory} settings={settings}
          saveSettings={saveSettings} sync={sync} notifyError={notifyError} onBattle={bump} />
        <ArenaTab active={view === "arena"} settings={settings} sync={sync} notifyError={notifyError} onBattle={bump}
          onOpenSettings={() => openSettings("arena")} />
        <LeaderboardTab active={view === "leaderboard"} catId={catId} refreshKey={refreshKey} notifyError={notifyError} />
        <StatsTab active={view === "stats"} refreshKey={refreshKey} notifyError={notifyError} />
        <SettingsTab active={view === "settings"} settings={settings} saveSettings={saveSettings}
          syncEnabled={syncEnabled} notifyError={notifyError} onDataChanged={bump} />
      </main>
    </div>
  );
}

// ===========================================================================
// Stash Settings → Tools → Vibings Overhaul panel
// ===========================================================================

function BattlesToolsPanel() {
  injectStyles(); // the Battles page may not have been opened yet
  const { settings, syncEnabled, saveSettings, notifyError } = useBattlesSettings();
  const { options: perf } = usePerformance();
  return (
    <div className={`vb-tools ${perfClasses(perf)}`}>
      <SettingsTab active settings={settings} saveSettings={saveSettings} syncEnabled={syncEnabled}
        notifyError={notifyError} onDataChanged={() => {}} />
    </div>
  );
}

// ===========================================================================
// Navigation entry
// ===========================================================================

function NavItem() {
  return (
    <div className="col-4 col-sm-3 col-md-2 col-lg-auto nav-link">
      <NavLink to={ROUTE} activeClassName="active">
        <Button className="minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center">
          <PluginApi.components.Icon icon={faTrophy} className="nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0" />
          <span>Battles</span>
        </Button>
      </NavLink>
    </div>
  );
}

// stash-plugin-builder imports and calls the default export.
export default function main() {
  PluginApi.register.route(ROUTE, BattlesPage);
  registerToolsPanel({
    id: "vibings-battles",
    title: "Vibings Battles",
    version: VERSION,
    description: "Elo-ranked head-to-head battles for your Stash items.",
    href: ROUTE,
    order: 10,
    Component: BattlesToolsPanel,
  });
  PluginApi.patch.before("MainNavBar.MenuItems", (props) => [
    { ...props, children: [...React.Children.toArray(props.children), <NavItem key="vibings-battles" />] },
  ]);
  console.log(LOG, "registered", ROUTE);
}
