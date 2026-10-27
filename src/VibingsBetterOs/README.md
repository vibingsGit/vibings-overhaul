# Vibings Better Os (source)

Source for the Vibings Better Os plugin: a UI plugin with a Python backend that stores the video position of scene Os and the viewing time of image Os. The built plugin is written to `../../plugins/VibingsBetterOs/`, which is what the GitHub Pages deploy publishes.

## Layout

| Path | Purpose |
| --- | --- |
| `settings.yml` | stash-plugin-builder config (becomes `VibingsBetterOs.yml`) |
| `backend/vibings_better_os.py` | Backend: O details, settings, import/export, backups, optimiser (standard library only) |
| `src/index.jsx` | UI entry: scene page tab, Stash Tools panel, start-up |
| `src/tracker.js` | Watches Stash's O mutations and stores each new O's detail; add/delete actions |
| `src/store.js` | Per-scene state: o_history plus stored details, kept in sync |
| `src/decor.js` | Player decorations: timeline markers, O button, pop-up |
| `src/player.js` | The video.js player and the open image's viewing time |
| `src/OsPanel.jsx` | The scene page's Os tab |
| `src/ToolsPanel.jsx` | Settings, import/export, backups and optimiser in Settings → Tools |
| `src/settings.js` | Server-side settings with a local mirror |
| `src/api.js` | `VERSION`, GraphQL, backend calls, time helpers |
| `src/styles.js` | All CSS, themable through `--vibings-better-os-*` variables |
| `tests/` | Backend (`unittest`) and version/build-rule tests (`node --test`) |

## Commands

```sh
npm install        # once
npm test           # backend and UI tests
npm run dev        # build over the installed plugin in ~/.stash/plugins for local testing
npm run build      # tests + minified build into ../../plugins
```

## How it works

**Stash stays the source of truth.** A scene's Os are its `o_history`, an image's are its `o_counter`. The backend only adds detail: a scene O is keyed by its o_history timestamp (UTC, whole seconds) and stores the video position (`t`) and duration (`d`); an image O stores how long the image had been open (`view`). Os without detail are classic Os.

**Tracking.** Stash's UI shares one Apollo client (`PluginApi.utils.StashService.getClient()`). The plugin wraps its `mutate()` and reacts to `SceneAddO`, `SceneDeleteO`, `SceneResetO`, `ImageIncrementO`, `ImageDecrementO` and `ImageResetO`, wherever in Stash they come from. Before the mutation it reads the player position or the open image's viewing time; after it, it stores the detail. Removed Os drop their detail through `sync_scene` (matched against the new o_history, with a 2-second tolerance for older data) or `sync_image`.

**Storage.** `vibings-better-os-data.json` next to the backend, with a file lock, atomic writes and corrupt files moved aside. Automatic backups are made before a write, at most once per interval, and pruned to the configured number.

**Import.** Accepts this plugin's export and the older O-timestamp format (`{"version": 2, "scenes": {id: [{seconds, createdAt}]}}`), merged or replacing the current data; a backup is made first.

## Other plugins

`window.VibingsBetterOs` gives other Vibings plugins the Os tab (`OsPanel`), the per-scene state (`useScene`, `getScene`, `onScene`, `loadScene`, `rows`), `addSceneO(sceneId, source)` and `getSettings`. A scene player that is not video.js marks its `<video>` with `data-vibings-scene-id`; the O position is then read from it (Vibings Better Scenes does this).

## Version

The version must be the same in `settings.yml`, `package.json`, `src/api.js` (`VERSION`) and the backend (`VERSION`); `npm test` fails otherwise.

## Build note

stash-plugin-builder rewrites the source with `String.replace`, so a `$` directly followed by a backtick, `'` or `&` is corrupted in the bundle. Use string concatenation there; a test guards against it.
