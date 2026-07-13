# webOS Notes

LG webOS TV packaged web apps use standard HTML/CSS/JavaScript and `appinfo.json` metadata. The `main` field points to the entry page and `icon` points to the application icon.

Implemented compatibility choices:

- Plain script tags instead of ES modules.
- No npm runtime dependencies.
- XHR-based API client instead of assuming `fetch`.
- HTML5 video playback instead of platform-specific media APIs.
- LG Back key code `461`, plus fallback `10009` and `Escape`.
- Directional focus navigation based on element geometry.
- Magic Remote pointer hover updates focus.
- Local settings, favorites, history, and progress stored under the `ddys-webos` namespace.

The generated `.ipk` follows the opkg archive shape with `debian-binary`, `control.tar.gz`, and `data.tar.gz`. If LG's official `ares-package` is available, it can still be used on the same source directory.
