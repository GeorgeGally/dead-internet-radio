'use strict';

// Station idents, ported from the station-ident lab.
// To add one: append an entry to IDENTS below with
//   { id, name, L, draw(ctx, w, h, t, state) }
// where L is its length in seconds. Nothing else changes: app.js never
// branches per ident, and every ident gets a fresh state object per play.

(function () {
  // ---------- shared helpers (from the lab) ----------
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const ramp = (t, s, d) => clamp((t - s) / d);
  function rng(hex) {
    let a = parseInt(hex.slice(0, 8), 16) >>> 0;
    return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function h32(n) { n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return (n ^ n >>> 16) >>> 0; }
  const MONO = (px, wt = 400) => `${wt} ${px}px 'IBM Plex Mono', monospace`;
  const ORANGE = '#ff5a1f';

  // No idents in rotation: the block wall was retired to
  // visuals/archive/ident-ascii-block-wall.js. Add one here to bring idents back.
  const IDENTS = [];

  // ---------- player: a full-frame ident between tracks and during loads ----------
  let canvas = null;
  let ctx = null;
  let raf = 0;
  let startedAt = 0;
  let state = null;
  let current = null;
  let nextIndex = 0;
  let kind = '';
  let loadTimer = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
  }

  function step(now) {
    if (!current) return;
    const t = (now - startedAt) / 1000;
    if (t > current.L) {
      if (kind === 'load') { play('load'); return; }
      stop(); return;
    }
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    current.draw(ctx, w, h, t, state);
    ctx.restore();
    if (t > current.L - .6) {
      ctx.fillStyle = `rgba(0,0,0,${ramp(t, current.L - .6, .6)})`;
      ctx.fillRect(0, 0, w, h);
    }
    raf = requestAnimationFrame(step);
  }

  function init() {
    canvas = document.getElementById('ident-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', () => { if (current) resize(); });
  }

  // The welcome splash plays its own ident; nothing goes over it.
  function splashUp() {
    const el = document.getElementById('welcome-splash');
    return !!el && el.style.display !== 'none' && !el.classList.contains('fade-out');
  }

  function play(mode) {
    if (!ctx || !IDENTS.length || splashUp()) return;
    stop();
    kind = mode || '';
    current = IDENTS[nextIndex % IDENTS.length];
    nextIndex += 1;
    state = {};
    startedAt = performance.now();
    resize();
    canvas.classList.add('on');
    raf = requestAnimationFrame(step);
  }

  function load() {
    if (loadTimer || kind === 'load' || !ctx || splashUp()) return;
    loadTimer = setTimeout(() => { loadTimer = 0; play('load'); }, 300);
  }

  function loadDone() {
    if (kind === 'load' || loadTimer) stop();
  }

  function stop() {
    clearTimeout(loadTimer);
    loadTimer = 0;
    kind = '';
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    current = null;
    state = null;
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (canvas) canvas.classList.remove('on');
  }

  window.idents = { list: IDENTS, init, play, load, loadDone, stop };
})();
