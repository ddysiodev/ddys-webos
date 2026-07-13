# Architecture

`ddys-webos` is a dependency-free LG webOS TV packaged web app.

- `appinfo.json`: webOS app metadata, id, version, title, icon, entry page, and resolution.
- `index.html`: static shell and script loading order.
- `src/ddys-client.js`: DDYS API client, cache, movie/resource normalization, resource classification.
- `src/focus.js`: remote-control focus manager plus Magic Remote pointer hover focus.
- `src/player.js`: HTML5 video player, progress tracking, playback controls, and self-checks.
- `src/store.js`: localStorage-backed settings, favorites, history, and resume progress.
- `src/app.js`: screen rendering, navigation, search, details, settings, diagnostics, and playback actions.

The application does not depend on npm packages. The `.ipk` artifact is generated from the runtime app files under `usr/palm/applications/io.ddys.webos`.
