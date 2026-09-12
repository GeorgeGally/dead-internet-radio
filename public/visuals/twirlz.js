'use strict';

visuals.register('twirlz', (() => {
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
      let path, x, y, r, t, rr, fc;
      let done = false;

      function Timer(d, s) {
        this.t = 0;
        this.d = d || 0;
        this.end = 0;
        this.speed = s || 0.001;
        this.update = function() {
          const dt = p.deltaTime * this.speed;
          this.t += dt;
          if (this.t >= this.d) this.end = 1;
        };
        this.reset = function() {
          this.t = 0;
          this.end = 0;
        };
      }

      class Path {
        constructor() {
          this.pts = [];
          this.angles = [];
          this.size = 4;
        }

        get lastPt() {
          return this.pts[this.pts.length - 1];
        }

        addPoint(x, y) {
          if (this.pts.length < 1) {
            this.pts.push(new p5.Vector(x, y));
            return;
          }

          const nextPt = new p5.Vector(x, y);
          let d = p5.Vector.dist(nextPt, this.lastPt);

          while (d > this.size) {
            const diff = p5.Vector.sub(nextPt, this.lastPt);
            diff.normalize();
            diff.mult(this.size);
            this.pts.push(p5.Vector.add(this.lastPt, diff));
            this.angles.push(diff.heading());
            d -= this.size;
          }
        }

        display() {
          p.rectMode(p.CENTER);
          for (let i = 1; i < this.pts.length; i++) {
            const prev = this.pts[i - 1];
            const next = this.pts[i];
            const diff = p5.Vector.sub(next, prev);
            diff.mult(0.5);
            p.push();
            p.translate(prev.x + diff.x, prev.y + diff.y);
            p.rotate(this.angles[i - 1]);
            p.rect(0, 0, this.size * 0.25, this.size * 4);
            p.ellipse(this.size, 0, this.size / 2);
            p.pop();
          }
        }
      }

      function restart() {
        t = new Timer(0, 0.005);
        path = new Path();
        r = 4;
        rr = 4;
        x = p.width / 2;
        y = p.height / 2;
        fc = 0;
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);

        path = new Path();
        p.noStroke();
        p.fill(0, 200);
        t = new Timer(0, 0.005);
        r = 4;
        rr = 4;
        x = p.width / 2;
        y = p.height / 2;
        fc = 0;
      };

      p.draw = () => {
        fc++;
        if (fc > 1888) {
          if (!done) {
            done = true;
            visuals.artworkEnded();
          }
        }

        p.background('#d8d4cb');
        rr = r + p.noise(fc / 10) * 15;
        x = p.width / 2 + Math.cos(t.t) * rr;
        y = p.height / 2 + Math.sin(t.t) * rr;
        path.addPoint(x, y);
        path.display();
        r += 0.25;
        t.update();
        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Twirlz', start, stop };
})());
