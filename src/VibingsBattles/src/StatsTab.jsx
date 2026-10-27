// Stats tab: totals, per-category breakdown, daily activity, recent battles.

import { backend, CATEGORIES } from "./api.js";
import { StatCard, describeEntry, formatDelta, timeAgo } from "./ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;
const { Form } = PluginApi.libraries.Bootstrap;

// Local-date key, matching the backend's tzOffset-based daily buckets.
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function lastDays(daily, n) {
  const out = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    out.push({ key, ...(daily[key] || { battles: 0, draws: 0, skips: 0 }) });
  }
  return out;
}

function ActivityChart({ days }) {
  const W = 1000;
  const H = 160;
  const pad = 18;
  const max = Math.max(1, ...days.map((d) => d.battles + d.skips));
  const bw = W / days.length;
  const scale = (v) => ((H - pad) * v) / max;
  return (
    <svg className="vb-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Battles per day">
      {days.map((d, i) => {
        const hb = scale(d.battles);
        const hs = scale(d.skips);
        return (
          <g key={d.key}>
            <title>{`${d.key}: ${d.battles} battles, ${d.skips} skips`}</title>
            <rect className="vb-bar" x={i * bw + 1} y={H - pad - hb} width={Math.max(1, bw - 2)} height={hb} />
            <rect className="vb-bar-skip" x={i * bw + 1} y={H - pad - hb - hs} width={Math.max(1, bw - 2)} height={hs} />
          </g>
        );
      })}
      <text x={0} y={H - 4}>{days[0]?.key}</text>
      <text x={W} y={H - 4} textAnchor="end">{days[days.length - 1]?.key}</text>
      <text x={0} y={10}>{max}</text>
    </svg>
  );
}

export function StatsTab({ active, refreshKey, notifyError }) {
  const [summary, setSummary] = React.useState(null);
  const [recent, setRecent] = React.useState([]);
  const [range, setRange] = React.useState(30);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.all([
      backend("summary", { tzOffset: new Date().getTimezoneOffset() }),
      backend("recent_log", { limit: 25 }),
    ])
      .then(([s, r]) => {
        if (cancelled) return;
        setSummary(s);
        setRecent(r || []);
      })
      .catch((e) => notifyError("Could not load stats", e));
    return () => { cancelled = true; };
  }, [active, refreshKey]);

  if (!active) return null;
  if (!summary) return <div className="vb-status vb-muted">Loading…</div>;

  const t = summary.totals;
  const days = lastDays(summary.daily, range);
  const today = summary.daily[dayKey(new Date())]?.battles || 0;
  const activeDays = Object.keys(summary.daily).length;

  return (
    <div>
      <div className="vb-cards">
        <StatCard label="Battles" value={t.battles} note={`${today} today`} />
        <StatCard label="Draws" value={t.draws} note={t.battles ? `${Math.round((t.draws / t.battles) * 100)}% of battles` : null} />
        <StatCard label="Skips" value={t.skips} />
        <StatCard label="Active days" value={activeDays} note={activeDays ? `${(t.battles / activeDays).toFixed(1)} battles / day` : null} />
        <StatCard label="Last battle" value={timeAgo(t.lastBattle)} />
        <StatCard
          label="Longest win streak"
          value={t.highestWinStreak?.value ?? "–"}
          note={t.highestWinStreak ? `${t.highestWinStreak.name || "#" + t.highestWinStreak.id} (${t.highestWinStreak.category})` : null}
        />
        <StatCard
          label="Longest loss streak"
          value={t.highestLossStreak?.value ?? "–"}
          note={t.highestLossStreak ? `${t.highestLossStreak.name || "#" + t.highestLossStreak.id} (${t.highestLossStreak.category})` : null}
        />
      </div>

      <div className="vb-section">
        <div className="vb-toolbar">
          <h3 style={{ margin: 0 }}>Activity</h3>
          <Form.Control as="select" size="sm" value={range} onChange={(e) => setRange(Number(e.target.value))}>
            {[14, 30, 90, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}
          </Form.Control>
          <span className="vb-muted">Battles, with skips stacked on top</span>
        </div>
        <ActivityChart days={days} />
      </div>

      <div className="vb-section">
        <h3>By category</h3>
        <div className="vb-scroll">
          <table className="vb-table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="vb-num">Battles</th>
                <th className="vb-num">Draws</th>
                <th className="vb-num">Skips</th>
                <th className="vb-num">Ranked items</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => {
                const s = summary.categories[c.id] || {};
                return (
                  <tr key={c.id} style={{ cursor: "default" }}>
                    <td>{c.label}</td>
                    <td className="vb-num">{s.battles || 0}</td>
                    <td className="vb-num">{s.draws || 0}</td>
                    <td className="vb-num">{s.skips || 0}</td>
                    <td className="vb-num">{s.items || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="vb-section">
        <h3>Recent battles</h3>
        {recent.length === 0 ? (
          <p className="vb-muted">No battles yet.</p>
        ) : (
          <div className="vb-scroll">
            <table className="vb-table">
              <tbody>
                {recent.map((e) => {
                  const d = describeEntry(e);
                  return (
                    <tr key={e.seq} style={{ cursor: "default" }}>
                      <td className="vb-muted">#{e.seq}</td>
                      <td className="vb-muted">{timeAgo(e.ts)}</td>
                      <td>{CATEGORIES.find((c) => c.id === e.category)?.label}</td>
                      <td className="vb-name">{d.text}</td>
                      <td>{d.outcome}</td>
                      <td className="vb-num vb-muted">
                        {e.result === "skip" ? "" : `${formatDelta(e.delta[0])} / ${formatDelta(e.delta[1])}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
