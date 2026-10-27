// Os: where in the video the O happens, how long an image was open before
// it, and the most recent Os. Positions and viewing times come from Vibings
// Better Os; without it only Stash's own O counts are shown.

import { Panel, DatasetCards, Bars, Columns, Split, fmtNumber, fmtPct, timeAgo, itemHref } from "../ui.jsx";
import { useDataset } from "../store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

/** Seconds -> 4:05 or 1:02:03. */
export function fmtPos(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
const fmtView = (s) => (s == null ? "–" : s < 60 ? `${Math.round(s)} s` : fmtPos(s));
const fmtPercent = (v) => (v == null ? "–" : `${Math.round(v)}%`);

function PluginNote() {
  const ds = useDataset("os");
  const d = ds.data;
  if (!d) return null;
  if (d.detailError) return <p className="vs-note vs-warn-text">Could not read Vibings Better Os: {d.detailError}</p>;
  if (d.hasDetail) return null;
  const text = !d.plugin?.installed
    ? "Install Vibings Better Os from the Vibings Overhaul source to see where in the video each O happens and how long images were open."
    : "Enable Vibings Better Os in Settings → Plugins to see video positions and image viewing times.";
  return <p className="vs-note">{text} Until then every O is a classic O.</p>;
}

function Recent({ rows }) {
  if (!rows.length) return <p className="vs-empty">No Os yet</p>;
  return (
    <table className="vs-table">
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.kind}-${r.id}-${r.at}`}>
            <td className="vs-name"><a href={itemHref(r.kind === "scene" ? "scenes" : "images", r.id)}>{r.name}</a></td>
            <td className="vs-num">
              {r.kind === "scene"
                ? r.t != null ? <>{fmtPos(r.t)}{r.d ? <span className="vs-muted"> · {fmtPct(r.t, r.d)}</span> : null}</> : <span className="vs-muted">Classic</span>
                : r.view != null ? <>{fmtView(r.view)} <span className="vs-muted">open</span></> : <span className="vs-muted">Classic</span>}
            </td>
            <td className="vs-muted vs-hide-sm">{r.kind === "scene" ? "Scene" : "Image"}</td>
            <td className="vs-num vs-muted">{timeAgo(r.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Os() {
  return (
    <>
      <PluginNote />
      <DatasetCards dataset="os" count={6} cards={(d) => [
        { label: "All Os", value: fmtNumber(d.totalOs), note: `${fmtNumber(d.sceneOs)} scene · ${fmtNumber(d.imageOs)} image`, hero: true },
        { label: "With video position", value: fmtNumber(d.timedOs), note: `${fmtPct(d.timedOs, d.sceneOs)} of scene Os · ${fmtNumber(d.sceneOs - d.timedOs)} classic` },
        { label: "Average point", value: fmtPercent(d.meanPct), note: d.medianPct != null ? `median ${fmtPercent(d.medianPct)} into the video` : "no positions yet" },
        { label: "Before the end", value: fmtPos(d.medianBeforeEnd), note: d.medianBeforeEnd != null ? "median time left in the video" : "no positions yet" },
        { label: "Average time into video", value: fmtPos(d.meanT), note: d.timedOs ? `over ${fmtNumber(d.timedOs)} Os` : "no positions yet" },
        { label: "Image viewing time", value: fmtView(d.medianView), note: d.sessionOs ? `median over ${fmtNumber(d.sessionOs)} image Os` : "no viewing times yet" },
      ]} />
      <div className="vs-grid">
        <Panel title="Where in the video" dataset="os" span={6}>
          {(d) => d.timedOs ? (
            <>
              <Columns data={d.positionBuckets} />
              <p className="vs-empty">Share of the video played when the O happened</p>
            </>
          ) : <p className="vs-empty">No Os with a video position yet</p>}
        </Panel>
        <Panel title="O details" dataset="os" span={6}>
          {(d) => (
            <>
              <Split data={d.coverage} />
              <p className="vs-empty" style={{ marginTop: 10 }}>
                Classic Os were added before Vibings Better Os, or without a playing video or an open image.
              </p>
            </>
          )}
        </Panel>

        <Panel title="Time into the video" dataset="os" span={4} rows={6}>
          {(d) => <Bars data={d.intoBuckets} empty="No Os with a video position yet" />}
        </Panel>
        <Panel title="Time left in the video" dataset="os" span={4} rows={6}>
          {(d) => <Bars data={d.beforeEndBuckets} empty="No Os with a video position yet" />}
        </Panel>
        <Panel title="Image open before the O" dataset="os" span={4} rows={6}>
          {(d) => <Bars data={d.viewBuckets} empty="No image Os with a viewing time yet" />}
        </Panel>

        <Panel title="Quickest Os" dataset="os" span={4} rows={5}>
          {(d) => <Bars data={d.quickest} entity="scenes" ranked format={fmtPos} empty="No Os with a video position yet" />}
        </Panel>
        <Panel title="Latest in the video" dataset="os" span={4} rows={5}>
          {(d) => <Bars data={d.latestInVideo} entity="scenes" ranked format={fmtPercent} max={100} empty="No Os with a video position yet" />}
        </Panel>
        <Panel title="Longest image sessions" dataset="os" span={4} rows={5}>
          {(d) => <Bars data={d.longestViews} entity="images" ranked format={fmtView} empty="No image Os with a viewing time yet" />}
        </Panel>

        <Panel title="Tags with the most Os" dataset="os" span={6} rows={8}>
          {(d) => <Bars data={d.topTags} entity="tags" ranked empty="No tagged scenes with Os" />}
        </Panel>
        <Panel title="Images with the most Os" dataset="os" span={6} rows={8}>
          {(d) => <Bars data={d.topImages} entity="images" ranked empty="No image Os yet" />}
        </Panel>
        <Panel title="Recent Os" dataset="os" span={12} rows={8}>
          {(d) => <Recent rows={d.recent} />}
        </Panel>
      </div>
    </>
  );
}
