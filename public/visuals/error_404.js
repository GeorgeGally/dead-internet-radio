'use strict';

// A black terminal test page in phosphor green. The big title is set in a 5x7 pixel font
// whose cells are drawn in one of six styles (horizontal, vertical, pixel,
// brick, full, inflated); the list top-left shows which. Everything small
// ticks, types and loads. Bass hits change the style, the barcode and the
// chevrons follow the spectrum. Cutoff sizes the title, resonance glitches it,
// sensitivity sets how hard it answers the music.
visuals.register('error_404', (() => {
  let myP5 = null;

  const BG = '#000000';
  const INK = '#3dff5a';
  const MODES = ['HORIZONTAL', 'VERTICAL', 'PIXEL', 'BRICK LANE', 'FULL', 'INFLATED'];
  const TITLES = ['(ERROR 404)', '(NO SIGNAL)', '(DEAD LINK)', '(ERROR 404)', '(LOST FEED)'];

  // 5x7 glyphs, rows top to bottom, '1' = ink.
  const F = {
    A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110',
    C: '01110100011000010000100001000101110', D: '11100100101000110001100011001011100',
    E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
    G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001',
    I: '01110001000010000100001000010001110', J: '00111000100001000010000101001001100',
    K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
    M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001',
    O: '01110100011000110001100011000101110', P: '11110100011000111110100001000010000',
    Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
    S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100',
    U: '10001100011000110001100011000101110', V: '10001100011000110001100010101000100',
    W: '10001100011000110101101011101110001', X: '10001100010101000100010101000110001',
    Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
    0: '01110100011001110101110011000101110', 1: '00100011000010000100001000010001110',
    2: '01110100010000100010001000100011111', 3: '11111000100010000010000011000101110',
    4: '00010001100101010010111110001000010', 5: '11111100001111000001000011000101110',
    6: '00110010001000011110100011000101110', 7: '11111000010001000100010000100001000',
    8: '01110100011000101110100011000101110', 9: '01110100011000101111000010001001100',
    '(': '00010001000100001000010000010000010', ')': '01000001000001000010000100010001000',
    '.': '00000000000000000000000000110001100', '-': '00000000000000011111000000000000000',
    '_': '00000000000000000000000000000011111', '>': '10000010000010000010001000100010000',
    '<': '00001000100010001000001000001000001', '=': '00000000001111100000111110000000000',
    '/': '00001000010001000100010001000010000', ':': '00000011000110000000011000110000000',
    ';': '00000011000110000000011000010001000', '&': '01100100101010001000101011001001101',
    '!': '00100001000010000100001000000000100', '?': '01110100010000100010001000000000100',
    '#': '01010010101111101010111110101001010', '@': '01110100011011110101101111000001110',
    "'": '00100001000100000000000000000000000', ',': '00000000000000000000001100001000100',
    ' ': '00000000000000000000000000000000000',
  };

  function trackInfo() {
    try {
      const t = playlist?.tracks?.[currentTrack] || {};
      return { title: String(t.title || '').toUpperCase(), artist: String(t.artist || '').toUpperCase() };
    } catch (e) {
      return { title: '', artist: '' };
    }
  }

  function start() {
    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    myP5 = new p5((p) => {
      let mode = 0;
      let modeAt = 0;
      let bassAvg = 0;
      let titleIdx = 0;
      let typedFrom = 0;
      let lastKey = '';
      let ctx;

      p.setup = () => {
        visuals.setupP5Canvas(p);
        ctx = p.drawingContext;
      };

      // One glyph cell in the given style.
      function cell(x, y, s, m) {
        const g = Math.max(1, s * 0.18);
        if (m === 0) { // horizontal stripes
          const n = 3;
          for (let i = 0; i < n; i++) ctx.fillRect(x, y + (i * s) / n, s, s / n - g * 0.6);
        } else if (m === 1) { // vertical stripes
          const n = 3;
          for (let i = 0; i < n; i++) ctx.fillRect(x + (i * s) / n, y, s / n - g * 0.6, s);
        } else if (m === 2) { // pixel
          ctx.fillRect(x + g / 2, y + g / 2, s - g, s - g);
        } else if (m === 3) { // brick
          ctx.fillRect(x, y + g / 2, s * 0.62, s / 2 - g);
          ctx.fillRect(x + s * 0.38, y + s / 2 + g / 2, s * 0.62, s / 2 - g);
        } else if (m === 4) { // full
          ctx.fillRect(x, y, s + 0.5, s + 0.5);
        } else { // inflated
          ctx.beginPath();
          ctx.arc(x + s / 2, y + s / 2, s * 0.56, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Pixel-font text. Small text is always solid; the title takes the mode.
      function text(str, x, y, s, m = 4, align = 'left', glitch = 0) {
        const w = str.length * 6 * s - s;
        let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
        for (const ch of str) {
          const bits = F[ch] || F[' '];
          const jx = glitch && Math.random() < glitch ? (Math.random() - 0.5) * s * 4 : 0;
          for (let r = 0; r < 7; r++) {
            for (let c = 0; c < 5; c++) {
              if (bits[r * 5 + c] === '1' && !(glitch && Math.random() < glitch * 0.15)) {
                cell(cx + c * s + jx, y + r * s, s, m);
              }
            }
          }
          cx += 6 * s;
        }
        return w;
      }

      function audio() {
        const gain = (window.audioInputGain ?? 50) / 50;
        const out = { bass: 0, level: 0, bars: new Array(64).fill(0) };
        if (!(audioAnalysisReady && analyser && frequencyData)) return out;
        analyser.getByteFrequencyData(frequencyData);
        const n = Math.floor(frequencyData.length * 0.6);
        let all = 0;
        let low = 0;
        for (let i = 0; i < n; i++) all += frequencyData[i];
        for (let i = 0; i < 12; i++) low += frequencyData[i];
        out.level = Math.min(1, (all / (n * 255)) * 2 * gain);
        out.bass = Math.min(1, (low / (12 * 255)) * gain);
        for (let b = 0; b < 64; b++) {
          const i = Math.floor((b / 64) * n);
          out.bars[b] = Math.min(1, (frequencyData[i] / 255) * 1.3 * gain);
        }
        return out;
      }

      p.draw = () => {
        const now = p.millis();
        const W = p.width;
        const H = p.height;
        const a = audio();
        const t = trackInfo();
        const key = t.title + t.artist;
        if (key !== lastKey) { lastKey = key; typedFrom = now; }

        // Bass hits (or every ~4s without music) move to the next style.
        const hit = a.bass > 0.35 && a.bass > bassAvg * 1.35;
        bassAvg = bassAvg * 0.95 + a.bass * 0.05;
        if ((hit && now - modeAt > 600) || now - modeAt > 4000) {
          mode = (mode + 1) % MODES.length;
          modeAt = now;
          if (mode === 0) titleIdx = (titleIdx + 1) % TITLES.length;
        }

        p.background(BG);
        ctx.fillStyle = INK;

        const u = Math.max(1.2, Math.min(W / 520, H / 350)); // small text pixel
        const lh = 9 * u;
        const m = 14 * u;
        const tick = Math.floor(now / 120);
        const dots = (n, phase = 0) => '.'.repeat(1 + ((tick + phase) % n));

        // Top left: page + style list.
        text('- 0 1', m, m, u);
        text('.NEW SIGNAL', m, m + lh, u);
        MODES.forEach((name, i) => {
          const on = i === mode;
          const line = `. 0${i + 1} ${on ? '>' : ' '} ${name}`;
          if (on && Math.floor(now / 250) % 2) ctx.globalAlpha = 0.35;
          text(line, m, m + lh * (2.6 + i), u);
          ctx.globalAlpha = 1;
        });
        text(t.title ? `(NOW: ${t.title.slice(0, 34)})` : '(NOTHING ON AIR)', m + u * 2, m + lh * 9.6, u);

        // Top right.
        text('& DEAD INTERNET RADIO', W - m, m, u, 4, 'right');
        text('& 2026', W - m, m + lh, u, 4, 'right');
        for (let i = 0; i < 3; i++) text(dots(8, i * 3).padStart(8, ' '), W - m, m + lh * (2.4 + i), u, 4, 'right');
        text(`(...) DOWNLOADING ${dots(6)}`, W * 0.56, m + lh * 6.2, u);
        text('//', W * 0.3, m + lh * 6.2, u);
        const chev = Math.round(3 + a.level * 9 + (Math.sin(now / 300) + 1) * 1.5);
        text(')'.repeat(chev), W - m, m + lh * 6.2, u, 4, 'right');
        text(':)', W - m, m + lh * 7.2, u, 4, 'right');
        const count = String(Math.floor(now / 90) % 100000).padStart(5, '0');
        text(`= ${count}`, W - m, m + lh * 8.2, u, 4, 'right');
        text(String((tick * 7) % 10000).padStart(4, '0'), W - m, m + lh * 9.6, u, 4, 'right');
        text(String(10 + (Math.floor(now / 1000) % 90)), W - m, m + lh * 11.2, u, 4, 'right');

        // Left dot columns.
        for (let i = 0; i < 4; i++) text(dots(8, i * 2).padEnd(8, ' '), m, m + lh * (11.4 + i), u);

        // Big title.
        const cutoff = window._cutoffVal ?? 130;
        const title = TITLES[titleIdx];
        const res = Math.max(0, Math.min(1, ((window._resonanceVal ?? 50) - 40) / 60));
        // The title sits between the dot columns and the login block.
        const blockW = 22 * 6 * u;
        const left = m + 10 * 6 * u;
        const room = W - m - blockW - 4 * 6 * u - left;
        const maxS = room / (title.length * 6);
        const s = Math.max(3, maxS * (0.8 + ((cutoff - 5) / 250) * 0.2));
        const tw = title.length * 6 * s - s;
        const tx = left + (room - tw) / 2;
        const ty = H * 0.47 - 3.5 * s;
        text(title, tx, ty, s, mode, 'left', res * 0.3 + (hit ? 0.05 : 0));
        // Leader line to the login block.
        const lx0 = tx + tw + s;
        text('_ _ _ _ _ _ _ _ _ _ _ _'.slice(0, Math.max(1, Math.floor((W - m - blockW - lx0) / (6 * u)))), lx0, ty + 3 * s, u);

        // Right: login block.
        text('_ _ _ _ INSERT USER', W - m, ty + 1.5 * s, u, 4, 'right');
        text('PASSWORD', W - m, ty + 1.5 * s + lh, u, 4, 'right');
        text('( LOGIN ) ( REGISTER )', W - m, ty + 1.5 * s + lh * 2.8, u, 4, 'right');
        text('(LOG OUT )', W - m, ty + 1.5 * s + lh * 3.8, u, 4, 'right');
        text('<> END 404', W - m, ty + 1.5 * s + lh * 4.8, u, 4, 'right');

        // Left numbers under the title.
        text(`= ${count}`, m, H * 0.5, u);
        text(String((tick * 3) % 10000).padStart(4, '0'), W * 0.14, H * 0.55, u);
        [10, 11, 12, 13].forEach((n, i) => text(String(n + (Math.floor(now / 2000) % 4)), W * (0.07 + i * 0.075), H * 0.6, u));

        // Typed prompt.
        const prompt = 'PLEASE_ _ _ INSERT USER_ _ _AGAIN';
        const shown = Math.max(0, Math.floor((now - typedFrom) / 70) % (prompt.length + 30));
        const caret = Math.floor(now / 400) % 2 ? '_' : ' ';
        text(prompt.slice(0, Math.min(prompt.length, shown)) + (shown < prompt.length ? caret : ''), m, H * 0.67, u);
        text('_ _ _ _ _ _ _ _ _ _ _ _ PASSWORD', m, H * 0.67 + lh, u);
        text(t.artist ? `BY ${t.artist.slice(0, 30)}` : '', m, H * 0.78, u);
        text('. - . - . - . - . -'.slice(0, 3 + (tick % 17)), m, H * 0.78 + lh, u);

        // Right: dot rows and the barcode, which follows the spectrum.
        for (let i = 0; i < 4; i++) text(dots(14, i * 4).padStart(14, ' '), W - m, H * 0.64 + lh * i, u, 4, 'right');
        const bx = W * 0.69;
        const bw = W - m - bx;
        const by = H * 0.77;
        const bh = H * 0.075;
        const bars = 64;
        for (let i = 0; i < bars; i++) {
          const v = a.bars[i] || (0.4 + 0.4 * Math.sin(now / 200 + i * 0.7));
          const x = bx + (i / bars) * bw;
          const lineW = Math.max(1, (bw / bars) * (0.25 + v * 0.6));
          ctx.fillRect(x, by, lineW, bh);
        }

        // Bottom.
        text('//', m, H - m - lh * 2.2, u);
        text('- END OF TEST PAGE', m, H - m - lh * 1.2, u);
        text('NUMBER 01 DIR', m, H - m - lh * 0.2, u);
        text('(', W * 0.31, H - m - lh * 2.2, u);
        text(')'.repeat(4 + (tick % 8)), W * 0.43, H - m - lh * 2.2, u);
        text(':)', W * 0.58, H - m - lh * 2.2, u);
        text(`EROR ${String(50000 + (Math.floor(now / 50) % 10000))}`, W - m, H - m - lh * 0.2, u, 4, 'right');

        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Error 404', start, stop };
})());
