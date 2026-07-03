'use strict';

visuals.register('led_grid', (() => {
  let myP5 = null;
  let blockCanvas = null;

  function rgb(r, g, b, a) {
    if (typeof r === 'string') return r;
    if (g === undefined) return 'rgb(' + Math.min(255, Math.max(0, Math.round(r))) + ',' + Math.min(255, Math.max(0, Math.round(r))) + ',' + Math.min(255, Math.max(0, Math.round(r))) + ')';
    if (b === undefined) return 'rgba(' + Math.min(255, Math.max(0, Math.round(r))) + ',' + Math.min(255, Math.max(0, Math.round(r))) + ',' + Math.min(255, Math.max(0, Math.round(r))) + ',' + Math.min(1, Math.max(0, g)) + ')';
    if (a === undefined) return 'rgb(' + Math.min(255, Math.max(0, Math.round(r))) + ',' + Math.min(255, Math.max(0, Math.round(g))) + ',' + Math.min(255, Math.max(0, Math.round(b))) + ')';
    return 'rgba(' + Math.min(255, Math.max(0, Math.round(r))) + ',' + Math.min(255, Math.max(0, Math.round(g))) + ',' + Math.min(255, Math.max(0, Math.round(b))) + ',' + Math.min(1, Math.max(0, a)) + ')';
  }

  function start() {
    blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      let sz = 4;
      let stripeSz = 6;
      let bg;
      let hiddenCtx, hiddenCtx2;

      let spectrum = [];

      let txt_sz = 60;
      let blk_sz = 75;

      let balls = [];
      let grid;
      let gridW, gridH;

      let mode = 7;
      let speed = 2;
      let pix = 1;

      let lineWidth = 0.2;

      let frameSkips = 0;

      function randomInt(min, max) {
        if (max === undefined) { max = min; min = 0; }
        return Math.floor(p.random(min, max + 1));
      }

      function chance(val) {
        return p.random(val) > val - 1;
      }

      function sticky(num, clamper) {
        clamper = clamper || 1;
        return Math.round(num / clamper) * clamper;
      }

      function tween(pos, target, speed) {
        if (speed === undefined) speed = 20;
        return pos + (target - pos) / speed;
      }

      function mapMe(value, min1, max1, min2, max2, clampResult) {
        const rv = ((value - min1) / (max1 - min1) * (max2 - min2)) + min2;
        return clampResult ? Math.min(max2, Math.max(min2, rv)) : rv;
      }

      function addBall(x, y, i) {
        const on = chance(2);
        balls.push({ x, y, sz: 10, me: i, on });
      }

      function moveBall(b) {
        let s = 0;
        if (spectrum.length > 0) {
          if (mode === 0) {
            const new_me = b.me % 50;
            s = mapSound(new_me, balls.length * 2, 10, 100);
          } else if (mode === 1) {
            s = mapSound(b.me, balls.length * 1, 10, 100);
          } else if (mode === 5) {
            const new_me = b.me % 150;
            s = mapSound(new_me, 150, 10, 100);
          } else if (mode === 6) {
            s = mapSound(b.me, balls.length, 10, 100);
          } else if (mode === 7) {
            const new_me = b.me % 50;
            s = mapSound(new_me, 100, 0, 200);
          } else {
            s = mapSound(b.me, balls.length, 10, 100);
          }
        }

        if (s > 0) b.sz = tween(b.sz, s, 2);

        if (mode === 6) {
          b.x -= speed;
        } else {
          b.y += speed;
        }
        if (b.x > p.width) b.x = 0;
        if (b.x < 0) b.x = p.width;
        if (b.y > p.height) b.y = 0;
        if (b.y < 0) b.y = p.height;
      }

      function mapSound(_me, _total, _min, _max) {
        if (!spectrum || spectrum.length === 0) return 0;
        const min = _min || 0;
        const max = _max || 100;
        const new_freq = Math.round((_me / _total) * spectrum.length);
        const idx = Math.min(new_freq, spectrum.length - 1);
        return mapMe(spectrum[idx], 0, 255, min, max);
      }

      function drawBallItem(b) {
        if (mode === 6) {
          p.rect(b.x, b.y, b.sz, grid.spacing_y / 2);
        } else if (mode === 7) {
          p.fill(255);
          p.rect(b.x - b.sz / 2, b.y, b.sz, grid.spacing_y / 2);
        } else {
          p.rect(b.x - b.sz / 2, b.y - b.sz, grid.spacing_x / 2, b.sz);
        }
      }

      function chooseColour(b) {
        if (mode === 2 || mode === 1) {
          p.fill(255);
        } else if (mode === 4) {
          p.fill(255);
        } else {
          p.fill(sticky(b.sz * 50), 20);
        }
      }

      function gingham() {
        hiddenCtx2.strokeWeight(0.25);
        hiddenCtx2.stroke(0, 40);
        for (let x = 0; x < p.width; x += stripeSz) {
          if (chance(5)) hiddenCtx2.stroke(255, 20);
          else hiddenCtx2.stroke(0, 40);
          hiddenCtx2.line(x, 0, x, p.height);
        }
        for (let y = 0; y < p.height; y += stripeSz) {
          if (chance(5)) hiddenCtx2.stroke(255, 20);
          else hiddenCtx2.stroke(0, 40);
          hiddenCtx2.line(0, y, p.width, y);
        }
      }

      function sample(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        const idx = 4 * (y * p.width + x);
        if (idx < 0 || idx >= hiddenCtx.pixels.length - 4) return 0;
        const r = hiddenCtx.pixels[idx];
        const g = hiddenCtx.pixels[idx + 1];
        const b = hiddenCtx.pixels[idx + 2];
        return (r + g + b) / 3;
      }

      function led() {
        hiddenCtx.image(p, 0, 0, p.width, p.height);
        p.background(bg);
        p.image(hiddenCtx2, 0, 0, p.width, p.height);
        hiddenCtx.loadPixels();
        p.noStroke();
        for (let y = 0; y < p.height; y += sz) {
          for (let x = 0; x < p.width; x += sz) {
            const c = sample(x, y);
            if (c > (window.ledThreshold || 40)) {
              p.fill(255);
              p.rect(x, y, sz - 1, sz - 1);
            }
          }
        }
      }

      function pixelate(blocksize, blockshape) {
        blocksize = blocksize || 20;
        blockshape = blockshape || 0;
        p.loadPixels();
        p.background(0);
        for (let x = 0; x < p.width; x += blocksize) {
          for (let y = 0; y < p.height; y += blocksize) {
            const index = (x + y * p.width) * 4;
            if (index >= p.pixels.length - 4) continue;
            const r = p.pixels[index];
            const g = p.pixels[index + 1];
            const b = p.pixels[index + 2];
            if (blockshape === 0) {
              p.fill(r);
              p.rect(x, y, blocksize, blocksize);
            } else if (blockshape === 1) {
              p.fill(r);
              p.ellipse(x, y, blocksize, blocksize);
            } else if (blockshape === 2) {
              const bb = (r * 299 + g * 587 + b * 114) / 1000;
              p.fill(bb < 40 ? rgb(0) : rgb(255));
              p.ellipse(x, y, blocksize - 1, blocksize - 1);
            } else if (blockshape === 3) {
              p.fill(r, g, b);
              p.ellipse(x, y, blocksize - 3, blocksize - 3);
            } else if (blockshape === 4) {
              p.fill(r, g, b);
              const s = blocksize - mapMe(r, 0, 255, 0, blocksize);
              p.ellipse(x, y, s, s);
            } else {
              const bb = (r * 299 + g * 587 + b * 114) / 1000;
              if (bb < 40) {
                p.fill(0);
                p.ellipse(x, y, blocksize - 1, blocksize - 1);
              } else {
                p.fill(255);
                p.ellipse(x, y, blocksize - 1, blocksize - 1);
                p.ellipse(x, y, blocksize, blocksize);
              }
            }
          }
        }
      }

      function randomPixelate() {
        const bs = randomInt(10, 30);
        pixelate(bs);
      }

      function reset() {
        p.background(100);
        gridW = randomInt(20, 80);
        gridH = randomInt(20, 80);
        grid = new Grid(gridW, gridH);
        balls = [];
        const number_of_balls = gridW * gridH;
        for (let i = 0; i < number_of_balls; i++) {
          addBall(grid.x[i], grid.y[i], i);
        }
      }

      function updateAudio() {
        if (audioAnalysisReady && analyser && frequencyData) {
          analyser.getByteFrequencyData(frequencyData);
          spectrum = frequencyData;
        }
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        hiddenCtx = p.createGraphics(p.windowWidth, p.windowHeight);
        hiddenCtx2 = p.createGraphics(p.windowWidth, p.windowHeight);
        p.pixelDensity(1);
        hiddenCtx.pixelDensity(1);
        bg = p.color(82, 50, 50);

        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';

        gingham();
        p.noStroke();
        reset();
        p.angleMode(p.DEGREES);
      };

      p.draw = () => {
        frameSkips = (frameSkips + 1) % 3;
        updateAudio();

        if (frameSkips === 0) {
          if (chance(200)) mode = randomInt(0, 8);
          if (chance(500)) speed *= -1;
          if (chance(500)) pix = !pix;
          if (chance(100)) reset();
        }

        p.background(0);

        if (spectrum.length > 0) {
          for (let i = 0; i < balls.length; i++) {
            moveBall(balls[i]);
          }
          for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            chooseColour(b);
            drawBallItem(b);
          }
        }

        if (pix && chance(2)) randomPixelate();
        led();

        const nativeCtx = p.canvas.getContext('2d');
        nativeCtx.save();
        nativeCtx.setTransform(1, 0, 0, 1, 0, 0);
        canvasFilters.apply(nativeCtx, p.canvas.width, p.canvas.height, p.frameCount);
        nativeCtx.restore();

        const audio = document.getElementById('player');
        const playing = audio && !audio.paused;
        if (playing) {
          let amp;
          if (audioAnalysisReady && analyser && timeData) {
            analyser.getByteTimeDomainData(timeData);
            let peak = 0;
            for (let i = 0; i < timeData.length; i++) {
              const v = Math.abs(timeData[i] / 128 - 1);
              if (v > peak) peak = v;
            }
            amp = peak;
          } else {
            const t = p.frameCount / 9;
            amp = 0.18 + 0.14 * Math.abs(Math.sin(t)) + Math.random() * 0.06;
          }
          feedWave(amp);
        }
        drawWave();
      };

      // Vector class for Grid
      function Vector(x, y, z) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
      }
      Vector.prototype = {
        add: function(v) { return new Vector(this.x + v.x, this.y + v.y, this.z + v.z); },
        subtract: function(v) { return new Vector(this.x - v.x, this.y - v.y, this.z - v.z); },
        multiply: function(v) {
          if (v instanceof Vector) return new Vector(this.x * v.x, this.y * v.y, this.z * v.z);
          return new Vector(this.x * v, this.y * v, this.z * v);
        },
        divide: function(v) {
          if (v instanceof Vector) return new Vector(this.x / v.x, this.y / v.y, this.z / v.z);
          return new Vector(this.x / v, this.y / v, this.z / v);
        },
        length: function() { return Math.sqrt(this.dot(this)); },
        dot: function(v) { return this.x * v.x + this.y * v.y + this.z * v.z; },
        clone: function() { return new Vector(this.x, this.y, this.z); },
      };

      function Grid(_num_items_horiz, _num_items_vert, _grid_w, _grid_h, _startx, _starty) {
        if (_num_items_horiz === undefined) _num_items_horiz = 1;
        if (_num_items_vert === undefined) _num_items_vert = 1;
        const _horiz = _num_items_horiz || 1;
        const _vert = _num_items_vert || 1;
        this.length = 0;
        this.spacing_x = 0;
        this.spacing_y = 0;
        this.num_items_horiz = 0;
        this.num_items_vert = 0;
        this.start = { x: _startx || 0, y: _starty || 0 };
        this.width = _grid_w || p.width;
        this.height = _grid_h || p.height;
        this.x = [];
        this.y = [];
        this.pos = [];

        this.add = function(h, v) {
          this.num_items_horiz += h || 1;
          this.num_items_vert += v || 1;
          this.spacing_x = this.width / this.num_items_horiz;
          this.spacing_y = this.height / this.num_items_vert;
          this.createGrid();
          return this;
        };

        this.createGrid = function() {
          this.spacing_x = this.width / this.num_items_horiz;
          this.spacing_y = this.height / this.num_items_vert;
          const startX = this.start.x;
          const startY = this.start.y;
          for (let y = 0; y < this.num_items_vert; y++) {
            const yy = y * this.spacing_y + this.spacing_y / 2 + startY;
            for (let x = 0; x < this.num_items_horiz; x++) {
              const xx = x * this.spacing_x + this.spacing_x / 2 + startX;
              this.x.push(xx);
              this.y.push(yy);
              this.pos.push({ row: y, col: x, x: xx, y: yy });
            }
          }
          this.length = this.num_items_vert * this.num_items_horiz;
        };

        this.add(_horiz, _vert);
      }
    });
  }

  function stop() {
    if (myP5) {
      myP5.remove();
      myP5 = null;
    }
    if (blockCanvas) blockCanvas.style.display = 'block';
  }

  return { name: 'LED Grid', start, stop };
})());
