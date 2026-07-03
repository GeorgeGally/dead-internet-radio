'use strict';

visuals.register('delayed_lerp_points7b', (() => {
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
      const res = 1000;
      const delay_factor = 2.3;
      const line_start_sz = 100;
      const circ_start_sz = 180;
      let pts = [];
      let pos = 0;
      let angle = 0, angle2 = 0;
      let line_sz = 0, line2_sz = 0;
      let ctx, ctx2;
      let t;

      function x1(t) { return 0.25 * p.width + 150 * p.cos(p.TWO_PI * t); }
      function y1(t) { return 0.5 * p.height + 150 * p.sin(p.TWO_PI * t); }
      function x2(t) { return 0.75 * p.width + 150 * p.cos(2 * p.TWO_PI * t); }
      function y2(t) { return 0.5 * p.height + 150 * p.sin(2 * p.TWO_PI * t); }

      function addPoints() {
        for (let i = 0; i <= res; i++) {
          const tt = 1.0 * i / res;
          const x = p.lerp(x1(t - delay_factor * tt), x2(t - delay_factor * (1 - tt)), tt);
          const y = p.lerp(y1(t - delay_factor * tt), y2(t - delay_factor * (1 - tt)), tt);
          pts.push({ x, y });
        }
      }

      function drawPoints() {
        ctx2.ellipse(x1(t), y1(t), 6, 6);
        ctx2.ellipse(x2(t), y2(t), 6, 6);
        ctx2.push();
        ctx2.strokeWeight(2);
        ctx2.stroke(255);
        for (let i = 0; i < pts.length; i++) {
          ctx2.point(pts[i].x, pts[i].y);
        }
        ctx2.pop();
      }

      function drawArm() {
        ctx2.noStroke();
        ctx2.fill(255);
        ctx2.ellipse(0, 0, 5, 5);
        ctx2.rotate(angle);
        ctx2.stroke(255);
        ctx2.line(0, 0, 0, line_sz);
        ctx2.noStroke();
        ctx2.fill(255);
        ctx2.ellipse(0, line_sz, 5, 5);
        ctx2.push();
        ctx2.translate(0, line_sz);
        ctx2.rotate(angle2);
        ctx2.stroke(255);
        ctx2.line(0, 0, 0, line2_sz);
        ctx2.ellipse(0, line2_sz, 10, 10);
        ctx2.pop();
      }

      function drawTrail() {
        ctx.rotate(angle);
        const sz = Math.abs(Math.sin(p.radians(p.frameCount / 5 + 200)) * circ_start_sz);
        ctx.push();
        ctx.translate(0, line_sz);
        ctx.rotate(angle2);
        ctx.noStroke();
        ctx.noFill();

        ctx.stroke(0, 40);
        ctx.noFill();
        ctx.ellipse(0, line2_sz, sz, sz);

        ctx.pop();
      }

      function travel() {
        if (pos >= pts.length) return;

        drawPoints();
        p.push();
        ctx.push();
        ctx2.push();
        p.translate(pts[pos].x, pts[pos].y);
        ctx.translate(pts[pos].x, pts[pos].y);
        ctx2.translate(pts[pos].x, pts[pos].y);

        drawArm();
        drawTrail();

        line_sz = Math.sin(p.radians(p.frameCount * 0.7)) * line_start_sz;
        line2_sz = Math.cos(p.radians(p.frameCount / 2)) * line_start_sz;
        pos++;
        angle -= 0.0097;
        angle2 += 0.009;
        p.pop();
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

        ctx = p.createGraphics(p.width, p.height);
        ctx2 = p.createGraphics(p.width, p.height);

        line_sz = Math.sin(p.radians(0)) * line_start_sz;
        line2_sz = Math.cos(p.radians(0)) * line_start_sz;
        t = Math.random() * 50;
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

  return { name: 'Delayed Lerp Points 7b', start, stop };
})());
