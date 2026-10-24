'use strict';

// A type specimen board that rebuilds itself. A fine grid fills and drains in
// waves: rows and columns of paper cells printed with b, P, d, Y and 8, floods
// of blank paper, rain of tiny glyphs on black. Big chamfered letters cut in
// over dark windows, and paper chips step across the grid, tied together by
// hairlines. Bass hits move the chips and cut letters in; cutoff sets the cell
// size, resonance how restless the glyphs are, sensitivity how hard the music
// pushes it all.
visuals.register('glyph_board', (() => {
  let myP5 = null;

  const BG = '#151515';
  const PAPER = '#d9d6ce';
  const PAPER_DIM = '#b9b6ae';
  const INK = '#1b1b1b';
  const LINE = 'rgba(255,255,255,0.075)';
  const RED = '#c8392f';
  const MONO = '"IBM Plex Mono", "Courier New", monospace';
  const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const GLYPHS = ['b', 'P', 'd', 'Y', '8', '"', '.', "'", 'b', '8'];

  // Big letters as chamfered strokes on a 3.2 × 6 box.
  const LETTERS = {
    b: [[[0, 0], [0, 6]], [[0, 2.6], [2.5, 2.6], [3.2, 3.3], [3.2, 5.3], [2.5, 6], [0, 6]]],
    d: [[[3.2, 0], [3.2, 6]], [[3.2, 2.6], [0.7, 2.6], [0, 3.3], [0, 5.3], [0.7, 6], [3.2, 6]]],
    P: [[[0, 6], [0, 0], [2.5, 0], [3.2, 0.7], [3.2, 2.7], [2.5, 3.4], [0, 3.4]]],
    Y: [[[0, 0], [0, 1.1], [1.1, 2.4], [2.1, 2.4], [3.2, 1.1], [3.2, 0]], [[1.6, 2.4], [1.6, 6]]],
    8: [[[0.7, 0], [2.5, 0], [3.2, 0.7], [3.2, 2.2], [2.5, 2.8], [0.7, 2.8], [0, 2.2], [0, 0.7], [0.7, 0]],
      [[0.7, 2.8], [2.5, 2.8], [3.2, 3.5], [3.2, 5.3], [2.5, 6], [0.7, 6], [0, 5.3], [0, 3.5], [0.7, 2.8]]],
  };
  const BIG = ['b', 'P', 'd', 'Y', 'b', 'P'];

  function start() {
    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    myP5 = new p5((p) => {
      let ctx;
      let grain = null;
      // Board geometry, in px and cells.
      let bx = 0, by = 0, cols = 0, rows = 0, c = 16;
      // Per cell: 0 empty, 1 paper, 2 glyph on black. `next` is the scene's
      // target, `at` the time each cell flips to it.
      let cur, next, at, glyph;
      let scene = -1, sceneAt = 0, sceneLen = 8000;
      let windows = [];
      let chips = [];
      let bassAvg = 0, lastHit = 0;
      let coord = [53.10345, 58.29775];

      const rnd = (a, b) => a + Math.random() * (b - a);
      const ri = (a, b) => Math.floor(rnd(a, b));
      const pick = (arr) => arr[ri(0, arr.length)];

      function makeGrain() {
        const g = document.createElement('canvas');
        g.width = 512; g.height = 512;
        const gx = g.getContext('2d');
        const img = gx.createImageData(512, 512);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = Math.random() * 255;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
        gx.putImageData(img, 0, 0);
        return g;
      }

      function layout() {
        const W = p.width, H = p.height;
        const cutoff = window._cutoffVal ?? 130;
        c = Math.round((8 + ((cutoff - 5) / 250) * 16) * Math.max(0.7, H / 760));
        // Clear of the menu bar, with room for the readouts.
        const top = Math.max(96, H * 0.14);
        const m = Math.max(24, W * 0.03);
        const nc = Math.floor((W - m * 2) / c);
        const nr = Math.floor((H - top - m * 0.9) / c);
        bx = Math.round((W - nc * c) / 2);
        by = Math.round(top);
        if (nc === cols && nr === rows) return;
        cols = nc; rows = nr;
        const n = cols * rows;
        cur = new Uint8Array(n);
        next = new Uint8Array(n);
        at = new Float64Array(n);
        glyph = new Uint8Array(n);
        for (let i = 0; i < n; i++) glyph[i] = ri(0, GLYPHS.length);
        windows = [];
        chips = [];
        nextScene(p.millis(), true);
      }

      // ── Scenes: each fills `next` and a flip time per cell ──────────────
      function frame(t) {
        for (let x = 0; x < cols; x++) { t[x] = 1; t[(rows - 1) * cols + x] = 1; }
      }
      function hbar(t, r, x0, x1, v = 1) { for (let x = Math.max(0, x0); x < Math.min(cols, x1); x++) t[r * cols + x] = v; }
      function vbar(t, x, r0, r1, v = 1) { for (let r = Math.max(0, r0); r < Math.min(rows, r1); r++) t[r * cols + x] = v; }
      function rect(t, x0, r0, x1, r1, v = 1) { for (let r = r0; r < r1; r++) hbar(t, r, x0, x1, v); }

      const SCENES = [
        // Streets: long runs of printed cells crossing the board.
        (t) => {
          frame(t);
          for (let k = 0; k < ri(4, 7); k++) {
            const r = ri(2, rows - 2);
            for (let x = 0; x < cols;) { const len = ri(3, 18); if (Math.random() < 0.6) hbar(t, r, x, x + len); x += len + ri(1, 6); }
          }
          for (let k = 0; k < ri(5, 10); k++) { const x = ri(1, cols - 1); const r0 = ri(1, rows - 4); vbar(t, x, r0, r0 + ri(4, rows)); }
          const fx = ri(4, cols / 3), fr = ri(rows / 2, rows - 4);
          for (let r = fr; r < rows - 1; r++) hbar(t, r, fx - Math.floor((r - fr) * 0.6), fx + 4 + Math.floor((r - fr) * 0.5));
        },
        // Flood: rain on top, a bank of blank paper below with a bite out of it.
        (t) => {
          frame(t);
          const split = ri(rows * 0.3, rows * 0.55);
          for (let r = 1; r < split; r++) for (let x = 0; x < cols; x++) t[r * cols + x] = Math.random() < 0.55 ? 2 : 0;
          for (let k = 0; k < ri(4, 9); k++) vbar(t, ri(0, cols), 1, split);
          rect(t, 0, split, cols, rows, 1);
          const bite = ri(cols * 0.3, cols * 0.6);
          rect(t, Math.random() < 0.5 ? 0 : cols - bite, split + ri(2, 5), Math.random() < 0.5 ? bite : cols, rows - 1, 0);
        },
        // Ledger: printed runs and black dashes, like a dump of memory.
        (t) => {
          frame(t);
          for (let r = 1; r < rows - 1; r++) {
            if (Math.random() < 0.12) continue;
            for (let x = 0; x < cols;) { const len = ri(1, 12); const v = Math.random() < 0.58 ? 1 : 0; hbar(t, r, x, x + len, v); x += len; }
          }
          rect(t, ri(2, cols / 2), ri(2, rows / 2), ri(cols / 2, cols - 2), ri(rows / 2 + 2, rows - 2), 0);
        },
        // Static: glyph rain over the whole board, a printed floor.
        (t) => {
          frame(t);
          for (let r = 1; r < rows - 1; r++) for (let x = 0; x < cols; x++) t[r * cols + x] = Math.random() < 0.45 ? 2 : 0;
          const floor = ri(rows * 0.75, rows * 0.88);
          rect(t, 0, floor, cols, rows, 1);
          for (let k = 0; k < ri(2, 5); k++) { const r = ri(rows * 0.4, floor); const x0 = ri(0, cols / 2); hbar(t, r, x0, x0 + ri(8, cols / 2)); }
        },
        // Quiet: the board empties; only chips and markers stay.
        () => {},
      ];

      function nextScene(now, instant) {
        let s = ri(0, SCENES.length);
        if (s === scene) s = (s + 1) % SCENES.length;
        if (scene === 4 && s === 4) s = 0;
        scene = s;
        sceneAt = now;
        sceneLen = scene === 4 ? rnd(3500, 6000) : rnd(7000, 12000);
        next.fill(0);
        SCENES[scene](next);
        // The wave: from a side, from a point, or scattered.
        const mode = ri(0, 4);
        const ox = ri(0, cols), oy = ri(0, rows);
        const span = rnd(1200, 2600);
        const res = Math.max(0, Math.min(1, (window._resonanceVal ?? 50) / 100));
        for (let r = 0; r < rows; r++) for (let x = 0; x < cols; x++) {
          const i = r * cols + x;
          let d;
          if (mode === 0) d = r / rows;
          else if (mode === 1) d = x / cols;
          else if (mode === 2) d = Math.hypot(x - ox, (r - oy) * 1.2) / Math.hypot(cols, rows);
          else d = Math.random();
          d = d * (1 - res * 0.5) + Math.random() * res * 0.5;
          at[i] = instant ? 0 : now + d * span;
        }
        if (instant) cur.set(next);
        // Letters for this scene.
        windows = windows.filter(() => Math.random() < 0.3);
        if (scene !== 4 || Math.random() < 0.5) addWindow(now);
        if (chips.length < 3) for (let k = 0; k < ri(3, 6); k++) addChip();
      }

      function addWindow(now) {
        const chars = Math.random() < 0.55 ? 1 : 2;
        const h = ri(Math.max(8, rows * 0.22), Math.max(10, rows * 0.36));
        const lw = Math.round(h * 0.62);
        const w = chars * lw + (chars - 1) * Math.round(lw * 0.5) + Math.round(h * 0.4);
        if (w >= cols - 2 || h >= rows - 2) return;
        const txt = Array.from({ length: chars }, () => pick(BIG));
        windows.push({ x: ri(1, cols - w - 1), y: ri(1, rows - h - 1), w, h, txt, born: now, life: rnd(3000, 9000), dot: Math.random() < 0.4 });
        if (windows.length > 3) windows.shift();
      }

      function addChip() {
        const n = pick([1, 1, 2, 2, 2, 3, 4]);
        const x = ri(0, cols - n * 3), y = ri(1, rows - 3);
        chips.push({ n, ch: Math.random() < 0.75 ? 'b' : pick(['P', 'd', 'Y', '8']), x, y, px: x, py: y, tx: x, ty: y, link: Math.random() < 0.6, out: 0 });
      }

      function moveChips(force) {
        for (const ch of chips) {
          if (!force && Math.random() < 0.5) continue;
          // Step along the grid: mostly one axis at a time.
          if (Math.random() < 0.5) ch.tx = ri(0, cols - ch.n * 3);
          else ch.ty = ri(1, rows - 3);
        }
        if (Math.random() < 0.3 && chips.length > 2) chips[ri(0, chips.length)].out = 1;
        if (Math.random() < 0.4 && chips.length < 7) addChip();
      }

      function level() {
        const gain = (window.audioInputGain ?? 50) / 50;
        if (!(audioAnalysisReady && analyser && frequencyData)) return { lvl: 0, bass: 0 };
        analyser.getByteFrequencyData(frequencyData);
        let b = 0, a = 0;
        for (let i = 1; i < 12; i++) b += frequencyData[i];
        for (let i = 1; i < 200; i++) a += frequencyData[i];
        const bass = Math.min(1, (b / 11 / 255) * gain);
        const lvl = Math.min(1, (a / 199 / 255) * 1.6 * gain);
        return { bass: isFinite(bass) ? bass : 0, lvl: isFinite(lvl) ? lvl : 0 };
      }

      function drawLetter(ch, x, y, h) {
        const u = h / 6;
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = PAPER;
        ctx.lineWidth = u * 0.72;
        ctx.lineJoin = 'bevel';
        ctx.lineCap = 'butt';
        for (const path of LETTERS[ch] || LETTERS.b) {
          ctx.beginPath();
          path.forEach(([px, py], k) => (k ? ctx.lineTo(px * u, py * u) : ctx.moveTo(px * u, py * u)));
          ctx.stroke();
        }
        ctx.restore();
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);
        ctx = p.drawingContext;
        grain = makeGrain();
        layout();
      };

      p.draw = () => {
        const now = p.millis();
        const W = p.width, H = p.height;
        layout();
        const res = Math.max(0, Math.min(1, (window._resonanceVal ?? 50) / 100));
        const { bass, lvl } = level();
        bassAvg = bassAvg * 0.95 + bass * 0.05;
        const hit = bass > 0.32 && bass > bassAvg * 1.3 && now - lastHit > 260;
        if (hit) {
          lastHit = now;
          moveChips(false);
          if (Math.random() < 0.25) addWindow(now);
        }
        if (now - sceneAt > sceneLen) nextScene(now, false);
        // Without music the chips still wander.
        if (!audioAnalysisReady && p.frameCount % 150 === 0) moveChips(false);

        // Flip cells whose time has come; restless glyphs reprint.
        const n = cols * rows;
        const flicker = 0.002 + res * 0.02 + lvl * 0.03;
        for (let i = 0; i < n; i++) {
          if (cur[i] !== next[i] && now >= at[i]) cur[i] = next[i];
          if (Math.random() < flicker) glyph[i] = ri(0, GLYPHS.length);
        }
        if (hit) {
          // A bass hit reprints one band of the board.
          const r0 = ri(1, rows - 3);
          for (let r = r0; r < Math.min(rows - 1, r0 + ri(1, 3)); r++) for (let x = 0; x < cols; x++) {
            const i = r * cols + x;
            if (cur[i] === 0 && Math.random() < 0.35) cur[i] = 2;
            glyph[i] = ri(0, GLYPHS.length);
          }
        }

        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, W, H);

        // Header readouts.
        const fs = Math.max(8, Math.round(H * 0.0125));
        ctx.font = `400 ${fs}px ${MONO}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(217,214,206,0.55)';
        const sizex = (c / 16).toFixed(1);
        const sizey = (0.8 + res * 0.3).toFixed(2);
        const hy = by - fs * 4.2;
        [[ '-------', 'Sizex', 'Sizey'], ['-------', sizex, sizey], ['-------', 'Sizex', 'Sizey'], ['-------', (lvl * 2).toFixed(1), (bass).toFixed(2)]]
          .forEach((col, k) => col.forEach((s, j) => ctx.fillText(s, bx + k * fs * 9, hy + j * fs * (j ? 1.05 : 1.4) + (j ? fs * 0.3 : 0))));

        // Grid.
        ctx.strokeStyle = LINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= cols; x++) { ctx.moveTo(bx + x * c + 0.5, by); ctx.lineTo(bx + x * c + 0.5, by + rows * c); }
        for (let r = 0; r <= rows; r++) { ctx.moveTo(bx, by + r * c + 0.5); ctx.lineTo(bx + cols * c, by + r * c + 0.5); }
        ctx.stroke();

        // Cells.
        const gfs = Math.max(6, Math.round(c * 0.66));
        ctx.font = `500 ${gfs}px ${MONO}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let r = 0; r < rows; r++) {
          const top = r === 0 || r === rows - 1;
          for (let x = 0; x < cols; x++) {
            const i = r * cols + x;
            const v = cur[i];
            if (!v) continue;
            const px = bx + x * c, py = by + r * c;
            const g = top ? 'Y' : GLYPHS[glyph[i]];
            if (v === 1) {
              ctx.fillStyle = PAPER;
              ctx.fillRect(px + 1, py + 1, c - 1, c - 1);
              // Floods stay mostly blank; runs are mostly printed.
              if (top || (glyph[i] + x + r) % (scene === 1 ? 7 : 3) === 0) {
                ctx.fillStyle = INK;
                ctx.fillText(g, px + c / 2 + 0.5, py + c / 2 + 1);
              }
            } else {
              ctx.fillStyle = glyph[i] % 3 ? 'rgba(217,214,206,0.55)' : PAPER_DIM;
              ctx.fillText(g, px + c / 2 + 0.5, py + c / 2 + 1);
            }
          }
        }

        // Letter windows: cut in, hold, cut out.
        windows = windows.filter((w) => now - w.born < w.life);
        for (const w of windows) {
          const age = now - w.born;
          // A two-frame stutter on the way in and out.
          if ((age < 120 && (p.frameCount & 2)) || (w.life - age < 120 && (p.frameCount & 2))) continue;
          const x = bx + w.x * c, y = by + w.y * c;
          ctx.fillStyle = '#121212';
          ctx.fillRect(x, y, w.w * c, w.h * c);
          if (w.dot) {
            ctx.fillStyle = 'rgba(217,214,206,0.35)';
            for (let r = 1; r < w.h; r += 3) for (let k = 1; k < w.w; k += 3) ctx.fillRect(x + k * c, y + r * c, 1.5, 1.5);
          }
          const lh = w.h * c * 0.62;
          const lw = lh * (3.2 / 6);
          const gap = lw * 0.9;
          const total = w.txt.length * lw + (w.txt.length - 1) * gap;
          w.txt.forEach((ch, k) => drawLetter(ch, x + (w.w * c - total) / 2 + k * (lw + gap), y + (w.h * c - lh) / 2, lh));
        }

        // Chips and the hairlines that tie them together.
        const ease = 0.12 + lvl * 0.15;
        chips = chips.filter((ch) => !(ch.out && ch.out > 30));
        const pos = chips.map((ch) => {
          // One axis at a time, like a plotter.
          if (Math.abs(ch.px - ch.tx) > 0.02) ch.px += (ch.tx - ch.px) * ease;
          else { ch.px = ch.tx; ch.py += (ch.ty - ch.py) * ease; }
          if (ch.out) ch.out++;
          return { x: bx + ch.px * c, y: by + ch.py * c, w: ch.n * c * 2.6, h: c * 2.5, ch };
        });
        ctx.strokeStyle = 'rgba(217,214,206,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 0; k < pos.length - 1; k++) {
          if (!pos[k].ch.link) continue;
          const a = pos[k], b = pos[k + 1];
          ctx.moveTo(a.x + a.w / 2, a.y + a.h / 2);
          ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
        }
        if (windows.length && pos.length) {
          const w = windows[windows.length - 1];
          ctx.moveTo(bx + (w.x + w.w) * c, by + w.y * c);
          ctx.lineTo(pos[0].x + pos[0].w / 2, pos[0].y + pos[0].h / 2);
        }
        ctx.stroke();
        ctx.font = `500 ${Math.round(c * 1.05)}px ${SANS}`;
        for (const q of pos) {
          if (q.ch.out && q.ch.out % 4 < 2) continue;
          ctx.fillStyle = '#cdcac2';
          ctx.fillRect(q.x, q.y, q.w, q.h);
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.strokeRect(q.x + 0.5, q.y + 0.5, q.w - 1, q.h - 1);
          ctx.fillStyle = INK;
          for (let k = 0; k < q.ch.n; k++) ctx.fillText(q.ch.ch, q.x + (k + 0.5) * (q.w / q.ch.n), q.y + q.h / 2 + 1);
        }

        // Markers along a hairline near the bottom: rings, red specks, a fix.
        const ly = by + rows * c * 0.86;
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(0, ly + 0.5);
        ctx.lineTo(W, ly + 0.5);
        ctx.stroke();
        const ringR = Math.max(3, c * 0.32);
        [0.012, 0.42, 0.52, 0.76, 0.86].forEach((f, k) => {
          const x = f * W;
          const y = k ? ly - c * 2.2 : ly - c * 2.2;
          ctx.fillStyle = PAPER;
          ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = BG;
          ctx.beginPath(); ctx.arc(x, y, ringR * 0.45, 0, Math.PI * 2); ctx.fill();
        });
        ctx.fillStyle = RED;
        for (let k = 0; k < 9; k++) {
          const x = ((k * 0.137 + 0.05) % 1) * W;
          if ((p.frameCount + k * 7) % 90 < 60) ctx.fillRect(x, ly + c * 1.4 + (k % 3) * 4, 2, 2);
        }
        if (p.frameCount % (res > 0.6 ? 2 : 6) === 0) {
          coord = coord.map((v) => v + (Math.random() - 0.5) * 0.0004 * (1 + lvl * 20));
        }
        ctx.font = `400 ${fs}px ${MONO}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(217,214,206,0.7)';
        ctx.fillText(`N ${coord[0].toFixed(5)} E${coord[1].toFixed(5)}`, bx + cols * c * 0.7, ly - c * 4);

        // Paper grain over everything.
        ctx.globalAlpha = 0.05;
        ctx.globalCompositeOperation = 'overlay';
        for (let y = 0; y < H; y += 512) for (let x = 0; x < W; x += 512) ctx.drawImage(grain, x, y);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;

        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => { p.resizeCanvas(p.windowWidth, p.windowHeight); layout(); };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Glyph Board', start, stop };
})());
