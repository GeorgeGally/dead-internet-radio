'use strict';

// After Modem Symphony No. 1 (radarboy3000, 2023-24): a cursor types the
// screen full of 24px cells, the waveform picking each one: pixel-font
// text, stripes, checks, solid. Bands of the page swap places now and then.
visuals.register('modem_symphony', (() => {
  let myP5 = null;

  const SLOGANS = [
    'WAR IS OVER IF YOU WANT IT >> WAR IS OVER NOW ',
    'KEIN MENSCH IST ILLEGAL ',
    'ALL WORK AND NO PLAY MAKES JACK A DULL BOY ',
    'I DIDNT GO TO WORK TODAY >> I DONT THINK ILL GO TOMORROW ',
    '++ I WILL LOVE YOU FOREVER ++ ',
  ];

  function start() {
    const blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      const SZ = 24;
      const BANDS = 8;
      let page;            // what's been typed so far; persists
      let x, y, flow = 1;  // the cursor, and whether it runs across or down
      let text = '';
      let ti = 0;
      let swap = null;     // { a, b, t0 } while two bands trade places
      let lastSwap = 0;
      let wave = false;    // cells read the waveform one by one
      let run = 1;         // the cell kind being typed

      // Black and text most, then checks and stripes, a solid now and then.
      const WEIGHTS = [0.22, 0.3, 0.13, 0.11, 0.11, 0.08, 0.05];
      function pickKind() {
        let r = Math.random();
        for (let k = 0; k < WEIGHTS.length; k++) { r -= WEIGHTS[k]; if (r < 0) return k; }
        return 1;
      }
      const td = new Uint8Array(256);

      function words() {
        const track = (document.getElementById('mini-track') || {}).textContent || '';
        const hex = Array.from({ length: 48 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
        return `${track.trim()} >> DEAD INTERNET RADIO 88.8 >> ${hex} >> ${SLOGANS[Math.floor(Math.random() * SLOGANS.length)]}`;
      }

      function home() {
        x = SZ;
        y = SZ;
      }

      // The typed area: whole cells inside a frame at least one cell wide.
      const cols = () => Math.floor((p.width - SZ * 2) / SZ);
      const rows = () => Math.floor((p.height - SZ * 2) / SZ);

      function advance() {
        const maxX = SZ * cols();
        const maxY = SZ * rows();
        if (flow) {
          x += SZ;
          if (x > maxX) { x = SZ; y += SZ; if (y > maxY) y = SZ; }
        } else {
          y += SZ;
          if (y > maxY) { y = SZ; x += SZ; if (x > maxX) x = SZ; }
        }
      }

      function stripes(g, n, across) {
        const s = SZ / 2 / n;
        for (let i = 0; i < n; i++) {
          if (across) g.rect(x, y + i * (SZ / n), SZ, s);
          else g.rect(x + i * (SZ / n), y, s, SZ);
        }
      }

      function checks(g, n) {
        const c = SZ / n;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) if ((i + j) % 2 === 0) g.rect(x + i * c, y + j * c, c, c);
        }
      }

      // One cell. k runs 0 (quiet) to 6 (loud).
      function cell(g, k) {
        g.noStroke();
        g.fill(0);
        g.rect(x, y, SZ, SZ);
        g.fill(255);
        if (k === 0) return;
        if (k === 1) {
          if (ti >= text.length) { text = words(); ti = 0; }
          g.text(text[ti++], x + SZ / 2, y + SZ / 2 + 1);
        } else if (k === 2) checks(g, 8);
        else if (k === 3) stripes(g, 4, false);
        else if (k === 4) stripes(g, 4, true);
        else if (k === 5) checks(g, 4);
        else g.rect(x, y, SZ, SZ);
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.noSmooth();
        page = p.createGraphics(p.width, p.height);
        page.pixelDensity(1);
        page.background(0);
        page.textFont('Dogica');
        page.textSize(SZ * 0.6);
        page.textAlign(p.CENTER, p.CENTER);
        text = words();
        home();
      };

      p.windowResized = () => {
        const old = page;
        page = p.createGraphics(p.width, p.height);
        page.pixelDensity(1);
        page.background(0);
        page.image(old, 0, 0);
        page.textFont('Dogica');
        page.textSize(SZ * 0.6);
        page.textAlign(p.CENTER, p.CENTER);
        old.remove();
        home();
      };

      p.draw = () => {
        const speed = (window.soundSensitivity ?? 50) / 50;
        const react = (window._cutoffVal ?? 130) / 255;

        let level = 0.15;
        if (audioAnalysisReady && analyser) {
          analyser.getByteTimeDomainData(td);
          let s = 0;
          for (let i = 0; i < td.length; i++) s += Math.abs(td[i] - 128);
          level = s / td.length / 128;
        }

        // Louder music types faster and changes its mind sooner. Mostly one
        // cell kind at a time, so the page fills in runs; now and then each
        // cell reads the waveform instead.
        if (Math.random() < 0.02) wave = !wave;
        if (wave && Math.random() < 0.05) wave = false;
        if (Math.random() < 0.1 + level * react * 2) run = pickKind();
        const steps = Math.round((10 + level * 160) * speed);
        for (let i = 0; i < steps; i++) {
          const k = wave ? Math.min(6, Math.floor(td[i % td.length] / 256 * 7 * (0.6 + react * 0.8))) : run;
          cell(page, k);
          advance();
        }
        if (Math.random() < 0.0008) flow = 1 - flow;
        if (!flow && Math.random() < 0.004) flow = 1;

        p.background(255);
        p.image(page, 0, 0);

        // Every few seconds two bands of the page trade places.
        const bh = Math.floor((rows() * SZ) / BANDS);
        const now = p.millis();
        if (!swap && now - lastSwap > 1800 + Math.random() * 4000) {
          const a = Math.floor(Math.random() * BANDS);
          let b = Math.floor(Math.random() * BANDS);
          if (b === a) b = (a + 1) % BANDS;
          swap = { a, b, t0: now, imgA: page.get(SZ, SZ + a * bh, cols() * SZ, bh), imgB: page.get(SZ, SZ + b * bh, cols() * SZ, bh) };
        }
        if (swap) {
          const t = Math.min(1, (now - swap.t0) / 1200);
          const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          const ya = SZ + swap.a * bh;
          const yb = SZ + swap.b * bh;
          p.image(swap.imgA, SZ, p.lerp(ya, yb, e));
          p.image(swap.imgB, SZ, p.lerp(yb, ya, e));
          if (t >= 1) {
            page.image(swap.imgA, SZ, yb);
            page.image(swap.imgB, SZ, ya);
            swap = null;
            lastSwap = now;
          }
        }

        // White frame round the page.
        p.noStroke();
        p.fill(255);
        const right = SZ + cols() * SZ;
        const bottom = SZ + rows() * SZ;
        p.rect(0, 0, p.width, SZ);
        p.rect(0, 0, SZ, p.height);
        p.rect(right, 0, p.width - right, p.height);
        p.rect(0, bottom, p.width, p.height - bottom);

        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Modem Symphony', start, stop };
})());
