'use strict';

visuals.register('bubbles', (() => {
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
      let particles = [];
      let x, y, nx, ny, n_speed_x, n_speed_y, fc;

      function sticky(num, clamper) {
        clamper = clamper || 1;
        return Math.round(num / clamper) * clamper;
      }

      function addCircle(cx, cy) {
        const new_sz = Math.round(Math.random() * 3 + 2);
        let same = false;

        for (let k = 0; k < particles.length; k++) {
          const pp = particles[k];
          if (p.dist(pp.x, pp.y, cx, cy) < (pp.sz / 2 + new_sz)) {
            same = true;
            break;
          }
        }

        if (!same) {
          particles.push({ x: cx, y: cy, sz: new_sz, active: true });
        }
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

        p.stroke(0);
        x = 0;
        y = p.height / 2;
        nx = Math.random();
        ny = Math.random();
        n_speed_x = Math.random() * 10 / 100;
        n_speed_y = Math.random() * 10 / 100;
        fc = 0;
      };

      p.draw = () => {
        fc++;
        p.background('#d8d4cb');
        p.stroke(0);

        nx += n_speed_x;
        ny += n_speed_y;
        x += p.noise(nx, fc / 100) * 8;
        y += p.noise(ny, fc / 100) * 8;

        if (x > p.width || x < 0) { x = 0; n_speed_x *= -1; }
        if (y > p.height || y < 0) { y = 0; n_speed_y *= -1; }

        p.noFill();
        if (Math.random() > 0.6) addCircle(x, y);

        for (let i = 0; i < particles.length; i++) {
          const p_i = particles[i];
          for (let j = i + 1; j < particles.length; j++) {
            const p_j = particles[j];
            if (i !== j && p.dist(p_i.x, p_i.y, p_j.x, p_j.y) < (p_i.sz / 2 + p_j.sz / 2)) {
              p_i.active = false;
              p_j.active = false;
            }
          }

          if (p_i.active && p_i.sz < 60) {
            p_i.sz += 1;
          } else {
            p_i.active = false;
          }

          p.fill(255, 200);
          p.ellipse(p_i.x, p_i.y, p_i.sz, p_i.sz);

          if (p_i.sz > 20) {
            p.fill(255);
            p.ellipse(p_i.x, p_i.y, p_i.sz / 4, p_i.sz / 4);
          }
          if (p_i.sz > 10) {
            p.fill(0);
            p.ellipse(p_i.x, p_i.y, p_i.sz / 2, p_i.sz / 2);
          }
        }

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

  return { name: 'Bubbles', start, stop };
})());
