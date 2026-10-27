// Ratings: how much of each category is rated, the spread and the best.

import { Panel, Columns, Bars, KeyValues, fmtNumber, fmtPct } from "../ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const RATED = [
  ["scenes", "Scenes"], ["images", "Images"], ["performers", "Performers"],
  ["galleries", "Galleries"], ["groups", "Groups"], ["studios", "Studios"],
];
const stars = (v) => (v == null ? "–" : `${v} (${(v / 20).toFixed(1)}★)`);

export function Ratings() {
  return (
    <div className="vs-grid">
      <Panel title="Rated share" dataset="ratings" span={12} rows={3}>
        {(r) => (
          <Bars max={100} format={(v) => `${Math.round(v)}%`}
            data={RATED.map(([id, label]) => {
              const total = r[id].rated + (r[id].unrated || 0);
              return { label: `${label} (${fmtNumber(r[id].rated)} of ${fmtNumber(total)})`, value: total ? (r[id].rated / total) * 100 : 0 };
            })} />
        )}
      </Panel>
      {RATED.map(([id, label]) => (
        <Panel key={id} title={label} dataset="ratings" span={6} rows={6}>
          {(r) => {
            const c = r[id];
            return (
              <>
                <KeyValues rows={[
                  ["Average (approx.)", stars(c.mean)],
                  ["Rated", `${fmtNumber(c.rated)} (${fmtPct(c.rated, c.rated + (c.unrated || 0))})`],
                ]} />
                <div style={{ height: 10 }} />
                {c.rated ? <Columns data={c.buckets} /> : <p className="vs-empty">Nothing rated yet</p>}
                {c.top.length > 0 && (
                  <>
                    <div style={{ height: 12 }} />
                    <Bars data={c.top} entity={id} ranked max={100} />
                  </>
                )}
              </>
            );
          }}
        </Panel>
      ))}
  </div>
);
}
