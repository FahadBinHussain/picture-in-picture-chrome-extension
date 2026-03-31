// Copyright 2025 Google LLC
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

// autoPip.js — v1.71

function findLargestPlayingVideo() {
  const videos = Array.from(document.querySelectorAll("video"))
    .filter((v) => v.readyState != 0)
    .filter((v) => v.disablePictureInPicture == false)
    .sort((a, b) => {
      const ar = a.getClientRects()[0] || { width: 0, height: 0 };
      const br = b.getClientRects()[0] || { width: 0, height: 0 };
      return br.width * br.height - ar.width * ar.height;
    });
  return videos[0] || null;
}

//  Auto-PiP via visibilitychange 
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    triggerAutoPip();
  } else {
    stopAutoPip();
  }
});

try {
  navigator.mediaSession.setActionHandler("enterpictureinpicture", () => {
    triggerAutoPip();
  });
} catch (_) {}

// Listen for messages from background.js (keyboard shortcut + icon click)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'openPip') {
    console.log('[AutoPiP] Opening PiP via message');
    manualTriggerPip();
    sendResponse({ ok: true });
    return true;
  }
});

// Manual trigger (doesn't check document.hidden)
function manualTriggerPip() {
  const video = findLargestPlayingVideo();
  if (!video) {
    console.log('[AutoPiP] No video found');
    return;
  }

  // If a pip window exists but is still closing, wait
  if (window._autoPipWindow && !window._autoPipWindow.closed) {
    console.log('[AutoPiP] PiP window already open');
    return;
  }

  if (typeof window.documentPictureInPicture === 'undefined') {
    console.log('[AutoPiP] documentPictureInPicture not available');
    return;
  }

  chrome.runtime.sendMessage({ type: 'getPipSize' }, (stored) => {
    if (window._autoPipWindow && !window._autoPipWindow.closed) return;

    const w = (stored && stored.w > 0) ? stored.w : Math.max(320, video.videoWidth  || 640);
    const h = (stored && stored.h > 0) ? stored.h : Math.max(180, video.videoHeight || 360);
    window.documentPictureInPicture.requestWindow({ width: w, height: h })
      .then((pipWin) => {
        window._autoPipWindow = pipWin;
        setupAutoPipWindow(pipWin, video);
      })
      .catch((err) => {
        console.log('[AutoPiP v1.71] Document PiP failed:', err.message);
      });
  });
}

function triggerAutoPip() {
  const video = findLargestPlayingVideo();
  if (!video) return;

  // If a pip window exists but is still closing (pagehide not yet fired after .close()),
  // wait for it to fully unload before opening a new one — Chrome rejects concurrent opens.
  if (window._autoPipWindow && !window._autoPipWindow.closed) {
    window._autoPipWindow.addEventListener('pagehide', () => {
      setTimeout(() => { if (document.hidden) triggerAutoPip(); }, 100);
    }, { once: true });
    return;
  }

  if (typeof window.documentPictureInPicture === 'undefined') return;

  chrome.runtime.sendMessage({ type: 'getPipSize' }, (stored) => {
    if (!document.hidden) return;
    if (window._autoPipWindow && !window._autoPipWindow.closed) return;

    const w = (stored && stored.w > 0) ? stored.w : Math.max(320, video.videoWidth  || 640);
    const h = (stored && stored.h > 0) ? stored.h : Math.max(180, video.videoHeight || 360);
    window.documentPictureInPicture.requestWindow({ width: w, height: h })
      .then((pipWin) => {
        window._autoPipWindow = pipWin;
        setupAutoPipWindow(pipWin, video);
      })
      .catch((err) => {
        console.log('[AutoPiP v1.71] Document PiP failed:', err.message);
      });
  });
}

