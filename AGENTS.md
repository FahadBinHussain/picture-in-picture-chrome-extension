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

## Quick checks

- `node --check src/autoPip.js` and `node --check src/background.js` and
  `node --check src/options.js` validate syntax (no test framework).
- Manifest is JSON — verify with `node -e "JSON.parse(require('fs').readFileSync('src/manifest.json','utf8'))"`.
- No build step. Load `src/` as an unpacked extension in `edge://extensions`
  or `chrome://extensions` to test. Reload after edits.
