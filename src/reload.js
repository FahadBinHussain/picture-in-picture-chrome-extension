// reload.js - dev-loop helper behind reload.html (opened by
// tools/reload-extension.ps1 after editing extension files, INCLUDING
// manifest.json). one method, no background handler: this extension page
// itself calls chrome.runtime.reload() - core MV3 API, available in every
// build, so it reloads from disk no matter how old the RUNNING copy is.
// (the old sendMessage handshake required the running copy to already
// contain the selfReload handler; on an older copy it just showed a
// manual-reload notice instead of reloading.) the status text below stays
// painted after the reload kills this page's context.
const el = document.getElementById("status");
let ver = "";
try { ver = chrome.runtime.getManifest().version; } catch (_) {}
try {
  if (el) el.textContent = "reloading from disk (running " + ver + ") - done, close this tab.";
  chrome.runtime.reload();
} catch (e) {
  if (el) el.textContent = "reload failed: " + String(e && e.message ? e.message : e);
}
