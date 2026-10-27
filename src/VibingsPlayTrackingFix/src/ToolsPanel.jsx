// Settings → Tools → Vibings Overhaul → Vibings Play Tracking Fix: tracking
// options, estimated earlier plays, database optimisation and backups.

import { LOG, backend, stashTracksActivity, fmtBytes, fmtDuration, fmtNumber, timeAgo } from "./api.js";
import { useSettings, saveSettings, loadSettings } from "./settings.js";
import { planEstimates, planTotals } from "./estimate.js";
import { scenesWithPlays, scenesById, replaceEarlierPlays, restoreEarlierPlays, staleResumePoints, clearResumePoints } from "./stash.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Button, Form, Table, Alert } = PluginApi.libraries.Bootstrap;

const plural = (n, one, many) => fmtNumber(n) + " " + (n === 1 ? one : many);

const ROUNDING_LABELS = { nearest: "Round to nearest", down: "Round down", up: "Round up" };

function Toggle({ id, label, help, checked, onChange, disabled }) {
  return (
    <Form.Group className="vpt-tool-toggle">
      <Form.Check type="switch" id={id} label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {help && <Form.Text className="text-muted">{help}</Form.Text>}
    </Form.Group>
  );
}

function Section({ title, children }) {
  return (
    <div className="vpt-tool-section">
      <h6>{title}</h6>
      {children}
    </div>
  );
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));

