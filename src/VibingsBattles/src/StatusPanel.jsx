// Version and health of each part of the plugin.

import { VERSION, runStatusChecks, worstState } from "./api.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button } = PluginApi.libraries.Bootstrap;

const STATE_LABEL = { ok: "OK", info: "Info", warn: "Warning", error: "Error" };

export function useStatus(settings, deps = []) {
  const [checks, setChecks] = React.useState(null);
  const [running, setRunning] = React.useState(false);
  const run = React.useCallback(async () => {
    setRunning(true);
    try {
      setChecks(await runStatusChecks(settings));
    } finally {
      setRunning(false);
    }
  }, [settings]);
  React.useEffect(() => { run(); }, [run, ...deps]);
  return { checks, running, run, state: checks ? worstState(checks) : null };
}

export function StatusDot({ state }) {
  return <span className={`vb-dot vb-dot-${state || "pending"}`} aria-label={STATE_LABEL[state] || "Checking"} />;
}

export function StatusPanel({ settings }) {
  const { checks, running, run, state } = useStatus(settings);
  return (
    <fieldset className="vb-status-panel">
      <legend>
        Status <StatusDot state={state} /> <span className="vb-muted vb-version">Vibings Battles v{VERSION}</span>
      </legend>
      {!checks && <p className="vb-muted">Checking…</p>}
      {checks && (
        <table className="vb-table vb-checks">
          <tbody>
            {checks.map((c) => (
              <tr key={c.id} style={{ cursor: "default" }}>
                <td><StatusDot state={c.state} /></td>
                <td className="vb-check-label">{c.label}</td>
                <td className={`vb-check-state vb-state-${c.state}`}>{STATE_LABEL[c.state]}</td>
                <td className="vb-check-detail">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="vb-row">
        <Button variant="secondary" size="sm" disabled={running} onClick={run}>{running ? "Checking…" : "Run checks again"}</Button>
      </div>
    </fieldset>
  );
}
