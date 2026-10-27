# Vibings Battles (source)

Source for the Vibings Battles plugin. The built plugin is written to `../../plugins/VibingsBattles/`, which is what the GitHub Pages deploy publishes.

## Layout

| Path | Purpose |
| --- | --- |
| `settings.yml` | stash-plugin-builder config (becomes `VibingsBattles.yml`) |
| `src/index.jsx` | UI entry (page, tabs, nav item); the default export is called by the builder |
| `src/*Tab.jsx` | Battle, Leaderboard, Stats and Settings tabs |
| `src/api.js` | Stash GraphQL, backend calls, category definitions, rating sync |
| `src/pairing.js` | Weighted pair selection (pure, unit tested) |
| `backend/vibings_battles.py` | Python backend, stdlib only |
| `tests/` | Backend (unittest) and pairing (node --test) tests |

## Commands

```sh
npm install        # once
npm test           # backend + pairing tests
npm run dev        # build into ~/.stash/plugins/vibings-dev for local testing
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
| `ping` | | `{ok, dataVersion, battles}` |
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

`changed` lists `{category, id, rating100}` whose Stash rating should be updated; `rating100: null` means clear it. Errors are returned as GraphQL errors.

Scoring is Elo: start 1500, K 32 (48 for the first 10 battles of an item), draw = 0.5. `rating100` is `50 + (elo - 1500) / 8` clamped to 1–100, or rank-based when `ratingMap.mode` is `percentile`.

Performer bonus: in scene and image battles the winning item's performers get `winnerPct`% (default 25) of its Elo gain, and optionally the losing item's performers `loserPct`% of its loss. Performers are stored in the log entry, so changing the bonus settings recalculates history.
