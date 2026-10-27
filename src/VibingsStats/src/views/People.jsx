// People and organisation: performers, studios, tags and groups.

import { Panel, DatasetCards, Bars, Split, KeyValues, Toggle, fmtNumber, fmtDuration, fmtPct } from "../ui.jsx";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const PERFORMER_TOPS = [["topScenes", "Scenes"], ["topImages", "Images"], ["topO", "O"], ["topRated", "Rating"]];
const STUDIO_TOPS = [["scene_count", "Scenes"], ["image_count", "Images"], ["o_counter", "O"]];
const TAG_TOPS = [["scene_count", "Scenes"], ["image_count", "Images"], ["performer_count", "Performers"], ["scene_marker_count", "Markers"]];
const GROUP_TOPS = [["scene_count", "Scenes"], ["duration", "Length"], ["o_counter", "O"]];

function TopPanel({ title, dataset, pick, options, entity, span = 4 }) {
  const [metric, setMetric] = React.useState(options[0][0]);
  return (
    <Panel title={title} dataset={dataset} span={span} rows={8} extra={<Toggle options={options} value={metric} onChange={setMetric} />}>
      {(data) => <Bars data={pick(data)[metric]} entity={entity} ranked format={metric === "duration" ? fmtDuration : fmtNumber} />}
    </Panel>
  );
}

export function People() {
  return (
    <>
      <DatasetCards dataset="performers" count={4} cards={(p) => [
        { label: "Performers", value: fmtNumber(p.total), note: `${fmtNumber(p.withScenes)} appear in scenes`, href: "/performers" },
        { label: "Favourites", value: fmtNumber(p.favorites), note: fmtPct(p.favorites, p.total, 1) },
        { label: "Average age", value: p.averageAge ?? "–", note: "living performers with a birthdate" },
        { label: "Unknown gender", value: fmtNumber(p.unknownGender) },
      ]} />

      <div className="vs-section-title">Performers</div>
      <div className="vs-grid">
        <Panel title="Gender" dataset="performers" span={6} rows={2}>
          {(p) => <Split data={p.genders} />}
        </Panel>
        <Panel title="Age" dataset="performers" span={6} rows={2}>
          {(p) => <Bars data={p.ages} />}
        </Panel>
        <TopPanel title="Top performers" dataset="performers" pick={(p) => p} options={PERFORMER_TOPS} entity="performers" span={6} />
        <Panel title="Country" dataset="performers" span={6} rows={8}>
          {(p) => <Bars data={p.countries} />}
        </Panel>
        <Panel title="Height (cm)" dataset="performers" span={4}>
          {(p) => <Bars data={p.heights} />}
        </Panel>
        <Panel title="Ethnicity" dataset="performers" span={4}>
          {(p) => <Bars data={p.ethnicities} />}
        </Panel>
        <Panel title="Hair and eyes" dataset="performers" span={4}>
          {(p) => (
            <>
              <Bars data={p.hairColors.slice(0, 5)} />
              <div style={{ height: 12 }} />
              <Bars data={p.eyeColors.slice(0, 5)} />
            </>
          )}
        </Panel>
      </div>

      <div className="vs-section-title">Studios, tags and groups</div>
      <div className="vs-grid">
        <TopPanel title="Top studios" dataset="entities" pick={(d) => d.studios} options={STUDIO_TOPS} entity="studios" />
        <TopPanel title="Top tags" dataset="entities" pick={(d) => d.tags} options={TAG_TOPS} entity="tags" />
        <TopPanel title="Top groups" dataset="entities" pick={(d) => d.groups} options={GROUP_TOPS} entity="groups" />
        <Panel title="Organisation" dataset="entities" span={12} rows={3}>
          {({ studios, tags, groups }) => (
            <div className="vs-grid" style={{ marginBottom: 0 }}>
              <div className="vs-span-4"><KeyValues rows={[
                ["Studios", fmtNumber(studios.total)],
                ["Sub-studios", fmtNumber(studios.withParent)],
                ["Studios without content", fmtNumber(studios.empty)],
              ]} /></div>
              <div className="vs-span-4"><KeyValues rows={[
                ["Tags", fmtNumber(tags.total)],
                ["Tags with a parent", fmtNumber(tags.withParent)],
                ["Unused tags", fmtNumber(tags.unused)],
              ]} /></div>
              <div className="vs-span-4"><KeyValues rows={[
                ["Groups", fmtNumber(groups.total)],
                ["Total group length", fmtDuration(groups.totalDuration)],
              ]} /></div>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
