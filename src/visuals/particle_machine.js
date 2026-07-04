'use strict';

visuals.register('particle_machine', (() => {
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
      let ctx;
      let particles = [];

      function drawLines(p_i) {
        p.stroke(255, 0, 0);
        ctx.stroke(p_i.c);
        for (let i = p_i.me - 1; i >= 0; i--) {
          const p_j = particles[i];
          const dd = p.dist(p_i.x, p_i.y, p_j.x, p_j.y);
          if (dd < 200 && dd > 100) {
            ctx.line(p_i.x, p_i.y, p_j.x, p_j.y);
            if (p.frameCount < 400) p.line(p_i.x, p_i.y, p_j.x, p_j.y);
          }
        }
      }

      function Particle() {
        this.x = Math.random() * p.width;
        this.y = Math.random() * p.height;
        this.sz = 6;
        this.me = particles.length;
        this.c = p.color(255, 10);

        if (Math.random() * 20 > 15) {
          this.c = p.color('#a19b8c');
          this.c.setAlpha(5);
        }

        this.speed = p.createVector(Math.random() * 1 + 1, Math.random() * 1 + 1);
        if (Math.random() > 0.5) this.speed.x *= -1;
        if (Math.random() > 0.5) this.speed.y *= -1;

        this.move = function () {
          this.x += this.speed.x;
          this.y += this.speed.y;

          if (this.x >= p.width - this.sz / 2 || this.x <= this.sz / 2) {
            this.speed.x *= -1;
          }
          if (this.y >= p.height - this.sz / 2 || this.y <= this.sz / 2) {
            this.speed.y *= -1;
          }

          p.noStroke();
          p.fill('red');
          p.ellipse(this.x, this.y, this.sz);
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
        p.colorMode(p.HSB, 360, 100, 100, 100);

        for (let i = 0; i < 10; i++) {
          particles.push(new Particle());
        }

        ctx.stroke(0, 2);
      };

      p.draw = () => {
        p.background('#d8d4cb');
        p.image(ctx, 0, 0);

        for (let i = 0; i < particles.length; i++) {
          const p_i = particles[i];
          p_i.move();
          drawLines(p_i);
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

  return { name: 'Particle Machine', start, stop };
})());
