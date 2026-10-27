# Vibings Play Tracking Fix (source)

Source for the Vibings Play Tracking Fix plugin: a UI plugin with a Python backend that replaces Stash's own play tracking in the scene player and estimates earlier play counts from earlier play time. The built plugin is written to `../../plugins/VibingsPlayTrackingFix/`, which is what the GitHub Pages deploy publishes.

## Layout

| Path | Purpose |
| --- | --- |
| `settings.yml` | stash-plugin-builder config (becomes `VibingsPlayTrackingFix.yml`) |
| `backend/vibings_play_tracking.py` | Backend: settings, this plugin's play time per scene, estimates, stored originals, backups, optimiser (standard library only) |
| `src/index.jsx` | UI entry: finds the scene player, switches Stash's tracking off, History tab card, Tools panel, `window.VibingsPlayTracking` |
| `src/tracker.js` | Follows one `<video>` element and saves play time, resume point and plays |
| `src/session.js` | The counting rules, without the DOM |
| `src/ledger.js` | Sends this plugin's play time and plays to the backend in batches |
| `src/estimate.js` | Estimated earlier plays and replacement histories, without the DOM |
| `src/stash.js` | Stash reads and writes for the Tools panel (replace, undo, resume points) |
| `src/ToolsPanel.jsx` | Settings → Tools: tracking options, estimates, optimiser, backups, reset |
| `src/SceneCard.jsx` | Play summary at the top of the scene page's History tab |
| `src/settings.js` | Server-side settings with a local mirror |
| `src/api.js` | `VERSION`, GraphQL, backend calls, the saves and the matching cache updates |
| `src/styles.js` | All CSS, themable through `--vibings-play-tracking-*` variables |
| `tests/` | Backend (`unittest`), counting and estimate rules, version/build-rule tests (`node --test`) |

## Commands

```sh
npm install        # once
npm test           # tests
npm run dev        # build over the installed plugin in ~/.stash/plugins for local testing
npm run build      # tests + minified build into ../../plugins
```

## How it works

**Stash's tracking.** Stash's `trackActivity` video.js plugin adds one second of play time every second the player reports "playing", and counts a play at its first save once the minimum play percent (default 0 %) is reached. The plugin switches its timer and saves off on the class, so every player instance is covered.

**Counting.** The tracker samples the `<video>` element on `timeupdate`, `pause`, `ratechange` and `ended`. Only forward movement of the video that fits the elapsed wall time counts: a paused or seeking video, jumps back and skips forward on the timeline add nothing. Faster playback counts the video time that went by.

**Saving.** Play time and the resume point are saved with `sceneSaveActivity` after every 10 s of new play time, on pause, on seeking, at the end, when the scene changes and when the page is hidden or closed (`keepalive`). The resume point follows Stash's rule: past 98 % it is saved as 0.

**Plays.** One play per viewing, with `sceneAddPlay`, once the set share of the video (Tools setting, default 25 %) has played. A new viewing starts with a new scene, a new video source, at the end of the video (so a replay counts again), at a jump from the end to the start (a loop; the edge is 3 s, or 15 % of a short video), and at a jump back to the start once the viewing has counted its play.

**This plugin's share.** The backend keeps, per scene, the play time and plays this plugin saved (sent in batches: every minute, on pause, at the end, when a viewing ends and when the page is hidden), and the start date (`installedAt`, set when the data file is created; it can be changed in Tools).

**Estimated earlier plays.** Earlier play time is a scene's `play_duration` minus this plugin's share; divided by the scene's length (rounded to nearest, down or up) it is the estimated number of earlier plays. Earlier plays in Stash are play history entries dated before the start date. Scenes without length, and optionally scenes without earlier play time (older Stash versions counted plays without time), keep their count. Three modes:

- *Calculate* only shows the result (totals, the biggest changes, CSV download).
- *Hybrid* stores the estimates in the backend; they are shown apart from Stash's play counts (History tab card, Vibings Stats). Stash is not changed.
- *Replace* changes Stash: each scene's earlier history is stored in the backend first (the first stored version is kept on later runs), then the scene's history is rewritten with `sceneResetPlayCount` + `sceneAddPlay(times)`: the newest earlier entries are kept and extra entries are dated one second apart before the oldest earlier play (or the scene's creation, at the latest a day before the start date). Plays since the start date stay. *Undo* writes the stored earlier history back, keeping plays since the start date.

**Optimise.** Resume points at 98 % or more (Stash would start such a video from the beginning) can be cleared with `sceneResetActivity`. The plugin data drops rows of deleted scenes and empty rows, and can prune backups.

**Stash's settings.** If *Track activity* is off in Stash's interface settings, nothing is tracked.

**Other players.** `window.VibingsPlayTracking.track(video, getSceneId)` tracks any `<video>` element that plays a scene and returns a stop function.

## Version

The version must be the same in `settings.yml`, `package.json`, `src/api.js` (`VERSION`) and the backend (`VERSION`); `npm test` fails otherwise.

## Build note

stash-plugin-builder rewrites the source with `String.replace`, so a `$` directly followed by a backtick, `'` or `&` is corrupted in the bundle. Use string concatenation there; a test guards against it.
