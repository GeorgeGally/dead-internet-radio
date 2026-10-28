'use strict';

// After Modem Symphony No. 1 (radarboy3000, 2023): the whole screen at once.
// A field of columns, each typing itself down at its own width and cell
// height - bars hung with hairlines, thin vertical rules, stacked pixel
// text, outline cells, the odd colour block. It is seeded full the moment it
// appears. The music cuts it to a new field, and now and then one row or
// column of pixels is smeared across the screen.
visuals.register('modem_symphony', (() => {
  let myP5 = null;

  const SLOGANS = [
    'WAR IS OVER IF YOU WANT IT ',
    'KEIN MENSCH IST ILLEGAL ',
    'ALL WORK AND NO PLAY MAKES JACK A DULL BOY ',
    'I DIDNT GO TO WORK TODAY ',
    '++ I WILL LOVE YOU FOREVER ++ ',
  ];

  // Field, ink, and the colours a block or a smear may pick up.
  const SCENES = [
    { w: 6, bg: '#fafafa', ink: '#000', accents: ['#000', '#000', '#00b5b0', '#ff3355'] },
    { w: 2, bg: '#000', ink: '#fff', accents: ['#fff', '#777', '#00ffff'] },
    { w: 1, bg: '#00ffff', ink: '#000', accents: ['#000', '#fff'] },
    { w: 1, bg: '#00b5b0', ink: '#000', accents: ['#000', '#fff', '#3355ff', '#ff3355'] },
    { w: 1, bg: '#fafafa', ink: '#000', accents: ['#ff0000', '#00cc44', '#0000ff', '#ff00ff', '#00ffff', '#ffee00'] },
  ];

  // Column widths and cell heights, in px: slabs and lanes side by side.
  const WIDTHS = [12, 16, 16, 24, 32, 32, 48, 64, 96];
  const HEIGHTS = [6, 8, 10, 12, 14, 18, 24];

  // Blank lane, text, bar with hairlines, vertical rules, outline cell,
  // colour block, half bar. Bars and text most of the time, a lane of paper
  // left open here and there.
  const WEIGHTS = [0.10, 0.22, 0.30, 0.12, 0.12, 0.05, 0.09];

  function start() {
    const blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      let page;
      let scene = SCENES[0];
      let cols = [];
      let sceneAt = 0;
      let sceneFor = 1000;
      let fs = 0;
      const td = new Uint8Array(256);

      const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

      function words() {
        const track = (document.getElementById('mini-track') || {}).textContent || '';
        return `${track.trim().toUpperCase()} >> DEAD INTERNET RADIO 88.8 >> ${pickOf(SLOGANS)}`;
      }

      function pickScene() {
        let r = Math.random() * SCENES.reduce((s, c) => s + c.w, 0);
        for (const s of SCENES) { r -= s.w; if (r < 0) return s; }
        return SCENES[0];
      }

      // A wide lane left blank is a hole in the field; narrow ones read as paper
      // between columns, so only they are allowed to go empty.
      function pickKind(c) {
        let r = Math.random();
        for (let k = 0; k < WEIGHTS.length; k++) {
          r -= WEIGHTS[k];
          if (r < 0) return k === 0 && c.w > 32 ? 2 : k;
        }
        return 1;
      }

      // A new composition: columns of mixed width edge to edge, each with its
      // own cell height, ink, and where it has got to.
      function makeColumns() {
        cols = [];
        let x = 0;
        while (x < p.width) {
          const w = Math.min(pickOf(WIDTHS), p.width - x);
          const h = pickOf(HEIGHTS);
          const c = {
            x, w, h,
            y: 0,
            ink: Math.random() < 0.15 ? pickOf(scene.accents) : scene.ink,
            accent: pickOf(scene.accents),
            text: '', ti: 0,
          };
          c.kind = pickKind(c);
          cols.push(c);
          x += w;
        }
      }

      // Fill each column from the top down to somewhere: full screen at once,
      // ragged at the bottom, and the typing carries on from there.
      function seed() {
        for (const c of cols) {
          const until = p.height * (0.4 + Math.random() * 0.6);
          c.y = 0;
          while (c.y < until) { cell(c); c.y += c.h; }
        }
      }

      function cell(c) {
        const g = page;
        const { x, y, w, h } = c;
        g.noStroke();
        g.fill(scene.bg);
        g.rect(x, y, w, h);
        if (c.kind === 0) return;
        g.fill(c.ink);
        if (c.kind === 1) {
          if (c.ti >= c.text.length) { c.text = words(); c.ti = 0; }
          const ts = Math.max(6, Math.min(12, Math.min(w, h) * 0.85));
          if (fs !== ts) { g.textSize(ts); fs = ts; }
          g.text(c.text[c.ti++], x + w / 2, y + h / 2 + 1);
        } else if (c.kind === 2) {
          // Bar, hung with a hairline. Stacked cells read as a ruled slab.
          g.rect(x, y, w, h);
          g.stroke(scene.bg);
          g.strokeWeight(1);
          g.line(x, y + h / 2, x + w, y + h / 2);
        } else if (c.kind === 3) {
          for (let i = 0; i < 3; i++) g.rect(x + (i + 0.5) * w / 3 - 0.5, y, Math.max(1, w / 24), h);
        } else if (c.kind === 4) {
          g.noFill();
          g.stroke(c.ink);
          g.strokeWeight(1);
          g.rect(x + 0.5, y + 0.5, w - 1, h - 1);
        } else if (c.kind === 5) {
          g.fill(c.accent);
          g.rect(x, y, w, h);
        } else {
          g.rect(x, y, w, h * 0.5);
        }
      }

      // One row or column of pixels pulled out across part of the page: fine
      // lines, never a wipe of the whole field.
      function smear() {
        const c = page.drawingContext;
        const el = page.elt;
        c.imageSmoothingEnabled = false;
        if (Math.random() < 0.6) {
          // A 1px row dragged down: fine vertical lines.
          const sy = Math.floor(Math.random() * (p.height - 1));
          const len = Math.max(8, (p.height - sy) * (0.25 + Math.random() * 0.75));
          c.drawImage(el, 0, sy, p.width, 1, 0, sy, p.width, len);
        } else {
          // A 1px column dragged sideways: fine horizontal lines.
          const sx = Math.floor(Math.random() * (p.width - 1));
          const left = Math.random() < 0.5;
          const len = Math.max(8, (left ? sx : p.width - sx) * (0.25 + Math.random() * 0.75));
          c.drawImage(el, sx, 0, 1, p.height, left ? sx - len : sx, 0, len, p.height);
        }
      }

      // Wipe to a new field: new colours, new columns, full again.
      function newScene(now, level) {
        scene = pickScene();
        page.background(scene.bg);
        makeColumns();
        seed();
        sceneAt = now;
        sceneFor = 900 + Math.random() * (level > 0.1 ? 3000 : 7000);
      }

      function makePage() {
        page = p.createGraphics(p.width, p.height);
        page.pixelDensity(1);
        page.textFont('Dogica');
        page.textAlign(p.CENTER, p.CENTER);
        fs = 0;
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.noSmooth();
        makePage();
        newScene(0, 0);
      };

      p.windowResized = () => {
        page.remove();
        makePage();
        newScene(p.millis(), 0);
      };

      p.draw = () => {
        const speed = (window.soundSensitivity ?? 50) / 50;
        const react = (window._cutoffVal ?? 130) / 255;

        let level = 0.1;
        if (audioAnalysisReady && analyser) {
          analyser.getByteTimeDomainData(td);
          let s = 0;
          for (let i = 0; i < td.length; i++) s += Math.abs(td[i] - 128);
          level = s / td.length / 128;
        }

        const now = p.millis();
        // Cut to a new field when the time's up, or on a hit.
        if (now - sceneAt > sceneFor || (now - sceneAt > 250 && level * react > 0.22 && Math.random() < 0.15)) {
          newScene(now, level);
        }

        // Every column types at once; louder music types faster. A column
        // keeps its treatment for the length of a pass.
        const steps = 1 + Math.round(level * 8 * speed);
        for (const c of cols) {
          if (Math.random() < 0.01) c.kind = pickKind(c);
          for (let i = 0; i < steps; i++) {
            cell(c);
            c.y += c.h;
            if (c.y >= p.height) {
              c.y = 0;
              c.kind = pickKind(c);
              c.ink = Math.random() < 0.15 ? pickOf(scene.accents) : scene.ink;
            }
          }
        }
        if (Math.random() < 0.02 + level * react * 0.1) smear();

        p.image(page, 0, 0);
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