function setupAutoPipWindow(pipWin, video) {
  const style = pipWin.document.createElement("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #pip-wrap {
      position: relative; width: 100%; height: 100%;
      display: flex; flex-direction: column;
    }
    #pip-video {
      flex: 1 1 auto; min-height: 0;
      width: 100%; object-fit: contain; display: block;
      background: #000;
      max-width: none !important; max-height: none !important;
    }
    #pip-art {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #000;
      display: none;
      z-index: 1;
    }
    /* Controls bar */
    #pip-controls {
      --pad-x: 8px;
      --pad-y: 6px;
      --gap: 6px;
      --btn-size: 28px;
      --icon-size: 1em;
      --seek-h: 4px;
      --seek-thumb: 12px;
      --vol-w: 56px;
      --time-fs: 10px;
      flex: 0 0 auto;
      background: linear-gradient(to top, rgba(0,0,0,.9) 0%, rgba(0,0,0,.3) 70%, transparent 100%);
      position: absolute; bottom: 0; left: 0; right: 0;
      padding: var(--pad-y) var(--pad-x);
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--gap);
      opacity: 0; transition: opacity .2s;
      z-index: 10;
    }
    #pip-wrap:hover #pip-controls,
    #pip-controls:focus-within { opacity: 1; }
    .pip-row {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--gap);
    }
    .pip-row-transport { grid-area: transport; justify-content: center; }
    .pip-row-seek { grid-area: seek; justify-content: stretch; }
    .pip-row-audio { grid-area: audio; justify-content: flex-end; }
    /* Buttons */
    .pip-btn {
      background: none; border: none; cursor: pointer;
      color: #fff; padding: 0; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border-radius: 4px; transition: background .15s;
      width: var(--btn-size); height: var(--btn-size); font-size: 16px;
    }
    .pip-btn:hover { background: rgba(255,255,255,.15); }
    .pip-btn svg { width: var(--icon-size); height: var(--icon-size); fill: currentColor; display: block; }
    /* Seek bar */
    #pip-seek {
      flex: 1 1 auto; min-width: 20px;
      -webkit-appearance: none; appearance: none;
      height: var(--seek-h); border-radius: 2px;
      background: rgba(255,255,255,.3); cursor: pointer; outline: none;
    }
    #pip-seek::-webkit-slider-thumb {
      -webkit-appearance: none; width: var(--seek-thumb); height: var(--seek-thumb);
      border-radius: 50%; background: #fff; cursor: pointer;
    }
    /* Volume */
    #pip-vol {
      -webkit-appearance: none; appearance: none;
      width: var(--vol-w); height: var(--seek-h); border-radius: 2px;
      background: rgba(255,255,255,.3); cursor: pointer; outline: none; flex-shrink: 0;
    }
    #pip-vol::-webkit-slider-thumb {
      -webkit-appearance: none; width: calc(var(--seek-thumb) - 2px); height: calc(var(--seek-thumb) - 2px);
      border-radius: 50%; background: #fff; cursor: pointer;
    }
    /* Time */
    #pip-time {
      color: #ccc; font-size: var(--time-fs); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      flex-shrink: 0; white-space: nowrap;
    }
    /* Save-size button */
    #pip-save { 
      color: #aaa; 
      font-size: 14px; 
      transition: all 0.3s ease;
    }
    #pip-save.active { 
      color: #0f0; 
      transform: scale(1.3);
      text-shadow: 0 0 10px #0f0;
    }
    /* Adaptive tiers: keep all controls, reflow + shrink only */
    #pip-controls[data-size="large"] {
      --pad-x: 8px; --pad-y: 6px; --gap: 6px; --btn-size: 28px; --icon-size: 1em;
      --seek-h: 4px; --seek-thumb: 12px; --vol-w: 56px; --time-fs: 10px;
    }
    #pip-controls[data-size="medium"] {
      --pad-x: 7px; --pad-y: 5px; --gap: 5px; --btn-size: 26px; --icon-size: .95em;
      --seek-h: 4px; --seek-thumb: 11px; --vol-w: 50px; --time-fs: 9px;
    }
    #pip-controls[data-size="small"] {
      --pad-x: 6px; --pad-y: 5px; --gap: 4px; --btn-size: 24px; --icon-size: .9em;
      --seek-h: 3px; --seek-thumb: 10px; --vol-w: 44px; --time-fs: 8px;
    }
    #pip-controls[data-size="tiny"] {
      --pad-x: 5px; --pad-y: 4px; --gap: 4px; --btn-size: 22px; --icon-size: .85em;
      --seek-h: 3px; --seek-thumb: 9px; --vol-w: 40px; --time-fs: 8px;
    }
    #pip-controls[data-size="nano"] {
      --pad-x: 4px; --pad-y: 3px; --gap: 3px; --btn-size: 20px; --icon-size: .8em;
      --seek-h: 2px; --seek-thumb: 8px; --vol-w: 34px; --time-fs: 7px;
    }

    #pip-controls[data-layout="single"] {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "transport transport"
        "seek audio";
    }
    #pip-controls[data-layout="single"] .pip-row { min-height: var(--btn-size); }

    #pip-controls[data-layout="split"] {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "transport"
        "seek"
        "audio";
    }

    #pip-controls[data-layout="stack"] {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "transport"
        "seek"
        "audio";
    }
    #pip-controls[data-layout="stack"] .pip-row-transport { justify-content: center; flex-wrap: wrap; }
    #pip-controls[data-layout="stack"] .pip-row-audio { justify-content: center; }

    #pip-controls[data-layout="micro"] {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "transport"
        "seek"
        "audio";
    }
    #pip-controls[data-layout="micro"] .pip-row { justify-content: center; flex-wrap: wrap; }
    #pip-controls[data-layout="micro"] #pip-seek { min-width: 0; }
  `;
  pipWin.document.head.appendChild(style);

  const wrap = pipWin.document.createElement("div");
  wrap.id = "pip-wrap";

  let stream = null;
  let hasVisualTrack = false;
  let displayVideo;
  try {
    stream = video.captureStream ? video.captureStream()
           : video.mozCaptureStream ? video.mozCaptureStream() : null;
    if (stream && stream.getTracks().length === 0) stream = null;
    hasVisualTrack = !!(stream && stream.getVideoTracks && stream.getVideoTracks().length > 0);
  } catch (_) { stream = null; }

  if (stream) {
    displayVideo = pipWin.document.createElement("video");
    displayVideo.srcObject = stream;
    displayVideo.autoplay = true;
    displayVideo.muted = true;
    displayVideo.playsInline = true;
    displayVideo.play().catch(() => {});
  } else {
    displayVideo = pipWin.document.createElement("video");
    displayVideo.autoplay = true;
    displayVideo.muted = true;
    displayVideo.playsInline = true;
    displayVideo.setAttribute("aria-hidden", "true");
  }
  displayVideo.id = "pip-video";
  wrap.appendChild(displayVideo);
  const artEl = pipWin.document.createElement("img");
  artEl.id = "pip-art";
  artEl.alt = "Album artwork";
  wrap.appendChild(artEl);

  // ── Controls ─────────────────────────────────────────────────────────────
  const controls = pipWin.document.createElement("div");
  controls.id = "pip-controls";
  controls.dataset.size = "large";

  const svgPlay = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const svgPause = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
  const svgPrev  = '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6L9.5 12z"/></svg>';
  const svgNext  = '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8l-5.5 4zM16 6h2v12h-2V6z"/></svg>';
  const svgBack10 = '<svg viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6L11 18zm1.5 0h2V6h-2v12zm4.5 0h2V6h-2v12z"/></svg>';
  const svgFwd10 = '<svg viewBox="0 0 24 24"><path d="M13 6v12l8.5-6L13 6zm-1.5 0h-2v12h2V6zM7 6H5v12h2V6z"/></svg>';
  const svgMute  = '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97V11.18l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.7 8.7 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-13.27-4L4 9.27 7.73 13H4v4h4l5 5v-6.73L8.27 10.73l-2.54-2.73zM11.5 5L9.91 6.59 11.5 8.18V5z"/></svg>';
  const svgVol   = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';

  const mkBtn = (id, svg, title) => {
    const b = pipWin.document.createElement("button");
    b.className = "pip-btn"; b.id = id; b.title = title;
    b.innerHTML = svg; return b;
  };

  const prevBtn  = mkBtn("pip-prev",  svgPrev,  "Previous");
  const playBtn  = mkBtn("pip-play",  svgPlay,  "Play/Pause");
  const nextBtn  = mkBtn("pip-next",  svgNext,  "Next");
  const back10Btn = mkBtn("pip-back10", svgBack10, "Back 10s");
  const fwd10Btn = mkBtn("pip-fwd10", svgFwd10, "Forward 10s");
  const muteBtn  = mkBtn("pip-mute",  svgVol,   "Mute");
  const saveBtn  = pipWin.document.createElement("button");
  saveBtn.className = "pip-btn"; saveBtn.id = "pip-save"; saveBtn.title = "Save size & position";
  saveBtn.textContent = "💾";

  const seek = pipWin.document.createElement("input");
  seek.type = "range"; seek.id = "pip-seek"; seek.min = 0; seek.max = 1; seek.step = 0.001; seek.value = 0;

  const volSlider = pipWin.document.createElement("input");
  volSlider.type = "range"; volSlider.id = "pip-vol"; volSlider.min = 0; volSlider.max = 1; volSlider.step = 0.01; volSlider.value = video.volume;

  const timeEl = pipWin.document.createElement("span");
  timeEl.id = "pip-time"; timeEl.textContent = "0:00";

  const rowTransport = pipWin.document.createElement("div");
  rowTransport.className = "pip-row pip-row-transport";
  const rowSeek = pipWin.document.createElement("div");
  rowSeek.className = "pip-row pip-row-seek";
  const rowAudio = pipWin.document.createElement("div");
  rowAudio.className = "pip-row pip-row-audio";

  rowTransport.append(prevBtn, back10Btn, playBtn, fwd10Btn, nextBtn);
  rowSeek.append(seek, timeEl);
  rowAudio.append(muteBtn, volSlider, saveBtn);

  controls.dataset.layout = "single";
  controls.append(rowTransport, rowSeek, rowAudio);
  wrap.appendChild(controls);
  pipWin.document.body.appendChild(wrap);

  // ── Control logic (all actions on the source `video`) ─────────────────────
  const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
    }
    return `${m}:${sec.toString().padStart(2,'0')}`;
  };

  const updatePlay = () => { playBtn.innerHTML = video.paused ? svgPlay : svgPause; };
  const updateMute = () => { muteBtn.innerHTML = video.muted ? svgMute : svgVol; volSlider.value = video.muted ? 0 : video.volume; };
  const updateSeek = () => {
    if (video.duration) { seek.value = video.currentTime / video.duration; }
    timeEl.textContent = fmt(video.currentTime) + (video.duration ? ' / ' + fmt(video.duration) : '');
  };
  const pickArtworkFromMetadata = () => {
    try {
      const md = navigator.mediaSession && navigator.mediaSession.metadata;
      if (!md || !md.artwork || !md.artwork.length) return "";
      const last = md.artwork[md.artwork.length - 1];
      return (last && last.src) ? String(last.src) : "";
    } catch (_) { return ""; }
  };
  const pickArtworkFromDom = () => {
    const candidates = [
      "ytmusic-player-bar img#img",
      "ytmusic-player-bar .image img",
      "ytmusic-player-page #song-image img",
      "img.image"
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.src) return el.src;
    }
    return "";
  };
  const updateArtwork = () => {
    const artSrc = pickArtworkFromMetadata() || pickArtworkFromDom();
    if (artSrc && artEl.src !== artSrc) artEl.src = artSrc;
    const noVisual = !hasVisualTrack || !video.videoWidth || video.videoWidth < 2 || video.readyState < 2;
    artEl.style.display = (noVisual && !!artSrc) ? "block" : "none";
  };

  video.addEventListener("play",       updatePlay);
  video.addEventListener("pause",      updatePlay);
  video.addEventListener("volumechange", updateMute);
  video.addEventListener("timeupdate",  updateSeek);
  video.addEventListener("loadedmetadata", updateArtwork);
  video.addEventListener("emptied", updateArtwork);
  updatePlay(); updateMute(); updateSeek(); updateArtwork();
  const artworkPoller = pipWin.setInterval(() => {
    if (pipWin.closed) { pipWin.clearInterval(artworkPoller); return; }
    updateArtwork();
  }, 1500);

  playBtn.addEventListener("click", () => { video.paused ? video.play() : video.pause(); });
  muteBtn.addEventListener("click", () => { video.muted = !video.muted; });
  const seekBy = (seconds) => {
    const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
    const nextTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
    video.currentTime = nextTime;
  };
  const pressMediaKey = (key, code) => {
    try {
      const down = new KeyboardEvent("keydown", { key, code, bubbles: true });
      const up = new KeyboardEvent("keyup", { key, code, bubbles: true });
      document.dispatchEvent(down);
      window.dispatchEvent(down);
      document.dispatchEvent(up);
      window.dispatchEvent(up);
    } catch (_) {}
  };
  const queryDeep = (root, selector) => {
    const queue = [root];
    while (queue.length) {
      const node = queue.shift();
      if (!node || !node.querySelector) continue;
      const hit = node.querySelector(selector);
      if (hit) return hit;
      const all = node.querySelectorAll("*");
      for (const el of all) {
        if (el.shadowRoot) queue.push(el.shadowRoot);
      }
    }
    return null;
  };
  const clickFirst = (root, selectors) => {
    for (const sel of selectors) {
      const el = queryDeep(root, sel);
      if (el) {
        el.click();
        return true;
      }
    }
    return false;
  };
  const runTrackAction = (dir) => {
    const selectors = dir === "prev"
      ? [
          "ytmusic-player-bar tp-yt-paper-icon-button.previous-button",
          "ytmusic-player-bar .previous-button",
          "button.previous-button",
          ".ytp-prev-button",
          "button[aria-label*='Previous']",
          "button[title*='Previous']",
          "button[aria-label*='Prev']",
          "[data-testid*='previous']",
          "[data-testid*='prev']"
        ]
      : [
          "ytmusic-player-bar tp-yt-paper-icon-button.next-button",
          "ytmusic-player-bar .next-button",
          "button.next-button",
          ".ytp-next-button",
          "button[aria-label*='Next']",
          "button[title*='Next']",
          "[data-testid*='next']"
        ];
    if (clickFirst(document, selectors)) return;
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        if (frame.contentDocument && clickFirst(frame.contentDocument, selectors)) return;
      } catch (_) {}
    }
    if (dir === "prev") pressMediaKey("MediaTrackPrevious", "MediaTrackPrevious");
    else pressMediaKey("MediaTrackNext", "MediaTrackNext");
  };
  prevBtn.addEventListener("click", () => { runTrackAction("prev"); });
  nextBtn.addEventListener("click", () => { runTrackAction("next"); });
  back10Btn.addEventListener("click", () => { seekBy(-10); });
  fwd10Btn.addEventListener("click", () => { seekBy(10); });

  let seeking = false;
  seek.addEventListener("mousedown", () => { seeking = true; });
  seek.addEventListener("input", () => {
    if (video.duration) video.currentTime = Number(seek.value) * video.duration;
  });
  seek.addEventListener("mouseup",   () => { seeking = false; });
  volSlider.addEventListener("input", () => {
    const vol = Number(volSlider.value);
    video.volume = vol;
    video.muted = vol === 0;
  });

  // ── Responsive: adjust controls based on window width ─────────────────────
  const ro = new pipWin.ResizeObserver(([entry]) => {
    const w = entry.contentRect.width;
    const h = entry.contentRect.height;
    let tier;
    let layout;
    if (w < 150 || h < 105) {
      tier = "nano";
      layout = "micro";
    } else if (w < 210 || h < 130) {
      tier = "tiny";
      layout = "stack";
    } else if (w < 290 || h < 160) {
      tier = "small";
      layout = "stack";
    } else if (w < 390 || h < 210) {
      tier = "medium";
      layout = "split";
    } else {
      tier = "large";
      layout = "single";
    }
    controls.dataset.size = tier;
    controls.dataset.layout = layout;
  });
  ro.observe(pipWin.document.body);

  // ── Debug badge (top-right, shows live size + position) ───────────────────
  // Commented out - debug info hidden
  /*
  const dbg = pipWin.document.createElement("div");
  Object.assign(dbg.style, {
    position:"fixed", top:"4px", right:"4px", zIndex:"9999",
    background:"rgba(0,0,0,.8)", color:"#0f0", fontFamily:"monospace",
    fontSize:"10px", padding:"2px 5px", borderRadius:"3px", pointerEvents:"none",
    lineHeight:"1.5", whiteSpace:"nowrap"
  });
  pipWin.document.body.appendChild(dbg);
  const updateDbg = () => {
    dbg.textContent = pipWin.innerWidth + "×" + pipWin.innerHeight + " @(" + pipWin.screenX + "," + pipWin.screenY + ")";
  };
  pipWin.addEventListener("resize", updateDbg);
  // 'move' event doesn't reliably fire on Document PiP — poll screenX/Y instead
  const movePoller = pipWin.setInterval(() => {
    if (pipWin.closed) { pipWin.clearInterval(movePoller); return; }
    updateDbg();
  }, 500);
  updateDbg();
  */

  // ── Save size and position button ──────────
  saveBtn.addEventListener('click', () => {
    const w = pipWin.innerWidth  || 0;
    const h = pipWin.innerHeight || 0;
    const x = pipWin.screenX;
    const y = pipWin.screenY;
    if (w > 0 && h > 0) {
      saveBtn.classList.add('active');
      pipWin.setTimeout(() => saveBtn.classList.remove('active'), 800);
      chrome.runtime.sendMessage({ type: 'pipLog', msg: '[AutoPiP] 💾 saved ' + w + 'x' + h + ' @(' + x + ',' + y + ')' });
      chrome.runtime.sendMessage({ type: 'setPipSize', w, h, x, y });
    }
  });

  // ── Pagehide: cleanup only (no size save — prevents drifted size from being stored) ──
  let _autoClosing = false;
  pipWin.addEventListener("pagehide", () => {
    pipWin.clearInterval(artworkPoller);
    pipWin.clearInterval(movePoller);
    ro.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    window._autoPipWindow = null;
  });
  pipWin._setAutoClosing = () => { _autoClosing = true; };
}

function stopAutoPip() {
  if (window._autoPipWindow && !window._autoPipWindow.closed) {
    try { window._autoPipWindow._setAutoClosing(); } catch(_) {}
    window._autoPipWindow.close();
  } else {
    window._autoPipWindow = null;
  }
  const movedVideo = document.querySelector('video[__autopip__]');
  if (movedVideo) {
    document.body.appendChild(movedVideo);
    movedVideo.removeAttribute('__autopip__');
  }
}
