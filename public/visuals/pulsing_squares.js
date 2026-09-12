'use strict';

visuals.register('pulsing_squares', (() => {
  let myP5 = null;
  let blockCanvas = null;

  function start() {
    blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      let balls = [];
      const cols = 20;
      const rows = 5;

      function createGrid() {
        const pts = [];
        for (let gy = 0; gy < rows; gy++) {
          for (let gx = 0; gx < cols; gx++) {
            pts.push({ x: (gx + 0.5) * p.width / cols, y: (gy + 0.5) * p.height / rows });
          }
        }
        return pts;
      }

      function seedBalls() {
        balls = [];
        for (const pt of createGrid()) {
          balls.push({ x: pt.x, y: pt.y, speedY: p.random(-5, -1) });
        }
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.background(0);
        seedBalls();
      };

      p.draw = () => {
        p.background(0, 0, 0, 15);
        p.noStroke();
        p.rectMode(p.CENTER);

        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];

          if (b.y < -60) b.y = p.height + 60;
          b.y += b.speedY;

          // Each square pulses on its own phase, offset by grid index, so the
          // row reads as a shimmering scanline rather than a uniform blink.
          const size = Math.abs(Math.sin(p.frameCount / (20 + i)) * 50);

          p.fill(255);
          p.rect(b.x, b.y, size, size);
          p.fill(0);
          p.rect(b.x, b.y, size / 1.2, size / 1.2);
        }
        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        seedBalls();
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Pulsing Squares', start, stop };
})());
