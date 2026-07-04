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
              on.push(Math.random() < 0.5 ? 1 : 0);
            }
          }
        }
      }

      function drawBox(sz) {
        const lit = p.color(255, 140, 0);
        const shadow = p.color(180, 92, 0);
        p.noStroke();
        p.push();
        p.translate(0, 0, sz / 2);
        p.fill(lit);
        p.plane(sz, sz);
        p.push();
        p.translate(0, 0, -sz);
        p.fill(shadow);
        p.plane(sz, sz);
        p.pop();

        p.fill(lit);
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

        p.fill(lit);
        p.push();
        p.rotateY(p.radians(90));
        p.translate(sz / 2, 0, sz / 2);
        p.plane(sz, sz);
        p.pop();

        p.pop();
      }

      p.setup = () => {
        const dpr = window.devicePixelRatio || 1;
        p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
        p.setAttributes('preserveDrawingBuffer', true); // let filters sample the canvas
        p.pixelDensity(dpr);

        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';

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
              if (on[c] === 1) drawBox(w - 1);
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

        canvasFilters.applyToOverlay(p.canvas, p.frameCount);
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

  return { name: 'Isocubes', start, stop };
})());
