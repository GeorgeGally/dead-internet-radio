'use strict';

visuals.register('particle_drawings', (() => {
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
      let ctx, ctx2;
      let particles = [];
      let num, d, dir, mode, spacing, sway, mono, lines;

      function drawConnectionLines(p_i) {
        ctx.stroke(p_i.c);
        for (let i = p_i.me - 1; i >= 0; i--) {
          const p_j = particles[i];
          if (p.dist(p_i.x, p_i.y, p_j.x, p_j.y) < d
            && Math.sign(p_i.speed.x) === Math.sign(p_j.speed.x)
            && Math.sign(p_i.speed.y) === Math.sign(p_j.speed.y)) {
            ctx.line(p_i.x, p_i.y, p_j.x, p_j.y);
            break;
          }
        }
      }

      function Particle() {
        this.me = particles.length;
        this.on = Math.random() > 0.2 ? 1 : 0;
        this.old = { x: 0, y: 0 };
        this.offset = Math.random() * 100;

        if (dir === 0) {
          this.x = (this.me + 0.5) * p.width / num;
          this.y = 0;
          this.speed = { x: 0, y: Math.random() * 1 + 1 };
        } else {
          this.x = p.width / 2;
          this.y = (this.me + 0.5) * p.height / num;
          this.speed = { x: Math.random() * 1 + 1, y: 0 };
        }

        this.start_x = this.x;
        this.start_y = this.y;
        this.old.x = this.x;
        this.old.y = this.y;
        this.sz = 6;

        if (mode === 1) {
          this.c = p.color(255, 5);
        } else {
          this.c = p.color(0, 0, 0, 5);
        }

        if (Math.random() * 20 > 19) {
          this.c = p.color(Math.random() * 255, 80, 80, 5);
        }

        if (Math.random() > 0.5) this.speed.x *= -1;
        if (Math.random() > 0.5) this.speed.y *= -1;

        this.move = function () {
          this.old.x = this.x;
          this.old.y = this.y;

          this.x += this.speed.x;
          this.y += this.speed.y;

          if (sway) {
            if (dir === 0) {
              this.x = this.start_x + Math.sin(this.y / 40) * spacing;
            } else {
              this.y = this.start_y + Math.sin(this.x / 40) * spacing;
            }
          }

          this.checkBounds();

          if (!mono) {
            this.c = p.color(
              80 + 180 * Math.sin(p.radians(p.frameCount / 10 + this.me)),
              50 + 20 * Math.sin(p.radians(p.frameCount / 10 + this.me)),
              50 + 20 * Math.sin(p.radians(p.frameCount / 10 + this.me)),
              10
            );
          }

          p.noStroke();
          p.fill('red');
          p.ellipse(this.x, this.y, this.sz);

          if (lines) this.drawTrails();
        };

        this.checkBounds = function () {
          if (this.x > p.width + this.sz * 2 || this.x < this.sz * -2) {
            this.speed.x *= -1;
            this.old.x = this.x;
            if (p.frameCount > 1000) { this.on = 0; this.speed.x = 0; }
          }
          if (this.y >= p.height + this.sz * 2 || this.y <= -this.sz * 2) {
            this.speed.y *= -1;
            this.old.y = this.y;
            if (p.frameCount > 1000) { this.on = 0; this.speed.y = 0; }
          }
        };

        this.drawTrails = function () {
          if (mode === 0) {
            ctx2.stroke(255);
            ctx2.line(this.x - 1, this.y - 1, this.old.x - 1, this.old.y - 1);
            ctx2.stroke(0, 50);
            ctx2.line(this.x, this.y, this.old.x, this.old.y);
          } else if (mode === 1) {
            ctx2.strokeWeight(3);
            ctx2.stroke(85);
            ctx2.line(this.x - 2, this.y - 2, this.old.x - 2, this.old.y - 2);
            ctx2.strokeWeight(1);
            ctx2.stroke(220);
            ctx2.line(this.x, this.y, this.old.x, this.old.y);
          } else if (mode === 4) {
            ctx2.strokeWeight(1);
            ctx2.stroke(230);
            ctx2.line(this.x, this.y, this.old.x, this.old.y);
          } else {
            ctx2.stroke(255);
            ctx2.line(this.x - 1, this.y - 1, this.old.x - 1, this.old.y - 1);
            ctx2.stroke(0, 50);
            ctx2.line(this.x, this.y, this.old.x, this.old.y);
          }
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

        ctx = p.createGraphics(p.windowWidth, p.windowHeight);
        ctx2 = p.createGraphics(p.windowWidth, p.windowHeight);
        num = Math.round(Math.random() * 35 + 5);
        spacing = p.width / num;
        d = spacing * 4;
        dir = 0;
        mode = 0;
        sway = 0;
        mono = 0;
        lines = 0;

        if (Math.random() * 100 > 80) dir = 1;
        if (Math.random() * 100 > 80) mode = 1;
        if (Math.random() * 1000 > 990) mode = 3;
        if (Math.random() * 1000 > 990) mode = 4;
        if (Math.random() * 1000 > 990) sway = 1;
        if (Math.random() * 1000 > 600) mono = 1;
        if (Math.random() * 1000 > 600) lines = 1;

        p.colorMode(p.HSB, 360, 100, 100, 100);

        for (let i = 0; i < num; i++) {
          particles.push(new Particle());
        }

        if (mode === 1) {
          ctx.stroke(255, 2);
        } else {
          ctx.stroke(0, 2);
        }
      };

      p.draw = () => {
        if (mode === 0) {
          p.background('#d8d4cb');
        } else if (mode === 1) {
          p.background(0);
        } else {
          p.background(0, 0, 90);
        }

        p.image(ctx, 0, 0);

        for (let i = 0; i < particles.length; i++) {
          const p_i = particles[i];
          if (p_i.on) {
            p_i.move();
            drawConnectionLines(p_i);
          }
        }

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

  return { name: 'Particle Drawings', start, stop };
})());
