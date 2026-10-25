'use strict';

const visuals = (() => {
  const registry = new Map();
  const order = [];
  let currentId = null;
  let onChange = null;
  const _thumbnails = new Map();
  let prewarmToken = 0;
  let prewarmSavedOnChange = null;

  let notifEl = null;

  // A label dropped somewhere random, with a level line to a point near the
  // middle of the artwork.
  function showNotification(text) {
    if (!notifEl) {
      notifEl = document.createElement('div');
      notifEl.id = 'visual-notification';
      notifEl.innerHTML = '<svg><line class="vn-halo"></line><line></line><circle r="2.5"></circle></svg><span class="vn-label"></span>';
      document.body.appendChild(notifEl);
    }
    const label = notifEl.querySelector('.vn-label');
    label.textContent = text;
    const W = innerWidth, H = innerHeight;
    const lw = label.offsetWidth, lh = label.offsetHeight;
    const tx = W / 2 + (Math.random() - 0.5) * W * 0.2;
    const ty = H / 2 + (Math.random() - 0.5) * H * 0.2;
    const pick = (lo, hi) => lo + Math.random() * Math.max(0, hi - lo);
    // Label level with the point, out to the left or right.
    const ly = ty - lh / 2;
    const left = Math.random() < 0.5;
    const lx = left ? pick(24, tx - W * 0.15 - lw) : pick(tx + W * 0.15, W - lw - 24);
    const ax = left ? lx + lw : lx;
    const ay = ty;
    label.style.left = `${lx}px`;
    label.style.top = `${ly}px`;
    for (const line of notifEl.querySelectorAll('line')) {
      line.setAttribute('x1', ax); line.setAttribute('y1', ay);
      line.setAttribute('x2', tx); line.setAttribute('y2', ty);
    }
    const dot = notifEl.querySelector('circle');
    dot.setAttribute('cx', tx); dot.setAttribute('cy', ty);
    notifEl.classList.add('visible');
    clearTimeout(notifEl._hideTimer);
    notifEl._hideTimer = setTimeout(() => notifEl.classList.remove('visible'), 2000);
  }

  function register(id, artwork) {
    if (registry.has(id)) {
      console.warn(`Visual artwork '${id}' already registered`);
      return;
    }
    registry.set(id, artwork);
    order.push(id);
  }

  // Shared p5 canvas setup for artworks: create canvas, pixel density,
  // fixed fullscreen styling + 30fps. Options cover the outliers:
  //   { renderer: p.WEBGL, preserveDrawingBuffer: true, pixelDensity: 1 }
  function setupP5Canvas(p, opts = {}) {
    const {
      renderer = p.P2D,
      pixelDensity = window.devicePixelRatio || 1,
      preserveDrawingBuffer = false,
    } = opts;
    p.createCanvas(p.windowWidth, p.windowHeight, renderer);
    if (preserveDrawingBuffer) p.setAttributes('preserveDrawingBuffer', true);
    p.pixelDensity(pixelDensity);
    p.frameRate(30);
    p.canvas.style.position = 'fixed';
    p.canvas.style.top = '0';
    p.canvas.style.left = '0';
    p.canvas.style.width = '100%';
    p.canvas.style.height = '100%';
    p.canvas.style.zIndex = '1';
    // Sketches without their own handler still follow the window, so the
    // filter overlays (sized from this canvas) never lag behind a resize.
    if (!p.windowResized) p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
    return p;
  }

  // Shared teardown for artworks: remove the p5 instance, restore block-canvas.
  function stopP5(p) {
    if (p) p.remove();
    const blockCanvas = document.getElementById('block-canvas');
    if (blockCanvas) blockCanvas.style.display = 'block';
  }

  function removeP5Canvases() {
    document.querySelectorAll('canvas.p5Canvas').forEach((c) => c.remove());
  }

  function startArtwork(id, artwork) {
    try {
      if (artwork.start) artwork.start();
      return true;
    } catch (e) {
      console.warn('Visual artwork start failed:', id, e);
      removeP5Canvases();
      return false;
    }
  }

  function activate(id) {
    const artwork = registry.get(id);
    if (!artwork) {
      console.warn(`Unknown visual artwork: '${id}'`);
      return false;
    }
    if (currentId === id) return true;
    if (currentId) {
      const prev = registry.get(currentId);
      if (prev.stop) prev.stop();
    }
    currentId = null;
    // Defensive: remove orphaned p5 canvases left by an interrupted start
    // (rapid prewarm cycling of WebGL sketches can freeze a canvas in the DOM
    // with a dead draw loop). Otherwise a zombie renders over the real visual.
    removeP5Canvases();
    if (!startArtwork(id, artwork)) return false;
    currentId = id;
    showNotification(artwork.name || id);
    if (onChange) onChange(id);

    setTimeout(() => captureThumbnail(id), 600);
    return true;
  }

  function next() {
    if (order.length < 2) return;
    const idx = order.indexOf(currentId);
    api.activate(order[(idx + 1) % order.length]);
  }

  function prev() {
    if (order.length < 2) return;
    const idx = order.indexOf(currentId);
    api.activate(order[(idx - 1 + order.length) % order.length]);
  }

  function handleKeyDown(e) {
    if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    }
  }

  function notify(event, data) {
    const artwork = registry.get(currentId);
    if (artwork && artwork.onEvent) {
      artwork.onEvent(event, data);
    }
  }

  // Each visual renders through one of a few known surfaces. Guessing at
  // "whichever canvas looks visible right now" (the old approach) is racy
  // during rapid prewarm cycling and can silently attribute one visual's
  // stale frame to a completely different id. Resolve deliberately instead.
  function captureVisualCanvas(id) {
    // Giphy composites a transparent overlay canvas over a background <img>
    // or looping <video>; capturing the overlay alone yields a black JPEG (no
    // alpha), so flatten both onto an offscreen canvas first.
    if (id === 'giphy') {
      const img = document.getElementById('gif-bg');
      const overlay = document.getElementById('overlay-canvas');
      if (!img) return null;
      const mw = img.videoWidth || img.naturalWidth;
      const mh = img.videoHeight || img.naturalHeight;
      if (!mw || (img.tagName === 'VIDEO' ? img.readyState < 2 : !img.complete)) return null;
      const w = (overlay && overlay.width) || mw;
      const h = (overlay && overlay.height) || mh;
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const ctx = tmp.getContext('2d');
      try {
        ctx.drawImage(img, 0, 0, w, h);
        if (overlay) ctx.drawImage(overlay, 0, 0, w, h);
        return tmp.toDataURL('image/jpeg', 0.4);
      } catch (e) {
        return null;
      }
    }

    // p5-based sketches each own a dedicated <canvas class="p5Canvas">.
    const p5c = document.querySelector('canvas.p5Canvas');
    if (p5c && p5c.width > 50 && p5c.height > 50 && getComputedStyle(p5c).display !== 'none') {
      try {
        return p5c.toDataURL('image/jpeg', 0.4);
      } catch (e) {
        return null;
      }
    }

    // Visuals (blocks, grid, ...) that draw straight onto the shared canvas.
    const block = document.getElementById('block-canvas');
    if (block && block.width > 50 && getComputedStyle(block).display !== 'none') {
      try {
        return block.toDataURL('image/jpeg', 0.4);
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  function captureThumbnail(id) {
    const url = captureVisualCanvas(id);
    if (url) _thumbnails.set(id, url);
  }

  function random() {
    if (!order.length) return;
    const startIdx = Math.floor(Math.random() * order.length);
    for (let offset = 0; offset < order.length; offset++) {
      if (api.activate(order[(startIdx + offset) % order.length])) return true;
    }
    return false;
  }

  function resetTimer(id) {
    const artwork = registry.get(id || currentId);
    if (artwork && artwork.resetTimer) artwork.resetTimer();
  }

  function artworkEnded() {
    setTimeout(() => {
      const others = order.filter(id => id !== currentId);
      const pool = others.length ? others : order;
      api.activate(pool[Math.floor(Math.random() * pool.length)]);
    }, 0);
  }

  function cancelPrewarm() {
    prewarmToken++;
    if (onChange === null) onChange = prewarmSavedOnChange;
    prewarmSavedOnChange = null;
    document.body.classList.remove('prewarming');
    if (currentId) {
      const artwork = registry.get(currentId);
      if (artwork && artwork.stop) artwork.stop();
    }
    currentId = null;
    removeP5Canvases();
  }

  function prewarmThumbnails() {
    const token = ++prewarmToken;
    const savedOnChange = onChange;
    prewarmSavedOnChange = savedOnChange;
    onChange = null;
    const savedId = currentId;
    currentId = null;
    // Hide the sketch canvases while cycling so the user doesn't see every
    // visual flash by at startup. toDataURL still reads the buffer (opacity
    // only affects screen compositing, not rendering).
    document.body.classList.add('prewarming');

    let idx = 0;

    function next() {
      if (token !== prewarmToken) return;
      if (idx >= order.length) {
        if (onChange === null) onChange = savedOnChange;
        prewarmSavedOnChange = null;
        document.body.classList.remove('prewarming');
        const randId = savedId || order[Math.floor(Math.random() * order.length)];
        // Internal activate: currentId is still the last prewarmed sketch, and
        // the wrapper would save the live filter set as that sketch's preset.
        if (!activate(randId)) random();
        return;
      }

      const id = order[idx];
      idx++;

      if (_thumbnails.has(id)) {
        next();
        return;
      }

      const artwork = registry.get(id);
      if (!artwork || !artwork.start) {
        next();
        return;
      }

      if (currentId) {
        const prev = registry.get(currentId);
        if (prev && prev.stop) prev.stop();
      }
      // Remove orphaned p5 canvases so we snapshot the real visual, not a
      // zombie left by a previous interrupted (WebGL) start.
      removeP5Canvases();
      currentId = id;
      // A single failing sketch must not abort the whole prewarm chain.
      try {
        artwork.start();
      } catch (e) {
        console.warn('prewarm start failed:', id, e);
        currentId = null;
        removeP5Canvases();
        setTimeout(next, 10);
        return;
      }

      // Let the sketch render several frames before snapshotting — most are
      // blank on frame 1, and sparse/particle sketches need real time to
      // accumulate enough trail detail to read as a recognizable thumbnail.
      let frames = 0;
      const settle = () => {
        if (token !== prewarmToken) return;
        if (frames++ < 30) { requestAnimationFrame(settle); return; }
        captureThumbnail(id);
        setTimeout(next, 10);
      };
      requestAnimationFrame(settle);
    }

    next();
  }

  function getList() {
    return order.map(id => {
      const artwork = registry.get(id);
      return { id, name: artwork ? (artwork.name || id) : id };
    });
  }

  function getCurrentId() {
    return currentId;
  }

  function getCurrentName() {
    if (!currentId) return '';
    const artwork = registry.get(currentId);
    return artwork ? (artwork.name || currentId) : '';
  }

  function getThumbnail(id) {
    return _thumbnails.get(id) || null;
  }

  function init() {
    window.addEventListener('keydown', handleKeyDown);
  }

  function drawScanlines(ctx, w, h, frame, vignetteOpacity = 0.55) {
    ctx.save();
    const spacing = 12;
    const offset = (frame * 0.5) % spacing;
    for (let y = -spacing + offset; y < h + spacing; y += spacing) {
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, y, w, 8);
    }
    ctx.restore();

    ctx.save();
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${vignetteOpacity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // Internal switches (next/prev/random/...) call api.activate so wrappers
  // installed on the public method (app.js preset load/save) always run.
  const api = { register, showNotification, setupP5Canvas, stopP5, activate, next, prev, random, resetTimer, artworkEnded, prewarmThumbnails, cancelPrewarm, notify, init, drawScanlines, getList, getCurrentId, getCurrentName, getThumbnail, captureThumbnail, get onChange() { return onChange; }, set onChange(v) { onChange = v; } };
  return api;
})();
