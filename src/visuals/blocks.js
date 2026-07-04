'use strict';

visuals.register('blocks', (() => {
  const PALETTES = [
    ['224b53', 'a0a8b0', '000000', 'af6075', 'ddd5d6', 'e8e6e3'],
    ['66a9a1', '425455', 'abafa2', 'abafa2', 'd6dddd', '425455'],
    ['5d9aa4', '3d6d6e', 'cbc19b', '2f505f', '9bada5', 'cbc19b', '5d9aa4'],
    ['8fea3f', 'ffe46e', 'a0e7d7', 'ffffff', '4f32ba', 'ff2ce3'],
    ['2f2e3a', 'e4cdb6', '656574', '758496', 'e4cdb6', 'bea999'],
    ['000000', 'ffb5b5', '000000', 'ffffff', 'ffb5b5', '000000'],
    ['E14D2A', 'FD841F', 'f1f1f1', '111111'],
    ['ff6e40', 'f5f0e1', '1e3d59'],
    ['bcc3c2', '302420', 'd6e3e2', 'b94d7a', 'd6e3e2'],
    ['E8D2A6', '000000', 'F55050'],
    ['411530', 'D1512D', 'F5C7A9', 'F5E8E4', 'FFFFFF'],
    ['fefbe8', 'f3d656', 'ec8a34', '77b4da'],
    ['DEC197', 'F5E1C9', 'F5D1C1', 'DE645F'],
    ['33312f', '566d7e', '6f7d92', '566d7e', 'e5dbd8'],
    ['b39c75', '58788c', 'ebddd3'],
    ['fff1d0', 'f0c808', '07a0c3', '086788'],
    ['eb5e28', '111111', '252422', '403d39', 'ccc5b9'],
    ['d37f64', 'beb8a1', 'ffffff', '3e3e3e', '6e97ad', 'eadadb'],
  ];

  function sOS(x, y) {
    return Math.sin(Math.sin(Math.sin(x)) + Math.sin(Math.sin(y)));
  }

  function perlin(x, y, octaves, persistence) {
    octaves = octaves || 2;
    persistence = persistence || 0.5;
    let total = 1;
    let amplitude = 1;
    let frequency = 1;
    let value = 1;
    for (let i = 0; i < octaves; i++) {
      value += sOS(x * frequency, y * frequency) * amplitude;
      total += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }
    return value / total;
  }

  function posHash(n) {
    return ((n * 2654435761) >>> 0) / 4294967296 * 100;
  }

  function colorIndexAt(col, row) {
    const sx = (col + SESSION_SEED * 0.13) * 0.00080;
    const sy = (row + SESSION_SEED * 0.07) * 0.5;
    const val = perlin(sx, sy, .3, 0.9);
    return Math.abs(Math.ceil(val * blockColorMult));
  }

  function isColorLight(hex) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
  }

  function cyclePalette(trackIndex) {
    const idx = (SESSION_SEED + trackIndex * 31) % PALETTES.length;
    currentPalette = PALETTES[idx];
  }

  const SESSION_SEED = Math.floor(Math.random() * 1e6);
  const BLOCK_STYLE_COUNT = 6;
  const STYLE_CYCLE_FRAMES = 480;
  const BLOCK_DENSITY = 64;
  const TOPBAR_COLOR = '#e0ddd5';
  const ACCENT_ORANGE = '#ff5a1f';

  let blockCanvas = null;
  let blockCtx = null;
  let blocks = [];
  let blockSize = 0;
  let blockCols = 0;
  let blockRows = 0;
  let scrollOffset = 0;
  let scrollSpeed = 2;
  let currentPalette = PALETTES[0];
  let blockAnimId = null;
  let blockFrameCount = 0;
  let blockColorMult = 12;
  let bassSmoothed = 0;
  let glitchIntensity = 0;
  let glitchCanvas = null;
  let glitchFrame = 0;
  let blockStyle = Math.floor(Math.random() * BLOCK_STYLE_COUNT);
  let blockStripes = 4 + Math.floor(Math.random() * 4);
  let styleFrameCount = 0;
  let styleCooldown = 0;
  let blockInk = '#000000';
  let blockBg = TOPBAR_COLOR;

  class Block {
    constructor(col, row, style) {
      this.col = col;
      this.row = row;
      this.colorIndex = 0;
      this.style = style;
    }

    draw(ctx, x, y, size) {
      const on = (this.colorIndex % 2) === 1;
      if (!on) return;
      const ox = x - 1;
      const oy = y - 1;
      const os = size + 2;

      if (this.colorIndex % 5 === 1) {
        ctx.fillStyle = ACCENT_ORANGE;
        ctx.fillRect(ox, oy, os, os);
        return;
      }
      ctx.fillStyle = blockInk;

      switch (this.style) {
        case 1: {
          const ratio = (this.colorIndex % 3) + 1;
          ctx.fillRect(ox, oy, os, size * ratio + 2);
          break;
        }
        case 2: {
          for (let j = size / 8; j < size; j += size / 2) {
            ctx.fillRect(ox, y + j, os, size / 4);
          }
          break;
        }
        case 3: {
          const cc = this.colorIndex % 4;
          if (cc === 0) {
            const u = size / 3;
            for (let xx = 0; xx < size; xx += u) {
              for (let yy = 0; yy < size; yy += u) {
                ctx.fillRect(x + xx + u / 4, y + yy + u / 4, u / 2, u / 2);
              }
            }
          } else if (cc === 1) {
            ctx.fillRect(x, y, size / 2, size);
          } else if (cc === 2) {
            ctx.fillRect(x, y, size, size / 2);
          } else {
            ctx.fillRect(ox, oy, os, os);
          }
          break;
        }
        case 4: {
          const lh = Math.max(1, size / 6);
          for (let j = lh; j < size; j += lh * 2) {
            ctx.fillRect(ox, y + j, os, lh);
          }
          break;
        }
        case 5: {
          const band = size / blockStripes;
          const sh = Math.max(1, band / 2);
          for (let i = 0; i < blockStripes; i++) {
            ctx.fillRect(ox, y + i * band + (band - sh) / 2, os, sh);
          }
          break;
        }
        default: {
          ctx.fillRect(ox, oy, os, os);
        }
      }
    }
  }

  function resizeBlockGrid() {
    if (!blockCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    blockCanvas.width = Math.round(w * dpr);
    blockCanvas.height = Math.round(h * dpr);
    blockCanvas.style.width = w + 'px';
    blockCanvas.style.height = h + 'px';
    blockSize = Math.ceil(blockCanvas.width / BLOCK_DENSITY);
    blockCols = Math.ceil(blockCanvas.width / blockSize);
    blockRows = Math.ceil(blockCanvas.height / blockSize);
    initBlocks();
  }

  function initBlocks() {
    blocks = [];
    for (let r = 0; r < blockRows; r++) {
      for (let c = 0; c < blockCols; c++) {
        const b = new Block(c, r, blockStyle);
        b.colorIndex = colorIndexAt(c, r);
        blocks.push(b);
      }
    }
  }

  function advanceBlockStyle() {
    let newStyle;
    do {
      newStyle = Math.floor(Math.random() * BLOCK_STYLE_COUNT);
    } while (newStyle === blockStyle);
    blockStyle = newStyle;
    blockStripes = 4 + Math.floor(Math.random() * 4);
    styleCooldown = 120;
  }

  function updateBlocks() {
    blockFrameCount++;
    styleCooldown = Math.max(0, styleCooldown - 1);
    styleFrameCount++;

    if (blockFrameCount % 600 === 0) {
      const idx = (Math.floor(blockFrameCount / 600) + 3) % PALETTES.length;
      currentPalette = PALETTES[idx];
    }

    if (styleFrameCount >= STYLE_CYCLE_FRAMES && styleCooldown === 0) {
      advanceBlockStyle();
      styleFrameCount = 0;
    }

    if (audioAnalysisReady && analyser && frequencyData) {
      const audio = document.getElementById('player');
      if (audio && audio.paused) {
        scrollSpeed = 0;
        bassSmoothed *= 0.95;
        return;
      }
      analyser.getByteFrequencyData(frequencyData);
      const bassEnd = 12;
      let bassSum = 0;
      for (let i = 0; i < bassEnd; i++) {
        bassSum += frequencyData[i];
      }
      const bassEnergy = bassSum / (bassEnd * 255);
      bassSmoothed = bassSmoothed * 0.7 + bassEnergy * 0.3;

      if (bassSmoothed > 0.12) {
        scrollSpeed = Math.min(6, 1 + bassSmoothed * 20);
      } else {
        scrollSpeed = 0;
      }

      glitchIntensity = Math.min(0.35, Math.max(0, (bassSmoothed - 0.06) * 2.0));

      if (bassEnergy > 0.18 && styleCooldown === 0) {
        advanceBlockStyle();
        styleFrameCount = 0;
      }
    }
  }

  function textRowsForTrack(trackIndex) {
    const track = playlist?.tracks?.[trackIndex] || {};
    const kind = track.kind || 'song';
    const isOpening = track.type === 'dj_announce';

    if (isOpening) {
      const text = [
        playlist?.djName,
        '',
        track.script || track.caption,
      ].filter(s => s !== undefined && s !== '').join('\n\n');
      return { rows: [{ startRow: 4, text, size: 'large' }] };
    }

    if (kind === 'voiceover') {
      const text = [track.caption || '—'].filter(s => s !== '').join('\n\n');
      return { rows: [{ startRow: 4, text, size: 'medium' }] };
    }

    const artistTitle = [track.artist, track.title].filter(Boolean).join(' — ') || track.caption || track.file || '';
    const meta = [`${track.bpm || '---'} BPM`, track.key || '', '0321.9 KHZ'].filter(Boolean).join(' / ');
    const text = [artistTitle, '', meta].filter(s => s !== '').join('\n\n');
    return { rows: [{ startRow: 4, text, size: 'medium' }] };
  }

  function wrapTextForCanvas(ctx, text, maxWidth) {
    const paragraphs = text.split(/\n\n+/);
    const lines = [];
    for (let pi = 0; pi < paragraphs.length; pi++) {
      if (pi > 0 && lines.length) lines.push('');
      const words = paragraphs[pi].trim().split(/\s+/);
      if (!words[0]) continue;
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
    }
    return lines.length ? lines : [text];
  }

  function renderBlockText(ctx, w, h) {
    const rows = textRowsForTrack(currentTrack);
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const leftPad = blockSize * 5;
    const maxTextWidth = w * 2 / 3;
    const totalH = blockRows * blockSize;
    const lineH = blockSize * 0.6;

    for (const def of rows.rows) {
      const text = def.text;
      if (!text) continue;

      if (def.size === 'small') {
        ctx.font = `${Math.min(blockSize * 0.75, 16) * .96}px "IBM Plex Mono", "Courier New", monospace`;
      } else if (def.size === 'medium') {
        ctx.font = `${Math.min(blockSize * 1.3, 32) * .96}px "IBM Plex Mono", "Courier New", monospace`;
      } else {
        ctx.font = `${Math.min(blockSize * 1.8, 40) * .96}px "IBM Plex Mono", "Courier New", monospace`;
      }

      const wrapped = wrapTextForCanvas(ctx, text, maxTextWidth - leftPad);
      if (!wrapped.length) continue;

      let topY = ((def.startRow - 1) * blockSize - scrollOffset) % totalH;
      if (topY < 0) topY += totalH;
      ctx.fillStyle = blockBg;
      ctx.fillRect(0, Math.round(topY), w, blockSize + 1);

      const bottomStart = def.startRow * blockSize + wrapped.length * lineH;
      let bottomY = (bottomStart - scrollOffset) % totalH;
      if (bottomY < 0) bottomY += totalH;
      ctx.fillStyle = blockBg;
      ctx.fillRect(0, Math.round(bottomY), w, blockSize + 1);

      for (let li = 0; li < wrapped.length; li++) {
        const lineY = def.startRow * blockSize + li * lineH - scrollOffset;
        let rowCenterY = (lineY + lineH * 0.5) % totalH;
        if (rowCenterY < 0) rowCenterY += totalH;
        if (rowCenterY < -lineH || rowCenterY > h + lineH) continue;
        ctx.fillStyle = blockBg;
        ctx.fillRect(0, Math.round(rowCenterY - lineH * 0.5), w, Math.ceil(lineH) + 1);
        if (wrapped[li]) {
          ctx.fillStyle = blockInk;
          ctx.fillText(wrapped[li], leftPad, rowCenterY);
        }
      }
    }
    ctx.restore();
  }

  function renderBlockOverlay(ctx, w, h) {
    glitchFrame++;

    if (glitchIntensity <= 0.005) return;
    if (glitchFrame % 45 !== 0) return;

    if (!glitchCanvas) {
      glitchCanvas = document.createElement('canvas');
    }
    const needResize = glitchCanvas.width !== w || glitchCanvas.height !== h;
    if (needResize) {
      glitchCanvas.width = w;
      glitchCanvas.height = h;
    }
    const gctx = glitchCanvas.getContext('2d');
    gctx.drawImage(blockCanvas, 0, 0);

    const prob = glitchIntensity * 0.6;
    if (Math.random() >= prob) return;

    const bands = 1 + Math.floor(Math.random() * 2);
    for (let b = 0; b < bands; b++) {
      const bandY = Math.random() * h;
      const bandH = Math.max(2, h * (0.01 + Math.random() * 0.04));
      const maxShift = Math.min(20, 3 + glitchIntensity * 15);
      const shift = (Math.random() - 0.5) * maxShift;
      ctx.drawImage(glitchCanvas, 0, bandY, w, bandH, shift, bandY, w, bandH);
    }

    if (Math.random() < 0.04) {
      const jitter = (Math.random() - 0.5) * 3;
      ctx.drawImage(glitchCanvas, jitter, 0);
    }
  }

  function renderBlocks() {
    const ctx = blockCtx;
    const w = blockCanvas.width;
    const h = blockCanvas.height;
    ctx.fillStyle = blockBg;
    ctx.fillRect(0, 0, w, h);

    const totalH = blockRows * blockSize;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      let y = (b.row * blockSize - scrollOffset) % totalH;
      if (y < 0) y += totalH;
      if (y < -blockSize || y > h + blockSize) continue;

      if (y < h * 0.15 && b.style !== blockStyle) {
        b.style = blockStyle;
      }
      b.draw(ctx, Math.round(b.col * blockSize), Math.round(y), blockSize);
    }

    renderBlockText(ctx, w, h);
    renderBlockOverlay(ctx, w, h);
    canvasFilters.apply(ctx, w, h, blockFrameCount);
  }

  function startBlockLoop() {
    function frame() {
      scrollOffset += scrollSpeed;
      updateBlocks();
      renderBlocks();

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
          const t = blockFrameCount / 9;
          amp = 0.18 + 0.14 * Math.abs(Math.sin(t)) + Math.random() * 0.06;
        }
        feedWave(amp);
      }
      drawWave();

      blockAnimId = requestAnimationFrame(frame);
    }
    blockAnimId = requestAnimationFrame(frame);
  }

  function initBlockEngine() {
    blockCanvas = document.getElementById('block-canvas');
    if (!blockCanvas) return;
    blockCtx = blockCanvas.getContext('2d', { alpha: true });
    blockColorMult = 5 + Math.floor(Math.random() * 30);
    blockStyle = Math.floor(Math.random() * BLOCK_STYLE_COUNT);
    blockStripes = 4 + Math.floor(Math.random() * 4);
    currentPalette = PALETTES[SESSION_SEED % PALETTES.length];
    blockBg = TOPBAR_COLOR;
    blockInk = isColorLight(blockBg.slice(1)) ? '#000000' : '#ffffff';
    resizeBlockGrid();
    window.addEventListener('resize', resizeBlockGrid);
    startBlockLoop();
  }

  function start() {
    const blockCanvasEl = document.getElementById('block-canvas');
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (blockCanvasEl) blockCanvasEl.style.display = 'block';
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    initBlockEngine();
  }

  function stop() {
    if (blockAnimId) {
      cancelAnimationFrame(blockAnimId);
      blockAnimId = null;
    }
    window.removeEventListener('resize', resizeBlockGrid);

    const blockCanvasEl = document.getElementById('block-canvas');
    if (blockCanvasEl) blockCanvasEl.style.display = 'none';
  }

  function onEvent(event) {
    if (event === 'trackChange') {
      cyclePalette(currentTrack);
    }
  }

  return { name: 'Generative Blocks', start, stop, onEvent };
})());
