# Vibings Better Scenes (source)

Source for the Vibings Better Scenes plugin: a UI-only plugin that replaces Stash's scene page with its own player, side panel and views under the player. The built plugin is written to `../../plugins/VibingsBetterScenes/`, which is what the GitHub Pages deploy publishes.

## Layout

| Path | Purpose |
| --- | --- |
| `settings.yml` | stash-plugin-builder config (becomes `VibingsBetterScenes.yml`) |
| `src/index.jsx` | UI entry: patches `ScenePage` and `ScenePlayer`, Tools panel |
| `src/Player.jsx` | The video player: controls, keyboard, touch and swipe gestures, loops, streams, queue, sleep timer, media session |
| `src/PlayerTools.jsx` | Screenshots, quick markers, ambient light, the most watched part, fade out |
| `src/MiniPlayer.jsx` | Mini player that keeps the video playing after leaving the scene page |
| `src/Timeline.jsx` | Timeline: scrubbing, thumbnail preview, markers, O positions, A/B loop, heatmap |
| `src/SidePanel.jsx` | Side panel: Overview, Queue and Stash (Stash's own scene page) tabs |
| `src/QuickEdit.jsx`, `src/QuickBattle.jsx` | Quick edit in the Overview; a Vibings Battles battle against a similar scene |
| `src/ui.jsx` | Dialog and an error box |
| `src/BelowPlayer.jsx` | Up next, continue watching, recommendations (tunable), performers' scenes, markers as chapters, filters, file info |
| `src/FiltersPanel.jsx`, `src/filters.js`, `src/audio.js` | Video filters (CSS + an SVG colour filter) and audio filters (Web Audio) |
| `src/Nerds.jsx` | Stats for nerds with bitrate, audio spectrum and frame rate graphs |
| `src/NavPreview.jsx` | The scene the previous / next buttons would load |
| `src/QueuePanel.jsx`, `src/queue.js` | Up next (this tab), Stash's queue, saved queues and groups |
| `src/SceneCard.jsx`, `src/ContextMenu.jsx` | Scene cards and right-click / long-press menus |
| `src/integrations.js` | Other Vibings plugins: Better Os, Play Tracking Fix, Battles |
| `src/tracking.js` | Play tracking: Vibings Play Tracking Fix, or a fallback like Stash's own |
| `src/store.js`, `src/settings.js` | Shared page state; settings and the library in Stash's plugin configuration |
| `src/format.js` | Formatting, sprite track parsing and recommendation scoring (no DOM) |
| `src/logic.js` | Chapters, most watched part, loudness, play order, queue links, sleep timer (no DOM) |
| `src/styles.js`, `src/icons.jsx` | CSS (themable through `--vibings-better-scenes-*`) and icons |
| `tests/` | `node --test` tests |

## Commands

```sh
npm install        # once
npm test           # tests
npm run dev        # build over the installed plugin in ~/.stash/plugins for local testing
npm run build      # tests + minified build into ../../plugins
```

## How it works

**Patches, not overlays.** Stash's scene route renders `ScenePage` (title, toolbar, tabs) and `ScenePlayer`. Both are replaced with `PluginApi.patch.instead`, receiving the same props. Stash's player is never mounted, and routing, the queue (`queueScenes`, `onQueueNext`, …), `autoplay`, the `t=` start time, continue playlist and marker links (`sendSetTimestamp`) keep working. The two parts share state through `store.js`; the CSS turns the row into one grid (player, side panel, views under the player). Stash's original `ScenePage` is rendered in the side panel's Stash tab, so editing, markers, file info, history and tabs added by other plugins stay available. If a part throws, Stash's own component is shown instead.

**Player.** A plain `<video>` with the scene's streams in Stash's order; a stream that fails moves on to the next one. Starts at `t=`, else the resume point (unless Stash is set to always start from the beginning). The video element carries `data-vibings-scene-id`, so Vibings Better Os reads the O position from it.

**Queue.** Up next (sessionStorage, this tab) plays first, each scene once; then Stash's queue. Scenes are dragged by their handle into up next (or back out). At the end of a video, continue playlist moves on; repeat starts the queue again; randomize picks a random queue scene that was not played recently (picked once per scene, so the button preview and what plays match), and previous then goes back through the scenes played in this tab.

**Player extras.** Markers split the timeline into chapters; B adds a marker at the current time (title, a recent or any tag), Shift+S takes a screenshot (download, copy or set as the scene's cover), `,` and `.` step a frame. Ambient light samples the picture a few times a second into box shadows around the player. The sleep timer fades out and pauses after a time, or stops at the end of the scene (also ending a loop and the queue). Touch: swipe sideways for the next or previous scene, up or down in fullscreen for the volume; fullscreen turns the screen to the video's orientation.

**Mini player.** Leaving the scene page while playing moves the same `<video>` element (in a layout effect, before React removes it) into a fixed element on `document.body`, so playback, filters, play tracking and the heatmap recording carry on. Its controls are a separate React root. Expanding opens the scene page again and the new player starts at the mini player's time.

**Loudness.** With "even out loudness" a gain node at the start of the audio chain follows the measured level of what has played (RMS of non-silent moments) towards one target, within ±12 dB.

**Layout.** On wide screens the default view fits the window (no page scroll): the views under the player and the side panel scroll inside. Theater mode lets the page scroll.

**Filters.** Video filters are CSS on the `<video>` plus an SVG filter for gamma, warmth and the colour levels. Audio filters (boost, bass/mids/treble, balance, compressor, mono) use a Web Audio chain made only when a filter or the spectrum is first used; the context is resumed whenever the video plays.

**Settings and library.** Stored with `configurePlugin` under the plugin's `settings` and `library` keys (shared by all devices); the whole configuration is written each time, so both are kept and nothing is written before it has been read. The library holds saved queues (played again as Stash queues with `?qs=…&continue=true`), filter presets and filters remembered per scene. Volume, the last tabs and views and recent marker tags are per device (localStorage). Saving a queue as a group creates a Stash group and adds the scenes in order, keeping their other groups.

**Other plugins.** Vibings Better Os: O positions on the timeline, its Os panel in the Overview, the O button stores the position. Vibings Play Tracking Fix: the video is handed to `window.VibingsPlayTracking.track`; without it, a fallback that counts like Stash's own player. Vibings Battles: Elo and rank of the scene and its performers (`get_items`, cached for a minute); "Battle" records a battle against a similar scene with `record` and writes the changed ratings to Stash when Battles syncs ratings. Vibings Scene Heatmap: the most watched curve over the timeline; H (and optionally the start of a scene) jumps to the most watched part.

## Version

The version must be the same in `settings.yml`, `package.json` and `src/api.js` (`VERSION`); `npm test` fails otherwise.

## Build note

stash-plugin-builder rewrites the source with `String.replace`, so a `$` directly followed by a backtick, `'` or `&` is corrupted in the bundle. Use string concatenation there; a test guards against it.
