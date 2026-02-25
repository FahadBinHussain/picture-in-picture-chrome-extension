// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

chrome.action.onClicked.addListener((tab) => {
  // Inject into all frames so videos inside iframes are found.
  // script.js uses captureStream() + injects overlay into the top-level document,
  // so cross-frame videos are mirrored without moving DOM nodes.
  chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    files: ["script.js"],
  });
});

// ── Global PiP size (shared across all tabs) ──────────────────────────────
let _pipW = 0;
let _pipH = 0;
let _pipX = null;
let _pipY = null;

// On startup, restore from storage in case service worker was restarted
chrome.storage.local.get({ pipSizeW: 0, pipSizeH: 0, pipSizeX: null, pipSizeY: null }, (s) => {
  _pipW = s.pipSizeW;
  _pipH = s.pipSizeH;
  _pipX = s.pipSizeX;
  _pipY = s.pipSizeY;
  console.log('[BG v1.62] restored from storage:', _pipW + 'x' + _pipH, '@(' + _pipX + ',' + _pipY + ')');
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'getPipSize') {
    console.log('[BG v1.62] getPipSize →', _pipW + 'x' + _pipH, '@(' + _pipX + ',' + _pipY + ')');
    reply({ w: _pipW, h: _pipH, x: _pipX, y: _pipY });
    return true;
  }
  if (msg.type === 'setPipSize' && msg.w > 0 && msg.h > 0) {
    const prevW = _pipW, prevH = _pipH, prevX = _pipX, prevY = _pipY;
    _pipW = msg.w;
    _pipH = msg.h;
    _pipX = (msg.x != null) ? msg.x : _pipX;
    _pipY = (msg.y != null) ? msg.y : _pipY;
    console.log('[BG v1.62] setPipSize', prevW + 'x' + prevH + ' @(' + prevX + ',' + prevY + ')', '→', _pipW + 'x' + _pipH + ' @(' + _pipX + ',' + _pipY + ')');
    chrome.storage.local.set({ pipSizeW: _pipW, pipSizeH: _pipH, pipSizeX: _pipX, pipSizeY: _pipY });
    reply({ ok: true });
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const { autoPip } = await chrome.storage.local.get({ autoPip: true });
  chrome.contextMenus.create({
    id: "autoPip",
    contexts: ["action"],
    title: "Automatic picture-in-picture (BETA)",
    type: "checkbox",
    checked: autoPip,
  });
  updateContentScripts(autoPip);
});

chrome.runtime.onStartup.addListener(async () => {
  const { autoPip } = await chrome.storage.local.get({ autoPip: true });
  chrome.action.setBadgeBackgroundColor({ color: "#4285F4" });
  chrome.action.setBadgeTextColor({ color: "#fff" });
  updateContentScripts(autoPip);
});

chrome.contextMenus.onClicked.addListener(({ checked: autoPip }) => {
  chrome.storage.local.set({ autoPip });
  updateContentScripts(autoPip);
});

function updateContentScripts(autoPip) {
  chrome.action.setTitle({title: `Automatic picture-in-picture (${autoPip ? "on" : "off"})`});
  chrome.action.setBadgeText({ text: autoPip ? "★" : "" });
  if (!autoPip) {
    chrome.scripting.unregisterContentScripts({ ids: ["autoPip"] });
    return;
  }
  // Always unregister first so updated settings take effect immediately
  chrome.scripting.unregisterContentScripts({ ids: ["autoPip"] }, () => {
    chrome.scripting.registerContentScripts([{
      id: "autoPip",
      js: ["autoPip.js"],
      matches: ["<all_urls>"],
      runAt: "document_idle"
    }]);
  });
}
