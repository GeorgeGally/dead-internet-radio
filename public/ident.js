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

  // ---------- V23 — ASCII blocks: a wall of block glyphs that resolves into the word ----------
  const BLK_RAMP = '█▓▒░';
  const BLK_FONT = {
    D: ['11110', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '11110', '10000', '11111'],
    A: ['01110', '10001', '11111', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '11111'],
    N: ['10001', '11001', '10101', '10011', '10001'],
    T: ['11111', '00100', '00100', '00100', '00100'],
    R: ['11110', '10001', '11110', '10100', '10011'],
    O: ['01110', '10001', '10001', '10001', '01110'],
  };
  const BLK_WORD = 'DEAD INTERNET RADIO';
  const BLK_COLS = BLK_WORD.length * 6 - 1;
  const BLK_MASK = [...BLK_WORD].reduce((g, ch, i) => {
    if (BLK_FONT[ch]) BLK_FONT[ch].forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '1') g[y][i * 6 + x] = 1; });
    return g;
  }, Array.from({ length: 5 }, () => new Uint8Array(BLK_COLS)));

  const IDENTS = [
    {
      id: 'ascii-block-wall',
      name: 'ASCII · block wall',
      L: 11,
      draw(c, w, h, t, S) {
        if (!S.v) {
          const r = rng('3a7f1c9d0b5e4826fd91a74c');
          S.v = Array.from({ length: BLK_COLS }, () => 2.6 + r() * 7);
          S.o = Array.from({ length: BLK_COLS }, () => r() * 977);
          S.a = Array.from({ length: BLK_COLS }, () => .55 + r() * .7);
        }
        const u = h / 100;
        c.fillStyle = '#0b0b0a'; c.fillRect(0, 0, w, h);
        c.textBaseline = 'top';
        if (!S.aw) { c.font = MONO(100); S.aw = c.measureText(BLK_RAMP[0]).width; }
        const cw = (w - 8 * u) / BLK_COLS, fs = 100 * cw / S.aw, rh = fs;
        const rows = Math.max(9, Math.floor(h / rh) - 2), y0 = (h - rows * rh) / 2, x0 = (w - BLK_COLS * cw) / 2;
        c.font = MONO(fs);
        const band = Math.floor((rows - 5) / 2), fade = ramp(t, 0, 1.1), hold = ramp(t, 2.6, .7) * (1 - ramp(t, 7.6, .6));
        for (let col = 0; col < BLK_COLS; col++) {
          const p = (S.v[col] * t + S.o[col]) % 977, fr = Math.floor(p), ph = p - fr, x = x0 + col * cw, ca = S.a[col];
          for (let r = 0; r < rows; r++) {
            const y = y0 + (r - ph) * rh, wr = r - band;
            const edge = Math.min(ramp(r, -.5, 3), 1 - ramp(r, rows - 2.5, 3));
            const g = h32((r + fr) * 131 + col * 977) % 100, wa = fade * (.04 + .28 * edge) * ca * (.92 - .3 * hold);
            if (wr >= 0 && wr < 5 && BLK_MASK[wr][col]) {
              const rv = ramp(t, 2.2 + col * .0055 + wr * .03, .22), dv = ramp(t, 7.4 + (h32(wr * 977 + col * 131) % 1000) / 1000 * .8, .18);
              if (rv > 0 && dv < 1) {
                c.globalAlpha = rv * (1 - dv); c.fillStyle = ORANGE; c.fillText(BLK_RAMP[0], x, y);
                continue;
              }
            }
            c.globalAlpha = wa * (g < 40 ? 1 : .62);
            c.fillStyle = '#e8e4da';
            c.fillText(g < 24 ? BLK_RAMP[0] : g < 56 ? BLK_RAMP[1] : g < 82 ? BLK_RAMP[2] : BLK_RAMP[3], x, y);
          }
        }
        c.globalAlpha = 1; c.textBaseline = 'alphabetic';
      },
    },
  ];

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
