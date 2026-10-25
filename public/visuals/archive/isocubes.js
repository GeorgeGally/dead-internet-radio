'use strict';

visuals.register('isocubes', (() => {
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
      let n = 3;
      let w = 320 / n;
      let ma;
      let on = [];

      function createBoxes() {
        on = [];
        w = 320 / n;
        for (let y = 0; y < n; y++) {
          for (let z = 0; z < n; z++) {
            for (let x = 0; x < n; x++) {
              on.push(Math.random() < 0.15 ? 1 : 0);
            }
          }
        }
      }

      function drawBox(sz, lit) {
        const top = lit ? p.color(255, 140, 0) : p.color(40);
        const shadow = lit ? p.color(180, 92, 0) : p.color(20);
        p.noStroke();
        p.push();
        p.translate(0, 0, sz / 2);
        p.fill(top);
        p.plane(sz, sz);
        p.push();
        p.translate(0, 0, -sz);
        p.fill(shadow);
        p.plane(sz, sz);
        p.pop();

        p.fill(top);
        p.push();
        p.rotateX(p.radians(90));
        p.translate(0, -sz / 2, -sz / 2);
        p.plane(sz, sz);
        p.pop();

        p.push();
        p.rotateX(p.radians(90));
        p.translate(0, -sz / 2, sz / 2);
        p.fill(shadow);
        p.plane(sz, sz);
        p.pop();

        p.fill(shadow);
        p.push();
        p.rotateY(p.radians(90));
        p.translate(sz / 2, 0, -sz / 2);
        p.plane(sz, sz);
        p.pop();

        p.fill(top);
        p.push();
        p.rotateY(p.radians(90));
        p.translate(sz / 2, 0, sz / 2);
        p.plane(sz, sz);
        p.pop();

        p.pop();
      }

      p.setup = () => {
        visuals.setupP5Canvas(p, { renderer: p.WEBGL, preserveDrawingBuffer: true });

        ma = Math.atan(Math.cos(Math.PI / 4));
        createBoxes();
      };

      p.draw = () => {
        p.background(216, 212, 203);
        const aspect = p.width / p.height;
        const viewSize = Math.min(p.width, p.height) * 0.55;
        p.ortho(-viewSize * aspect, viewSize * aspect, viewSize, -viewSize, 0, 2000);
        p.push();
        p.rotateX(ma);
        p.rotateY(-Math.PI / 4);

        let c = 0;
        for (let y = 0; y < n; y++) {
          for (let z = 0; z < n; z++) {
            for (let x = 0; x < n; x++) {
              p.push();
              p.translate(w * x, w * y, w * z);
              drawBox(w - 1, on[c] === 1);
              p.pop();
              c++;
            }
          }
        }

        p.pop();

        if (Math.random() * 500 > 488) {
          n = Math.floor(Math.random() * 5 + 1) * 2;
          createBoxes();
        }
        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Isocubes', start, stop };
})());
