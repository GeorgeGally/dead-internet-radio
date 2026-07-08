'use strict';

visuals.register('grid', (() => {
  const GW = 40;
  const GH = 30;
  const TWEEN_SPEED = 10;
  const CONNECT_DIST = 30;

  function chance(val) { return Math.random() * val < 1; }
  function randomInt(min, max) { if (max === undefined) { max = min; min = 0; } return Math.floor(Math.random() * (max + 1 - min)) + min; }
  function tween(pos, target, speed) { return pos + (target - pos) / speed; }
  function dist(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)); }

  let canvas = null;
  let ctx = null;
  let animId = null;
  let frameCount = 0;
  let particles = [];
  let w = 0, h = 0;
  let bassSmoothed = 0;

  function initParticles() {
    particles = [];
    const sx = w / GW;
    const sy = h / GH;
    for (let row = 0; row < GH; row++) {
      for (let col = 0; col < GW; col++) {
        const x = col * sx + sx / 2;
        const y = row * sy + sy / 2;
        const on = chance(2);
        const p = {
          pos: {x, y},
          start: {x, y},
          target: {x, y},
          old: {x, y},
          row, col, on, open: !on,
          sz: Math.max(3, sx * 0.125),
        };
        particles.push(p);
      }
    }
  }

  function newPosX(g) {
    if (!g.on) return;
    const newCol = randomInt(GW - 1);
    if (newCol === g.col) return;
    const newPos = newCol + g.row * GW;
    const p = particles[newPos];
    if (!p || !p.open || p.on) return;
    p.open = false;
    p.on = true;
    g.open = true;
    g.on = false;
    p.pos.x = g.pos.x;
    p.target.x = p.start.x;
  }

  function newPosY(g) {
    if (!g.on) return;
    const oldPos = g.col + g.row * GW;
    const newRow = randomInt(GH - 1);
    if (newRow === g.row) return;
    const newPos = g.col + newRow * GW;
    const p = particles[newPos];
    const g2 = particles[oldPos];
    if (!p || !p.open || p.on) return;
    p.open = false;
    p.on = true;
    g.open = true;
    g.on = false;
    p.pos.y = g.pos.y;
    p.target.y = p.start.y;
    p.old.y = g2.old.y;
  }

  function shuffleGrid() {
    for (let i = 0; i < particles.length; i++) {
      const g = particles[i];
      if (Math.round(g.pos.x) === Math.round(g.target.x) && Math.round(g.pos.y) === Math.round(g.target.y)) {
        if (chance(30)) newPosX(g);
        if (chance(30)) newPosY(g);
      }
    }
  }

  function moveGrid() {
    const speed = bassSmoothed > 0.08 ? Math.max(TWEEN_SPEED, TWEEN_SPEED + bassSmoothed * 40) : TWEEN_SPEED;
    for (let i = 0; i < particles.length; i++) {
      const g = particles[i];
      g.pos.x = tween(g.pos.x, g.target.x, speed);
      g.pos.y = tween(g.pos.y, g.target.y, speed);
    }
  }

  function drawGrid() {
    for (let i = 0; i < particles.length; i++) {
      const g = particles[i];
      if (!g.on) continue;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      const sides = 8;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / sides) {
        const ex = g.pos.x + Math.cos(a) * g.sz;
        const ey = g.pos.y + Math.sin(a) * g.sz;
        a === 0 ? ctx.moveTo(ex, ey) : ctx.lineTo(ex, ey);
      }
      ctx.closePath();
      ctx.fill();

      for (let j = i + 1; j < particles.length; j++) {
        const gg = particles[j];
        if (!gg.on) continue;
        if (dist(gg.pos.x, gg.pos.y, g.pos.x, g.pos.y) < CONNECT_DIST) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gg.pos.x, gg.pos.y);
          ctx.lineTo(g.pos.x, g.pos.y);
          ctx.stroke();
        }
      }
    }
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initParticles();
  }

  function render() {
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, w, h);

    if (chance(50)) shuffleGrid();
    moveGrid();
    drawGrid();
    canvasFilters.apply(ctx, canvas.width, canvas.height, frameCount);
  }

  function loop() {
    frameCount++;

    try {
      if (audioAnalysisReady && analyser && frequencyData) {
        const audio = document.getElementById('player');
        if (audio && !audio.paused) {
          analyser.getByteFrequencyData(frequencyData);
          let bassSum = 0;
          for (let i = 0; i < 12; i++) bassSum += frequencyData[i];
          const gain = (window.audioInputGain != null ? window.audioInputGain : 50) / 50;
          const bassEnergy = bassSum / (12 * 255) * gain;
          bassSmoothed = bassSmoothed * 0.7 + bassEnergy * 0.3;
        } else {
          bassSmoothed *= 0.95;
        }
      }

      render();

      const audio = document.getElementById('player');
      const playing = audio && !audio.paused;
      if (playing) {
        let amp;
        if (audioAnalysisReady && analyser && timeData) {
          analyser.getByteTimeDomainData(timeData);
          let peak = 0;
          for (let i = 0; i < timeData.length; i++) {
            const v = Math.abs(timeData[i] / 128 - 1);
            if (v > peak) peak = v;
          }
          amp = peak;
        } else {
          const t = frameCount / 9;
          amp = 0.18 + 0.14 * Math.abs(Math.sin(t)) + Math.random() * 0.06;
        }
        feedWave(amp);
      }
      drawWave();
    } catch (e) {
      console.error('grid loop error:', e);
    }

    animId = requestAnimationFrame(loop);
  }

  function start() {
    const blockCanvasEl = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvasEl) blockCanvasEl.style.display = 'block';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    canvas = document.getElementById('block-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { alpha: true });
    resize();
    window.addEventListener('resize', resize);
    animId = requestAnimationFrame(loop);
  }

  function stop() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    window.removeEventListener('resize', resize);
    const blockCanvasEl = document.getElementById('block-canvas');
    if (blockCanvasEl) blockCanvasEl.style.display = 'none';
  }

  function onEvent(event) {
    if (event === 'trackChange') {
      shuffleGrid();
    }
  }

  return { name: 'Grid', start, stop, onEvent };
})();
