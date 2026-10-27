// Plugins: every Vibings Overhaul plugin, and the statistics of those that
// keep their own data (currently Vibings Battles).

import { Panel, KeyValues, Bars, fmtNumber, timeAgo } from "../ui.jsx";
import { useDataset } from "../store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const BATTLE_CATEGORIES = [
  ["scenes", "Scenes"], ["images", "Images"], ["performers", "Performers"],
  ["studios", "Studios"], ["groups", "Groups"], ["galleries", "Galleries"],
];

function pill(p) {
  if (p.installed) return <span className={`vs-pill ${p.enabled ? "ok" : "warn"}`}>{p.enabled ? "Enabled" : "Disabled"} · v{p.version}</span>;
  return <span className="vs-pill">{p.planned ? "Coming later" : "Not installed"}</span>;
}

function describe(e) {
  if (e.type === "arena") return `Arena: ${e.names?.[0] || `#${e.ranking[0]}`} won (${e.ranking.length} fighters)`;
  const a = e.aName || `#${e.a}`;
  const b = e.bName || `#${e.b}`;
  if (e.result === "skip") return `${a} vs ${b} (skipped)`;
  if (e.result === "draw") return `${a} vs ${b} (draw)`;
  return e.result === "a" ? `${a} beat ${b}` : `${b} beat ${a}`;
}

function BattlesStats({ stats }) {
  const { summary, recent, top } = stats;
  const t = summary.totals;
  return (
    <div className="vs-grid" style={{ marginBottom: 0 }}>
      <div className="vs-span-4">
        <KeyValues rows={[
          ["Battles", fmtNumber(t.battles)],
          ["Draws", fmtNumber(t.draws)],
          ["Skips", fmtNumber(t.skips)],
          ["Arena fights", fmtNumber(t.arenas || 0)],
          ["Last battle", timeAgo(t.lastBattle)],
          ["Best win streak", t.highestWinStreak ? `${t.highestWinStreak.value} · ${t.highestWinStreak.name || `#${t.highestWinStreak.id}`}` : "–"],
        ]} />
        <div style={{ height: 12 }} />
        <Bars data={BATTLE_CATEGORIES.map(([id, label]) => ({ label, value: summary.categories[id]?.items || 0 }))} empty="Nothing ranked yet" />
        <p className="vs-empty">Ranked items per category</p>
      </div>
      {Object.keys(top).slice(0, 2).map((cat) => (
        <div key={cat} className="vs-span-4">
          <div className="vs-card-label" style={{ marginBottom: 8 }}>Top {cat} (Elo)</div>
          <Bars data={top[cat].map((it) => ({ id: it.id, label: it.name || `#${it.id}`, value: Math.round(it.rating) }))}
            entity={cat} ranked empty="Nothing ranked yet" max={Math.max(...top[cat].map((it) => it.rating), 1)} />
        </div>
      ))}
      <div className="vs-span-12">
        <div className="vs-card-label" style={{ margin: "6px 0 8px" }}>Recent battles</div>
        {recent.length ? (
          <table className="vs-table">
            <tbody>
              {recent.map((e) => (
                <tr key={e.seq}>
                  <td className="vs-name">{describe(e)}</td>
                  <td className="vs-muted vs-hide-sm">{e.category}</td>
                  <td className="vs-num vs-muted">{timeAgo(e.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="vs-empty">No battles yet</p>}
      </div>
    </div>
  );
}

function BetterOsStats({ stats }) {
  const c = stats.counts;
  return (
    <div className="vs-grid" style={{ marginBottom: 0 }}>
      <div className="vs-span-6">
        <KeyValues rows={[
          ["Scene Os with video position", `${fmtNumber(c.timedOs)} on ${fmtNumber(c.scenes)} scenes`],
          ["Image Os with viewing time", `${fmtNumber(c.sessionOs)} on ${fmtNumber(c.images)} images`],
          ["Data file", `${(stats.dataBytes / 1024).toFixed(1)} KB`],
        ]} />
      </div>
      <div className="vs-span-6">
        <p className="vs-empty">All O statistics are in the <a href="/vibings-stats?view=os">Os</a> view.</p>
      </div>
    </div>
  );
}

const STATS_COMPONENTS = { VibingsBattles: BattlesStats, VibingsBetterOs: BetterOsStats };

export function Plugins() {
  const ds = useDataset("plugins");
  return (
    <div className="vs-grid">
      {(ds.data || []).filter((p) => p.id !== "VibingsStats").map((p) => {
        const Stats = STATS_COMPONENTS[p.id];
        return (
          <section key={p.id} className="vs-panel vs-span-12">
            <div className="vs-plugin-head">
              <h3>{p.name}</h3>
              {pill(p)}
              {p.installed && p.enabled && p.route && <a href={p.route} className="vs-muted">Open</a>}
            </div>
            {p.error && <p className="vs-empty" style={{ color: "var(--vibings-stats-bad)" }}>Could not read its statistics: {p.error}</p>}
            {p.stats && Stats && <div style={{ marginTop: 12 }}><Stats stats={p.stats} /></div>}
            {!p.installed && !p.planned && <p className="vs-empty">Install it from the Vibings Overhaul source to see its statistics here.</p>}
            {p.installed && !p.enabled && <p className="vs-empty">Enable it in Settings → Plugins to see its statistics here.</p>}
            {p.planned && !p.installed && <p className="vs-empty">Its statistics appear here once it is released and installed.</p>}
          </section>
        );
      })}
      {!ds.data && (
        <Panel title="Vibings Overhaul plugins" dataset="plugins" span={12}>{() => null}</Panel>
      )}
    </div>
  );
}
