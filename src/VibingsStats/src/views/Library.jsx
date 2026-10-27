// Library: what the collection is made of — video and image formats,
// lengths, sizes, growth over time and the newest / oldest items.

import { LIBRARY } from "../datasets.js";
import { useDataset } from "../store.js";
import { Panel, Bars, Columns, Split, KeyValues, Toggle, fmtNumber, fmtBytes, fmtDuration, fmtDate, fmtPct, timeAgo, itemHref } from "../ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const GROWTH = [["scenes", "Scenes"], ["images", "Images"], ["galleries", "Galleries"], ["performers", "Performers"]];
const mbps = (b) => (b == null ? "–" : `${(b / 1e6).toFixed(1)} Mbps`);

export function Library() {
  const [growth, setGrowth] = React.useState("scenes");
  return (
    <>
      <div className="vs-section-title">Scenes</div>
      <div className="vs-grid">
        <Panel title="Resolution" dataset="media" span={4}>
          {(m) => <Bars data={m.sceneResolutions} />}
        </Panel>
        <Panel title="Length" dataset="media" span={4}>
          {(m) => <Bars data={m.durations} />}
        </Panel>
        <Panel title="File size" dataset="scenes" span={4}>
          {({ activity }) => <Bars data={activity.sizeBuckets} />}
        </Panel>
        <Panel title="Orientation" dataset="media" span={4} rows={2}>
          {(m) => <Split data={m.sceneOrientations} />}
        </Panel>
        <Panel title="Video codec" dataset="scenes" span={4} rows={2}>
          {({ files }) => <Split data={files.videoCodecs} />}
        </Panel>
        <Panel title="Container" dataset="scenes" span={4} rows={2}>
          {({ files }) => <Split data={files.containers} />}
        </Panel>
        <Panel title="Frame rate (fps)" dataset="scenes" span={4}>
          {({ files }) => <Bars data={files.frameRates} />}
        </Panel>
        <Panel title="Bit rate" dataset="scenes" span={4}>
          {({ files }) => (
            <>
              <Bars data={files.bitRates} />
              <p className="vs-muted vs-empty">Average {mbps(files.averageBitRate)}</p>
            </>
          )}
        </Panel>
        <Panel title="Audio codec" dataset="scenes" span={4}>
          {({ files }) => <Bars data={files.audioCodecs} />}
        </Panel>
        <Panel title="Release year" dataset="scenes" span={8}>
          {({ activity }) => <Columns data={activity.releaseYears} />}
        </Panel>
        <Panel title="Largest and longest" dataset="scenes" span={4} rows={6}>
          {({ activity }) => (
            <>
              <div className="vs-card-label" style={{ marginBottom: 6 }}>Largest files</div>
              <Bars data={activity.largest} entity="scenes" format={fmtBytes} />
              <div className="vs-card-label" style={{ margin: "14px 0 6px" }}>Longest scenes</div>
              <Bars data={activity.longest} entity="scenes" format={fmtDuration} />
            </>
          )}
        </Panel>
      </div>

      <div className="vs-section-title">Images and galleries</div>
      <div className="vs-grid">
        <Panel title="Image resolution" dataset="media" span={4}>
          {(m) => <Bars data={m.imageResolutions} />}
        </Panel>
        <Panel title="Image format" dataset="media" span={4}>
          {(m) => <Bars data={m.imageFormats} />}
        </Panel>
        <Panel title="Image orientation" dataset="media" span={4} rows={2}>
          {(m) => <Split data={m.imageOrientations} />}
        </Panel>
        <Panel title="Galleries" dataset="entities" span={6}>
          {({ galleries }) => <Bars data={galleries.image_count} entity="galleries" ranked empty="No galleries" />}
        </Panel>
        <Panel title="Gallery facts" dataset="media" span={6}>
          {(m) => <GalleryFacts media={m} />}
        </Panel>
      </div>

      <div className="vs-section-title">Growth</div>
      <div className="vs-grid">
        <Panel title="Added per month" dataset="growth" span={8} extra={<Toggle options={GROWTH} value={growth} onChange={setGrowth} />}>
          {({ monthly }) => <Columns data={monthly[growth]} />}
        </Panel>
        <Panel title="Recently added" dataset="growth" span={4} rows={7}>
          {({ recent }) => (
            <div className="vs-scroll">
              <table className="vs-table">
                <thead><tr><th /><th className="vs-num">7 d</th><th className="vs-num">30 d</th><th className="vs-num">1 y</th></tr></thead>
                <tbody>
                  {LIBRARY.map((c) => (
                    <tr key={c.id}><td>{c.label}</td>
                      <td className="vs-num">{fmtNumber(recent[c.id][7])}</td>
                      <td className="vs-num">{fmtNumber(recent[c.id][30])}</td>
                      <td className="vs-num">{fmtNumber(recent[c.id][365])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Newest and oldest" dataset="latest" span={12} rows={7}>
          {(l) => (
            <div className="vs-scroll">
              <table className="vs-table">
                <thead><tr><th /><th>Newest</th><th className="vs-hide-sm">Added</th><th>Oldest</th><th className="vs-hide-sm">Added</th></tr></thead>
                <tbody>
                  {LIBRARY.map((c) => {
                    const n = l.newest[c.id][0];
                    const o = l.oldest[c.id];
                    return (
                      <tr key={c.id}>
                        <td>{c.label}</td>
                        <td className="vs-name">{n ? <a href={itemHref(c.id, n.id)}>{n.name}</a> : "–"}</td>
                        <td className="vs-muted vs-hide-sm">{n ? timeAgo(n.created_at) : ""}</td>
                        <td className="vs-name">{o ? <a href={itemHref(c.id, o.id)}>{o.name}</a> : "–"}</td>
                        <td className="vs-muted vs-hide-sm">{o ? fmtDate(o.created_at) : ""}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td>By release date</td>
                    <td className="vs-name">{l.newestRelease ? <a href={itemHref("scenes", l.newestRelease.id)}>{l.newestRelease.name}</a> : "–"}</td>
                    <td className="vs-muted vs-hide-sm">{fmtDate(l.newestRelease?.date)}</td>
                    <td className="vs-name">{l.oldestRelease ? <a href={itemHref("scenes", l.oldestRelease.id)}>{l.oldestRelease.name}</a> : "–"}</td>
                    <td className="vs-muted vs-hide-sm">{fmtDate(l.oldestRelease?.date)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

// Counts from "media" plus the average from the (slower) gallery list.
function GalleryFacts({ media }) {
  const ent = useDataset("entities").data?.galleries;
  return (
    <KeyValues rows={[
      ["Zip archives", fmtNumber(media.galleriesZip)],
      ["Without images", fmtNumber(media.galleriesEmpty)],
      ["Average images per gallery", ent ? fmtNumber(ent.averageImages) : "…"],
      ["Zip share", ent ? fmtPct(media.galleriesZip, ent.total) : "…"],
    ]} />
  );
}
