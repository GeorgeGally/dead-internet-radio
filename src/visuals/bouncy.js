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
        if (x > p.width - sz / 2 || x < sz / 2) speedx *= -1;
        if (y > p.height - sz / 2 || y < sz / 2) speedy *= -1;
        x += speedx;
        y += speedy;
        rotation += 1;
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.pixelDensity(1);
        p.angleMode(p.DEGREES);

        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';

        ctx = p.createGraphics(p.windowWidth, p.windowHeight);
        x = Math.random() * p.width / 2;
        y = Math.random() * p.height / 2;
        speedx = Math.random() * 2 + 1;
        speedy = Math.random() * 2 + 1;
        sz = 80;
        rotation = 0;
        p.background(216, 212, 203);
      };

      p.draw = () => {
        moveBall();
        drawPoly();
        p.image(ctx, 0, 0, p.width, p.height);

        const nativeCtx = p.canvas.getContext('2d');
        nativeCtx.save();
        nativeCtx.setTransform(1, 0, 0, 1, 0, 0);
        canvasFilters.apply(nativeCtx, p.canvas.width, p.canvas.height, p.frameCount);
        nativeCtx.restore();
      };
    });
  }

  function stop() {
    if (myP5) {
      myP5.remove();
      myP5 = null;
    }
    if (blockCanvas) blockCanvas.style.display = 'block';
  }

  return { name: 'Bouncy', start, stop };
})());
