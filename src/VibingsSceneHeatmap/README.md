# Vibings Scene Heatmap (source)

Source for the Vibings Scene Heatmap plugin: a UI plugin with a Python backend that records which parts of each video are watched and draws a curve of the most watched parts over the player's timeline. The built plugin is written to `../../plugins/VibingsSceneHeatmap/`, which is what the GitHub Pages deploy publishes.

## Layout

| Path | Purpose |
| --- | --- |
| `settings.yml` | stash-plugin-builder config (becomes `VibingsSceneHeatmap.yml`) |
| `backend/vibings_scene_heatmap.py` | Backend: watched seconds per part of each video, settings, import/export, backups, optimiser (standard library only) |
| `src/index.jsx` | UI entry: finds the players, `window.VibingsSceneHeatmap`, Tools panel |
| `src/tracker.js` | Records the watched segments of a `<video>` and sends them in batches |
| `src/heat.js` | Segments, bins and the curve (no DOM) |
| `src/store.js` | Per-scene heat, with what was just watched added locally |
| `src/Curve.jsx`, `src/decor.jsx` | The curve; on Stash's own player inside the progress bar |
| `src/ToolsPanel.jsx`, `src/settings.js` | Settings → Tools; server-side settings with a local mirror |
| `tests/` | Backend (`unittest`) and curve / build-rule tests (`node --test`) |

## Commands

```sh
npm install        # once
npm test           # backend and UI tests
npm run dev        # build over the installed plugin in ~/.stash/plugins for local testing
npm run build      # tests + minified build into ../../plugins
```

## How it works

**Recording.** Every second of a scene's player (Stash's video.js player, or a `<video data-vibings-scene-id>` such as Vibings Better Scenes') is sampled on `timeupdate`. Forward movement that fits the elapsed wall time extends the current segment; pauses, seeks and jumps close it (the same rule as Vibings Play Tracking Fix). Segments are sent every 30 s, on pause, at the end, when the video changes and when the page is hidden (`keepalive`).

**Data.** Per scene, 200 equal parts (bins) of the video hold the watched seconds in them; rewatching adds again, skipped parts stay low. Stored in `vibings-scene-heatmap-data.json` next to the backend, with a file lock, atomic writes, corrupt files moved aside and automatic backups.

**Curve.** The bins are smoothed (a weighted moving average, setting *smoothing*) and scaled to the highest part. It shows while the pointer is on the timeline, or always. On Stash's player it is rendered into the progress bar; Vibings Better Scenes draws it with `window.VibingsSceneHeatmap.Curve`.

## Version

The version must be the same in `settings.yml`, `package.json`, `src/api.js` (`VERSION`) and the backend (`VERSION`); `npm test` fails otherwise.

## Build note

stash-plugin-builder rewrites the source with `String.replace`, so a `$` directly followed by a backtick, `'` or `&` is corrupted in the bundle. Use string concatenation there; a test guards against it.
