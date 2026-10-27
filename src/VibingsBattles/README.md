# Vibings Battles (source)

Source for the Vibings Battles plugin. The built plugin is written to `../../plugins/VibingsBattles/`, which is what the GitHub Pages deploy publishes.

## Layout

| Path | Purpose |
| --- | --- |
| `settings.yml` | stash-plugin-builder config (becomes `VibingsBattles.yml`) |
| `src/index.jsx` | UI entry: page layout (side panel + main panel), nav item, Stash Tools panel; the default export is called by the builder |
| `src/*Tab.jsx` | Battle, Arena, Leaderboard, Stats and Settings views |
| `src/FiltersEditor.jsx` | Blacklist / whitelist editor |
| `src/MaintenancePanels.jsx` | Performance (per browser) and database optimization panels |
| `src/arena.js` | Arena fight simulation (pure, unit tested) |
| `src/perf.js` | Performance options, stored in `localStorage`, with low-end device detection |
| `src/api.js` | `VERSION`, Stash GraphQL, backend calls, category definitions, fallback media, rating sync, status checks |
| `src/useBattlesSettings.js` | Settings state shared by the page and the Tools panel |
| `src/StatusPanel.jsx` | Version and health checks |
| `src/pairing.js` | Weighted pair selection (pure, unit tested) |
| `src/styles.js` | All CSS, themable through `--vibings-battles-*` variables |
| `../_shared/overhaul-tools.jsx` | Shared "Vibings Overhaul" section in Stash's Settings → Tools |
| `backend/vibings_battles.py` | Python backend, stdlib only |
| `tests/` | Backend (unittest), pairing, arena and version (node --test) tests |

## Commands

```sh
npm install        # once
npm test           # backend, pairing, arena and version tests
npm run dev        # build over the installed plugin in ~/.stash/plugins for local testing
npm run build      # tests + minified build into ../../plugins
```

Manual backend call:

```sh
echo '{"args":{"operation":"ping"}}' | python3 backend/vibings_battles.py
```

## Backend

Data lives in `vibings-battles-data.json` next to the script (format v4). The battle log is the single source of truth: ratings, streaks and counters are derived by replaying it, so `undo` and settings changes always stay consistent.

Operations (`runPluginOperation` args, `operation` + fields):

| Operation | Args | Returns |
| --- | --- | --- |
| `ping` | | `{ok, version, dataVersion, battles, dataBytes, corruptBackups, python}` |
| `get_settings` | | settings |
| `save_settings` | `settings` (partial) | `{settings, changed}` |
| `record` | `category`, `a: {id, name, performers?}`, `b: {...}`, `result: a\|b\|draw\|skip` | `{entry, a, b, changed}` |
| `undo` | | `{undone, changed}` |
| `get_items` | `category` | items sorted by rating |
| `get_item` | `category`, `id` | item + last 20 battles |
| `recent_log` | `limit`, `category?` | newest entries first |
| `summary` | `tzOffset` (JS `getTimezoneOffset()`) | totals, per category, daily |
| `reset` | `category?` | `{backup, changed}` |
| `ratings` | | every ranked item's `{category, id, rating100}` |
| `record_arena` | `ranking: [{id, name}]` (winner first), `kills?` | `{entry, changed}` |
| `db_info` | | file size, entry counts, names (unused), backups, referenced ids per category |
| `compact` | `removeItems?: {category: [ids]}`, `dropSkips?`, `keepBackups?` | `{bytesBefore, bytesAfter, removedEntries, removedNames, removedBackups, backup, changed}` |

`changed` lists `{category, id, rating100}` whose Stash rating should be updated; `rating100: null` means clear it. Errors are returned as GraphQL errors.

Scoring is Elo: start 1500, K 32 (48 for the first 10 battles of an item), draw = 0.5. `rating100` is `50 + (elo - 1500) / 8` clamped to 1–100, or rank-based when `ratingMap.mode` is `percentile`.

Fallback media: performers, studios, groups and galleries whose Stash image is the generated placeholder (`default=true`) are shown with a picture from their own library (a scene, or an image); the choice is stable per item.

Settings sections: `elo`, `ratingMap`, `performerBonus`, `pairing` (`noDuplicatePerformer`), `filters` (per category `{blacklist, whitelist, whitelistOn}`, lists of `{id, name}`), `arena` and free-form `ui` (`syncRatings`, `autoContinue`, `animations`, `resultDelayMs`). A partial `save_settings` merges into these sections; `filters` merges per category.

Arena: the UI simulates the fight (`src/arena.js`) and stores the final ranking with `record_arena`. The winner gains `winBonus`; the first knocked out loses `lossPenalty`, later placements proportionally less. The Elo changes are stored in the entry, so changing the arena settings later does not rewrite past fights. Strength is `10^((elo - lineup mean) / 800 * eloInfluence%)`.

Database optimization (`compact`): backs up the file, removes entries of items deleted from Stash (the UI finds them by bisecting id batches) and optionally skips, drops names nothing references and keeps the newest `keepBackups` backups.

Performer bonus: in scene and image battles the winning item's performers get `winnerPct`% (default 25) of its Elo gain, and optionally the losing item's performers `loserPct`% of its loss. Performers are stored in the log entry, so changing the bonus settings recalculates history.

## Version and status

The version must be the same in `settings.yml`, `package.json`, `src/api.js` (`VERSION`) and the backend (`VERSION`); `npm test` fails otherwise. Bump all four for a release.

The Settings view (and the panel in Stash's **Settings → Tools → Vibings Overhaul**) runs status checks: UI, backend version and response time, battle data (size, set-aside corrupt files), Stash and GraphQL, the plugin version Stash has installed, which categories can battle, and the sync / performer bonus settings. The side panel shows the version with the overall status.

## Stash Tools section

`registerToolsPanel()` from `../_shared/overhaul-tools.jsx` adds a panel to a shared "Vibings Overhaul" section after Stash's own Tools sections. The registry lives on `window.VibingsOverhaul`, so every Vibings plugin can bundle the module and they all end up in one section, each in its own collapsible panel.
