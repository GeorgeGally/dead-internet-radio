'use strict';

visuals.register('delayed_lerp_points2c', (() => {
  let myP5 = null;
  let blockCanvas = null;

  function colourPool() {
    const items = [];
    return {
      add(col, weight) {
        items.push({ col, weight });
        return this;
      },
      get() {
        const total = items.reduce((s, i) => s + i.weight, 0);
        let r = Math.random() * total;
        for (const item of items) {
          r -= item.weight;
          if (r <= 0) return item.col;
        }
        return items[items.length - 1].col;
      }
    };
  }

  function start() {
    blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      const res = 1200;
      const delay_factor = 2.0;
      const line_start_sz = 120;
      const circ_start_sz = 180;
      let pts = [];
      let pos = 0;
      let angle = 0, angle2 = 0;
      let line_sz = 0, line2_sz = 50;
      let ctx, ctx2;
      let c1, c2;
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
        p.ellipse(x1(t), y1(t), 6, 6);
        p.ellipse(x2(t), y2(t), 6, 6);
        p.push();
        p.strokeWeight(2);
        p.stroke(255);
        for (let i = 0; i < pts.length; i++) {
          p.point(pts[i].x, pts[i].y);
        }
        p.pop();
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
        const sz = Math.abs(Math.sin(p.radians(p.frameCount / 5)) * circ_start_sz);
        ctx.push();
        ctx.translate(0, line_sz);
        ctx.rotate(angle2);
        ctx.noStroke();
        ctx.fill(255, 80);
        ctx.ellipse(0, line2_sz + sz / 2, 8, 8);
        ctx.fill(0, 80);
        ctx.ellipse(0, line2_sz, 4, 2);
        const c = p.lerpColor(c1, c2, pos / pts.length);
        ctx.fill(c, 1.5);
        ctx.ellipse(0, line2_sz, sz, sz);
        ctx.stroke(0, 20);
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
        p.fill('red');
        p.noStroke();
        p.translate(pts[pos].x, pts[pos].y);
        ctx.translate(pts[pos].x, pts[pos].y);
        ctx2.translate(pts[pos].x, pts[pos].y);

        drawArm();
        drawTrail();

        line_sz = Math.sin(p.radians(p.frameCount * 0.7)) * line_start_sz;
        pos++;
        angle += 0.005;
        angle2 += 0.008;
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
        ctx.strokeWeight(0.5);

        const colours = new colourPool()
          .add('pink', 1)
          .add('#F0F6E6', 2)
          .add('#F3ECD9', 2)
          .add('#EEE6D7', 1)
          .add('#FEFAEF', 1)
          .add('#F5E6ED', 1)
          .add('#EFE3CE', 1)
          .add('#FAE7E3', 3)
          .add('#CCF2F4', 1)
          .add('#F5E8C7', 1)
          .add('#6D8299', 1)
          .add('#fbd2c5', 1)
          .add('#CEE5D0', 1)
          .add('#D6E0F0', 1)
          .add('orange', 1)
          .add('red', 1)
          .add('#311432', 1)
          .add('#FF3300', 1)
          .add('#663399', 1)
          .add('#3D0158', 1)
          .add('#E33276', 1);

        c1 = p.color(colours.get());
        c2 = p.color(colours.get());
        const r1 = p.red(c1), g1 = p.green(c1), b1 = p.blue(c1);
        const r2 = p.red(c2), g2 = p.green(c2), b2 = p.blue(c2);
        c1 = p.color(r1, g1, b1, 1);
        c2 = p.color(r2, g2, b2, 1);

        t = Math.random() * 100;
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

  return { name: 'Delayed Lerp Points 2C', start, stop };
})());
