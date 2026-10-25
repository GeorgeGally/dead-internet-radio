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
      let baseCols = 40;
      let zoomUntil = 0;
      let nextZoomAt = 0;
      let bassAvg = 0;

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

      function buildGrid(cols) {
        grid = new simpleGrid(cols, Math.max(2, Math.round(cols / 2)));
        pixel_size = (grid.sz.x - 2) / 5;
        for (let i = 0; i < grid.length; i++) {
          grid.pos[i].mode = Math.round(Math.random() * (shapes.length - 1));
        }
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);
        buildGrid(40);
        nextZoomAt = p.millis() + 8000;
      };

      p.draw = () => {
        p.background(0);
        p.fill(220);
        p.noStroke();

        // Cutoff sets the resting grid: low = fine (64 cols), high = coarse (16)
        const cutoff = window._cutoffVal != null ? window._cutoffVal : 130;
        baseCols = Math.round(64 - ((cutoff - 5) / 250) * 48);

        const gain = (window.audioInputGain != null ? window.audioInputGain : 50) / 50;
        const sens = (window.soundSensitivity != null ? window.soundSensitivity : 50) / 50;
        let spectrum = null;
        let bass = 0;
        if (audioAnalysisReady && analyser && frequencyData) {
          analyser.getByteFrequencyData(frequencyData);
          spectrum = frequencyData;
          let s = 0;
          for (let i = 0; i < 12; i++) s += frequencyData[i];
          bass = Math.min(1, (s / (12 * 255)) * gain);
        }

        // Every so often the grid goes coarse, then settles back: on a bass hit,
        // or on a timer when the music gives nothing to react to.
        const now = p.millis();
        const hit = bass > 0.35 && bass > bassAvg * 1.35;
        bassAvg = bassAvg * 0.95 + bass * 0.05;
        if (now > zoomUntil && (hit || now > nextZoomAt) && now > nextZoomAt - 6000) {
          zoomUntil = now + 2500;
          nextZoomAt = now + 9000 + Math.random() * 7000;
        }
        const cols = now < zoomUntil ? Math.max(8, Math.round(baseCols / 2)) : baseCols;
        if (cols !== grid.cols || p.width !== grid.w) buildGrid(cols);

        // Each column listens to its own slice of the spectrum; louder = more change
        const usable = spectrum ? Math.floor(spectrum.length * 0.7) : 0;
        for (let i = 0; i < grid.length; i++) {
          const g = grid.pos[i];
          let chance = 0.05;
          if (spectrum) {
            const col = i % grid.cols;
            const level = spectrum[Math.floor((col / grid.cols) * usable)] / 255;
            chance = 0.01 + Math.min(0.6, level * level * gain * sens * 0.6);
          }
          if (Math.random() < chance) {
            g.mode = Math.round(Math.random() * (shapes.length - 1));
          }
          pixelShape(shapes[g.mode], g.x - g.sz.x / 2, g.y - g.sz.y / 2);
        }
        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Patterns 2', start, stop };
})());
