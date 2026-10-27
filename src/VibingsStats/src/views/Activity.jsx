// Activity: plays and O counts over time, when they happen, streaks and the
// most watched scenes.

import { periodTotals, dailySeries, monthlySeries } from "../aggregate.js";
import { Panel, StatCard, Bars, Columns, Heatmap, KeyValues, Toggle, fmtNumber, fmtDuration, fmtDate, timeAgo, itemHref } from "../ui.jsx";
import { useDataset } from "../store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const RANGES = [["30", "30 d"], ["90", "90 d"], ["365", "1 y"], ["months", "24 mo"]];

function series(map, range) {
  return range === "months" ? monthlySeries(map, 24) : dailySeries(map, Number(range));
}
const shortDay = (label) => (label.length === 7 ? label : label.slice(5));

function Totals() {
  const ds = useDataset("scenes");
  const a = ds.data?.activity;
  const p = a && periodTotals(a.plays);
  const o = a && periodTotals(a.os);
  const cards = [
    { label: "Plays · 7 days", value: p && fmtNumber(p.week), note: p && `${p.today} today · ${p.month} in 30 d` },
    { label: "O · 7 days", value: o && fmtNumber(o.week), note: o && `${o.today} today · ${o.month} in 30 d` },
    { label: "Play streak", value: a && `${a.playStreak.current} d`, note: a && `best ${a.playStreak.longest} d · ${a.playStreak.activeDays} active days` },
    { label: "O streak", value: a && `${a.oStreak.current} d`, note: a && `best ${a.oStreak.longest} d · ${a.oStreak.activeDays} active days` },
    { label: "Busiest play day", value: a?.busiestPlayDay ? fmtNumber(a.busiestPlayDay.value) : a && "–", note: a?.busiestPlayDay && fmtDate(a.busiestPlayDay.label) },
    { label: "Busiest O day", value: a?.busiestODay ? fmtNumber(a.busiestODay.value) : a && "–", note: a?.busiestODay && fmtDate(a.busiestODay.label) },
  ];
  return <div className="vs-cards">{cards.map((c) => <StatCard key={c.label} {...c} loading={!a} />)}</div>;
}

export function Activity() {
  const [range, setRange] = React.useState("90");
  const toggle = <Toggle options={RANGES} value={range} onChange={setRange} />;
  return (
    <>
      <Totals />
      <div className="vs-grid">
        <Panel title="Plays" dataset="scenes" span={6} extra={toggle}>
          {({ activity }) => <Columns data={series(activity.plays, range)} labelFormat={shortDay} />}
        </Panel>
        <Panel title="O count" dataset="scenes" span={6} extra={toggle}>
          {({ activity }) => <Columns data={series(activity.os, range)} labelFormat={shortDay} />}
        </Panel>

        <Panel title="When you watch" dataset="scenes" span={6}>
          {({ activity }) => <Heatmap grid={activity.playHeat} unit="plays" />}
        </Panel>
        <Panel title="When the O happens" dataset="scenes" span={6}>
          {({ activity }) => <Heatmap grid={activity.oHeat} unit="O" />}
        </Panel>

        <Panel title="Most played" dataset="scenes" span={4} rows={6}>
          {({ activity }) => <Bars data={activity.topPlayed} entity="scenes" ranked empty="Nothing played yet" />}
        </Panel>
        <Panel title="Most O" dataset="scenes" span={4} rows={6}>
          {({ activity }) => <Bars data={activity.topO} entity="scenes" ranked empty="No O yet" />}
        </Panel>
        <Panel title="Most time watched" dataset="scenes" span={4} rows={6}>
          {({ activity }) => <Bars data={activity.topPlayTime} entity="scenes" ranked format={fmtDuration} empty="Nothing played yet" />}
        </Panel>

        <Panel title="Recently played" dataset="latest" span={6} rows={6}>
          {({ recentlyPlayed }) => recentlyPlayed.length ? (
            <table className="vs-table">
              <tbody>
                {recentlyPlayed.map((s) => (
                  <tr key={s.id}>
                    <td className="vs-name"><a href={itemHref("scenes", s.id)}>{s.name}</a></td>
                    <td className="vs-num vs-muted vs-hide-sm">{s.play_count}×</td>
                    <td className="vs-num vs-muted">{timeAgo(s.last_played_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="vs-empty">Nothing played yet</p>}
        </Panel>
        <Panel title="History" dataset="scenes" span={6}>
          {({ activity: a }) => (
            <KeyValues rows={[
              ["First play", fmtDate(a.firstPlay)],
              ["Last play", timeAgo(a.lastPlay)],
              ["First O", fmtDate(a.firstO)],
              ["Last O", timeAgo(a.lastO)],
              ["Longest play streak", a.playStreak.longest ? `${a.playStreak.longest} d (ended ${fmtDate(a.playStreak.longestEnd)})` : "–"],
              ["Longest O streak", a.oStreak.longest ? `${a.oStreak.longest} d (ended ${fmtDate(a.oStreak.longestEnd)})` : "–"],
              ["Played, no O yet", fmtNumber(a.playedWithoutO)],
              ["Never played", fmtNumber(a.neverPlayed)],
            ]} />
          )}
        </Panel>
      </div>
    </>
  );
}
