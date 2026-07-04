'use strict';

visuals.register('sound_investigation1', (() => {
  let myP5 = null;
  let blockCanvas = null;
  const NUM_DOTS = 120;

  function start() {
    blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      let dots = [];

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        p.pixelDensity(window.devicePixelRatio || 1);
        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';
        p.background(255);
        p.strokeWeight(0.5);

        for (let i = 0; i < NUM_DOTS; i++) {
          dots.push({ theta: p.radians((360 / NUM_DOTS) * i) });
        }
      };

      p.draw = () => {
        p.background(255);
        const sens = (window.soundSensitivity != null ? window.soundSensitivity : 50) / 50;
        const cx = p.width / 2;
        const cy = p.height / 2;

        if (audioAnalysisReady && analyser && frequencyData) {
          analyser.getByteFrequencyData(frequencyData);
        }

        const ringAngle = p.frameCount * 0.003;

        for (let i = 0; i < NUM_DOTS; i++) {
          let vol = 0;
          if (audioAnalysisReady && frequencyData) {
            const bin = Math.floor((i / NUM_DOTS) * frequencyData.length);
            vol = (frequencyData[bin] / 255) * sens * 100;
          } else {
            vol = (10 + p.noise(i * 0.1, p.frameCount * 0.01) * 60) * sens;
          }

          const angle = dots[i].theta + ringAngle;
          const r = 120 + vol;
          const x = r * p.cos(angle);
          const y = r * p.sin(angle);

          p.noFill();
          p.stroke(0, 100);
          p.ellipse(cx + x, cy + y, r / 2, r / 2);
          p.fill(0);
          p.noStroke();
          p.ellipse(cx + x, cy + y, 2, 2);
        }

        p.noFill();
        p.stroke(0, 40);
        p.strokeWeight(0.5);
        p.beginShape();
        for (let i = 0; i < NUM_DOTS; i++) {
          let vol = 0;
          if (audioAnalysisReady && frequencyData) {
            const bin = Math.floor((i / NUM_DOTS) * frequencyData.length);
            vol = (frequencyData[bin] / 255) * sens * 100;
          } else {
            vol = (10 + p.noise(i * 0.1, p.frameCount * 0.01) * 60) * sens;
          }
          const angle = dots[i].theta + ringAngle;
          const r = 120 + vol;
          p.vertex(cx + r * p.cos(angle), cy + r * p.sin(angle));
        }
        p.endShape(p.CLOSE);

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

  return { name: 'Sound Investigation 1', start, stop };
})());
