// Overview: the library at a glance, recent activity and what is new.

import { periodTotals } from "../aggregate.js";
import { LIBRARY } from "../datasets.js";
import { Panel, DatasetCards, Bars, Split, KeyValues, fmtNumber, fmtBytes, fmtDuration, fmtPct, timeAgo, itemHref } from "../ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

export function Overview() {
  return (
    <>
      <DatasetCards dataset="core" count={8} cards={({ stats: s, counts: c }) => [
        { label: "Scenes", value: fmtNumber(s.scene_count), note: `${fmtBytes(s.scenes_size)} · ${fmtDuration(s.scenes_duration)}`, hero: true, href: "/scenes" },
        { label: "Images", value: fmtNumber(s.image_count), note: fmtBytes(s.images_size), hero: true, href: "/images" },
        { label: "Galleries", value: fmtNumber(s.gallery_count), href: "/galleries" },
        { label: "Groups", value: fmtNumber(s.group_count), href: "/groups" },
        { label: "Performers", value: fmtNumber(s.performer_count), note: `${fmtNumber(c.performersFavorite)} favourites`, href: "/performers" },
        { label: "Studios", value: fmtNumber(s.studio_count), href: "/studios" },
        { label: "Tags", value: fmtNumber(s.tag_count), href: "/tags" },
        { label: "Markers", value: fmtNumber(c.markers), note: `in ${fmtNumber(c.scenesWithMarkers)} scenes` },
      ]} />

      <div className="vs-grid">
        <Panel title="Watching" dataset="core" span={4}>
          {({ stats: s, counts: c }) => (
            <KeyValues rows={[
              ["Plays", fmtNumber(s.total_play_count)],
              ["Time watched", fmtDuration(s.total_play_duration)],
              ["Scenes played", `${fmtNumber(s.scenes_played)} (${fmtPct(s.scenes_played, s.scene_count)})`],
              ["Never played", fmtNumber(s.scene_count - s.scenes_played)],
              ["O count", fmtNumber(s.total_o_count)],
              ["Scenes with an O", fmtNumber(c.scenesWithO)],
              ["Images with an O", fmtNumber(c.imagesWithO)],
            ]} />
          )}
        </Panel>

        <Panel title="Recent activity" dataset="scenes" span={4}>
          {({ activity: a }) => {
            const p = periodTotals(a.plays);
            const o = periodTotals(a.os);
            return (
              <KeyValues rows={[
                ["Plays today / 7 d / 30 d", `${p.today} / ${p.week} / ${p.month}`],
                ["O today / 7 d / 30 d", `${o.today} / ${o.week} / ${o.month}`],
                ["Play streak", `${a.playStreak.current} d (best ${a.playStreak.longest})`],
                ["O streak", `${a.oStreak.current} d (best ${a.oStreak.longest})`],
                ["Last played", timeAgo(a.lastPlay)],
                ["Last O", timeAgo(a.lastO)],
              ]} />
            );
          }}
        </Panel>

        <Panel title="Storage" dataset="core" span={4}>
          {({ stats: s }) => (
            <>
              <Split format={fmtBytes} data={[{ label: "Scenes", value: s.scenes_size }, { label: "Images", value: s.images_size }]} />
              <div style={{ marginTop: 12 }}>
                <KeyValues rows={[
                  ["Total", fmtBytes((s.scenes_size || 0) + (s.images_size || 0))],
                  ["Average scene", fmtBytes(s.scene_count ? s.scenes_size / s.scene_count : null)],
                  ["Average image", fmtBytes(s.image_count ? s.images_size / s.image_count : null)],
                  ["Average scene length", fmtDuration(s.scene_count ? s.scenes_duration / s.scene_count : null)],
                ]} />
              </div>
            </>
          )}
        </Panel>

        <Panel title="Added in the last 30 days" dataset="growth" span={6}>
          {({ recent }) => <Bars data={LIBRARY.map((c) => ({ label: c.label, value: recent[c.id][30] }))} empty="Nothing added in 30 days" />}
        </Panel>

        <Panel title="Newest scenes" dataset="latest" span={6}>
          {({ newest }) => (
            <table className="vs-table">
              <tbody>
                {newest.scenes.map((s) => (
                  <tr key={s.id}>
                    <td className="vs-name"><a href={itemHref("scenes", s.id)}>{s.name}</a></td>
                    <td className="vs-num vs-muted">{timeAgo(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Vibings Overhaul" dataset="plugins" span={12} rows={2}>
          {(plugins) => <PluginSummary plugins={plugins} />}
        </Panel>
      </div>
    </>
  );
}

function PluginSummary({ plugins }) {
  const released = plugins.filter((p) => !p.planned || p.installed);
  const battles = plugins.find((p) => p.id === "VibingsBattles")?.stats?.summary?.totals;
  return (
    <KeyValues rows={[
      ...released.map((p) => [p.name, p.installed ? `${p.enabled ? "enabled" : "disabled"} · v${p.version}` : "not installed"]),
      ...(battles ? [["Battles fought", `${fmtNumber(battles.battles)} (+ ${fmtNumber(battles.arenas || 0)} arena fights)`]] : []),
    ]} />
  );
}
