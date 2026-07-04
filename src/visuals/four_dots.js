'use strict';

visuals.register('four_dots', (() => {
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
      let pts = [];
      let dots = [];
      let ctx, ctx2;
      let pos = 0;
      let angle = 0, angle2 = 0;
      let line_sz = 0, line2_sz = 0;
      let l1_sz = 80, l2_sz = 100;
      let circ_sz, circ_start_sz = 120;
      let sw1, sw2;
      let num = 5;
      let padding = 80;

      function addFourPts() {
        for (let i = 0; i < num; i++) {
          dots.push({
            x: Math.random() * (p.width - padding * 2) + padding,
            y: Math.random() * (p.height - padding * 2) + padding
          });
        }
      }

      function addPoints() {
        for (let i = 1; i < dots.length; i++) {
          const d1 = dots[i];
          const d2 = dots[i - 1];
          for (let t = 1; t >= 0; t -= 0.0015) {
            pts.push({
              x: p.lerp(d1.x, d2.x, t),
              y: p.lerp(d1.y, d2.y, t)
            });
          }
        }
      }

      function drawFourPts() {
        p.noStroke();
        p.fill(255);
        for (let i = 0; i < dots.length; i++) {
          p.ellipse(dots[i].x, dots[i].y, 10, 10);
        }
      }

      function drawPoints() {
        ctx2.noStroke();
        ctx2.fill(255);
        for (let i = 0; i < pts.length; i++) {
          ctx2.ellipse(pts[i].x, pts[i].y, 2, 2);
        }
      }

      function drawArm() {
        ctx2.noStroke();
        ctx2.fill(80);
        ctx2.ellipse(0, 0, 5, 5);
        ctx2.rotate(angle);
        ctx2.stroke(255);
        ctx2.line(0, 0, 0, line_sz);
        ctx2.noStroke();
        ctx2.fill(80);
        ctx2.ellipse(0, line_sz, 5, 5);

        ctx2.push();
        ctx2.translate(0, line_sz);
        ctx2.rotate(angle2);
        ctx2.stroke(255);
        ctx2.line(0, 0, 0, line2_sz);
        ctx2.fill(0);
        ctx2.noStroke();
        ctx2.ellipse(0, line2_sz, 8, 8);
        ctx2.pop();
      }

      function drawTrail() {
        ctx.rotate(angle);
        const sz = Math.abs(Math.sin(p.radians(p.frameCount / 5 + 200)) * circ_start_sz);

        ctx.push();
        ctx.translate(0, line_sz);
        ctx.rotate(angle2);

        ctx.fill(255, 42);
        ctx.noStroke();
        ctx.ellipse(0, line2_sz - 4, 4, 4);

        ctx.fill(0, 82);
        ctx.noStroke();
        ctx.ellipse(0, line2_sz, 2, 2);

        ctx.fill('#c3c8d8');
        ctx.ellipse(-sz / 10, line2_sz, 5, 5);

        ctx.fill(255, 1);
        ctx.stroke(angle2 * 4, angle2, 100, 12);
        ctx.ellipse(-sz / 10, line2_sz, sz / 5, sz / 5);

        ctx.strokeWeight(sw1);
        ctx.stroke(255, 12);
        ctx.noFill();
        ctx.ellipse(0, line2_sz - 10, sz, sz);

        ctx.strokeWeight(sw2);
        ctx.stroke(0, 12);
        ctx.noFill();
        ctx.ellipse(0, line2_sz, sz, sz);

        ctx.pop();
      }

      function travel() {
        if (pos >= pts.length) return;

        drawFourPts();
        drawPoints();

        ctx.push();
        ctx2.push();

        ctx.translate(pts[pos].x, pts[pos].y);
        ctx2.translate(pts[pos].x, pts[pos].y);

        drawArm();
        drawTrail();

        circ_sz = Math.sin(p.radians(p.frameCount * 0.5)) * circ_start_sz;
        line_sz = Math.sin(p.radians(p.frameCount * 0.5)) * l1_sz;
        line2_sz = Math.cos(p.radians(p.frameCount / 4)) * l2_sz;
        pos++;
        angle += 0.005;
        angle2 += 0.01;

        ctx.pop();
        ctx2.pop();
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.pixelDensity(window.devicePixelRatio || 1);

        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';

        padding = p.width / 6;

        ctx = p.createGraphics(p.width, p.height);
        ctx2 = p.createGraphics(p.width, p.height);

        sw1 = Math.random() * 2.99 + 0.01;
        sw2 = Math.random() * 2.9 + 0.1;
        l1_sz = Math.floor(Math.random() * 81) + 40;
        l2_sz = Math.floor(Math.random() * 81) + 40;
        circ_sz = Math.sin(p.radians(0)) * circ_start_sz;
        line_sz = Math.sin(p.radians(0)) * l1_sz;
        line2_sz = Math.cos(p.radians(0)) * l2_sz;

        addFourPts();
        addPoints();
      };

      p.draw = () => {
        p.background('#d8d4cb');
        ctx2.clear();

        travel();

        p.image(ctx, 0, 0);
        p.image(ctx2, 0, 0);

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

  return { name: 'Four Dots', start, stop };
})());
