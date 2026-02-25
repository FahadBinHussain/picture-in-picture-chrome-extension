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

console.log('[AutoPiP v1.46] script loaded, frame:', window === window.top ? 'TOP' : 'IFRAME');

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
  console.log('[AutoPiP v1.46] visibilitychange hidden:', document.hidden);
  if (document.hidden) {
    triggerAutoPip();
  } else {
    stopAutoPip();
  }
});

try {
  navigator.mediaSession.setActionHandler("enterpictureinpicture", () => {
    console.log('[AutoPiP v1.46] mediaSession enterpictureinpicture');
    triggerAutoPip();
  });
} catch (_) {}

function triggerAutoPip() {
  const video = findLargestPlayingVideo();
  console.log('[AutoPiP v1.46] triggerAutoPip, video:', video ? 'found (' + (video.videoWidth||0) + 'x' + (video.videoHeight||0) + ')' : 'null');
  if (!video) return;

  // Already open — don't open another
  if (window._autoPipWindow && !window._autoPipWindow.closed) return;

  if (typeof window.documentPictureInPicture === 'undefined') return; // no fallback popup

  chrome.storage.local.get({ autopipW: 0, autopipH: 0 }, (stored) => {
    // Re-check after async get (user may have returned to tab)
    if (!document.hidden) return;
    if (window._autoPipWindow && !window._autoPipWindow.closed) return;

    const w = stored.autopipW > 0 ? stored.autopipW : Math.max(320, video.videoWidth  || 640);
    const h = stored.autopipH > 0 ? stored.autopipH : Math.max(180, video.videoHeight || 360);
    window.documentPictureInPicture.requestWindow({ width: w, height: h })
      .then((pipWin) => {
        console.log('[AutoPiP v1.46] Document PiP window opened');
        window._autoPipWindow = pipWin;
        setupAutoPipWindow(pipWin, video, w, h);
      })
      .catch((err) => {
        console.log('[AutoPiP v1.46] Document PiP failed (no fallback):', err.message);
        // No window.open fallback — avoid unwanted popups
      });
  });
}

