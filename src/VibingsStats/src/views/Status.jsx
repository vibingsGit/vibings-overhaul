// Status and settings: health checks, how each dataset loaded, and the
// plugin settings. Also rendered in Stash's Settings → Tools panel.

import { VERSION, loadConfig, saveConfig, cachedConfig } from "../api.js";
import { runStatusChecks, worstState } from "../status.js";
import { useAllDatasets, load, refreshAll, clearCache } from "../store.js";
import { RefreshButton, fmtDate, timeAgo } from "../ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Form } = PluginApi.libraries.Bootstrap;

const STATE_LABEL = { ok: "OK", info: "Info", warn: "Warning", error: "Error" };

export function useStatus(deps = []) {
  const [checks, setChecks] = React.useState(null);
  const [running, setRunning] = React.useState(false);
  const run = React.useCallback(async () => {
    setRunning(true);
    try { setChecks(await runStatusChecks()); } finally { setRunning(false); }
  }, []);
  React.useEffect(() => { run(); }, deps);
  return { checks, running, run, state: checks ? worstState(checks) : null };
}

export function StatusDot({ state }) {
  return <span className={`vs-dot vs-dot-${state || "pending"}`} aria-label={STATE_LABEL[state] || "Checking"} />;
}

function Checks() {
  const { checks, running, run, state } = useStatus();
  return (
    <section className="vs-panel vs-span-12">
      <div className="vs-panel-head">
        <h3>Status <StatusDot state={state} /> <span className="vs-muted" style={{ fontWeight: "normal" }}>Vibings Stats v{VERSION}</span></h3>
        <RefreshButton onClick={run} busy={running} label="Run checks" />
      </div>
      {!checks ? <p className="vs-empty">Checking…</p> : (
        <table className="vs-table vs-checks">
          <tbody>
            {checks.map((c) => (
              <tr key={c.id}>
                <td><StatusDot state={c.state} /></td>
                <td className="vs-check-label">{c.label}</td>
                <td className={`vs-check-state vs-state-${c.state}`}>{STATE_LABEL[c.state]}</td>
                <td className="vs-check-detail">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Datasets() {
  const list = useAllDatasets();
  const [busy, setBusy] = React.useState(false);
  const all = async () => { setBusy(true); try { await refreshAll(); } finally { setBusy(false); } };
  return (
    <section className="vs-panel vs-span-12">
      <div className="vs-panel-head">
        <h3>Statistics data</h3>
        <RefreshButton onClick={all} busy={busy} label="Refresh all" />
        <Button size="sm" variant="outline-secondary" onClick={clearCache}>Clear cache</Button>
      </div>
      <div className="vs-scroll">
        <table className="vs-table">
          <thead><tr><th>Dataset</th><th>State</th><th className="vs-num">Load time</th><th>Updated</th><th /></tr></thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.name}>
                <td>{d.label}</td>
                <td className={d.error ? "vs-state-error" : d.loading ? "vs-state-warn" : d.data ? "vs-state-ok" : "vs-muted"} title={d.error || ""}>
                  {d.error ? "Failed" : d.loading ? "Loading" : d.data ? (d.cached ? "Cached" : "Loaded") : "Not loaded"}
                </td>
                <td className="vs-num">{d.ms != null ? `${d.ms} ms` : "–"}</td>
                <td className="vs-muted" title={d.updatedAt ? fmtDate(d.updatedAt) : ""}>{d.updatedAt ? timeAgo(d.updatedAt) : "–"}</td>
                <td><Button size="sm" variant="link" className="p-0" disabled={d.loading} onClick={() => load(d.name, { force: true }).catch(() => {})}>Reload</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="vs-empty">
        Each dataset loads on its own and its panels appear as soon as it arrives. Results are cached in this browser and refreshed in
        the background when older than the cache time.
      </p>
    </section>
  );
}

function SettingsForm() {
  const toast = PluginApi.hooks.useToast();
  const [config, setConfig] = React.useState(cachedConfig);
  const [saved, setSaved] = React.useState(cachedConfig);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    loadConfig().then((c) => { setConfig(c); setSaved(c); }).catch((e) => toast.error(`Could not load settings: ${e.message}`));
  }, []);
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const save = async () => {
    setBusy(true);
    try {
      const c = await saveConfig({ ...config, cacheMinutes: Math.max(0, Number(config.cacheMinutes) || 0) });
      setConfig(c);
      setSaved(c);
      toast.success("Settings saved");
    } catch (e) {
      toast.error(`Could not save settings: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="vs-panel vs-span-12">
      <div className="vs-panel-head"><h3>Settings</h3></div>
      <div className="vs-field">
        <label>Replace Stash's Statistics page</label>
        <Form.Check type="switch" id="vs-replace" checked={!config.keepNativeStatsPage}
          onChange={(e) => setConfig((c) => ({ ...c, keepNativeStatsPage: !e.target.checked }))} label="" />
        <span className="vs-help">On: the Statistics link in Stash's navbar opens Vibings Stats. Off: Stash's own page stays; Vibings Stats is at /vibings-stats.</span>
      </div>
      <div className="vs-field">
        <label>Cache minutes</label>
        <Form.Control type="number" min={0} max={10080} value={config.cacheMinutes}
          onChange={(e) => setConfig((c) => ({ ...c, cacheMinutes: e.target.value === "" ? "" : Number(e.target.value) }))} />
        <span className="vs-help">Loaded statistics are reused this long, then refreshed in the background while the old numbers stay visible. 0 = always refresh.</span>
      </div>
      <div className="vs-row">
        <Button variant="primary" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</Button>
        <span className="vs-help">Also editable in Settings → Plugins → Vibings Stats.</span>
      </div>
    </section>
  );
}

export function Status() {
  return (
    <div className="vs-grid">
      <Checks />
      <SettingsForm />
      <Datasets />
    </div>
  );
}
