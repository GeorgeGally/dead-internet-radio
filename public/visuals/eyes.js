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

      // p5 decodes the GIF into frames and plays it on its own clock.
      p.preload = () => {
        gif = p.loadImage('visuals/media/eyes.gif');
      };

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.background(0);
      };

      // The GIF's height fills the screen; the sides crop on anything wider
      // than its 500:210 frame and letterbox on anything narrower.
      p.draw = () => {
        p.background(0);
        const s = p.height / gif.height;
        const w = gif.width * s;
        p.image(gif, (p.width - w) / 2, 0, w, p.height);
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
