# Vibings Overhaul

A collection of [Stash](https://stashapp.cc/) plugins that rework and extend Stash's built-in pages. Every plugin works on its own, so install only the ones you want.

## Installing

In Stash, go to **Settings → Plugins → Available Plugins → Add Source** and add:

```
https://vibingsGit.github.io/vibings-overhaul/main/index.yml
```

## Plugins

| Plugin | Type | Status |
| --- | --- | --- |
| **Vibings Battles** | UI + Python backend | 2.2.0 |
| **Vibings Stats** | UI | 2.0.0 (in development) |

### Vibings Battles

Head-to-head battles that build an Elo ranking for scenes, images, performers, studios, groups and galleries.

- Pick the better of two items, call a draw or skip the pair; undo the last battle at any time
- Battle animations (epic, subtle or off) and an auto continue toggle
- **Arena**: an auto battler where performers fight a free-for-all; Elo can affect strength, and the winner gains Elo while the knocked out lose some
- Blacklist and whitelist per category, and an option to never pit the same performer against itself
- Elo scoring in the backend, mapped to Stash's `rating100` (optional sync)
- Optional performer bonus: scene and image wins also lift the performers
- Smart pairing that favours under-battled items and close matches
- Whole pictures, and items without an image show one from their own library
- Leaderboard, stats and settings; side panel layout that works on phones
- Performance options per device for weaker machines, and a database optimizer
- Settings and status checks also in Stash's **Settings → Tools → Vibings Overhaul**
- Battle log stored on the Stash server, shared across devices

### Vibings Stats

A fast statistics page that replaces Stash's own (optional).

- Views for overview, activity (plays and O over time, weekday × hour heatmaps, streaks), library (resolutions, lengths, codecs, sizes, formats, growth), people (performers, studios, tags, groups), ratings, metadata health and plugins
- Panels appear as soon as their data is loaded; the rest loads in the background and is cached
- Shows statistics from other Vibings plugins, such as Vibings Battles
- Version and status checks for Stash and every Vibings plugin

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/<Plugin>/` | Plugin source (stash-plugin-builder projects) |
| `src/_shared/` | Code bundled into several plugins: the shared Settings → Tools section and the Vibings plugin list |
| `plugins/<Plugin>/` | Built plugins; pushing changes here publishes them |
| `build_site.sh` | Builds the plugin source index for GitHub Pages |

Each source folder has its own README with build and test commands.

## Settings

Every plugin adds its settings to one shared section in Stash: **Settings → Tools → Vibings Overhaul**, with a collapsible panel per plugin showing its version.

## License

[AGPL-3.0](LICENCE)
