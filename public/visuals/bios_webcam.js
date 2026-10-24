'use strict';

visuals.register('bios_webcam', (() => {
  let myP5 = null;
  let videoEl = null;
  let stream = null;
  let cameraState = 'idle';

  const LINES = [
    'COMMAND.COM',
    'LOAD BIOS',
    'BIOS SYSTEM CHECK',
    'RAM CHECK',
    'CONFIG.SYS',
    'BIOS INTERFACE',
    'TO ROM I/O',
    'CONTROLLER',
    'COMSPEC.EXE',
    'MEMORY.DAT',
    'ROBO UTILS',
    'SYSTEM BUFFER',
    'PARAMETERS',
    'PARITY SET',
    'MEMORY SET',
    'SYSTEM STATUS',
    'OK_',
  ];

  const GREEN = '#3dff5a'

  function openCamera() {
    if (cameraState === 'ready' || cameraState === 'asking') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraState = 'unavailable';
      return;
    }
    cameraState = 'asking';
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
      .then((s) => {
        stream = s;
        videoEl = document.createElement('video');
        videoEl.srcObject = s;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.autoplay = true;
        cameraState = 'ready';
        return videoEl.play().catch(() => {});
      })
      .catch(() => {
        cameraState = 'denied';
      });
  }

  function closeCamera() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
      videoEl = null;
    }
    cameraState = 'idle';
  }

  function start() {
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    const blockCanvas = document.getElementById('block-canvas');
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    if (blockCanvas) blockCanvas.style.display = 'none';

    openCamera();

    myP5 = new p5((p) => {
      let started = 0;
      let revealRef = 0;

      p.setup = () => {
        visuals.setupP5Canvas(p);
        p.textFont('IBM Plex Mono, monospace');
        started = p.millis();
      };

      function drawFeed() {
        p.background(0);
        if (cameraState === 'ready' && videoEl && videoEl.videoWidth > 0) {
          const vw = videoEl.videoWidth;
          const vh = videoEl.videoHeight;
          const scale = Math.max(p.width / vw, p.height / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          const dx = (p.width - dw) / 2;
          const dy = (p.height - dh) / 2;
          p.push();
          p.noTint();
          p.image(videoEl, dx, dy, dw, dh);
          p.pop();
        } else {
          p.background(6, 10, 6);
          const t = p.millis() / 1000;
          p.noStroke();
          for (let i = 0; i < 90; i++) {
            const x = (i * 137.5 + t * 40) % p.width;
            const y = (i * 89.3 + Math.sin(t + i) * 30 + p.height) % p.height;
            p.fill(20, 40, 20, 90);
            p.rect(x, y, 2, 2);
          }
        }
      }

      function drawScanlines() {
        const t = p.millis() / 1000;
        p.noStroke();
        p.fill(0, 0, 0, 90);
        for (let y = 0; y < p.height; y += 3) {
          p.rect(0, y, p.width, 1.4);
        }
        const band = ((t * 0.12) % 1.4) - 0.2;
        const by = band * p.height;
        const g = p.drawingContext.createLinearGradient(0, by, 0, by + p.height * 0.16);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.06)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        p.drawingContext.fillStyle = g;
        p.drawingContext.fillRect(0, by, p.width, p.height * 0.16);
      }

      function drawBios() {
        const elapsed = (p.millis() - started) / 1000;
        const fs = Math.max(11, p.height * 0.027);
        const lh = fs * 1.32;
        const x = p.width * 0.055;
        let y = p.height * 0.06 + fs;

        const perLine = 0.34;
        const perChar = 0.022;

        p.push();
        p.textFont('IBM Plex Mono, monospace');
        p.textSize(fs);
        p.textAlign(p.LEFT, p.BASELINE);
        p.fill(61, 255, 90);
        p.drawingContext.shadowColor = 'rgba(61,255,90,0.55)';
        p.drawingContext.shadowBlur = Math.max(4, fs * 0.45);

        let budget = elapsed - 0.35;
        let cursorX = x;
        let cursorY = y;

        for (let i = 0; i < LINES.length; i++) {
          const line = LINES[i];
          if (budget <= 0) break;
          const chars = Math.min(line.length, Math.floor(budget / perChar));
          if (chars <= 0) break;
          const shown = line.slice(0, chars);
          p.text(shown, x, y);
          cursorX = x + p.textWidth(shown);
          cursorY = y;
          budget -= chars * perChar;
          if (chars < line.length) break;
          budget -= perLine;
          y += lh;
        }

        if ((p.millis() / 500) % 2 < 1) {
          p.text('_', cursorX + fs * 0.04, cursorY);
        }
        p.pop();
      }

      p.draw = () => {
        drawFeed();
        drawScanlines();
        drawBios();
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
    closeCamera();
  }

  return { name: 'BIOS Webcam', start, stop };
})());
