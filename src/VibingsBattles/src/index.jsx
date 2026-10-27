// Vibings Battles — UI entry.
//
// All scoring happens in the Python backend; this UI renders, forwards
// decisions and writes the resulting ratings to Stash. Tabs live in their
// own modules; stash-plugin-builder bundles them into one script.

import { LOG, backend, fetchCounts, syncRatings } from "./api.js";
import { injectStyles } from "./styles.js";
import { BattleTab } from "./BattleTab.jsx";
import { LeaderboardTab } from "./LeaderboardTab.jsx";
import { StatsTab } from "./StatsTab.jsx";
import { SettingsTab } from "./SettingsTab.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { NavLink, useHistory, useLocation } = PluginApi.libraries.ReactRouterDOM;
const { Button } = PluginApi.libraries.Bootstrap;
const { faTrophy } = PluginApi.libraries.FontAwesomeSolid;

// Not under /plugin/: the Stash server owns that prefix for plugin assets,
// so a direct load or refresh there returns a plain 404.
const ROUTE = "/vibings-battles";

const TABS = [
  { id: "battle", label: "Battle" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "stats", label: "Stats" },
  { id: "settings", label: "Settings" },
];

function BattlesPage() {
  const toast = PluginApi.hooks.useToast();
  const history = useHistory();
  const location = useLocation();
  const [settings, setSettings] = React.useState(null);
  const [counts, setCounts] = React.useState({});
  const [refreshKey, setRefreshKey] = React.useState(0); // bumps when battle data changes

  const tab = new URLSearchParams(location.search).get("tab") || "battle";
  const setTab = (id) => history.replace({ search: id === "battle" ? "" : `?tab=${id}` });
  const syncEnabled = settings?.ui?.syncRatings !== false;

  const notifyError = React.useCallback((msg, e) => {
    console.warn(LOG, msg, e);
    toast.error(`${msg}: ${e?.message || e}`);
  }, [toast]);

  React.useEffect(() => {
    injectStyles();
    document.title = "Battles | Stash";
    backend("get_settings").then(setSettings).catch((e) => notifyError("Could not load settings", e));
    fetchCounts().then(setCounts).catch((e) => console.warn(LOG, "counts failed", e));
  }, []);

  const sync = React.useCallback(async (changed, force = false) => {
    if ((!syncEnabled && !force) || !changed?.length) return 0;
    try {
      return await syncRatings(changed);
    } catch (e) {
      notifyError("Rating sync to Stash failed", e);
      return 0;
    }
  }, [syncEnabled, notifyError]);

  const bump = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  const saveSettings = React.useCallback(async (next) => {
    try {
      const out = await backend("save_settings", { settings: next });
      setSettings(out.settings);
      const willSync = out.settings.ui?.syncRatings !== false;
      const n = willSync ? await sync(out.changed, true) : 0;
      toast.success(n ? `Settings saved, ${n} Stash ratings updated` : "Settings saved");
      if (out.changed.length) bump();
      return out;
    } catch (e) {
      notifyError("Could not save settings", e);
      return null;
    }
  }, [sync, toast, notifyError, bump]);

  const toggleSync = () => saveSettings({ ui: { ...(settings?.ui || {}), syncRatings: !syncEnabled } });

  return (
    <div className="vb-page">
      <div className="vb-header">
        <h1>Battles</h1>
        <span className="vb-spacer" />
        <label className="vb-switch" title="Write the resulting rating to the item's Stash rating">
          <input type="checkbox" checked={syncEnabled} disabled={!settings} onChange={toggleSync} />
          Sync ratings to Stash
        </label>
      </div>
      <div className="vb-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`vb-tab${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* The battle tab stays mounted so switching tabs keeps the current pair. */}
      <BattleTab active={tab === "battle"} settings={settings} counts={counts} sync={sync} notifyError={notifyError} onBattle={bump} />
      <LeaderboardTab active={tab === "leaderboard"} refreshKey={refreshKey} notifyError={notifyError} />
      <StatsTab active={tab === "stats"} refreshKey={refreshKey} notifyError={notifyError} />
      <SettingsTab active={tab === "settings"} settings={settings} saveSettings={saveSettings}
        syncEnabled={syncEnabled} notifyError={notifyError} onDataChanged={bump} />
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
  PluginApi.patch.before("MainNavBar.MenuItems", (props) => [
    { ...props, children: [...React.Children.toArray(props.children), <NavItem key="vibings-battles" />] },
  ]);
  console.log(LOG, "registered", ROUTE);
}
