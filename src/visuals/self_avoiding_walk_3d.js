'use strict';

visuals.register('self_avoiding_walk_3d', (() => {
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
      const spacing = 48;
      const BRANCH_COLORS = [
        [34, 75, 83],    // deep teal
        [160, 168, 176], // silver grey
        [175, 96, 117],  // dusty rose
        [160, 173, 162], // sage
        [232, 230, 227], // warm white
        [110, 106, 95],  // taupe
      ];
      let colorIdx = 0;
      let cols, rows, depth;
      let grid;
      let path = [];
      let spot;
      let lerpX = 0, lerpY = 0, lerpZ = 0;

      class Step {
        constructor(dx, dy, dz) {
          this.dx = dx;
          this.dy = dy;
          this.dz = dz;
          this.tried = false;
        }
      }

      function allOptions() {
        return [
          new Step(1, 0, 0),
          new Step(-1, 0, 0),
          new Step(0, 1, 0),
          new Step(0, -1, 0),
          new Step(0, 0, 1),
          new Step(0, 0, -1),
        ];
      }

      class Spot {
        constructor(i_, j_, k_) {
          this.i = i_;
          this.j = j_;
          this.k = k_;
          this.x = i_ * spacing;
          this.y = j_ * spacing;
          this.z = k_ * spacing;
          this.options = allOptions();
          this.visited = false;
        }

        clear() {
          this.visited = false;
          this.options = allOptions();
        }

        nextSpot() {
          const validOptions = [];
          for (const option of this.options) {
            const newX = this.i + option.dx;
            const newY = this.j + option.dy;
            const newZ = this.k + option.dz;
            if (isValid(newX, newY, newZ) && !option.tried) {
              validOptions.push(option);
            }
          }

          if (validOptions.length > 0) {
            const step = p.random(validOptions);
            step.tried = true;
            return grid[this.i + step.dx][this.j + step.dy][this.k + step.dz];
          }
          return undefined;
        }
      }

      function isValid(i, j, k) {
        if (i < 0 || i >= cols || j < 0 || j >= rows || k < 0 || k >= depth) {
          return false;
        }
        return !grid[i][j][k].visited;
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
        p.pixelDensity(1);

        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';

        cols = Math.floor(p.width / spacing);
        rows = Math.floor(p.height / spacing);
        depth = cols;

        grid = new Array(cols);
        for (let i = 0; i < cols; i++) {
          grid[i] = new Array(rows);
          for (let j = 0; j < rows; j++) {
            grid[i][j] = new Array(depth);
            for (let k = 0; k < depth; k++) {
              grid[i][j][k] = new Spot(i, j, k);
            }
          }
        }

        const cx = Math.floor(cols / 2);
        spot = grid[cx][cx][cx];
        spot.branchColor = BRANCH_COLORS[0];
        colorIdx = 1;
        path.push(spot);
        spot.visited = true;
      };

      p.draw = () => {
        p.background('#d8d4cb');

        const minXYZ = { x: Infinity, y: Infinity, z: Infinity };
        const maxXYZ = { x: 0, y: 0, z: 0 };
        for (const v of path) {
          if (v.x < minXYZ.x) minXYZ.x = v.x;
          if (v.y < minXYZ.y) minXYZ.y = v.y;
          if (v.z < minXYZ.z) minXYZ.z = v.z;
          if (v.x > maxXYZ.x) maxXYZ.x = v.x;
          if (v.y > maxXYZ.y) maxXYZ.y = v.y;
          if (v.z > maxXYZ.z) maxXYZ.z = v.z;
        }

        const centerX = (maxXYZ.x - minXYZ.x) * 0.5 + minXYZ.x;
        const centerY = (maxXYZ.y - minXYZ.y) * 0.5 + minXYZ.y;
        const centerZ = (maxXYZ.z - minXYZ.z) * 0.5 + minXYZ.z;

        const amt = 0.05;
        lerpX = p.lerp(lerpX, centerX, amt);
        lerpY = p.lerp(lerpY, centerY, amt);
        lerpZ = p.lerp(lerpZ, centerZ, amt);

        p.rotateY(p.frameCount * 0.001);
        p.translate(-lerpX, -lerpY, -lerpZ);

        const next = spot.nextSpot();
        if (!next) {
          const stuck = path.pop();
          stuck.clear();
          spot = path[path.length - 1];
        } else {
          next.branchColor = BRANCH_COLORS[colorIdx % BRANCH_COLORS.length];
          colorIdx = (colorIdx + 1) % BRANCH_COLORS.length;
          path.push(next);
          next.visited = true;
          spot = next;
        }

        if (path.length === cols * rows * depth) {
          p.noLoop();
        }

        p.noFill();
        for (let i = 0; i < path.length - 1; i++) {
          const v1 = path[i];
          const v2 = path[i + 1];
          const c = v2.branchColor || BRANCH_COLORS[0];
          p.stroke(c[0], c[1], c[2], 160);
          p.strokeWeight(4);
          p.line(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
        }

        p.stroke(255, 200);
        p.strokeWeight(8);
        p.point(spot.x, spot.y, spot.z);
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

  return { name: 'Self Avoiding Walk 3D', start, stop };
})());
