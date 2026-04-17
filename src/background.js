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

// Track last click time for double-click detection
let lastClickTime = 0;
const DOUBLE_CLICK_DELAY = 400; // milliseconds

chrome.action.onClicked.addListener((tab) => {
  const now = Date.now();
  const timeSinceLastClick = now - lastClickTime;
  lastClickTime = now;

  // Double-click detected
  if (timeSinceLastClick < DOUBLE_CLICK_DELAY) {
    // Open settings page
    chrome.runtime.openOptionsPage();
    return;
  }

  // Single click - send message to autoPip.js to open PiP
  chrome.tabs.sendMessage(tab.id, { type: 'openPip' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('[Background] Error:', chrome.runtime.lastError.message);
    }
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
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'getPipSize') {
    reply({ w: _pipW, h: _pipH, x: _pipX, y: _pipY });
    return true;
  }
  if (msg.type === 'setPipSize' && msg.w > 0 && msg.h > 0) {
    _pipW = msg.w;
    _pipH = msg.h;
    _pipX = (msg.x != null) ? msg.x : _pipX;
    _pipY = (msg.y != null) ? msg.y : _pipY;
    console.log('[PiP saved] ' + _pipW + 'x' + _pipH + ' @(' + _pipX + ',' + _pipY + ')');
    chrome.storage.local.set({ pipSizeW: _pipW, pipSizeH: _pipH, pipSizeX: _pipX, pipSizeY: _pipY });
    reply({ ok: true });
    return true;
  }
  if (msg.type === 'pipLog') {
    if (msg.msg) console.log(msg.msg);
    reply({ ok: true });
    return true;
  }
  if (msg.type === 'updateSites') {
    // Re-register content scripts with updated site list
    chrome.storage.local.get({ autoPip: true }, (result) => {
      if (result.autoPip) {
        updateContentScripts(true);
      }
    });
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
  
  // Get enabled sites from storage
  chrome.storage.local.get({ enabledSites: 'https://www.youtube.com/*\nhttps://music.youtube.com/*\nhttps://www.netflix.com/*\nhttps://vimeo.com/*\nhttps://www.twitch.tv/*' }, (result) => {
    const sites = result.enabledSites
      .split('\n')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
    
    // Always unregister first so updated settings take effect immediately
    chrome.scripting.unregisterContentScripts({ ids: ["autoPip"] }, () => {
      chrome.scripting.registerContentScripts([{
        id: "autoPip",
        js: ["autoPip.js"],
        matches: sites.length > 0 ? sites : ["<all_urls>"],
        runAt: "document_idle"
      }]);
    });
  });
}

// ── Keyboard shortcut handler ──────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[Background] Command triggered:', command);
  if (command === "open-pip") {
    console.log('[Background] Opening PiP...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[Background] Active tab:', tab);
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'openPip' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Background] Error:', chrome.runtime.lastError.message);
        }
      });
    }
  }
});
