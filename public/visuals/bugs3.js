'use strict';

visuals.register('bugs3', (() => {
  let myP5 = null;
  let blockCanvas = null;

  const WORDS = ['kindness', 'gentleness', 'compassion', 'generosity', 'dream', 'chill', 'gratitude', 'live', 'relax', 'peace'];
  const MAX_PARTICLES = 3000;

  function start() {
    blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      let particles = [];
      let word;

      p.setup = () => {
        visuals.setupP5Canvas(p, { pixelDensity: 1 });

        word = WORDS[Math.floor(Math.random() * WORDS.length)];

        const g = p.createGraphics(p.windowWidth, p.windowHeight);
        g.pixelDensity(1);
        g.background(255, 255, 204);
        g.textFont('helvetica');
        g.textSize(200);
        g.textAlign(p.CENTER, p.CENTER);
        g.fill(0);
        g.noStroke();
        g.text(word, p.windowWidth / 2, p.windowHeight / 2);
        g.loadPixels();

        for (let y = 0; y < p.windowHeight; y += 4) {
          for (let x = 0; x < p.windowWidth; x += 4) {
            const idx = (y * p.windowWidth + x) * 4;
            const brightness = 0.3 * g.pixels[idx] + 0.59 * g.pixels[idx + 1] + 0.11 * g.pixels[idx + 2];
            if (brightness < 100) {
              particles.push({
                orig_x: x,
                orig_y: y,
                x: x + Math.random() * 8 - 4,
                y: y + Math.random() * 8 - 4,
                r: Math.floor(Math.random() * 256),
                g_: Math.floor(Math.random() * 256),
                b: 0,
                size: 3,
                reduce: 0.8 + Math.random() * 0.1999,
                alpha: 0.05,
                speedx: Math.random() * 2 - 1,
                speedy: Math.random() * 2 - 1,
              });
            }
          }
        }

        g.remove();
      };

      p.draw = () => {
        //p.background(255, 255, 204);
        //p.blendMode(p.MULTIPLY);

        for (let i = 0; i < particles.length; i++) {
          const pt = particles[i];
          p.noStroke();
          p.fill(pt.r, pt.g_, pt.b, pt.alpha * 255);
          p.ellipse(pt.x, pt.y, pt.size, pt.size);

          if (pt.alpha < 1) pt.alpha += 0.0019999;
          if (pt.size < 0.005) {
            pt.x = pt.orig_x + Math.random() * 8 - 4;
            pt.y = pt.orig_y + Math.random() * 8 - 4;
            pt.size = 3;
            pt.speedx = Math.random() * 4 - 2;
            pt.speedy = Math.random() * 4 - 2;
          }
          pt.x += pt.speedx + Math.random() * 2 - 1;
          pt.y += pt.speedy + Math.random() * 2 - 1;
          pt.size *= pt.reduce;
        }

        while (particles.length > MAX_PARTICLES) {
          particles.shift();
        }

        //p.blendMode(p.BLEND);
        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Bugs3', start, stop };
})());
