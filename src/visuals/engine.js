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

  function showNotification(text) {
    if (!notifEl) {
      notifEl = document.createElement('div');
      notifEl.id = 'visual-notification';
      document.body.appendChild(notifEl);
    }
    notifEl.textContent = text;
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
    activate(order[(idx + 1) % order.length]);
  }

  function prev() {
    if (order.length < 2) return;
    const idx = order.indexOf(currentId);
    activate(order[(idx - 1 + order.length) % order.length]);
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
    // Giphy composites a transparent overlay canvas over a background <img>;
    // capturing the overlay alone yields a black JPEG (no alpha), so flatten
    // both onto an offscreen canvas first.
    if (id === 'giphy') {
      const img = document.getElementById('gif-bg');
      const overlay = document.getElementById('overlay-canvas');
      if (!img || !img.complete || !img.naturalWidth) return null;
      const w = (overlay && overlay.width) || img.naturalWidth;
      const h = (overlay && overlay.height) || img.naturalHeight;
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
      if (activate(order[(startIdx + offset) % order.length])) return true;
    }
    return false;
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

  return { register, activate, next, prev, random, prewarmThumbnails, cancelPrewarm, notify, init, drawScanlines, getList, getCurrentId, getCurrentName, getThumbnail, captureThumbnail, get onChange() { return onChange; }, set onChange(v) { onChange = v; } };
})();
