# Project notes — picture-in-picture-chrome-extension

Forked from GoogleChromeLabs' MV3 PiP extension. Structural changes already
landed in this repo (Document PiP custom window, options page, site list), so
direct in-tree patches are acceptable here — do not try to upstream-target
these changes.

## PiP gotchas (browser behavior, hard-won)

- **Document PiP (`window.documentPictureInPicture.requestWindow()`) requires
  a transient user activation.** Programmatically triggering it from a
  `visibilitychange` event (tab switch) is rejected by Chrome with
  `NotAllowedError`. This is most visible on `youtube.com` because that's the
  main auto-PiP target.
- **Native `<video>.requestPictureInPicture()` is NOT user-gesture-gated**
  for already-playing media, and works reliably when triggered from a tab
  switch. Use it as the auto-PiP fallback when Document PiP fails.
- `autoPip.js` triggerAutoPip now does: try Document PiP → on failure, fall
  back to native PiP. Returning to the tab must call `document.exitPictureInPicture()`
  too (not just close the Document PiP window), otherwise the native fallback
  PiP stays open after the tab regains visibility.
- Content scripts are dynamically registered via `chrome.scripting.registerContentScripts`
  (in `background.js updateContentScripts`) driven by the user-edited
  `enabledSites` list. The manifest has no static `content_scripts` entry —
  any new default site must be added in THREE places: `options.js DEFAULT_SITES`,
  `background.js enabledSites` default string, and `options.html` examples list.

## Default site list gotcha

The old default list only had `https://www.youtube.com/*`. YouTube sometimes
redirects through / serves from bare `https://youtube.com/*` — that URL would
silently get no content script. Both patterns are in the default list now.

## Service worker cold-start dimension race

- **Background.js `getPipSize` race:** MV3 service workers are killed after
  ~30s idle. When a content script sends `getPipSize` on tab switch, the SW
  wakes up and runs top-level code, but the async `chrome.storage.local.get()`
  (line 138) callback hasn't fired yet. The synchronous `getPipSize` handler
  replies with zeroed in-memory globals → content script opens PiP at the
  reset default size. On the second tab switch, the SW is already warm and
  globals are populated → correct size.
- **Fix:** `getPipSize` reads directly from `chrome.storage.local` instead of
  the in-memory cache, so it always returns the correct saved dimensions even
  on a cold SW start.

## YT Music DOM churn (2026-10)

- YT Music's 2026 UI removed `ytmusic-player-bar` entirely. The song title now
  lives in `ytmusic-track-info .ytmusicTrackInfoTitle` (text content + `title`
  attribute); artist byline in `.ytmusicTrackInfoByline`.
- The queue panel header reuses the old `.title` class:
  `yt-formatted-string.title` inside `ytmusic-queue-header-renderer` is the
  "Playing from" label, and the left-nav guide entries (Home/Explore/Library/…)
  also match a bare `yt-formatted-string.title` in document order. Any selector
  of the form `*.title` on YT Music is therefore a junk magnet.
- `pickTrackTitle` now prefers `navigator.mediaSession.metadata.title` (verified
  correct on YT Music), then `ytmusic-track-info .ytmusicTrackInfoTitle`, then
  the legacy selectors; every candidate passes `cleanTitle()` which drops
  nav/queue labels ("Playing from", "Home", …).
- To re-verify after another YT Music redesign: `browser-use` JS dump of
  `ytmusic-track-info` outerHTML + check what bare `yt-formatted-string.title`
  resolves to in document order. mediaSession is the stable source; DOM is
  fallback only.

## Quick checks

- `node --check src/autoPip.js` and `node --check src/background.js` and
  `node --check src/options.js` validate syntax (no test framework).
- Manifest is JSON — verify with `node -e "JSON.parse(require('fs').readFileSync('src/manifest.json','utf8'))"`.
- No build step. Load `src/` as an unpacked extension in `edge://extensions`
  or `chrome://extensions` to test. Reload after edits (bump `version` patch
  in `src/manifest.json` in the same edit) with `pwsh tools/reload-extension.ps1`
  — it opens `src/reload.html`, which messages bg to blank its tab + call
  `chrome.runtime.reload()`, so manifest bumps are picked up too. Extensions
  Reloader is JS-only and never re-reads the manifest. note: no pinned manifest
  `key`, so the extension id in the ps1 is path-derived — if the folder moves,
  re-read the id from `edge://extensions`.
