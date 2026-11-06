'use strict';

visuals.register('bouncy', (() => {
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
      let x, y, speedx, speedy, sz, rotation, ctx;

      function polygon(cx, cy, pw, ph, num_sides) {
        num_sides /= 2;
        ctx.beginShape();
        for (let i = 0; i < Math.PI * 2; i += Math.PI / num_sides) {
          ctx.vertex(cx + Math.cos(i) * pw / 2, cy + Math.sin(i) * ph / 2);
        }
        ctx.endShape(p.CLOSE);
      }

      function drawPoly() {
        ctx.stroke(0);
        ctx.fill(255);
        ctx.push();
        ctx.translate(x, y);
        ctx.rotate(rotation);
        polygon(0, 0, sz, sz, 6);
        ctx.pop();
      }

      function moveBall() {
        // Aim away from the wall. Flipping the sign instead pins the ball to any
        // wall it starts inside: it reverses every frame and never leaves.
        if (x > p.width - sz / 2) speedx = -Math.abs(speedx);
        else if (x < sz / 2) speedx = Math.abs(speedx);
        if (y > p.height - sz / 2) speedy = -Math.abs(speedy);
        else if (y < sz / 2) speedy = Math.abs(speedy);
        x += speedx;
        y += speedy;
        rotation += 1;
      }

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        const trail = p.createGraphics(p.width, p.height);
        trail.image(ctx, 0, 0);
        ctx.remove();
        ctx = trail;
        p.background(216, 212, 203);
      };

      p.setup = () => {
        visuals.setupP5Canvas(p, { pixelDensity: 1 });
        p.angleMode(p.DEGREES);

        ctx = p.createGraphics(p.width, p.height);
        sz = 80;
        x = sz / 2 + Math.random() * (p.width - sz);
        y = sz / 2 + Math.random() * (p.height - sz);
        speedx = Math.random() * 2 + 1;
        speedy = Math.random() * 2 + 1;
        rotation = 0;
        p.background(216, 212, 203);
      };

      p.draw = () => {
        moveBall();
        drawPoly();
        p.image(ctx, 0, 0);
        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Bouncy', start, stop };
})());
