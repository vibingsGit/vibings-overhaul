// Datasets: each one is a small set of Stash queries whose result a view
// can show on its own. Count statistics use batched count queries
// (milliseconds even for large libraries); only scenes, performers and
// the smaller entity lists are fetched item by item, in pages.

import { graphql, countMany, findMany, fetchAll } from "./api.js";
import {
  daysAgo, lastMonths, sceneActivity, sceneFileStats, performerStats, entityTops, sum,
  RATING_BUCKETS, bucketMean,
} from "./aggregate.js";
import { loadIntegrations } from "./integrations.js";

export const LIBRARY = [
  { id: "scenes", label: "Scenes" },
  { id: "images", label: "Images" },
  { id: "galleries", label: "Galleries" },
  { id: "groups", label: "Groups" },
  { id: "performers", label: "Performers" },
  { id: "studios", label: "Studios" },
  { id: "tags", label: "Tags" },
];
const RATED = ["scenes", "images", "galleries", "groups", "performers", "studios"];

const RESOLUTIONS = [
  { label: "≤ 480p", values: ["VERY_LOW", "LOW", "R360P", "STANDARD"] },
  { label: "720p", values: ["WEB_HD", "STANDARD_HD"] },
  { label: "1080p", values: ["FULL_HD"] },
  { label: "1440p", values: ["QUAD_HD"] },
  { label: "4K", values: ["FOUR_K"] },
  { label: "5K–8K", values: ["FIVE_K", "SIX_K", "SEVEN_K", "EIGHT_K"] },
  { label: "> 8K", values: ["HUGE"] },
];
const ORIENTATIONS = [["Landscape", "LANDSCAPE"], ["Portrait", "PORTRAIT"], ["Square", "SQUARE"]];
const DURATIONS = [
  { label: "< 5 min", f: { value: 300, modifier: "LESS_THAN" } },
  { label: "5–15 min", f: { value: 300, value2: 899, modifier: "BETWEEN" } },
  { label: "15–30 min", f: { value: 900, value2: 1799, modifier: "BETWEEN" } },
  { label: "30–60 min", f: { value: 1800, value2: 3599, modifier: "BETWEEN" } },
  { label: "1–2 h", f: { value: 3600, value2: 7199, modifier: "BETWEEN" } },
  { label: "2 h +", f: { value: 7199, modifier: "GREATER_THAN" } },
];
const IMAGE_FORMATS = [
  ["JPEG", "jpe?g"], ["PNG", "png"], ["WebP", "webp"], ["GIF", "gif"], ["AVIF", "avif"], ["HEIC", "heic|heif"], ["Video", "mp4|webm|m4v|mov"],
];
const RECENT_DAYS = [7, 30, 90, 365];
const GROWTH_MONTHS = 24;

const resolutionSpecs = (entity) =>
  Object.fromEntries(RESOLUTIONS.flatMap((r) => r.values.map((v) => [`res_${v}`, [entity, { resolution: { value: v, modifier: "EQUALS" } }]])));
const resolutionRows = (counts) => RESOLUTIONS.map((r) => ({ label: r.label, value: sum(r.values, (v) => counts[`res_${v}`]) }));
const orientationSpecs = (entity) => Object.fromEntries(ORIENTATIONS.map(([, v]) => [`or_${v}`, [entity, { orientation: { value: [v] } }]]));
const orientationRows = (counts) => ORIENTATIONS.map(([label, v]) => ({ label, value: counts[`or_${v}`] ?? 0 }));

const NAME = {
  scenes: "id title date created_at files { basename }",
  images: "id title created_at visual_files { ... on BaseFile { basename } }",
  galleries: "id title created_at folder { path } files { basename }",
  groups: "id name created_at",
  performers: "id name created_at",
  studios: "id name created_at",
  tags: "id name created_at",
};
const basename = (p) => (p ? String(p).split(/[/\\]/).pop() : "");
export function itemName(entity, it) {
  if (!it) return "";
  if (entity === "scenes") return it.title || it.files?.[0]?.basename || `Scene ${it.id}`;
  if (entity === "images") return it.title || it.visual_files?.[0]?.basename || `Image ${it.id}`;
  if (entity === "galleries") return it.title || it.files?.[0]?.basename || basename(it.folder?.path) || `Gallery ${it.id}`;
  return it.name || `#${it.id}`;
}
const ref = (entity, it) => (it ? { id: String(it.id), name: itemName(entity, it), created_at: it.created_at, date: it.date } : null);

