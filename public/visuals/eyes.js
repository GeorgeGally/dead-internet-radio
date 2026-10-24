'use strict';

visuals.register('eyes', (() => {
  let myP5 = null;

  function start() {
    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    myP5 = new p5((p) => {
      let gif = null;
      let frames = [];
      let delays = [];
      // Two playheads over the same frames: the original at its own pace
      // underneath, and the one the dials drive on top.
      const base = { i: 0, t: 0 };
      const live = { i: 0, t: 0 };

      p.preload = () => {
        gif = p.loadImage('visuals/media/eyes.gif');
      };

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.background(0);
        // Decode every frame once into its own canvas so either playhead can
        // draw any frame at any opacity.
        const props = gif.gifProperties;
        if (props) {
          gif.pause();
          frames = props.frames.map((f) => {
            const c = document.createElement('canvas');
            c.width = f.image.width;
            c.height = f.image.height;
            c.getContext('2d').putImageData(f.image, 0, 0);
            return c;
          });
          delays = props.frames.map((f) => Math.max(20, f.delay || 100));
        } else {
          frames = [gif.canvas];
          delays = [100];
        }
      };

      // Move a playhead on by dt at `speed`; each new frame is, with chance
      // `jump`, a random one instead of the next.
      function advance(head, dt, speed, jump) {
        head.t += dt * speed;
        let guard = 0;
        while (head.t >= delays[head.i] && guard++ < 64) {
          head.t -= delays[head.i];
          head.i = Math.random() < jump
            ? Math.floor(Math.random() * frames.length)
            : (head.i + 1) % frames.length;
        }
      }

      // The GIF's height fills the screen; the sides crop on anything wider
      // than its 500:210 frame and letterbox on anything narrower.
      function drawFrame(i, alpha) {
        const f = frames[i];
        const d = p.pixelDensity();
        const s = p.height / f.height;
        const w = f.width * s;
        const ctx = p.drawingContext;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = alpha;
        ctx.drawImage(f, ((p.width - w) / 2) * d, 0, w * d, p.height * d);
        ctx.restore();
      }

      p.draw = () => {
        if (!frames.length) return;
        const dt = Math.min(250, p.deltaTime);
        // cutoff: speed, 1x at its rest position (130), about 0.25x to 4x
        const speed = Math.pow(2, ((window._cutoffVal ?? 130) - 130) / 60);
        // resonance: past its rest position, more and more random frame jumps
        const r = Math.max(0, Math.min(1, ((window._resonanceVal ?? 50) - 50) / 50));
        const jump = r * r;
        // alpha: how much of the driven playhead shows over the original
        const alpha = Math.max(0, Math.min(1, (window._filterStrengthVal ?? 100) / 100));

        advance(base, dt, 1, 0);
        advance(live, dt, speed, jump);

        p.background(0);
        drawFrame(base.i, 1);
        if (alpha > 0) drawFrame(live.i, alpha);
        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Eyes', start, stop };
})());