function setupAutoPipWindow(pipWin, video, openedW, openedH) {
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
    /* Controls bar */
    #pip-controls {
      flex: 0 0 auto;
      background: linear-gradient(to top, rgba(0,0,0,.85) 0%, transparent 100%);
      position: absolute; bottom: 0; left: 0; right: 0;
      padding: 6px 8px 6px;
      display: flex; align-items: center; gap: 6px;
      opacity: 0; transition: opacity .2s;
      z-index: 10;
    }
    #pip-wrap:hover #pip-controls { opacity: 1; }
    /* Buttons */
    .pip-btn {
      background: none; border: none; cursor: pointer;
      color: #fff; padding: 0; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border-radius: 4px; transition: background .15s;
      width: 28px; height: 28px; font-size: 16px;
    }
    .pip-btn:hover { background: rgba(255,255,255,.15); }
    .pip-btn svg { width: 1em; height: 1em; fill: currentColor; display: block; }
    /* Seek bar */
    #pip-seek {
      flex: 1 1 auto; min-width: 20px;
      -webkit-appearance: none; appearance: none;
      height: 4px; border-radius: 2px;
      background: rgba(255,255,255,.3); cursor: pointer; outline: none;
    }
    #pip-seek::-webkit-slider-thumb {
      -webkit-appearance: none; width: 12px; height: 12px;
      border-radius: 50%; background: #fff; cursor: pointer;
    }
    /* Volume */
    #pip-vol {
      -webkit-appearance: none; appearance: none;
      width: 56px; height: 4px; border-radius: 2px;
      background: rgba(255,255,255,.3); cursor: pointer; outline: none; flex-shrink: 0;
    }
    #pip-vol::-webkit-slider-thumb {
      -webkit-appearance: none; width: 10px; height: 10px;
      border-radius: 50%; background: #fff; cursor: pointer;
    }
    /* Time */
    #pip-time {
      color: #ccc; font-size: 10px; font-family: monospace;
      flex-shrink: 0; white-space: nowrap;
    }
    /* Responsive hiding via data-size on #pip-controls */
    #pip-controls[data-size="tiny"] #pip-seek,
    #pip-controls[data-size="tiny"] #pip-vol,
    #pip-controls[data-size="tiny"] #pip-time,
    #pip-controls[data-size="tiny"] #pip-prev,
    #pip-controls[data-size="tiny"] #pip-next,
    #pip-controls[data-size="tiny"] #pip-mute { display: none; }

    #pip-controls[data-size="small"] #pip-seek,
    #pip-controls[data-size="small"] #pip-vol,
    #pip-controls[data-size="small"] #pip-time,
    #pip-controls[data-size="small"] #pip-prev,
    #pip-controls[data-size="small"] #pip-next { display: none; }

    #pip-controls[data-size="medium"] #pip-vol,
    #pip-controls[data-size="medium"] #pip-time,
    #pip-controls[data-size="medium"] #pip-prev,
    #pip-controls[data-size="medium"] #pip-next { display: none; }
  `;
  pipWin.document.head.appendChild(style);

  const wrap = pipWin.document.createElement("div");
  wrap.id = "pip-wrap";

  let stream = null;
  let displayVideo;
  try {
    stream = video.captureStream ? video.captureStream()
           : video.mozCaptureStream ? video.mozCaptureStream() : null;
    if (stream && stream.getTracks().length === 0) stream = null;
  } catch (_) { stream = null; }

  if (stream) {
    displayVideo = pipWin.document.createElement("video");
    displayVideo.srcObject = stream;
    displayVideo.autoplay = true;
    displayVideo.muted = true;
    displayVideo.playsInline = true;
    displayVideo.play().catch(() => {});
  } else {
    displayVideo = video;
    video.setAttribute("__autopip__", "1");
  }
  displayVideo.id = "pip-video";
  wrap.appendChild(displayVideo);

  // ── Controls ─────────────────────────────────────────────────────────────
  const controls = pipWin.document.createElement("div");
  controls.id = "pip-controls";
  controls.dataset.size = "large";

  const svgPlay = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const svgPause = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
  const svgPrev = '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6L9.5 12z"/></svg>';
  const svgNext = '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8l-5.5 4zM16 6h2v12h-2V6z"/></svg>';
  const svgMute = '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97V11.18l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.7 8.7 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-13.27-4L4 9.27 7.73 13H4v4h4l5 5v-6.73L8.27 10.73l-2.54-2.73zM11.5 5L9.91 6.59 11.5 8.18V5z"/></svg>';
  const svgVol  = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';

  const mkBtn = (id, svg, title) => {
    const b = pipWin.document.createElement("button");
    b.className = "pip-btn"; b.id = id; b.title = title;
    b.innerHTML = svg; return b;
  };

  const prevBtn  = mkBtn("pip-prev",  svgPrev,  "Previous");
  const playBtn  = mkBtn("pip-play",  svgPlay,  "Play/Pause");
  const nextBtn  = mkBtn("pip-next",  svgNext,  "Next");
  const muteBtn  = mkBtn("pip-mute",  svgVol,   "Mute");

  const seek = pipWin.document.createElement("input");
  seek.type = "range"; seek.id = "pip-seek"; seek.min = 0; seek.max = 1; seek.step = 0.001; seek.value = 0;

  const volSlider = pipWin.document.createElement("input");
  volSlider.type = "range"; volSlider.id = "pip-vol"; volSlider.min = 0; volSlider.max = 1; volSlider.step = 0.01; volSlider.value = video.volume;

  const timeEl = pipWin.document.createElement("span");
  timeEl.id = "pip-time"; timeEl.textContent = "0:00";

  controls.append(prevBtn, playBtn, nextBtn, seek, timeEl, muteBtn, volSlider);
  wrap.appendChild(controls);
  pipWin.document.body.appendChild(wrap);

  // ── Control logic (all actions on the source `video`) ─────────────────────
  const fmt = (s) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2,'0')}`;
  };

  const updatePlay = () => { playBtn.innerHTML = video.paused ? svgPlay : svgPause; };
  const updateMute = () => { muteBtn.innerHTML = video.muted ? svgMute : svgVol; volSlider.value = video.muted ? 0 : video.volume; };
  const updateSeek = () => {
    if (video.duration) { seek.value = video.currentTime / video.duration; }
    timeEl.textContent = fmt(video.currentTime) + (video.duration ? ' / ' + fmt(video.duration) : '');
  };

  video.addEventListener("play",       updatePlay);
  video.addEventListener("pause",      updatePlay);
  video.addEventListener("volumechange", updateMute);
  video.addEventListener("timeupdate",  updateSeek);
  updatePlay(); updateMute(); updateSeek();

  playBtn.addEventListener("click", () => { video.paused ? video.play() : video.pause(); });
  muteBtn.addEventListener("click", () => { video.muted = !video.muted; });
  prevBtn.addEventListener("click", () => {
    if (navigator.mediaSession && navigator.mediaSession.metadata)
      navigator.mediaSession.callActionHandler('previoustrack');
    else video.currentTime = Math.max(0, video.currentTime - 10);
  });
  nextBtn.addEventListener("click", () => {
    if (navigator.mediaSession && navigator.mediaSession.metadata)
      navigator.mediaSession.callActionHandler('nexttrack');
    else video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
  });

  let seeking = false;
  seek.addEventListener("mousedown", () => { seeking = true; });
  seek.addEventListener("input", () => { if (video.duration) video.currentTime = seek.value * video.duration; });
  seek.addEventListener("mouseup",   () => { seeking = false; });
  volSlider.addEventListener("input", () => { video.volume = volSlider.value; video.muted = volSlider.value == 0; });

  // ── Responsive: adjust controls based on window width ─────────────────────
  const ro = new pipWin.ResizeObserver(([entry]) => {
    const w = entry.contentRect.width;
    const h = entry.contentRect.height;
    let tier;
    if (w < 130)      tier = "tiny";
    else if (w < 210) tier = "small";
    else if (w < 320) tier = "medium";
    else              tier = "large";
    controls.dataset.size = tier;
    try { pipWin.console.log(`[AutoPiP] size=${tier} | w=${Math.round(w)}px h=${Math.round(h)}px`); } catch(_) {}
  });
  ro.observe(pipWin.document.body);

  // ── Size persistence ──────────────────────────────────────────────────────
  let userInteracted = false;
  pipWin.addEventListener("mousedown", () => { userInteracted = true; });
  let saveTimer = null;
  pipWin.addEventListener("resize", () => {
    if (!userInteracted) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const w = pipWin.outerWidth  || pipWin.innerWidth  || 0;
      const h = pipWin.outerHeight || pipWin.innerHeight || 0;
      if (w > 0 && h > 0) chrome.storage.local.set({ autopipW: w, autopipH: h });
    }, 300);
  });

  pipWin.addEventListener("pagehide", () => {
    ro.disconnect();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    else { document.body.appendChild(video); video.removeAttribute("__autopip__"); }
    window._autoPipWindow = null;
  });
}

function stopAutoPip() {
  console.log('[AutoPiP v1.46] stopAutoPip, _autoPipWindow:', window._autoPipWindow ? 'exists' : 'null');
  if (window._autoPipWindow && !window._autoPipWindow.closed) {
    window._autoPipWindow.close();
  }
  window._autoPipWindow = null;

  // Return video node if it was moved
  const movedVideo = document.querySelector('video[__autopip__]');
  if (movedVideo) {
    document.body.appendChild(movedVideo);
    movedVideo.removeAttribute('__autopip__');
  }
}
