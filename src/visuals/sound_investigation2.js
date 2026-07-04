'use strict';

visuals.register('sound_investigation2', (() => {
  let myP5 = null;
  let blockCanvas = null;
  const NUM = 100;

  function start() {
    blockCanvas = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvas) blockCanvas.style.display = 'none';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    myP5 = new p5((p) => {
      let rot = 0;
      let spikes = [];
      let baseRadius;

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight, p.WEBGL);
        p.setAttributes('preserveDrawingBuffer', true); // let filters sample the canvas
        p.pixelDensity(window.devicePixelRatio || 1);
        p.canvas.style.position = 'fixed';
        p.canvas.style.top = '0';
        p.canvas.style.left = '0';
        p.canvas.style.width = '100%';
        p.canvas.style.height = '100%';
        p.canvas.style.zIndex = '1';

        baseRadius = p.height / 5.2;

        for (let i = 0; i < NUM; i++) {
          const theta = p.acos(p.random(-1, 1));
          const phi = p.random(p.TWO_PI);
          spikes.push({
            theta,
            phi,
            spikeBase: 1.0,
            sw: p.random(0.4, 4),
          });
        }
      };

      p.draw = () => {
        p.background(0);
        p.lights();
        const sens = (window.soundSensitivity != null ? window.soundSensitivity : 50) / 50;

        rot += 0.5;
        p.rotateY(p.radians(rot));

        p.noStroke();
        p.fill(0, 0, 0, 255);
        p.sphere(baseRadius);

        if (audioAnalysisReady && analyser && frequencyData) {
          analyser.getByteFrequencyData(frequencyData);
        }

        for (let i = 0; i < NUM; i++) {
          const s = spikes[i];
          let vol = 0;
          if (audioAnalysisReady && frequencyData) {
            const bin = i % frequencyData.length;
            vol = (frequencyData[bin] / 255) * sens * 2.2;
          } else {
            vol = p.noise(i * 0.1, p.frameCount * 0.01) * sens * 1.1;
          }
          let spikeLen = s.spikeBase + vol;
          if (spikeLen > 4.5) spikeLen = 4.5;

          // full-sphere distribution: z = cos(theta) spans [-1, 1]
          const x = baseRadius * p.sin(s.theta) * p.cos(s.phi);
          const y = baseRadius * p.sin(s.theta) * p.sin(s.phi);
          const z = baseRadius * p.cos(s.theta);

          const xb = x * spikeLen;
          const yb = y * spikeLen;
          const zb = z * spikeLen;

          p.strokeWeight(s.sw);
          p.stroke(200);
          p.line(x, y, z, xb, yb, zb);
        }

        canvasFilters.applyToOverlay(p.canvas, p.frameCount);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
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

  return { name: 'Sound Investigation 2', start, stop };
})());
