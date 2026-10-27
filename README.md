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
| **Vibings Battles** | UI + Python backend | 2.0.0 |

### Vibings Battles

Head-to-head battles that build an Elo ranking for scenes, images, performers, studios, groups and galleries.

- Pick the better of two items, call a draw or skip the pair; undo the last battle at any time
- Elo scoring in the backend, mapped to Stash's `rating100` (optional sync)
- Smart pairing that favours under-battled items and close matches
- Battle log stored on the Stash server, shared across devices

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/<Plugin>/` | Plugin source (stash-plugin-builder projects) |
| `plugins/<Plugin>/` | Built plugins; pushing changes here publishes them |
| `build_site.sh` | Builds the plugin source index for GitHub Pages |

Each source folder has its own README with build and test commands.

## License

[AGPL-3.0](LICENCE)
