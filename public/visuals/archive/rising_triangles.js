'use strict';

visuals.register('rising_triangles', (() => {
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
      let balls = [];
      const cols = 6;
      const rows = 10;

      function eqTriangleUp(x, y, size) {
        const h = size * Math.sqrt(3) / 2;
        p.triangle(x, y - h * 2 / 3, x - size / 2, y + h / 3, x + size / 2, y + h / 3);
      }

      function eqTriangleDown(x, y, size) {
        const h = size * Math.sqrt(3) / 2;
        p.triangle(x, y + h * 2 / 3, x - size / 2, y - h / 3, x + size / 2, y - h / 3);
      }

      function createGrid() {
        const pts = [];
        for (let gy = 0; gy < rows; gy++) {
          for (let gx = 0; gx < cols; gx++) {
            pts.push({ x: (gx + 0.5) * p.width / cols, y: (gy + 0.5) * p.height / rows });
          }
        }
        return pts;
      }

      function addBall(x, y) {
        balls.push({
          x,
          y,
          speedX: 0.1 + (p.random() < 0.5 ? -1 : 1) * p.random(0.1, 1),
          speedY: p.random(-3, -0.8),
          r: Math.floor(p.random(50, 200)),
          alpha: p.random(50, 100),
          size: p.random(24, 70),
          angle: p.random(p.TWO_PI),
          spin: p.random(-0.04, 0.04),
        });
      }

      function seedBalls() {
        balls = [];
        for (const pt of createGrid()) addBall(pt.x, pt.y);
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);

        seedBalls();
      };

      p.draw = () => {
        p.background(0, 0, 0, 2);
        p.noStroke();

        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];

          if (b.y < -b.size) b.y = p.height + b.size;
          if (b.x < -b.size) b.x = p.width + b.size;
          if (b.x > p.width + b.size) b.x = -b.size;

          p.push();
          p.translate(b.x, b.y);
          p.rotate(b.angle);

          p.fill(b.r, 0, 0, b.alpha);
          eqTriangleUp(0, 0, b.size);
          p.fill(0);
          eqTriangleUp(0, 0, b.size / 4);

          p.fill(b.r, 0, 0, b.alpha);
          eqTriangleDown(0, 0, b.size);
          p.fill(0);
          eqTriangleDown(0, 0, b.size / 4);

          p.pop();

          b.x += b.speedX;
          b.y += b.speedY;
          b.angle += b.spin;
        }
        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        seedBalls();
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Rising Triangles', start, stop };
})());
