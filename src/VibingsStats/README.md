# Vibings Stats (source)

Source for the Vibings Stats plugin, a UI-only plugin that replaces Stash's Statistics page. The built plugin is written to `../../plugins/VibingsStats/`, which is what the GitHub Pages deploy publishes.

## Layout

| Path | Purpose |
| --- | --- |
| `settings.yml` | stash-plugin-builder config (becomes `VibingsStats.yml`), including the plugin settings shown in Stash |
| `src/index.jsx` | UI entry: page layout, the `/stats` redirect, Stash Tools panel |
| `src/views/*.jsx` | Overview, Activity, Library, People, Ratings, Health, Plugins, Status views |
| `src/datasets.js` | What each statistic is loaded from |
| `src/store.js` | Dataset loader: per-dataset loading, cache, background prefetch |
| `src/aggregate.js` | Pure aggregation helpers (unit tested) |
| `src/api.js` | `VERSION`, GraphQL, batched counts, paginated lists, plugin settings |
| `src/integrations.js` | Statistics from other Vibings plugins (Vibings Battles) |
| `src/status.js` | Status checks for this plugin, Stash and every Vibings plugin |
| `src/ui.jsx` | Panels, cards and the CSS-only bar, column, split and heatmap charts |
| `src/styles.js` | All CSS, themable through `--vibings-stats-*` variables |
| `../_shared/overhaul-plugins.js` | The Vibings plugin list used by status checks |
| `tests/` | Aggregation, version and build-rule tests (`node --test`) |

## Commands

```sh
npm install        # once
npm test           # unit tests
npm run dev        # build over the installed plugin in ~/.stash/plugins for local testing
npm run build      # tests + minified build into ../../plugins
```

## How it works

**Page.** Stash's `/stats` route cannot be patched, so the page lives at `/vibings-stats`. A component in the navbar (mounted on every page) replaces `/stats` with `/vibings-stats` in a layout effect, before the browser paints, so Stash's own page never flashes and the redirect works from any page, including custom home pages. The setting *Keep Stash's own Statistics page* turns this off.

**Loading.** Statistics are split into datasets (`src/datasets.js`). A view asks only for the datasets it shows, and each panel renders as soon as its dataset arrives, with a skeleton until then. After the open view, the remaining datasets load one by one in the background. Most numbers are batched count queries (dozens of `findX(filter: { per_page: 0 }) { count }` aliases per request); only scenes (for play and O history), performers and the studio, tag, group and gallery lists are fetched item by item, in pages. Images are never downloaded item by item.

**Cache.** Results are kept in memory and in `localStorage` (aggregates only, tens of KB). A return visit shows them at once; when older than *Cache minutes* (default 15) they refresh in the background while the old numbers stay visible. The Status view lists every dataset with its load time and lets you reload one, refresh all or clear the cache.

**Plugins.** `src/integrations.js` reads statistics from other Vibings plugins when they are installed and enabled. Vibings Battles: totals, ranked items per category, the top items by Elo and recent battles, through its backend operations. Plugins that are not released yet are listed with their state.

## Version and status

The version must be the same in `settings.yml`, `package.json` and `src/api.js` (`VERSION`); `npm test` fails otherwise.

The Status view (and the panel in Stash's **Settings → Tools → Vibings Overhaul**) checks the UI version, Stash and GraphQL latency, the plugin version Stash has installed, every Vibings Overhaul plugin, whether the Statistics page is replaced, and whether the statistics loaded.

## Build note

stash-plugin-builder rewrites the source with `String.replace`, so a `$` directly followed by a backtick, `'` or `&` is corrupted in the bundle. Use string concatenation there; a test guards against it.
