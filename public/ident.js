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
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const TAU = Math.PI * 2;
  function rng(hex) {
    let a = parseInt(hex.slice(0, 8), 16) >>> 0;
    return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function h32(n) { n = Math.imul(n ^ n >>> 16, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return (n ^ n >>> 16) >>> 0; }
  const hx = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const mix = (a, b, k) => { const A = hx(a), B = hx(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`; };
  const grey = (a, f) => { const [r, g, b] = hx(a); const l = Math.round((.3 * r + .59 * g + .11 * b) * f); return '#' + [l, l, l].map(v => v.toString(16).padStart(2, '0')).join(''); };
  const rgba = (hex, a) => { const [r, g, b] = hx(hex); return `rgba(${r},${g},${b},${a})`; };
  const JK = (wt, px) => `${wt} ${px}px 'Plus Jakarta Sans', sans-serif`;
  const MONO = (px, wt = 400) => `${wt} ${px}px 'IBM Plex Mono', monospace`;
  const ORANGE = '#ff5a1f', CREAM = '#f2eee6';
  const CTA = '▶ Tune in';
  const clock = () => new Date().toTimeString().slice(0, 8);

  const NZ = document.createElement('canvas'); NZ.width = 256; NZ.height = 144;
  const nzx = NZ.getContext('2d'); const nzImg = nzx.createImageData(256, 144);
  function noise(ctx, w, h, alpha, lo = 0, hi = 255, x = 0, y = 0) {
    if (alpha <= 0) return;
    const d = nzImg.data;
    for (let i = 0; i < d.length; i += 4) { const v = lo + Math.random() * (hi - lo); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    nzx.putImageData(nzImg, 0, 0);
    ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = false; ctx.drawImage(NZ, x, y, w, h); ctx.restore();
  }
  function scan(ctx, w, h, a = .18) {
    ctx.save(); ctx.fillStyle = `rgba(0,0,0,${a})`;
    const s = Math.max(2, Math.round(h / 240));
    for (let y = 0; y < h; y += s * 2) ctx.fillRect(0, y, w, s);
    ctx.restore();
  }
  function txt(ctx, s, x, y, font, color, alpha = 1, align = 'left', base = 'alphabetic') {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y); ctx.restore();
  }
  function fitFont(ctx, s, wt, px, maxW, fam = JK) { ctx.font = fam(wt, px); const m = ctx.measureText(s).width; return m > maxW ? px * maxW / m : px; }
  function key(ctx, x, y, u, alpha, o = {}) {
    if (alpha <= 0) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.font = MONO(2.8 * u, 500);
    const label = o.label || CTA, tw = ctx.measureText(label).width, pw = 1.6 * u, kh = 5 * u, kw = tw + pw * 2;
    const kx = o.align === 'right' ? x - kw : x;
    ctx.fillStyle = o.bg || CREAM; ctx.fillRect(kx, y - kh * .72, kw, kh);
    ctx.fillStyle = o.fg || '#0b0b0b'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, kx + pw, y);
    ctx.restore();
  }
  function ident(ctx, w, h, t, t0, x, y, o = {}) {
    const u = h / 100, size = o.size || 13 * u;
    txt(ctx, '/D.I.R.', x, y, JK(800, size), o.color || CREAM, ramp(t, t0, .7));
    txt(ctx, o.sub || 'Dead Internet Radio', x, y + 3.2 * u + size * .18, MONO(3.1 * u), o.dim || 'rgba(242,238,230,.8)', ramp(t, t0 + .4, .7));
    if (o.prompt !== false) key(ctx, x, y + 12 * u + size * .18, u, ramp(t, t0 + 1, .7), { bg: o.accent || CREAM });
  }
  function hud(ctx, w, h, t, t0, left, right, color = 'rgba(242,238,230,.7)') {
    const u = h / 100;
    txt(ctx, left, 6 * u, 7 * u, MONO(2.6 * u), color, ramp(t, t0, .6));
    txt(ctx, right, w - 6 * u, 7 * u, MONO(2.6 * u), color, ramp(t, t0, .6), 'right');
  }

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

  // ---------- player: a full-frame ident between tracks ----------
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

  function play(mode) {
    if (!ctx || !IDENTS.length) return;
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
    if (loadTimer || !ctx) return;
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
