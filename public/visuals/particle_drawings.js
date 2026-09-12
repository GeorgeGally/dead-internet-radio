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
      let num, d, dir, spacing, lines;

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

        this.c = Math.random() > 0.5
          ? p.color(255, 0, 0, 10)
          : p.color(0, 0, 0, 10);

        if (Math.random() > 0.5) this.speed.x *= -1;
        if (Math.random() > 0.5) this.speed.y *= -1;

        this.move = function () {
          this.old.x = this.x;
          this.old.y = this.y;

          this.x += this.speed.x;
          this.y += this.speed.y;

          this.checkBounds();

          p.noStroke();
          p.fill(this.c);
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
          const trailC = Math.random() > 0.5
            ? p.color(255, 0, 0, 15)
            : p.color(0, 0, 0, 40);
          ctx2.strokeWeight(1);
          ctx2.stroke(trailC);
          ctx2.line(this.x, this.y, this.old.x, this.old.y);
        };
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);

        ctx = p.createGraphics(p.windowWidth, p.windowHeight);
        ctx2 = p.createGraphics(p.windowWidth, p.windowHeight);
        num = Math.round(Math.random() * 35 + 5);
        spacing = p.width / num;
        d = spacing * 4;
        dir = 0;
        lines = 0;

        if (Math.random() * 100 > 80) dir = 1;
        if (Math.random() * 1000 > 600) lines = 1;

        for (let i = 0; i < num; i++) {
          particles.push(new Particle());
        }

        ctx.stroke(0, 10);
      };

      p.draw = () => {
        p.background('#d8d4cb');

        p.image(ctx, 0, 0);

        for (let i = 0; i < particles.length; i++) {
          const p_i = particles[i];
          if (p_i.on) {
            p_i.move();
            drawConnectionLines(p_i);
          }
        }

        p.image(ctx2, 0, 0);
        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Particle Drawings', start, stop };
})());