function planCsv(rows) {
  const head = ["scene_id", "title", "length_s", "earlier_play_time_s", "earlier_plays", "estimate", "change", "kept_as_is"];
  const lines = rows.map((r) => [r.id, r.title, Math.round(r.length), Math.round(r.earlierSeconds), r.earlierPlays, r.estimate, r.change, r.skipped ? "yes" : ""].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n");
}

// <input type="datetime-local"> value in local time.
function localInput(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
}

function PlanTable({ rows }) {
  const top = [...rows].filter((r) => !r.skipped && r.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 15);
  if (!top.length) return <p className="text-muted">No scene would change.</p>;
  return (
    <Table size="sm" className="vpt-tool-table">
      <thead>
        <tr><th>Scene</th><th className="text-right">Earlier time</th><th className="text-right">Plays now</th><th className="text-right">Estimate</th></tr>
      </thead>
      <tbody>
        {top.map((r) => (
          <tr key={r.id}>
            <td className="vpt-name"><a href={"/scenes/" + r.id}>{r.title}</a></td>
            <td className="text-right vpt-nowrap">{fmtDuration(r.earlierSeconds)}</td>
            <td className="text-right">{r.earlierPlays}</td>
            <td className="text-right vpt-nowrap">{r.estimate} <span className={r.change > 0 ? "vpt-up" : "vpt-down"}>({r.change > 0 ? "+" : ""}{r.change})</span></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function ToolsPanel() {
  const settings = useSettings();
  const [info, setInfo] = React.useState(null);
  const [stashTracks, setStashTracks] = React.useState(true);
  const [busy, setBusy] = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [message, setMessage] = React.useState(null); // { variant, text }
  const [plan, setPlan] = React.useState(null); // { rows, totals, at }
  const [confirm, setConfirm] = React.useState(null); // "replace" | "undo" | "resume" | "reset"
  const [resume, setResume] = React.useState(null); // stale resume point ids
  const [keepBackups, setKeepBackups] = React.useState("");

  const refresh = React.useCallback(async () => {
    try { setInfo(await backend("db_info")); } catch (e) { setMessage({ variant: "danger", text: e.message }); }
  }, []);
  React.useEffect(() => {
    loadSettings();
    refresh();
    stashTracksActivity().then(setStashTracks).catch(() => {});
  }, [refresh]);

  const run = async (name, fn) => {
    setBusy(name);
    setMessage(null);
    setConfirm(null);
    try {
      const text = await fn();
      if (text) setMessage({ variant: "success", text });
    } catch (e) {
      console.warn(LOG, e);
      setMessage({ variant: "danger", text: e.message || String(e) });
    } finally {
      setBusy(null);
      setProgress(null);
      refresh();
    }
  };
  const save = (partial) => run("settings", async () => { await saveSettings(partial); setPlan(null); });
  const onProgress = (done, total) => setProgress({ done, total });

  const calculate = () => run("calculate", async () => {
    const [scenes, all] = await Promise.all([scenesWithPlays(), backend("get_all")]);
    const rows = planEstimates(scenes, all, settings.estimate);
    setPlan({ rows, totals: planTotals(rows), at: Date.now() });
  });

  const c = info?.counts;
  const b = settings.backup;
  const mode = info?.mode;
  const t = plan?.totals;

  return (
    <div className="vpt-tools">
      {message && <Alert variant={message.variant} onClose={() => setMessage(null)} dismissible>{message.text}</Alert>}

      <Section title="Tracking">
        {!stashTracks && (
          <p className="vpt-warn">Track activity is off in Stash's settings (Interface → Scene player), so nothing is tracked.</p>
        )}
        <Toggle id="vpt-enabled" label="Count play time from the video" checked={settings.enabled}
          help="Only time the video really plays counts; pauses and skips on the timeline do not. Off: Stash's own tracking is used."
          onChange={(v) => save({ enabled: v })} />
        <div className="vpt-tool-row">
          <Form.Label htmlFor="vpt-min" className="mb-0">A play counts after</Form.Label>
          <Form.Control id="vpt-min" size="sm" type="number" min={0} max={100} className="vpt-tool-num"
            defaultValue={settings.minPercent} key={"m" + settings.minPercent}
            onBlur={(e) => Number(e.target.value) !== settings.minPercent && save({ minPercent: Number(e.target.value) })} />
          <span>% of the video has played in one viewing</span>
        </div>
        <p className="vpt-tool-stats text-muted">
          {c ? (
            <>
              Tracking since {new Date(info.installedAt).toLocaleString()}: {fmtDuration(c.seconds)} of play time and{" "}
              {plural(c.plays, "play", "plays")} on {plural(c.scenes, "scene", "scenes")}.
            </>
          ) : "Loading…"}
        </p>
      </Section>

      <Section title="Estimated earlier plays">
        <p className="text-muted">
          Earlier play time is what Stash counted before this plugin started: a scene's play time minus the time this
          plugin has counted. Divided by the scene's length it gives an estimate of how many times the scene was
          played. Earlier plays are plays dated before the start date.
        </p>
        <div className="vpt-tool-row">
          <Form.Label htmlFor="vpt-start" className="mb-0">Start date</Form.Label>
          <Form.Control id="vpt-start" size="sm" type="datetime-local" className="vpt-tool-date"
            key={"s" + info?.installedAt} defaultValue={info ? localInput(info.installedAt) : ""}
            disabled={!info || mode === "replace" || !!busy}
            onBlur={(e) => {
              const at = new Date(e.target.value);
              if (Number.isNaN(at.getTime()) || localInput(info.installedAt) === e.target.value) return;
              run("start", async () => { await backend("set_installed_at", { at: at.toISOString() }); setPlan(null); return "Start date changed."; });
            }} />
          <Form.Control as="select" size="sm" className="vpt-tool-select" aria-label="Rounding" value={settings.estimate.rounding}
            onChange={(e) => save({ estimate: { rounding: e.target.value } })}>
            {Object.entries(ROUNDING_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Form.Control>
        </div>
        <Toggle id="vpt-skip" label="Keep scenes without earlier play time as they are" checked={settings.estimate.skipWithoutTime}
          help="Older Stash versions counted plays without play time. Off: such scenes are estimated at 0 plays."
          onChange={(v) => save({ estimate: { skipWithoutTime: v } })} />

        {mode === "hybrid" && (
          <p className="vpt-mode">
            <strong>Hybrid in use:</strong> {fmtNumber(c.estimatedPlays)} estimated earlier plays on {fmtNumber(c.estimatedScenes)} scenes,
            shown apart from Stash's play counts{info.estimate?.at ? ", calculated " + timeAgo(info.estimate.at) : ""}.{" "}
            <Button size="sm" variant="secondary" disabled={!!busy}
              onClick={() => run("clear", async () => { await backend("clear_estimates"); return "Estimated earlier plays removed."; })}>Remove estimates</Button>
          </p>
        )}
        {mode === "replace" && (
          <div className="vpt-mode">
            <strong>Replaced in Stash:</strong> earlier play counts of {fmtNumber(c.replacedScenes)} scenes are estimates
            {info.estimate?.at ? " (" + timeAgo(info.estimate.at) + ")" : ""}. The original plays are stored and can be put back.{" "}
            {confirm !== "undo" ? (
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => setConfirm("undo")}>Undo replacement…</Button>
            ) : (
              <span className="vpt-tool-row">
                <span>Put the original earlier plays back on {c.replacedScenes} scenes? Plays since the start date stay.</span>
                <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("undo", async () => {
                  const out = await restoreEarlierPlays(info.installedAt, onProgress);
                  return `Original plays restored on ${out.restored} scenes` + (out.failed ? `, ${out.failed} failed (try again).` : ".");
                })}>Undo</Button>
                <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              </span>
            )}
          </div>
        )}

        <div className="vpt-tool-row">
          <Button size="sm" variant="primary" disabled={!!busy} onClick={calculate}>
            {busy === "calculate" ? "Calculating…" : "Calculate"}
          </Button>
          <span className="text-muted">Calculating changes nothing.</span>
        </div>

        {plan && (
          <div className="vpt-plan">
            <p>
              {fmtNumber(t.estimated)} scenes estimated from {fmtDuration(t.earlierSeconds)} of earlier play time
              {t.skipped ? `, ${fmtNumber(t.skipped)} kept as they are` : ""}.
              Earlier plays now <strong>{fmtNumber(t.earlierPlays)}</strong>, estimated <strong>{fmtNumber(t.estimatedPlays)}</strong>{" "}
              ({fmtNumber(t.changed)} scenes would change).
            </p>
            <PlanTable rows={plan.rows} />
            <div className="vpt-tool-row">
              <Button size="sm" variant="secondary" onClick={() => download(`vibings-play-estimates-${new Date().toISOString().slice(0, 10)}.csv`, planCsv(plan.rows), "text/csv")}>
                Download all as CSV
              </Button>
            </div>
            <div className="vpt-choices">
              <div className="vpt-choice">
                <strong>Hybrid</strong>
                <span className="text-muted">Keeps the estimates as earlier plays shown apart from Stash's play counts (scene History tab, Vibings Stats). Stash is not changed.</span>
                <Button size="sm" variant="primary" disabled={!!busy || mode === "replace"} onClick={() => run("hybrid", async () => {
                  const estimates = Object.fromEntries(plan.rows.filter((r) => !r.skipped && r.estimate > 0).map((r) => [r.id, r.estimate]));
                  const out = await backend("set_estimates", { estimates });
                  return `Saved ${fmtNumber(out.counts.estimatedPlays)} estimated earlier plays on ${fmtNumber(out.counts.estimatedScenes)} scenes.`;
                })}>Use as earlier plays</Button>
                {mode === "replace" && <Form.Text className="text-muted">Undo the replacement first.</Form.Text>}
              </div>
              <div className="vpt-choice">
                <strong>Replace</strong>
                <span className="text-muted">Changes the play counts in Stash: each scene's earlier plays become its estimate. The original plays are stored and the change can be undone.</span>
                {confirm !== "replace" ? (
                  <Button size="sm" variant="danger" disabled={!!busy || !t.changed} onClick={() => setConfirm("replace")}>Replace play counts…</Button>
                ) : (
                  <span className="vpt-tool-row">
                    <span>Change the play history of {fmtNumber(t.changed)} scenes in Stash?</span>
                    <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("replace", async () => {
                      const out = await replaceEarlierPlays(plan.rows, info.installedAt, onProgress);
                      setPlan(null);
                      return `Play counts replaced on ${out.changed} scenes` + (out.failed ? `, ${out.failed} failed (run again).` : ".");
                    })}>Replace</Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {progress && <p className="text-muted">Working… {progress.done} / {progress.total}</p>}
      </Section>

      <Section title="Optimise database">
        <p className="text-muted">
          Finds resume points Stash never uses (98 % or more of the video: the video would start from the beginning
          anyway) and cleans this plugin's data: rows of deleted scenes and empty rows are removed and the file is
          rewritten compactly. A backup is made first.
        </p>
        <div className="vpt-tool-row">
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("check", async () => { setResume(await staleResumePoints()); })}>
            {busy === "check" ? "Checking…" : "Check resume points"}
          </Button>
          {resume && (
            resume.length ? (
              confirm !== "resume" ? (
                <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => setConfirm("resume")}>Clear {plural(resume.length, "resume point", "resume points")}…</Button>
              ) : (
                <>
                  <span>Set the resume point of {plural(resume.length, "scene", "scenes")} to the beginning in Stash?</span>
                  <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("resume", async () => {
                    const out = await clearResumePoints(resume, onProgress);
                    setResume(null);
                    return "Cleared " + plural(out.cleared, "resume point", "resume points") + (out.failed ? ", " + out.failed + " failed." : ".");
                  })}>Clear</Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
                </>
              )
            ) : <span className="text-muted">No unused resume points.</span>
          )}
        </div>
        <div className="vpt-tool-row">
          <Form.Label htmlFor="vpt-keep-all" className="mb-0">Keep newest</Form.Label>
          <Form.Control id="vpt-keep-all" size="sm" type="number" min={0} placeholder="all" className="vpt-tool-num"
            value={keepBackups} onChange={(e) => setKeepBackups(e.target.value)} />
          <span>backups</span>
          <Button size="sm" variant="primary" disabled={!!busy || !info} onClick={() => run("compact", async () => {
            const found = await scenesById(info.ids);
            const existing = Object.fromEntries(info.ids.map((id) => [id, found.has(id)]));
            const out = await backend("compact", { existing, ...(keepBackups !== "" ? { keepBackups: Number(keepBackups) } : {}) });
            return `Optimised: ${fmtBytes(out.bytesBefore)} → ${fmtBytes(out.bytesAfter)}, removed ${out.removedRows} rows and ${out.removedBackups} backups.`;
          })}>{busy === "compact" ? "Optimising…" : "Optimise plugin data"}</Button>
        </div>
        {info && <Form.Text className="text-muted">Plugin data {fmtBytes(info.bytes)}, backups {fmtBytes(info.backupBytes)}.</Form.Text>}
      </Section>

      <Section title="Backups">
        <Toggle id="vpt-auto-backup" label="Automatic backups" checked={b.auto}
          help="Before a change, at most once per interval. Estimates and replacements always make one."
          onChange={(v) => save({ backup: { auto: v } })} />
        <div className="vpt-tool-row">
          <Form.Label htmlFor="vpt-interval" className="mb-0">Every</Form.Label>
          <Form.Control id="vpt-interval" size="sm" type="number" min={1} max={720} className="vpt-tool-num"
            defaultValue={b.intervalHours} key={"i" + b.intervalHours}
            onBlur={(e) => Number(e.target.value) !== b.intervalHours && save({ backup: { intervalHours: Number(e.target.value) } })} />
          <span>hours, keep</span>
          <Form.Control id="vpt-keep" size="sm" type="number" min={1} max={100} className="vpt-tool-num"
            defaultValue={b.keep} key={"k" + b.keep} aria-label="Automatic backups to keep"
            onBlur={(e) => Number(e.target.value) !== b.keep && save({ backup: { keep: Number(e.target.value) } })} />
          <span>automatic backups</span>
          <Button size="sm" variant="secondary" disabled={!!busy}
            onClick={() => run("backup", async () => `Backup ${(await backend("backup_now")).backup} made.`)}>Back up now</Button>
        </div>
        {info?.backups?.length ? (
          <Table size="sm" className="vpt-tool-table">
            <tbody>
              {info.backups.map((bk) => (
                <tr key={bk.name}>
                  <td>{bk.tag}</td>
                  <td>{timeAgo(bk.mtime * 1000)}</td>
                  <td className="text-muted">{new Date(bk.mtime * 1000).toLocaleString()}</td>
                  <td className="text-right">{fmtBytes(bk.bytes)}</td>
                  <td className="text-right vpt-nowrap">
                    <Button size="sm" variant="secondary" disabled={!!busy || bk.tag === "corrupt"}
                      onClick={() => run("restore", async () => {
                        const out = await backend("restore_backup", { name: bk.name });
                        return `Restored ${out.restored}. The data before it was backed up as ${out.backup}.`;
                      })}>Restore</Button>{" "}
                    <Button size="sm" variant="minimal" className="vpt-danger" disabled={!!busy} title="Delete backup"
                      onClick={() => run("delete", async () => { await backend("delete_backup", { name: bk.name }); })}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <p className="text-muted">No backups yet.</p>}
        <Form.Text className="text-muted">Backups cover this plugin's data; a restore does not change Stash.</Form.Text>
      </Section>

      <Section title="Reset">
        {confirm !== "reset" ? (
          <Button size="sm" variant="danger" disabled={!!busy || mode === "replace"} onClick={() => setConfirm("reset")}>Forget plugin data…</Button>
        ) : (
          <div className="vpt-tool-row">
            <span>Forget the play time counted by this plugin and the estimates? Stash's play counts and play time stay. A backup is made first.</span>
            <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("reset", async () => {
              await backend("reset", { confirm: true });
              return "Plugin data forgotten.";
            })}>Forget</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          </div>
        )}
        {mode === "replace" && <Form.Text className="text-muted">Undo the replacement first.</Form.Text>}
      </Section>
    </div>
  );
}
