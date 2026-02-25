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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function findLargestPlayingVideo() {
  const videos = Array.from(document.querySelectorAll('video'))
    .filter(video => video.readyState != 0)
    .filter(video => video.disablePictureInPicture == false)
    .sort((v1, v2) => {
      const v1Rect = v1.getClientRects()[0] || { width: 0, height: 0 };
      const v2Rect = v2.getClientRects()[0] || { width: 0, height: 0 };
      return (v2Rect.width * v2Rect.height) - (v1Rect.width * v1Rect.height);
    });
  if (videos.length === 0) return;
  return videos[0];
}

// ─── Custom floating miniplayer (no size limits in either direction) ──────────
// Uses captureStream() so it works even when the source video is in an iframe.
// The overlay is always injected into the TOP-LEVEL document.

const OVERLAY_ID = '__pip_overlay__';

function closeOverlay() {
  const topDoc = window === window.top ? document : (window.top && window.top.document);
  if (!topDoc) return;
  const existing = topDoc.getElementById(OVERLAY_ID);
  if (existing) existing.remove();
}

function openOverlayWithStream(video) {
  // Capture a live MediaStream from the source video
  let stream;
  try {
    stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
  } catch (e) {
    console.warn('[PiP] captureStream failed, opening overlay without stream mirror:', e);
    stream = null;
  }

  // Target the top-level document (works from both main frame and iframes)
  let topDoc = null;
  try {
    topDoc = window === window.top ? document : window.top.document;
  } catch (_) {
    topDoc = null;
  }

  if (!topDoc) {
    // Cross-origin top frame and no stream — can't do anything useful
    console.warn('[PiP] Cross-origin top frame, cannot create overlay');
    return;
  }

  // Remove any existing overlay
  const prev = topDoc.getElementById(OVERLAY_ID);
  if (prev) prev.remove();

  const videoRect = video.getBoundingClientRect();
  const initW = Math.max(160, Math.round(videoRect.width  * 0.35)) || 320;
  const initH = Math.max(90,  Math.round(videoRect.height * 0.35)) || 180;

  // ── Shadow host ───────────────────────────────────────────────────────────
  const host = topDoc.createElement('div');
  host.id = OVERLAY_ID;
  Object.assign(host.style, {
    position:  'fixed',
    right:     '20px',
    bottom:    '20px',
    width:     initW + 'px',
    height:    initH + 'px',
    zIndex:    '2147483647',
    overflow:  'visible',
  });

  const shadow = host.attachShadow({ mode: 'open' });

  const style = topDoc.createElement('style');
  style.textContent = `
    :host { display: block; }
    #wrapper {
      position: relative;
      width: 100%; height: 100%;
      background: #000;
      border-radius: 6px;
      box-shadow: 0 8px 32px rgba(0,0,0,.6);
      overflow: hidden;
      cursor: move;
      user-select: none;
    }
    video {
      width: 100%; height: 100%;
      object-fit: contain;
      display: block;
      pointer-events: none;
    }
    #close-btn {
      position: absolute; top: 4px; right: 4px;
      width: 22px; height: 22px;
      background: rgba(0,0,0,.65); border: none; border-radius: 50%;
      cursor: pointer; color: #fff; font-size: 14px;
      line-height: 22px; text-align: center;
      opacity: 0; transition: opacity .15s; pointer-events: all; z-index: 10;
    }
    #wrapper:hover #close-btn { opacity: 1; }
    .rh { position: absolute; z-index: 20; }
    .rh-nw { top:0;    left:0;    width:12px; height:12px; cursor:nw-resize; }
    .rh-ne { top:0;    right:0;   width:12px; height:12px; cursor:ne-resize; }
    .rh-sw { bottom:0; left:0;    width:12px; height:12px; cursor:sw-resize; }
    .rh-se { bottom:0; right:0;   width:12px; height:12px; cursor:se-resize; }
    .rh-n  { top:0;    left:12px; right:12px;  height:6px; cursor:n-resize; }
    .rh-s  { bottom:0; left:12px; right:12px;  height:6px; cursor:s-resize; }
    .rh-w  { left:0;   top:12px;  bottom:12px; width:6px;  cursor:w-resize; }
    .rh-e  { right:0;  top:12px;  bottom:12px; width:6px;  cursor:e-resize; }
  `;
  shadow.appendChild(style);

  const wrapper = topDoc.createElement('div');
  wrapper.id = 'wrapper';

  // Mirror video: if we have a stream, use it (non-DRM); otherwise move the video node directly
  let mirrorVideo;
  if (stream) {
    mirrorVideo = topDoc.createElement('video');
    mirrorVideo.srcObject = stream;
    mirrorVideo.autoplay = true;
    mirrorVideo.muted = true; // audio from original; mirror is silent
  } else {
    // DRM or captureStream failed — move the actual video element into the overlay
    mirrorVideo = video;
  }
  wrapper.appendChild(mirrorVideo);

  // Close button
  const closeBtn = topDoc.createElement('button');
  closeBtn.id = 'close-btn';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    } else {
      // Return moved video node to original page
      document.body.appendChild(video);
    }
    host.remove();
  });
  wrapper.appendChild(closeBtn);

  // Resize handles
  ['nw','ne','sw','se','n','s','w','e'].forEach(dir => {
    const rh = topDoc.createElement('div');
    rh.className = `rh rh-${dir}`;
    rh.dataset.dir = dir;
    wrapper.appendChild(rh);
  });

  shadow.appendChild(wrapper);
  topDoc.documentElement.appendChild(host);

  // ── Drag to move ──────────────────────────────────────────────────────────
  let dragMove = false, dmStartX, dmStartY, dmOrigL, dmOrigT;

  wrapper.addEventListener('mousedown', e => {
    if (e.target.closest('.rh') || e.target.id === 'close-btn') return;
    dragMove = true;
    dmStartX = e.clientX;
    dmStartY = e.clientY;
    const rect = host.getBoundingClientRect();
    dmOrigL = rect.left;
    dmOrigT = rect.top;
    e.preventDefault();
  });

  // ── Resize (no clamping — any size allowed) ────────────────────────────────
  let resizeDir = null, rsStartX, rsStartY, rsOrigW, rsOrigH, rsOrigL, rsOrigT;

  shadow.addEventListener('mousedown', e => {
    const rh = e.target.closest('.rh');
    if (!rh) return;
    e.preventDefault(); e.stopPropagation();
    resizeDir = rh.dataset.dir;
    rsStartX = e.clientX; rsStartY = e.clientY;
    const rect = host.getBoundingClientRect();
    rsOrigW = rect.width; rsOrigH = rect.height;
    rsOrigL = rect.left;  rsOrigT = rect.top;
  });

  topDoc.addEventListener('mousemove', e => {
    if (dragMove) {
      host.style.left   = (dmOrigL + e.clientX - dmStartX) + 'px';
      host.style.top    = (dmOrigT + e.clientY - dmStartY) + 'px';
      host.style.right  = 'auto';
      host.style.bottom = 'auto';
      return;
    }
    if (!resizeDir) return;
    e.preventDefault();
    const dx = e.clientX - rsStartX;
    const dy = e.clientY - rsStartY;
    let newW = rsOrigW, newH = rsOrigH, newL = rsOrigL, newT = rsOrigT;
    if (resizeDir.includes('e')) newW = rsOrigW + dx;
    if (resizeDir.includes('s')) newH = rsOrigH + dy;
    if (resizeDir.includes('w')) { newW = rsOrigW - dx; newL = rsOrigL + dx; }
    if (resizeDir.includes('n')) { newH = rsOrigH - dy; newT = rsOrigT + dy; }
    // No clamping — allow any size
    host.style.width  = newW + 'px';
    host.style.height = newH + 'px';
    host.style.left   = newL + 'px';
    host.style.top    = newT + 'px';
    host.style.right  = 'auto';
    host.style.bottom = 'auto';
  });

  topDoc.addEventListener('mouseup', () => { dragMove = false; resizeDir = null; });
}

