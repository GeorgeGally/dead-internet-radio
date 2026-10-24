'use strict';

// A Swiss poster clock. The black blocks keep time: the top half is now, the
// bottom half is when the next track starts; each number slides down its block
// as its value grows. The ruled bars on the left are the spectrum: thin comb
// lines for the highs, thick bars for the lows. Cutoff sets the bar density,
// resonance smears them, sensitivity sets how far they swing.
visuals.register('swiss_clock', (() => {
  let myP5 = null;

  const PAPER = '#e8e8e4';
  const INK = '#1c1c1c';
  const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  function nextStart() {
    try {
      const t = playlist?.tracks?.[currentTrack];
      if (t && t.startsAt && t.durationMs) return new Date(t.startsAt + t.durationMs);
      const a = document.getElementById('player');
      if (a && isFinite(a.duration)) return new Date(Date.now() + (a.duration - a.currentTime) * 1000);
    } catch (e) {}
    return null;
  }

  function start() {
    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    myP5 = new p5((p) => {
      let ctx;
      let smooth = new Float32Array(256);
      let FS = 14; // one type size for every label and number, like the poster

      p.setup = () => {
        visuals.setupP5Canvas(p);
        ctx = p.drawingContext;
      };

      function spectrum(n) {
        const gain = (window.audioInputGain ?? 50) / 50;
        const out = new Float32Array(n);
        if (!(audioAnalysisReady && analyser && frequencyData)) return out;
        analyser.getByteFrequencyData(frequencyData);
        const usable = Math.floor(frequencyData.length * 0.7);
        for (let i = 0; i < n; i++) {
          // Log-ish spread so the lows get more rows.
          const f = Math.floor(Math.pow(i / n, 1.8) * usable);
          out[i] = Math.min(1, (frequencyData[f] / 255) * 1.2 * gain);
        }
        return out;
      }

      // A black block with a label top-left and a number that slides down it.
      function block(x, y, w, h, label, value, max, labelRight) {
        ctx.fillStyle = INK;
        ctx.fillRect(x, y, w, h);
        const fs = FS;
        const pad = fs * 0.5;
        ctx.fillStyle = PAPER;
        ctx.font = `400 ${fs}px ${FONT}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        if (label) ctx.fillText(label, x + pad, y + pad * 0.6);
        if (labelRight) ctx.fillText(labelRight, x + w * 0.45, y + pad * 0.6);
        if (value != null) {
          const frac = max ? value / max : 1;
          const ny = y + fs * 2.2 + frac * (h - fs * 3.6);
          ctx.textAlign = 'right';
          ctx.fillText(String(value).padStart(2, '0'), x + w - w * 0.22, ny);
        }
      }

      function half(x, y, w, h, date, which) {
        const gap = Math.max(4, w * 0.012);
        const colW = (w - gap * 2) / 3;
        const hrs = date ? date.getHours() : 0;
        const mins = date ? date.getMinutes() : 0;
        const secs = date ? date.getSeconds() + (which === 'now' ? (Date.now() % 1000) / 1000 : 0) : 0;
        // Column 1: hours, a.m./p.m., colon, label.
        const hH = h * 0.44;
        const sH = (h - hH - gap * 3) / 3;
        block(x, y, colW, hH, 'hours', String(((hrs + 11) % 12) + 1), 12);
        block(x, y + hH + gap * 2.2, colW, sH * 0.8, hrs < 12 ? 'a.m.' : 'p.m.');
        const cy = y + hH + gap * 3.4 + sH * 0.8;
        block(x, cy, colW, sH * 0.8, '');
        if (Math.floor(Date.now() / 500) % 2 || which !== 'now') {
          ctx.fillStyle = PAPER;
          const fs = FS;
          ctx.font = `400 ${fs}px ${FONT}`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(':', x + fs * 0.5, cy + fs * 0.15);
          ctx.fillText(':', x + fs * 0.5, cy + fs * 0.95);
        }
        block(x, y + h - sH * 0.8, colW, sH * 0.8, which, null, null, which === 'now' ? 'playing' : 'track');
        block(x + colW + gap, y, colW, h, 'minutes', Math.floor(mins), 59);
        block(x + (colW + gap) * 2, y, colW, h, 'seconds', Math.floor(secs), 59);
        // Seconds also move smoothly, not just the label.
        if (which === 'now') {
          const sx = x + (colW + gap) * 2;
          ctx.fillStyle = PAPER;
          ctx.globalAlpha = 0.18;
          ctx.fillRect(sx, y + (secs / 60) * h, colW, Math.max(1, h * 0.004));
          ctx.globalAlpha = 1;
        }
      }

      p.draw = () => {
        const W = p.width;
        const H = p.height;
        const m = Math.min(W, H) * 0.035;
        FS = Math.max(11, Math.round(H * 0.024));
        p.background(PAPER);

        // Left: ruled spectrum. Cutoff sets how many rows.
        const cutoff = window._cutoffVal ?? 130;
        const rowH = 4 + ((cutoff - 5) / 250) * 10;
        const rows = Math.max(16, Math.floor((H - m * 2) / rowH));
        const res = Math.max(0, Math.min(1, ((window._resonanceVal ?? 50) - 40) / 60));
        const spec = spectrum(rows);
        if (smooth.length !== rows) smooth = new Float32Array(rows);
        const leftW = W * 0.27;
        const combX = m;
        const combW = leftW * 0.4;
        const barX = m + leftW * 0.45;
        const barW = leftW * 0.5;
        ctx.fillStyle = INK;
        for (let r = 0; r < rows; r++) {
          // The bottom rows carry the bass (thick bars), the top rows the highs.
          const v = spec[rows - 1 - r];
          smooth[r] = smooth[r] * (0.55 + res * 0.4) + v * (0.45 - res * 0.4);
          const s = smooth[r];
          const y = m + r * rowH;
          // Thin comb line, full width at rest, pulled shorter by the highs.
          const comb = combW * (0.35 + 0.65 * (1 - s * 0.8));
          ctx.fillRect(combX, y, comb, Math.max(1, rowH * 0.28));
          // Thick bar, grows with the music.
          const bw = barW * (0.15 + 0.85 * s);
          ctx.fillRect(barX, y, bw, Math.max(1.5, rowH * 0.62));
        }

        // Right: the clock, now on top, the next track below.
        const rx = m + leftW + m * 0.6;
        const rw = W - rx - m;
        const gap = Math.max(6, H * 0.008);
        const hh = (H - m * 2 - gap) / 2;
        half(rx, m, rw, hh, new Date(), 'now');
        half(rx, m + hh + gap, rw, hh, nextStart(), 'next');

        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Swiss Clock', start, stop };
})());
