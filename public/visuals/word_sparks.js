'use strict';

visuals.register('word_sparks', (() => {
  let myP5 = null;
  let blockCanvas = null;

  const WORDS = ['kindness', 'hello world', 'anyone there', 'generosity', 'no signal', 'D.I.R.', 'broadcast', 'i am alive', 'peace'];

  function start() {
    blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      let particles = [];
      const maxParticles = 2500;

      function addParticle(x, y) {
        particles.push({
          origX: x,
          origY: y,
          x: x + p.random(-4, 4),
          y: y + p.random(-4, 4),
          r: Math.floor(p.random(255)),
          g: Math.floor(p.random(255)),
          size: 3,
          reduce: p.random(0.88, 0.999999),
          alpha: 60,
          speedX: (p.random() < 0.5 ? -1 : 1) * p.random(0.5, 2),
          speedY: (p.random() < 0.5 ? -1 : 1) * p.random(0.5, 2)
        });
      }

      // Samples an offscreen render of a word into a particle field, so the
      // sparks converge on the letterforms instead of scattering randomly.
      function sampleWord() {
        particles = [];
        const word = WORDS[Math.floor(p.random(WORDS.length))];
        const buf = p.createGraphics(p.width, p.height);
        buf.pixelDensity(1);
        buf.background(0);
        buf.fill(255);
        buf.noStroke();
        buf.textAlign(p.CENTER, p.CENTER);
        let ts = Math.min(p.width, p.height) * 0.3;
        buf.textSize(ts);
        while (buf.textWidth(word) > p.width * 0.9 && ts > 8) {
          ts *= 0.9;
          buf.textSize(ts);
        }
        buf.text(word, p.width / 2, p.height / 2);
        buf.loadPixels();

        const step = 6;
        const candidates = [];
        for (let y = 0; y < p.height; y += step) {
          for (let x = 0; x < p.width; x += step) {
            const idx = (y * p.width + x) * 4;
            if (buf.pixels[idx] > 40) candidates.push(x, y);
          }
        }
        // Take every Nth candidate so the particle budget covers the whole
        // word evenly instead of filling the top and cutting off the bottom.
        const stride = Math.max(1, Math.ceil(candidates.length / 2 / maxParticles));
        for (let i = 0; i < candidates.length && particles.length < maxParticles; i += stride * 2) {
          addParticle(candidates[i], candidates[i + 1]);
        }
        buf.remove();
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.fill(0);
        sampleWord();
      };

      p.draw = () => {
        p.noStroke();
        // Fade the previous frame instead of clearing it, so particles leave trails.
        //p.blendMode(p.BLEND);
        //p.fill(0, 1);
        //p.rect(0, 0, p.width, p.height);
        //p.blendMode(p.MULTIPLY);

        for (let i = 0; i < particles.length; i++) {
          const particle = particles[i];
          p.fill(particle.r, particle.g, 0, particle.alpha);
          p.ellipse(particle.x, particle.y, particle.size, particle.size);

          if (particle.alpha > 0) particle.alpha -= 0.005;
          if (particle.size < 0.05) {
            particle.x = particle.origX + p.random(-4, 4);
            particle.y = particle.origY + p.random(-4, 4);
            particle.size = 3;
            particle.speedX = p.random(-1, 1);
            particle.speedY = p.random(-1, 1);
          }
          particle.x += particle.speedX + p.random(-1, 1);
          particle.y += particle.speedY + p.random(-1, 1);
          particle.size *= particle.reduce;
        }

        //p.blendMode(p.BLEND);
        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        sampleWord();
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Word Sparks', start, stop };
})());
