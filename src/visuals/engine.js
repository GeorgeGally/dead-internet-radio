'use strict';

const visuals = (() => {
  const registry = new Map();
  const order = [];
  let currentId = null;
  let onChange = null;
  const _thumbnails = new Map();

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

  function activate(id) {
    const artwork = registry.get(id);
    if (!artwork) {
      console.warn(`Unknown visual artwork: '${id}'`);
      return;
    }
    if (currentId === id) return;
    if (currentId) {
      const prev = registry.get(currentId);
      if (prev.stop) prev.stop();
    }
    // Defensive: remove orphaned p5 canvases left by an interrupted start
    // (rapid prewarm cycling of WebGL sketches can freeze a canvas in the DOM
    // with a dead draw loop). Otherwise a zombie renders over the real visual.
    document.querySelectorAll('canvas.p5Canvas').forEach((c) => c.remove());
    currentId = id;
    if (artwork.start) artwork.start();
    showNotification(artwork.name || id);
    if (onChange) onChange(id);

    setTimeout(() => captureThumbnail(id), 600);
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

  function captureThumbnail(id) {
    try {
      const canvases = document.querySelectorAll('canvas');
      let found = false;
      for (const c of canvases) {
        if (c.id === 'block-canvas' || c.id === 'overlay-canvas' || c.id === 'fx-canvas' || c.id === 'wave') continue;
        const display = getComputedStyle(c).display;
        if (display === 'none') continue;
        _thumbnails.set(id, c.toDataURL('image/jpeg', 0.3));
        found = true;
        break;
      }
      if (found) return;
      const block = document.getElementById('block-canvas');
      const overlay = document.getElementById('overlay-canvas');
      const gif = document.getElementById('gif-bg');
      const target = (block && block.style.display !== 'none') ? block
        : (overlay && overlay.style.display !== 'none') ? overlay
        : gif;
      if (target) {
        if (target.tagName === 'CANVAS') {
          _thumbnails.set(id, target.toDataURL('image/jpeg', 0.3));
        } else if (target.tagName === 'IMG' && target.src) {
          _thumbnails.set(id, target.src);
        }
      }
    } catch (e) {}
  }

  function random() {
    if (!order.length) return;
    activate(order[Math.floor(Math.random() * order.length)]);
  }

  function prewarmThumbnails() {
    const savedOnChange = onChange;
    onChange = null;
    const savedId = currentId;
    currentId = null;
    // Hide the sketch canvases while cycling so the user doesn't see every
    // visual flash by at startup. toDataURL still reads the buffer (opacity
    // only affects screen compositing, not rendering).
    document.body.classList.add('prewarming');

    let idx = 0;

    function next() {
      if (idx >= order.length) {
        if (onChange === null) onChange = savedOnChange;
        document.body.classList.remove('prewarming');
        const randId = savedId || order[Math.floor(Math.random() * order.length)];
        activate(randId);
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
      document.querySelectorAll('canvas.p5Canvas').forEach((c) => c.remove());
      currentId = id;
      // A single failing sketch must not abort the whole prewarm chain.
      try {
        artwork.start();
      } catch (e) {
        console.warn('prewarm start failed:', id, e);
        setTimeout(next, 10);
        return;
      }

      // Let the sketch render several frames before snapshotting — most are
      // blank on frame 1 and accumulate detail over time.
      let frames = 0;
      const settle = () => {
        if (frames++ < 12) { requestAnimationFrame(settle); return; }
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

  return { register, activate, next, prev, random, prewarmThumbnails, notify, init, drawScanlines, getList, getCurrentId, getCurrentName, getThumbnail, get onChange() { return onChange; }, set onChange(v) { onChange = v; } };
})();