export const DATASETS = [
  {
    name: "core",
    label: "Library totals",
    async load() {
      const [{ stats }, counts] = await Promise.all([
        graphql(`query VibingsStatsCore { stats { scene_count scenes_size scenes_duration image_count images_size gallery_count
          performer_count studio_count group_count tag_count total_o_count total_play_duration total_play_count scenes_played } }`),
        countMany({
          markers: ["markers", {}],
          scenesOrganized: ["scenes", { organized: true }],
          imagesOrganized: ["images", { organized: true }],
          galleriesOrganized: ["galleries", { organized: true }],
          performersFavorite: ["performers", { filter_favorites: true }],
          studiosFavorite: ["studios", { favorite: true }],
          tagsFavorite: ["tags", { favorite: true }],
          scenesInteractive: ["scenes", { interactive: true }],
          scenesWithMarkers: ["scenes", { has_markers: "true" }],
          scenesWithO: ["scenes", { o_counter: { value: 0, modifier: "GREATER_THAN" } }],
          imagesWithO: ["images", { o_counter: { value: 0, modifier: "GREATER_THAN" } }],
        }),
      ]);
      return { stats, counts };
    },
  },
  {
    name: "growth",
    label: "Recently added and growth",
    async load() {
      const specs = {};
      for (const { id } of LIBRARY) {
        for (const d of RECENT_DAYS) specs[`${id}_${d}`] = [id, { created_at: { value: daysAgo(d), modifier: "GREATER_THAN" } }];
      }
      const months = lastMonths(GROWTH_MONTHS);
      for (const id of ["scenes", "images", "galleries", "performers"]) {
        months.forEach((m) => { specs[`m_${id}_${m.key}`] = [id, { created_at: { value: m.start, value2: m.end, modifier: "BETWEEN" } }]; });
      }
      const c = await countMany(specs);
      return {
        recent: Object.fromEntries(LIBRARY.map(({ id }) => [id, Object.fromEntries(RECENT_DAYS.map((d) => [d, c[`${id}_${d}`]]))])),
        monthly: Object.fromEntries(["scenes", "images", "galleries", "performers"].map((id) =>
          [id, months.map((m) => ({ label: m.key, value: c[`m_${id}_${m.key}`] ?? 0 }))])),
      };
    },
  },
  {
    name: "latest",
    label: "Newest and oldest items",
    async load() {
      const specs = {};
      for (const { id } of LIBRARY) {
        specs[`${id}_new`] = [id, { per_page: 5, sort: "created_at", direction: "DESC" }, NAME[id]];
        specs[`${id}_old`] = [id, { per_page: 1, sort: "created_at", direction: "ASC" }, NAME[id]];
      }
      specs.scenes_released = [
        "scenes", { per_page: 1, sort: "date", direction: "DESC" }, NAME.scenes,
        { date: { value: "0001-01-01", modifier: "GREATER_THAN" } },
      ];
      specs.scenes_oldestRelease = [
        "scenes", { per_page: 1, sort: "date", direction: "ASC" }, NAME.scenes,
        { date: { value: "0001-01-01", modifier: "GREATER_THAN" } },
      ];
      specs.played = ["scenes", { per_page: 8, sort: "last_played_at", direction: "DESC" }, `${NAME.scenes} last_played_at play_count`,
        { play_count: { value: 0, modifier: "GREATER_THAN" } }];
      const r = await findMany(specs);
      return {
        newest: Object.fromEntries(LIBRARY.map(({ id }) => [id, r[`${id}_new`].map((it) => ref(id, it))])),
        oldest: Object.fromEntries(LIBRARY.map(({ id }) => [id, ref(id, r[`${id}_old`][0])])),
        newestRelease: ref("scenes", r.scenes_released[0]),
        oldestRelease: ref("scenes", r.scenes_oldestRelease[0]),
        recentlyPlayed: r.played.map((s) => ({ ...ref("scenes", s), last_played_at: s.last_played_at, play_count: s.play_count })),
      };
    },
  },
  {
    name: "media",
    label: "Resolutions, lengths and formats",
    async load() {
      const specs = {
        ...Object.fromEntries(Object.entries(resolutionSpecs("scenes")).map(([k, v]) => [`s_${k}`, v])),
        ...Object.fromEntries(Object.entries(orientationSpecs("scenes")).map(([k, v]) => [`s_${k}`, v])),
        ...Object.fromEntries(Object.entries(resolutionSpecs("images")).map(([k, v]) => [`i_${k}`, v])),
        ...Object.fromEntries(Object.entries(orientationSpecs("images")).map(([k, v]) => [`i_${k}`, v])),
        galleriesZip: ["galleries", { is_zip: true }],
        galleriesEmpty: ["galleries", { image_count: { value: 0, modifier: "EQUALS" } }],
      };
      DURATIONS.forEach((d, i) => { specs[`dur_${i}`] = ["scenes", { duration: d.f }]; });
      // Concatenated on purpose: stash-plugin-builder corrupts "$" followed by a backtick.
      IMAGE_FORMATS.forEach(([label, re]) => {
        specs[`fmt_${label}`] = ["images", { path: { value: "(?i)\\.(" + re + ")$", modifier: "MATCHES_REGEX" } }];
      });
      const c = await countMany(specs);
      const pick = (prefix) => Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
      return {
        sceneResolutions: resolutionRows(pick("s_")),
        sceneOrientations: orientationRows(pick("s_")),
        imageResolutions: resolutionRows(pick("i_")),
        imageOrientations: orientationRows(pick("i_")),
        durations: DURATIONS.map((d, i) => ({ label: d.label, value: c[`dur_${i}`] ?? 0 })),
        imageFormats: IMAGE_FORMATS.map(([label]) => ({ label, value: c[`fmt_${label}`] ?? 0 })).filter((r) => r.value > 0),
        galleriesZip: c.galleriesZip,
        galleriesEmpty: c.galleriesEmpty,
      };
    },
  },
  {
    name: "scenes",
    label: "Play and O history",
    async load(report) {
      const scenes = await fetchAll("scenes",
        "id title date play_count play_duration o_counter play_history o_history files { basename size duration video_codec audio_codec frame_rate bit_rate }",
        report, 500);
      return { activity: sceneActivity(scenes), files: sceneFileStats(scenes), count: scenes.length };
    },
  },
  {
    name: "performers",
    label: "Performers",
    async load(report) {
      const list = await fetchAll("performers",
        "id name gender birthdate death_date country ethnicity hair_color eye_color height_cm favorite rating100 scene_count image_count o_counter",
        report);
      return performerStats(list);
    },
  },
  {
    name: "entities",
    label: "Studios, tags, groups and galleries",
    async load(report) {
      const parts = [
        ["studios", "id name favorite rating100 scene_count image_count gallery_count o_counter parent_studio { id }"],
        ["tags", "id name favorite scene_count image_count gallery_count performer_count scene_marker_count parent_count"],
        ["groups", "id name duration rating100 scene_count o_counter"],
        ["galleries", "id title image_count rating100 folder { path } files { basename }"],
      ];
      const lists = {};
      for (let i = 0; i < parts.length; i++) {
        const [entity, fields] = parts[i];
        lists[entity] = await fetchAll(entity, fields, (done, total) => report(i * 1000 + Math.round((done / Math.max(1, total)) * 1000), parts.length * 1000));
      }
      const nm = (entity) => (it) => itemName(entity, it);
      return {
        studios: {
          ...entityTops(lists.studios, ["scene_count", "image_count", "o_counter"], nm("studios")),
          total: lists.studios.length,
          withParent: lists.studios.filter((s) => s.parent_studio).length,
          empty: lists.studios.filter((s) => !s.scene_count && !s.image_count && !s.gallery_count).length,
        },
        tags: {
          ...entityTops(lists.tags, ["scene_count", "image_count", "performer_count", "scene_marker_count"], nm("tags")),
          total: lists.tags.length,
          withParent: lists.tags.filter((t) => t.parent_count > 0).length,
          unused: lists.tags.filter((t) => !t.scene_count && !t.image_count && !t.gallery_count && !t.performer_count && !t.scene_marker_count).length,
        },
        groups: {
          ...entityTops(lists.groups, ["scene_count", "duration", "o_counter"], nm("groups")),
          total: lists.groups.length,
          totalDuration: sum(lists.groups, (g) => g.duration),
        },
        galleries: {
          ...entityTops(lists.galleries, ["image_count"], nm("galleries")),
          total: lists.galleries.length,
          averageImages: lists.galleries.length ? Math.round(sum(lists.galleries, (g) => g.image_count) / lists.galleries.length) : 0,
        },
      };
    },
  },
  {
    name: "ratings",
    label: "Ratings",
    async load() {
      const specs = {};
      for (const id of RATED) {
        RATING_BUCKETS.forEach((b, i) => { specs[`${id}_${i}`] = [id, { rating100: { value: b.min, value2: b.max, modifier: "BETWEEN" } }]; });
        specs[`${id}_all`] = [id, {}];
      }
      const tops = {};
      for (const id of RATED) tops[id] = [id, { per_page: 5, sort: "rating", direction: "DESC" }, `${NAME[id]} rating100`, { rating100: { value: 0, modifier: "GREATER_THAN" } }];
      const [c, top] = await Promise.all([countMany(specs), findMany(tops)]);
      return Object.fromEntries(RATED.map((id) => {
        const counts = RATING_BUCKETS.map((_, i) => c[`${id}_${i}`] ?? 0);
        return [id, {
          buckets: RATING_BUCKETS.map((b, i) => ({ label: b.label, value: counts[i] })),
          rated: sum(counts),
          unrated: c[`${id}_all`] == null ? null : c[`${id}_all`] - sum(counts),
          mean: bucketMean(counts),
          top: top[id].map((it) => ({ id: String(it.id), name: itemName(id, it), value: it.rating100 })),
        }];
      }));
    },
  },
  {
    name: "health",
    label: "Metadata completeness",
    async load() {
      const MISSING = {
        scenes: [["Title", "title"], ["Date", "date"], ["Studio", "studio"], ["Performers", "performers"], ["Tags", "tags"], ["Cover", "cover"], ["StashDB link", "stash_id"]],
        performers: [["Image", "image"], ["Gender", "gender"], ["Birthdate", "birthdate"], ["Country", "country"], ["Ethnicity", "ethnicity"], ["Height", "height"], ["Tags", "tags"], ["StashDB link", "stash_id"]],
        studios: [["Image", "image"], ["StashDB link", "stash_id"]],
        groups: [["Front cover", "front_image"], ["Studio", "studio"], ["Date", "date"]],
        galleries: [["Date", "date"], ["Studio", "studio"], ["Performers", "performers"], ["Tags", "tags"]],
        images: [["Performers", "performers"], ["Tags", "tags"], ["Studio", "studio"]],
        tags: [["Image", "image"], ["Description", "description"]],
      };
      const specs = {
        scenesUnorganized: ["scenes", { organized: false }],
        imagesUnorganized: ["images", { organized: false }],
        duplicates: ["scenes", { duplicated: { duplicated: true, distance: 0 } }],
        multiFile: ["scenes", { file_count: { value: 1, modifier: "GREATER_THAN" } }],
      };
      for (const [entity, list] of Object.entries(MISSING)) {
        list.forEach(([, v]) => { specs[`${entity}_${v}`] = [entity, { is_missing: v }]; });
      }
      const c = await countMany(specs);
      return {
        missing: Object.fromEntries(Object.entries(MISSING).map(([entity, list]) =>
          [entity, list.map(([label, v]) => ({ label, key: v, value: c[`${entity}_${v}`] }))])),
        scenesUnorganized: c.scenesUnorganized,
        imagesUnorganized: c.imagesUnorganized,
        duplicates: c.duplicates,
        multiFile: c.multiFile,
      };
    },
  },
  {
    name: "plugins",
    label: "Plugins",
    load: () => loadIntegrations(),
  },
];
