'use strict';

// After Modem Symphony No. 1 (radarboy3000, 2023): mostly an empty field. A
// cursor types down a few narrow columns (stacked text, bars, outline
// cells), and now and then one row or column of pixels is smeared across
// the screen into fine lines. The music cuts it to a new field and starts
// again.
visuals.register('modem_symphony', (() => {
  let myP5 = null;

  const SLOGANS = [
    'WAR IS OVER IF YOU WANT IT ',
    'KEIN MENSCH IST ILLEGAL ',
    'ALL WORK AND NO PLAY MAKES JACK A DULL BOY ',
    'I DIDNT GO TO WORK TODAY ',
    '++ I WILL LOVE YOU FOREVER ++ ',
  ];

  // Field, ink, and colours a smear may pick up. Mostly paper.
  const SCENES = [
    { w: 5, bg: '#fafafa', ink: ['#000'] },
    { w: 2, bg: '#000', ink: ['#fff', '#777'] },
    { w: 1, bg: '#00ffff', ink: ['#000', '#fff'] },
    { w: 1, bg: '#00b5b0', ink: ['#000', '#7ff', '#3355ff', '#ff3355'] },
    { w: 1, bg: '#fafafa', ink: ['#000', '#ff0000', '#00cc44', '#0000ff', '#ff00ff', '#00ffff', '#ffee00'] },
  ];

  function start() {
    const blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      let page;
      let sz = 24;
      let scene = SCENES[0];
      let x = 0, y = 0;
      let left = 0, span = 1;  // the band of columns the cursor works in
      let run = 1;
      let text = '';
      let ti = 0;
      let sceneAt = 0;
      let sceneFor = 1000;
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

      // Wipe to a new field and drop the cursor at the top of a fresh band.
      function newScene(now, level) {
        scene = pickScene();
        sz = pickOf([12, 16, 24, 24, 32]);
        page.textSize(sz * 0.62);
        page.background(scene.bg);
        newBand();
        sceneAt = now;
        sceneFor = 300 + Math.random() * (level > 0.1 ? 1800 : 4000);
      }

      function newBand() {
        const cols = Math.floor(p.width / sz);
        span = 2 + Math.floor(Math.random() * Math.random() * 10);
        left = Math.floor(Math.random() * Math.max(1, cols - span)) * sz;
        x = left;
        y = Math.floor(Math.random() * 6) * sz;
        run = pickKind();
      }

      // Down the column; at the bottom, across to the next one in the band.
      function advance() {
        y += sz;
        if (y >= p.height) {
          y = 0;
          x += sz;
          if (x >= left + span * sz) newBand();
        }
      }

      // Text most, then bars and outline cells, a solid or a gap now and then.
      const WEIGHTS = [0.12, 0.34, 0.16, 0.12, 0.12, 0.08, 0.06];
      function pickKind() {
        let r = Math.random();
        for (let k = 0; k < WEIGHTS.length; k++) { r -= WEIGHTS[k]; if (r < 0) return k; }
        return 1;
      }

      function cell(k) {
        const g = page;
        const ink = Math.random() < 0.85 ? scene.ink[0] : pickOf(scene.ink);
        g.noStroke();
        g.fill(scene.bg);
        g.rect(x, y, sz, sz);
        if (k === 0) return;
        g.fill(ink);
        if (k === 1) {
          if (ti >= text.length) { text = words(); ti = 0; }
          g.text(text[ti++], x + sz / 2, y + sz / 2 + 1);
        } else if (k === 2) {
          // Fat bar across the middle of the cell: the ladder rungs.
          g.rect(x + sz * 0.15, y + sz * 0.3, sz * 0.7, sz * 0.4);
        } else if (k === 3) {
          for (let i = 0; i < 3; i++) g.rect(x + i * sz / 3, y, Math.max(1, sz / 12), sz);
        } else if (k === 4) {
          g.noFill();
          g.stroke(ink);
          g.strokeWeight(1);
          g.rect(x + 0.5, y + 0.5, sz - 1, sz - 1);
        } else if (k === 5) {
          g.rect(x, y, sz, sz);
        } else {
          g.rect(x, y, sz / 2, sz);
        }
      }

      // One row or column of pixels pulled out across the page.
      function smear() {
        const c = page.drawingContext;
        const el = page.elt;
        c.imageSmoothingEnabled = false;
        if (Math.random() < 0.6) {
          // A 1px row dragged down: fine vertical lines.
          const sy = Math.min(p.height - 1, Math.max(0, y - 1));
          const x0 = Math.random() < 0.5 ? 0 : left;
          const x1 = Math.random() < 0.5 ? p.width : left + span * sz;
          c.drawImage(el, x0, sy, x1 - x0, 1, x0, sy, x1 - x0, p.height - sy);
        } else {
          // A 1px column dragged sideways: fine horizontal lines.
          const sx = Math.min(p.width - 1, x + Math.floor(sz / 2));
          if (Math.random() < 0.5) c.drawImage(el, sx, 0, 1, p.height, 0, 0, sx, p.height);
          else c.drawImage(el, sx, 0, 1, p.height, sx, 0, p.width - sx, p.height);
        }
      }

      function makePage() {
        page = p.createGraphics(p.width, p.height);
        page.pixelDensity(1);
        page.textFont('Dogica');
        page.textAlign(p.CENTER, p.CENTER);
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.noSmooth();
        makePage();
        text = words();
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

        const steps = Math.max(1, Math.round((2 + level * 50) * speed));
        for (let i = 0; i < steps; i++) {
          if (Math.random() < 0.08) run = pickKind();
          cell(run);
          advance();
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
