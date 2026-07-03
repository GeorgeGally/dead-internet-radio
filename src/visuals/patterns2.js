'use strict';

visuals.register('patterns2', (() => {
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
      const strokeBitSmallRect = [
        0, 0, 0, 0, 0,
        0, 1, 1, 1, 0,
        0, 1, 0, 1, 0,
        0, 1, 1, 1, 0,
        0, 0, 0, 0, 0
      ];

      const strokeBitRect = [
        1, 1, 1, 1, 1,
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
      ];

      const strokeBitDotRect = [
        1, 1, 1, 1, 1,
        1, 0, 0, 0, 1,
        1, 0, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
      ];

      const strokeBitCircle = [
        0, 1, 1, 1, 0,
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1,
        0, 1, 1, 1, 0
      ];

      const strokeBitCircleMiddle = [
        0, 1, 1, 1, 0,
        1, 0, 0, 0, 1,
        1, 0, 1, 0, 1,
        1, 0, 0, 0, 1,
        0, 1, 1, 1, 0
      ];

      const fillBitCircle = [
        0, 1, 1, 1, 0,
        1, 1, 1, 1, 1,
        1, 1, 1, 1, 1,
        1, 1, 1, 1, 1,
        0, 1, 1, 1, 0
      ];

      const dottedBitLine = [
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        1, 0, 1, 0, 1,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0
      ];

      const twoBitLine = [
        0, 0, 0, 0, 0,
        0, 0, 0, 1, 0,
        0, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 0, 0, 0
      ];

      const threeBitLine = [
        0, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 0, 1, 0,
        0, 1, 0, 0, 0,
        0, 0, 0, 0, 0
      ];

      const dottedBitPlus = [
        0, 0, 1, 0, 0,
        0, 0, 0, 0, 0,
        1, 0, 1, 0, 1,
        0, 0, 0, 0, 0,
        0, 0, 1, 0, 0
      ];

      const invaderBitBig = [
        0, 0, 1, 0, 0,
        0, 1, 0, 1, 0,
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
      ];

      const invaderBitDown = [
        1, 1, 1, 1, 1,
        1, 0, 0, 0, 1,
        0, 1, 0, 1, 0,
        0, 0, 1, 0, 0
      ];

      const halfBitX = [
        1, 0, 0, 0, 1,
        0, 1, 0, 1, 0,
        0, 0, 1, 0, 0,
        0, 1, 0, 1, 0,
        1, 0, 0, 0, 1
      ];

      const halfBitCircle = [
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1,
        0, 1, 1, 1, 0,
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1
      ];

      const lineBitVert = [
        0, 0, 1, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 1, 0, 0
      ];

      const threeLineBitVert = [
        1, 0, 1, 0, 1,
        1, 0, 1, 0, 1,
        1, 0, 1, 0, 1,
        1, 0, 1, 0, 1,
        1, 0, 1, 0, 1
      ];

      const threeLineOffsetBitVert = [
        1, 0, 1, 0, 1,
        1, 0, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 0, 1, 0, 1,
        1, 0, 1, 0, 1
      ];

      const lineBitHoriz = [
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        1, 1, 1, 1, 1,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0
      ];

      const threeLineBitHoriz = [
        1, 1, 1, 1, 1,
        0, 0, 0, 0, 0,
        1, 1, 1, 1, 1,
        0, 0, 0, 0, 0,
        1, 1, 1, 1, 1
      ];

      const threeLineOffsetBitHoriz = [
        1, 1, 1, 1, 1,
        0, 0, 0, 0, 0,
        1, 1, 0, 1, 1,
        0, 0, 0, 0, 0,
        1, 1, 1, 1, 1
      ];

      const shapes = [
        lineBitHoriz, threeLineBitHoriz, threeLineOffsetBitHoriz,
        threeLineOffsetBitVert, threeLineBitVert, lineBitVert,
        halfBitCircle, halfBitX,
        invaderBitBig, invaderBitDown,
        dottedBitPlus, threeBitLine, twoBitLine, dottedBitLine,
        fillBitCircle, strokeBitCircleMiddle, strokeBitCircle,
        strokeBitDotRect, strokeBitRect, strokeBitSmallRect
      ];

      let pixel_size = 8;
      let grid;

      function simpleGrid(nx, ny, _w, _h) {
        this.w = _w || p.width;
        this.h = _h || p.height;
        this.pos = [];
        this.cols = nx;
        this.rows = ny;
        this.sz = { x: this.w / nx, y: this.h / ny };
        for (let y = 0; y < ny; y++) {
          for (let x = 0; x < nx; x++) {
            this.pos.push({
              x: x * this.sz.x + this.sz.x / 2,
              y: y * this.sz.y + this.sz.y / 2,
              sz: { x: this.sz.x, y: this.sz.y },
              mode: 0
            });
          }
        }
        this.length = this.pos.length;
      }

      function pixelShape(_bits, _x, _y) {
        p.push();
        p.translate(_x, _y);
        let counter = 0;
        for (let y = 0; y < 5 * pixel_size; y += pixel_size) {
          for (let x = 0; x < 5 * pixel_size; x += pixel_size) {
            if (_bits[counter] === 1) {
              p.rect(x, y, pixel_size, pixel_size);
            }
            counter++;
          }
        }
        p.pop();
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

        grid = new simpleGrid(40, 20);
        pixel_size = (grid.sz.x - 2) / 5;
        for (let i = 0; i < grid.length; i++) {
          grid.pos[i].mode = Math.round(Math.random() * (shapes.length - 1));
        }
      };

      p.draw = () => {
        p.background(220);
        p.fill(0);
        p.noStroke();

        for (let i = 0; i < grid.length; i++) {
          const g = grid.pos[i];
          if (Math.random() * 5 > 4) {
            g.mode = Math.round(Math.random() * (shapes.length - 1));
          }
          pixelShape(shapes[g.mode], g.x - g.sz.x / 2, g.y - g.sz.y / 2);
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

  return { name: 'Patterns 2', start, stop };
})());
