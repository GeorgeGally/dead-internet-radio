'use strict';

visuals.register('bonk', (() => {
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
      const NUM = 200;
      let time = 0;

      p.setup = () => {
        visuals.setupP5Canvas(p);
      };

      p.draw = () => {
        p.background(0, 0, 0, 40);

        const speed = (window.soundSensitivity ?? 50) / 50;
        const react = (window._cutoffVal ?? 130) / 255;

        let bass = 0;
        let avg = 0;
        if (audioAnalysisReady && analyser && frequencyData) {
          analyser.getByteFrequencyData(frequencyData);
          let s = 0;
          for (let i = 0; i < 12; i++) s += frequencyData[i];
          bass = s / (12 * 255);
          let t = 0;
          for (let i = 0; i < frequencyData.length; i++) t += frequencyData[i];
          avg = t / frequencyData.length / 255;
        }

        const baseStep = 0.0001 * Math.PI / 180;
        const step = baseStep * speed * (1 + bass * react * 8);
        const sizeMod = 1 + avg * react * 0.5;
        const spacing = 1.3 * sizeMod;

        p.push();
        p.translate(p.width / 2, p.height / 2);

        for (let i = 0; i < NUM; i++) {
          p.rotate(time);
          const x = 10 + i * 2;
          const sz = i * spacing;

          p.fill(0);
          p.noStroke();
          p.ellipse(x, 0, sz, sz);

          const alpha = 180 + bass * react * 75;
          p.noFill();
          p.stroke(255, alpha);
          p.strokeWeight(0.5 + bass * react * 2);
          p.ellipse(x, 0, sz, sz);

          time += step;
        }

        p.pop();
        canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'Bonk', start, stop };
})());
