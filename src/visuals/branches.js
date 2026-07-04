'use strict';

visuals.register('branches', (() => {
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
      let branches = [];
      let rad = 200;

      function chance(n) { return Math.random() * n < 1; }
      function posNeg() { return Math.random() < 0.5 ? 1 : -1; }

      function checkIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (d === 0) return false;
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
        const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / d;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
        }
        return false;
      }

      function checkHit(_x, _y) {
        for (let i = 0; i < branches.length; i++) {
          const b = branches[i];
          if (p.dist(b.startx, b.starty, _x, _y) <= 1) return true;
        }
        return false;
      }

      function addBranch(_sw) {
        const a = p.radians(Math.random() * 360);
        const _x = p.width / 2 + Math.sin(a) * rad;
        const _y = p.height / 2 + Math.cos(a) * rad;
        const sw = _sw || 1;
        if (!checkHit(_x, _y)) {
          branches.push(new Branch(_x, _y, sw, a));
        }
      }

      function Branch(_x, _y, _sw, _a) {
        this.segments = [];
        this.line_width = _sw || 2;
        this.moving = true;
        this.angle = _a || p.radians(Math.random() * 360);
        this.oldx = _x;
        this.oldy = _y;
        this.startx = this.oldx;
        this.starty = this.oldy;

        for (let i = 0; i < branches.length; i++) {
          for (let j = 0; j < branches[i].segments.length; j++) {
            const s = branches[i].segments[j];
            if (s.x === this.oldx && s.y === this.oldy) {
              this.moving = false;
            }
          }
        }

        this.segments.push({ x: this.oldx, y: this.oldy });
        this.t = 0.3;

        this.drawSegments = function () {
          const i = this.segments.length - 1;
          const seg = this.segments[i];
          if (this.line_width > 0.2) this.line_width *= 0.99;
          p.stroke(0);
          p.strokeWeight(this.line_width);
          if (i > 0 && this.moving) {
            const prev = this.segments[i - 1];
            p.line(prev.x, prev.y, seg.x, seg.y);
          }
        };

        this.addSegment = function () {
          if (!this.moving) return;
          const last = this.segments.length - 1;
          this.oldx = this.segments[last].x;
          this.oldy = this.segments[last].y;

          if (chance(50)) {
            this.angle += p.noise(this.oldx, this.oldy, this.t) * 0.05;
          }
          if (chance(10)) {
            this.angle += posNeg() * p.radians(55);
          }

          const x = this.oldx + Math.sin(this.angle) * Math.random() * 10;
          const y = this.oldy + Math.cos(this.angle) * Math.random() * 10;

          this.selfHit(x, y, this.oldx, this.oldy);
          this.othersHit(x, y, this.oldx, this.oldy);

          if (this.moving) this.segments.push({ x, y });

          if (x > p.width || x < 0 || y > p.height || y < 0) {
            this.moving = false;
            addBranch(this.line_width);
          }
        };

        this.selfHit = function (x, y, x2, y2) {
          for (let i = 1; i < this.segments.length - 1; i++) {
            const hit = checkIntersection(
              x, y, x2, y2,
              this.segments[i].x, this.segments[i].y,
              this.segments[i - 1].x, this.segments[i - 1].y
            );
            if (hit) {
              this.moving = false;
              addBranch();
              return;
            }
          }
        };

        this.othersHit = function (x, y, x2, y2) {
          for (let j = 0; j < branches.length; j++) {
            if (!this.moving) return;
            const b = branches[j];
            if (b === this) continue;
            if (this.branchHit(b, x, y, x2, y2)) {
              this.moving = false;
              addBranch();
              return;
            }
          }
        };
 
        this.branchHit = function (testBranch, x, y, x2, y2) {
          const s = testBranch.segments;
          for (let i = 1; i < s.length - 1; i++) {
            const hit = checkIntersection(
              s[i].x, s[i].y, s[i - 1].x, s[i - 1].y,
              x, y, x2, y2
            );
            if (hit) return true;
          }
          return false;
        };
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

        addBranch();
        p.background('#d8d4cb');
      };

      p.draw = () => {
        if (chance(2)) addBranch();
        for (let i = 0; i < branches.length; i++) {
          branches[i].addSegment();
          branches[i].drawSegments();
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

  return { name: 'Branches', start, stop };
})());
