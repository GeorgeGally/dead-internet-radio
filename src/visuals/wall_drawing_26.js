'use strict';

visuals.register('wall_drawing_26', (() => {
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
      let sz;
      let grid = [];

      function addGrid() {
        let i = 0;
        for (let y = 0; y < p.height; y += sz) {
          for (let x = 0; x < p.width; x += sz) {
            const dir = chooseDirection(i);
            grid.push({ x, y, dir });
            i++;
          }
        }
      }

      function chooseDirection() {
        return Math.round(Math.random() * 8);
      }

      function drawLine(dir) {
        p.strokeWeight(4);
        if (dir === 0 || dir === 5) p.line(0, 0, sz, sz);
        if (dir === 1 || dir === 6) p.line(sz / 2, 0, sz / 2, sz);
        if (dir === 2 || dir === 7) p.line(sz, 0, 0, sz);
        if (dir === 3 || dir === 8) p.line(sz, sz / 2, 0, sz / 2);
        if (dir === 4 || dir === 9) p.line(sz, sz, 0, 0);
      }

      function drawGrid() {
        p.stroke(0);
        for (let i = 0; i < grid.length; i++) {
          const g = grid[i];
          p.push();
          p.translate(g.x, g.y);
          drawLine(g.dir);
          if (Math.random() * 500 > 498) g.dir = chooseDirection();
          p.pop();
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

        sz = p.width / 36;
        addGrid();
      };

      p.draw = () => {
        p.background('#d8d4cb');
        drawGrid();

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

  return { name: 'Wall Drawing No. 26', start, stop };
})());
