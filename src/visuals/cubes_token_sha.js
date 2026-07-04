'use strict';

visuals.register('cubes_token_sha', (() => {
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
      const s = 40;
      const dims = 8;
      let hash;
      let r;
      let c = [];

      function sha512(str) {
        return crypto.subtle
          .digest('SHA-512', new TextEncoder('utf-8').encode(str))
          .then((buf) => {
            return Array.prototype.map
              .call(new Uint8Array(buf), (x) => ('00' + x.toString(16)).slice(-2))
              .join('');
          });
      }

      function addCubes(sha) {
        let d = 0;
        for (let x = 0; x < dims; x++) {
          for (let y = 0; y < dims; y++) {
            for (let z = 0; z < dims; z++) {
              let b = 0;
              if (sha.substring(d, d + 1).charCodeAt(0) > 60) {
                b = 1;
              }
              const a = addCube(
                x * s - 4.5 * s + s / 2,
                y * s - 4.5 * s + s / 2,
                z * s - 4.5 * s + s / 2,
                b
              );
              c.push(a);
              d++;
            }
          }
        }
      }

      function addCube(x, y, z, b) {
        const col = p.color(r[0] % 256, p.random(255), p.random(255));
        if (b === 0) {
          return { x, y, z, c: col };
        }
        const ball = {
          x: 0, y: 0, z: 0,
          sx: p.random(-2, 2),
          sy: p.random(-2, 2),
          sz: p.random(-2, 2)
        };
        return { x, y, z, ball, c: col, b };
      }

      function moveBall(b) {
        b.x += b.sx;
        b.y += b.sy;
        b.z += b.sz;
        if (b.x >= s / 2 || b.x <= -s / 2) b.sx *= -1;
        if (b.y >= s / 2 || b.y <= -s / 2) b.sy *= -1;
        if (b.z >= s / 2 || b.z <= -s / 2) b.sz *= -1;
      }

      function drawBall(p) {
        const b = p.ball;
        p.fill(p.c);
        p.noStroke();
        p.translate(b.x, b.y, b.z);
        p.sphere(3);
      }

      function drawCube(p) {
        if (p.b === 1) {
          p.stroke(240);
          p.noFill();
        } else {
          p.fill(r[0] % 256);
          p.noStroke();
        }
        p.box(s);
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
        p.setAttributes('preserveDrawingBuffer', true); // let filters sample the canvas
        p.pixelDensity(1);

        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';

        const tokenData = {
          hash: '0x11ac16678959949c12d5410212301960fc496813cbc3495bf77aeed738579738',
          tokenId: '123000456',
        };

        hash = tokenData.hash.substr(2, 66);
        r = Uint32Array.from([0, 0, 0, 0].map((_, i) => parseInt(hash.substr(i * 8 + 2, 8), 16)));

        const h1 = hash.substr(0, 16);
        const h2 = hash.substr(16, 32);
        const h3 = hash.substr(32, 48);
        const h4 = hash.substr(48, 64);

        sha512(h1).then((x1) => {
          let sha = x1;
          sha512(h2).then((x) => {
            sha += x;
            sha512(h3).then((x) => {
              sha += x;
              sha512(h4).then((x) => {
                sha += x;
                addCubes(sha);
              });
            });
          });
        });
      };

      p.draw = () => {
        p.background(220);
        p.rotateX(p.frameCount * 0.001);
        p.rotateY(p.frameCount * 0.001);

        for (let i = 0; i < c.length; i++) {
          const pCube = c[i];
          p.push();
          p.translate(pCube.x, pCube.y, pCube.z);
          drawCube(pCube);
          if (pCube.ball) {
            moveBall(pCube.ball);
            drawBall(pCube);
          }
          p.pop();
        }

        p.orbitControl();

        canvasFilters.applyToOverlay(p.canvas, p.frameCount);
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

  return { name: 'Cubes Token SHA', start, stop };
})());
