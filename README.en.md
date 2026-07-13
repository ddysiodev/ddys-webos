# ddys-webos

LG webOS TV packaged web app for DDYS. It provides a remote-control and Magic Remote friendly TV interface for DDYS feeds, categories, search, details, playable resources, favorites, history, resume progress, settings, diagnostics, and HTML5 video playback.

## Features

- Home feeds for latest and hot items.
- Resume row, favorites, and playback history.
- Category browsing for movies, series, anime, variety, and documentaries.
- Search with TV input and pointer support.
- Detail page with poster, metadata, summary, and resources.
- HTML5 video playback with remote media controls.
- Directional remote navigation, Back key, color-key shortcuts, and Magic Remote hover focus.
- API settings for base URL, API key, key mode, page size, cache TTL, and resource filters.
- Runtime diagnostics.
- `.ipk` and source ZIP packaging.

## Install

Use the `.ipk` asset from the GitHub Release. Installing to a TV usually requires LG webOS TV developer mode and webOS SDK/CLI. The source can also be opened in a desktop browser for UI/API debugging.

## Verify

```bash
node tools/check.mjs
node --test tests/*.test.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-package.ps1
```
