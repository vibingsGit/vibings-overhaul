// Health: how complete the metadata is, and what needs attention. Each row
// links to the Stash list of the items that are missing it.

import { Panel, DatasetCards, Meter, KeyValues, fmtNumber, fmtPct, filterHref } from "../ui.jsx";
import { useDataset } from "../store.js";

const PluginApi = window.PluginApi;
const React = PluginApi.React;

const ENTITIES = [
  ["scenes", "Scenes", "scene_count"], ["performers", "Performers", "performer_count"], ["images", "Images", "image_count"],
  ["galleries", "Galleries", "gallery_count"], ["studios", "Studios", "studio_count"], ["groups", "Groups", "group_count"],
  ["tags", "Tags", "tag_count"],
];

function Completeness({ entity, label, totalKey }) {
  const core = useDataset("core").data;
  const total = core?.stats[totalKey];
  return (
    <Panel title={label} dataset="health" span={entity === "scenes" || entity === "performers" ? 6 : 4} rows={4}>
      {(h) => (
        <>
          {h.missing[entity].map((m) => (
            <Meter key={m.key} label={m.label} total={total} have={m.value == null || total == null ? null : total - m.value}
              href={filterHref(entity, { type: "is_missing", value: m.key })} />
          ))}
        </>
      )}
    </Panel>
  );
}

export function Health() {
  return (
    <>
      <p className="vs-muted">Bars show the share of items that have each field. Click a field to open the items that are missing it.</p>
      <DatasetCards dataset="health" count={4} cards={(h) => [
        { label: "Unorganized scenes", value: fmtNumber(h.scenesUnorganized), href: filterHref("scenes", { type: "organized", value: "false" }) },
        { label: "Unorganized images", value: fmtNumber(h.imagesUnorganized), href: filterHref("images", { type: "organized", value: "false" }) },
        { label: "Duplicate scenes", value: fmtNumber(h.duplicates), note: "same perceptual hash", href: "/sceneDuplicateChecker" },
        { label: "Scenes with several files", value: fmtNumber(h.multiFile) },
      ]} />
      <div className="vs-grid">
        {ENTITIES.map(([id, label, key]) => <Completeness key={id} entity={id} label={label} totalKey={key} />)}
        <Panel title="Housekeeping" dataset="entities" span={4} rows={4}>
          {({ tags, studios }) => (
            <KeyValues rows={[
              ["Unused tags", `${fmtNumber(tags.unused)} (${fmtPct(tags.unused, tags.total)})`],
              ["Studios without content", fmtNumber(studios.empty)],
            ]} />
          )}
        </Panel>
      </div>
    </>
  );
}
