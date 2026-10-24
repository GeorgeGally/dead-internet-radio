'use strict';

// A green-phosphor terminal title card for whatever is on air: the song title
// glows in the middle, the artist sits huge and faint behind it, the corners
// are level meters. Cutoff sets the grid, resonance glitches the headline,
// sensitivity sets how hard it all answers the music.
visuals.register('system_terminal', (() => {
  let myP5 = null;

  const GREEN = [61, 255, 90];
  const FONT = '"IBM Plex Mono", "Courier New", monospace';

  function trackInfo() {
    try {
      const t = playlist?.tracks?.[currentTrack] || {};
      return {
        title: String(t.title || 'Dead Internet Radio').toUpperCase(),
        artist: String(t.artist || 'DIR').toUpperCase(),
        show: String(t.show || '').toUpperCase(),
        bpm: t.bpm ? `${t.bpm} BPM` : '',
        key: String(t.key || t.keyscale || '').toUpperCase(),
      };
    } catch (e) {
      return { title: 'DEAD INTERNET RADIO', artist: 'DIR', show: '', bpm: '', key: '' };
    }
  }

  // Up to three lines of roughly balanced length.
  function wrap(text) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 3) return words;
    const lines = ['', '', ''];
    const target = text.length / 3;
    let li = 0;
    for (const w of words) {
      if (li < 2 && lines[li].length && lines[li].length + w.length > target) li++;
      lines[li] = lines[li] ? `${lines[li]} ${w}` : w;
    }
    return lines.filter(Boolean);
  }

  function start() {
    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    myP5 = new p5((p) => {
      let info = trackInfo();
      let key = '';
      let typedFrom = 0;
      let bassAvg = 0;
      let hitGlow = 0;
      let ghostShift = 0;

      const rgba = (a) => `rgba(${GREEN[0]},${GREEN[1]},${GREEN[2]},${a})`;

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.textFont(FONT);
      };

      function bands() {
        const gain = (window.audioInputGain ?? 50) / 50;
        const out = { level: 0, bass: 0, bars: new Array(15).fill(0) };
        if (!(audioAnalysisReady && analyser && frequencyData)) return out;
        analyser.getByteFrequencyData(frequencyData);
        const n = Math.floor(frequencyData.length * 0.6);
        let all = 0;
        for (let i = 0; i < n; i++) all += frequencyData[i];
        out.level = Math.min(1, (all / (n * 255)) * 2 * gain);
        let low = 0;
        for (let i = 0; i < 12; i++) low += frequencyData[i];
        out.bass = Math.min(1, (low / (12 * 255)) * gain);
        for (let b = 0; b < out.bars.length; b++) {
          const i0 = Math.floor((b / out.bars.length) * n);
          const i1 = Math.max(i0 + 1, Math.floor(((b + 1) / out.bars.length) * n));
          let s = 0;
          for (let i = i0; i < i1; i++) s += frequencyData[i];
          out.bars[b] = Math.min(1, (s / ((i1 - i0) * 255)) * 1.4 * gain);
        }
        return out;
      }

      function drawGrid(g) {
        const ctx = p.drawingContext;
        ctx.strokeStyle = rgba(0.05);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = (p.width % g) / 2; x < p.width; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, p.height); }
        for (let y = (p.height % g) / 2; y < p.height; y += g) { ctx.moveTo(0, y); ctx.lineTo(p.width, y); }
        ctx.stroke();
        ctx.strokeStyle = rgba(0.22);
        ctx.beginPath();
        for (let x = (p.width % g) / 2 + g; x < p.width; x += g * 2) {
          for (let y = (p.height % g) / 2 + g; y < p.height; y += g * 2) {
            ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
            ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
          }
        }
        ctx.stroke();
      }

      // Pixel blocks in a corner, lit by a few spectrum bands.
      function meter(x, y, values, dir, cell) {
        const ctx = p.drawingContext;
        values.forEach((v, i) => {
          for (let k = 0; k < 3; k++) {
            const lit = v > (k + 1) / 4;
            ctx.fillStyle = rgba(lit ? 0.9 : 0.15);
            const cx = x + dir * i * (cell + 3);
            ctx.fillRect(dir > 0 ? cx : cx - cell, y - k * (cell + 3) * (y > p.height / 2 ? 1 : -1), cell, cell);
          }
        });
      }

      p.draw = () => {
        const now = p.millis();
        const t = trackInfo();
        const k = `${t.title}|${t.artist}`;
        if (k !== key) { key = k; info = t; typedFrom = now; }

        const a = bands();
        const hit = a.bass > 0.35 && a.bass > bassAvg * 1.35;
        bassAvg = bassAvg * 0.95 + a.bass * 0.05;
        if (hit) { hitGlow = 1; ghostShift = (Math.random() - 0.5) * p.width * 0.04; }
        hitGlow *= 0.9;
        ghostShift *= 0.95;

        const cutoff = window._cutoffVal ?? 130;
        const grid = Math.round(28 + ((cutoff - 5) / 250) * 90);
        const res = Math.max(0, Math.min(1, ((window._resonanceVal ?? 50) - 30) / 70));

        const ctx = p.drawingContext;
        p.background(0);
        drawGrid(grid);

        const W = p.width;
        const H = p.height;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // Artist, huge and faint behind everything.
        let gs = H * 0.42;
        ctx.font = `700 ${gs}px ${FONT}`;
        const gw = ctx.measureText(info.artist).width;
        if (gw > W * 0.94) { gs *= (W * 0.94) / gw; ctx.font = `700 ${gs}px ${FONT}`; }
        ctx.fillStyle = rgba(0.07 + a.level * 0.05);
        ctx.fillText(info.artist, W / 2 + ghostShift, H * 0.5);

        // Title, glowing.
        const lines = wrap(info.title);
        let fs = Math.min(H * 0.13, W * 0.11);
        ctx.font = `700 ${fs}px ${FONT}`;
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        if (widest > W * 0.7) { fs *= (W * 0.7) / widest; ctx.font = `700 ${fs}px ${FONT}`; }
        const lh = fs * 1.02;
        const top = H * 0.46 - ((lines.length - 1) * lh) / 2;
        ctx.save();
        ctx.shadowColor = rgba(0.9);
        ctx.shadowBlur = fs * (0.25 + a.level * 0.35 + hitGlow * 0.3);
        ctx.fillStyle = rgba(0.85 + hitGlow * 0.15);
        lines.forEach((l, i) => {
          const jitter = res > 0 && Math.random() < res * 0.25 ? (Math.random() - 0.5) * fs * res : 0;
          ctx.fillText(l, W / 2 + jitter, top + i * lh);
        });
        ctx.restore();

        // Typed readout under the title.
        const small = Math.max(11, Math.round(Math.min(W, H) * 0.022));
        ctx.font = `400 ${small}px ${FONT}`;
        ctx.textAlign = 'left';
        const readout = [info.artist, [info.bpm, info.key].filter(Boolean).join(' · ')].filter(Boolean);
        const chars = Math.floor((now - typedFrom) / 45);
        const left = W / 2 - Math.min(W * 0.35, widest / 2);
        let used = 0;
        ctx.fillStyle = rgba(0.8);
        readout.forEach((line, i) => {
          const n = Math.max(0, Math.min(line.length, chars - used));
          used += line.length;
          const caret = n < line.length && n > 0 && Math.floor(now / 400) % 2 ? '_' : '';
          ctx.fillText(line.slice(0, n) + caret, left, top + lines.length * lh + small * (1.2 + i * 1.5));
        });

        // Frequency, bracketed, under a hairline.
        const fy = Math.min(H - small * 5, top + lines.length * lh + small * 6.5);
        ctx.strokeStyle = rgba(0.25);
        ctx.beginPath();
        ctx.moveTo(W / 2 - small * 9, fy - small * 1.6);
        ctx.lineTo(W / 2 + small * 9, fy - small * 1.6);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `400 ${Math.round(small * 1.25)}px ${FONT}`;
        ctx.fillStyle = rgba(0.85);
        ctx.fillText('[ 0321.9 KHZ ]', W / 2, fy);

        // Status, top left.
        ctx.textAlign = 'left';
        ctx.font = `400 ${Math.round(small * 0.85)}px ${FONT}`;
        ctx.fillStyle = rgba(0.75);
        ['SIGNAL: ONLINE', info.show && `SHOW: ${info.show}`, `TIME: ${new Date().toTimeString().slice(0, 8)}`]
          .filter(Boolean)
          .forEach((s, i) => ctx.fillText(s, small * 1.6, small * (2 + i * 1.3)));

        // Corner meters.
        const cell = Math.max(5, Math.round(small * 0.5));
        meter(W - small * 1.6, small * 1.8, a.bars.slice(0, 5), -1, cell);
        meter(small * 1.6, H - small * 1.8, a.bars.slice(5, 10), 1, cell);
        meter(W - small * 1.6, H - small * 1.8, a.bars.slice(10, 15), -1, cell);

        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'System Terminal', start, stop };
})());
