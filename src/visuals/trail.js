'use strict';

visuals.register('trail', (() => {
  const RES = 2000;
  const DELAY_FACTOR = 1.0;
  const CIRC_START_SZ = 180;
  const LINE_START_SZ = 150;
  const LINE2_START_SZ = 100;
  const ANGLE_SPEED = 0.15;
  const ANGLE2_SPEED = 0.25;

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
      let pos = 0;
      let angle = 0, angle2 = 0;
      let t = 5;
      let line_sz = 40, line2_sz = 50, circ_sz = CIRC_START_SZ;
      let sz = 0;
      let c1;
      let ctx, ctx2;

      function lerp(a, b, t) { return a + (b - a) * t; }
      function x1(t) { return 0.35 * p.width + p.width / 4 * Math.cos(p.TWO_PI * t); }
      function y1(t) { return 0.65 * p.height + p.height / 4 * Math.sin(p.TWO_PI * t); }
      function x2(t) { return 0.65 * p.width + p.width / 4 * Math.cos(2 * p.TWO_PI * t); }
      function y2(t) { return 0.35 * p.height + p.height / 4 * Math.sin(2 * p.TWO_PI * t); }

      function addPoints() {
        pts = [];
        for (let i = 0; i <= RES; i++) {
          const tt = i / RES;
          const x = lerp(x1(t - DELAY_FACTOR * tt), x2(t - DELAY_FACTOR * (1 - tt)), tt);
          const y = lerp(y1(t - DELAY_FACTOR * tt), y2(t - DELAY_FACTOR * (1 - tt)), tt);
          pts.push({ x, y });
        }
      }

      function drawPoints() {
        ctx2.ellipse(x1(t), y1(t), 6, 6);
        ctx2.ellipse(x2(t), y2(t), 6, 6);
        ctx2.push();
        ctx2.strokeWeight(2);
        ctx2.stroke(235, 50);
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
        sz = Math.abs(Math.sin(p.radians(p.frameCount / 5)) * CIRC_START_SZ);
        ctx.push();
        ctx.translate(0, line_sz);
        ctx.rotate(angle2);
        ctx.stroke(0, 40);
        ctx.noFill();
        ctx.ellipse(0, line2_sz, sz, sz);
        ctx.fill(c1);
        ctx.ellipse(0, line2_sz, sz / 4, sz / 2);
        ctx.noStroke();
        ctx.fill(255, 180);
        ctx.ellipse(0, line2_sz + sz / 2, 18, 4);
        ctx.pop();
      }

      function travel() {
        drawPoints();
        p.push();
        ctx.push();
        ctx2.push();
        p.translate(pts[pos].x, pts[pos].y);
        ctx.translate(pts[pos].x, pts[pos].y);
        ctx2.translate(pts[pos].x, pts[pos].y);
        drawArm();
        drawTrail();
        circ_sz = Math.sin(p.radians(p.frameCount * 0.7)) * CIRC_START_SZ;
        line_sz = Math.sin(p.radians(p.frameCount * 0.7)) * LINE_START_SZ;
        line2_sz = Math.sin(p.radians(p.frameCount / 2)) * LINE2_START_SZ;
        pos = (pos + 1) % pts.length;
        angle += p.radians(ANGLE_SPEED);
        angle2 += p.radians(ANGLE2_SPEED);
        p.pop();
        ctx.pop();
        ctx2.pop();
      }

      p.setup = () => {
        const dpr = window.devicePixelRatio || 1;
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.pixelDensity(dpr);

        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';

        c1 = p.color(255, 105, 180, 240);
        t = Math.random() * 100;
        ctx = p.createGraphics(p.width, p.height);
        ctx2 = p.createGraphics(p.width, p.height);
        line_sz = Math.sin(p.radians(p.frameCount * 0.4)) * LINE_START_SZ;
        line2_sz = Math.sin(p.radians(p.frameCount / 2)) * LINE2_START_SZ;
        ctx2.stroke(255);
        ctx2.fill(255);
        addPoints();
      };

      p.draw = () => {
        p.background(216, 212, 203);
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

  return { name: 'Mechanical', start, stop };
})());