// ─── Document PiP setup (Chrome 116+, if available) ──────────────────────────

function setupDocPipWindow(pipWindow, video, openedW, openedH) {
  window._docPipWindow = pipWindow;

  const style = pipWindow.document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    #pip-wrap { position: relative; width: 100%; height: 100%; display: flex; flex-direction: column; }
    #pip-video {
      flex: 1 1 auto; min-height: 0; width: 100%;
      object-fit: contain; display: block; background: #000;
      max-width: none !important; max-height: none !important;
    }
    #pip-controls {
      flex: 0 0 auto;
      background: linear-gradient(to top, rgba(0,0,0,.85) 0%, transparent 100%);
      position: absolute; bottom: 0; left: 0; right: 0;
      padding: 6px 8px 6px;
      display: flex; align-items: center; gap: 6px;
      opacity: 0; transition: opacity .2s; z-index: 10;
    }
    #pip-wrap:hover #pip-controls { opacity: 1; }
    .pip-btn {
      background: none; border: none; cursor: pointer; color: #fff; padding: 0;
      flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      border-radius: 4px; transition: background .15s; width: 28px; height: 28px; font-size: 16px;
    }
    .pip-btn:hover { background: rgba(255,255,255,.15); }
    .pip-btn svg { width: 1em; height: 1em; fill: currentColor; display: block; }
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
    #pip-vol {
      -webkit-appearance: none; appearance: none;
      width: 56px; height: 4px; border-radius: 2px;
      background: rgba(255,255,255,.3); cursor: pointer; outline: none; flex-shrink: 0;
    }
    #pip-vol::-webkit-slider-thumb {
      -webkit-appearance: none; width: 10px; height: 10px;
      border-radius: 50%; background: #fff; cursor: pointer;
    }
    #pip-time { color: #ccc; font-size: 10px; font-family: monospace; flex-shrink: 0; white-space: nowrap; }
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
  pipWindow.document.head.appendChild(style);

  const wrap = pipWindow.document.createElement('div');
  wrap.id = 'pip-wrap';

  // Try captureStream() first (non-DRM)
  let stream = null;
  try {
    stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
    if (stream && stream.getTracks().length === 0) stream = null;
  } catch (_) { stream = null; }

  let displayVideo;
  if (stream) {
    displayVideo = pipWindow.document.createElement('video');
    displayVideo.srcObject = stream;
    displayVideo.autoplay  = true;
    displayVideo.muted     = true;
  } else {
    displayVideo = video;
    video.setAttribute('__pip__', true);
  }
  displayVideo.id = 'pip-video';
  wrap.appendChild(displayVideo);

  // ── Controls ──────────────────────────────────────────────────────────────
  const controls = pipWindow.document.createElement('div');
  controls.id = 'pip-controls';
  controls.dataset.size = 'large';

  const svgPlay = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
  const svgPause= '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
  const svgPrev = '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6V6zm3.5 6 8.5 6V6L9.5 12z"/></svg>';
  const svgNext = '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8l-5.5 4zM16 6h2v12h-2V6z"/></svg>';
  const svgMute = '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 7.97V11.18l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.7 8.7 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-13.27-4L4 9.27 7.73 13H4v4h4l5 5v-6.73L8.27 10.73l-2.54-2.73zM11.5 5L9.91 6.59 11.5 8.18V5z"/></svg>';
  const svgVol  = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';

  const mkBtn = (id, svg, title) => {
    const b = pipWindow.document.createElement('button');
    b.className = 'pip-btn'; b.id = id; b.title = title;
    b.innerHTML = svg; return b;
  };

  const prevBtn = mkBtn('pip-prev', svgPrev, 'Previous');
  const playBtn = mkBtn('pip-play', svgPlay, 'Play/Pause');
  const nextBtn = mkBtn('pip-next', svgNext, 'Next');
  const muteBtn = mkBtn('pip-mute', svgVol,  'Mute');

  const seek = pipWindow.document.createElement('input');
  seek.type = 'range'; seek.id = 'pip-seek'; seek.min = 0; seek.max = 1; seek.step = 0.001; seek.value = 0;

  const volSlider = pipWindow.document.createElement('input');
  volSlider.type = 'range'; volSlider.id = 'pip-vol'; volSlider.min = 0; volSlider.max = 1; volSlider.step = 0.01; volSlider.value = video.volume;

  const timeEl = pipWindow.document.createElement('span');
  timeEl.id = 'pip-time'; timeEl.textContent = '0:00';

  controls.append(prevBtn, playBtn, nextBtn, seek, timeEl, muteBtn, volSlider);
  wrap.appendChild(controls);
  pipWindow.document.body.appendChild(wrap);

  // ── Control logic ─────────────────────────────────────────────────────────
  const fmt = (s) => { const m = Math.floor(s/60), sec = Math.floor(s%60); return `${m}:${sec.toString().padStart(2,'0')}`; };
  const updatePlay = () => { playBtn.innerHTML = video.paused ? svgPlay : svgPause; };
  const updateMute = () => { muteBtn.innerHTML = video.muted ? svgMute : svgVol; volSlider.value = video.muted ? 0 : video.volume; };
  const updateSeek = () => {
    if (video.duration) seek.value = video.currentTime / video.duration;
    timeEl.textContent = fmt(video.currentTime) + (video.duration ? ' / ' + fmt(video.duration) : '');
  };
  video.addEventListener('play', updatePlay);
  video.addEventListener('pause', updatePlay);
  video.addEventListener('volumechange', updateMute);
  video.addEventListener('timeupdate', updateSeek);
  updatePlay(); updateMute(); updateSeek();

  playBtn.addEventListener('click', () => { video.paused ? video.play() : video.pause(); });
  muteBtn.addEventListener('click', () => { video.muted = !video.muted; });
  prevBtn.addEventListener('click', () => {
    try { navigator.mediaSession.callActionHandler('previoustrack'); } catch(_) { video.currentTime = Math.max(0, video.currentTime - 10); }
  });
  nextBtn.addEventListener('click', () => {
    try { navigator.mediaSession.callActionHandler('nexttrack'); } catch(_) { video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); }
  });
  seek.addEventListener('input', () => { if (video.duration) video.currentTime = seek.value * video.duration; });
  volSlider.addEventListener('input', () => { video.volume = volSlider.value; video.muted = volSlider.value == 0; });

  // ── Responsive controls ───────────────────────────────────────────────────
  const ro = new pipWindow.ResizeObserver(([entry]) => {
    const w = entry.contentRect.width;
    const h = entry.contentRect.height;
    let tier;
    if      (w < 130) tier = 'tiny';
    else if (w < 210) tier = 'small';
    else if (w < 320) tier = 'medium';
    else              tier = 'large';
    controls.dataset.size = tier;
    try { pipWindow.console.log(`[PiP] size=${tier} | w=${Math.round(w)}px h=${Math.round(h)}px`); } catch(_) {}
  });
  ro.observe(pipWindow.document.body);

  // ── Size persistence ──────────────────────────────────────────────────────
  let userInteracted = false;
  pipWindow.addEventListener('mousedown', () => { userInteracted = true; });
  let saveTimer = null;
  pipWindow.addEventListener('resize', () => {
    if (!userInteracted) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const w = pipWindow.outerWidth  || pipWindow.innerWidth  || 0;
      const h = pipWindow.outerHeight || pipWindow.innerHeight || 0;
      if (w > 0 && h > 0) chrome.storage.local.set({ pipW: w, pipH: h });
    }, 300);
  });

  pipWindow.addEventListener('pagehide', () => {
    ro.disconnect();
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    } else {
      document.body.appendChild(video);
      video.removeAttribute('__pip__');
    }
    window._docPipWindow = null;
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

(() => {
  // ── Version toast (runs unconditionally in the top-level frame) ───────────
  if (window === window.top) {
    const toast = document.createElement('div');
    toast.textContent = '✅ PiP v1.46';
    Object.assign(toast.style, {
      position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: '#222', color: '#0f0', fontFamily: 'monospace',
      fontSize: '18px', fontWeight: 'bold', padding: '10px 24px',
      borderRadius: '8px', border: '2px solid #0f0',
      pointerEvents: 'none',
      boxShadow: '0 4px 20px rgba(0,255,0,.4)',
    });
    document.documentElement.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .5s'; }, 3500);
    setTimeout(() => { toast.remove(); }, 4100);
  }

  console.log('[PiP v1.46] frame:', window === window.top ? 'TOP' : 'IFRAME', '| documentPictureInPicture:', typeof window.documentPictureInPicture !== 'undefined');

  const video = findLargestPlayingVideo();
  if (!video) {
    return false;
  }

  // ── Safely access top-level document (guard against cross-origin) ─────────
  let topDoc = null;
  try {
    topDoc = window.top.document; // throws for cross-origin iframes
  } catch (_) {
    topDoc = null;
  }

  // ── Toggle off if overlay is already open ─────────────────────────────────
  const existingOverlay = topDoc && topDoc.getElementById(OVERLAY_ID);
  if (existingOverlay) {
    existingOverlay.remove();
    return true;
  }

  // ── Prevent duplicate overlays when multiple frames have videos ───────────
  if (topDoc && topDoc.__pipOverlayInProgress) return false;
  if (topDoc) topDoc.__pipOverlayInProgress = true;
  setTimeout(() => { if (topDoc) delete topDoc.__pipOverlayInProgress; }, 500);

  // ── Document PiP (Chrome 116+, top-level frame only) ─────────────────────
  if (window === window.top && typeof window.documentPictureInPicture !== 'undefined') {
    if (window._docPipWindow && !window._docPipWindow.closed) {
      window._docPipWindow.close();
      window._docPipWindow = null;
      video.removeAttribute('__pip__');
      return true;
    }
    // Use saved size if available, otherwise use video element size
    chrome.storage.local.get({ pipW: 0, pipH: 0 }, (stored) => {
      let w, h;
      if (stored.pipW > 0) { w = stored.pipW; h = stored.pipH; }
      else {
        const videoRect = video.getBoundingClientRect();
        w = Math.max(320, Math.round(videoRect.width))  || 640;
        h = Math.max(180, Math.round(videoRect.height)) || 360;
      }
      window.documentPictureInPicture.requestWindow({ width: w, height: h })
        .then(pipWindow => setupDocPipWindow(pipWindow, video, w, h))
        .catch(err => {
          console.warn('[PiP] Document PiP failed, using overlay:', err);
          openOverlayWithStream(video);
        });
    });
    return true;
  }

  // ── Custom overlay with MediaStream capture / node move (no size limits) ──
  // Works for both DRM and non-DRM videos.
  // Non-DRM: uses captureStream() mirror. DRM: moves the video node.
  openOverlayWithStream(video);
  return true;
})();
