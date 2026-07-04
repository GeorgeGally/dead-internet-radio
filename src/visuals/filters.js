'use strict';

const canvasFilters = (() => {
  const registry = new Map();
  let activeKeys = new Set();

  const COVERS = {
    1: { side: 'A', track: 1, colors: ['#3a3a3a', '#c8c8c8'], pattern: 'bars-h' },
    2: { side: 'A', track: 2, colors: ['#7a4a2e', '#d4a06a'], pattern: 'circles' },
    3: { side: 'A', track: 3, colors: ['#2e5a3a', '#8abc8a'], pattern: 'noise' },
    4: { side: 'A', track: 4, colors: ['#1a3a5a', '#e06060', '#60c0e0'], pattern: 'rgb' },
    5: { side: 'B', track: 1, colors: ['#1a2a4a', '#6a8aba'], pattern: 'bars-v' },
    6: { side: 'B', track: 2, colors: ['#c04040', '#f0c040', '#40a040'], pattern: 'blocks' },
    7: { side: 'B', track: 3, colors: ['#103030', '#40a0a0'], pattern: 'grid' },
    8: { side: 'B', track: 4, colors: ['#eeeeee', '#111111'], pattern: 'negate' },
    9: { side: 'B', track: 5, colors: ['#1a0a00', '#e08030'], pattern: 'dots' },
  };

  function coverStyles(key, w, h) {
    const c = COVERS[key] || COVERS[1];
    const [c1, c2, c3] = c.colors;
    switch (c.pattern) {
      case 'bars-h':
        return `repeating-linear-gradient(0deg, ${c1} 0px, ${c1} 8px, ${c2} 8px, ${c2} 16px)`;
      case 'bars-v':
        return `repeating-linear-gradient(90deg, ${c1} 0px, ${c1} 8px, ${c2} 8px, ${c2} 16px)`;
      case 'circles':
        return `radial-gradient(circle at 30% 30%, ${c2} 0%, ${c1} 50%, ${c2} 100%)`;
      case 'noise':
        return `repeating-conic-gradient(${c1} 0% 25%, ${c2} 25% 50%)`;
      case 'rgb':
        return `linear-gradient(135deg, ${c1}, ${c2}, ${c3})`;
      case 'blocks':
        return `repeating-linear-gradient(45deg, ${c1} 0px, ${c1} 20px, ${c2} 20px, ${c2} 40px, ${c3} 40px, ${c3} 60px)`;
      case 'grid':
        return `repeating-linear-gradient(0deg, ${c1} 0px, ${c1} 2px, transparent 2px, transparent 20px), repeating-linear-gradient(90deg, ${c1} 0px, ${c1} 2px, transparent 2px, transparent 20px)`;
      case 'negate':
        return `linear-gradient(45deg, ${c1} 25%, ${c2} 25%, ${c2} 50%, ${c1} 50%, ${c1} 75%, ${c2} 75%)`;
      case 'dots':
        return `radial-gradient(${c2} 1px, transparent 1px) 0 0 / 8px 8px, radial-gradient(${c2} 2px, transparent 2px) 4px 4px / 16px 16px, linear-gradient(${c1}, ${c1})`;
      default:
        return `linear-gradient(135deg, ${c1}, ${c2})`;
    }
  }

  function register(key, name, fn) {
    registry.set(key, { name, fn });
  }

  // Fired whenever the active filter set changes (keyboard, gallery, or api),
  // so the shader pipeline can start/stop its loop instead of running always.
  let onFilterChange = null;
  function setOnFilterChange(cb) {
    onFilterChange = cb;
  }
  function notifyChange() {
    if (onFilterChange) onFilterChange();
  }

  function setActive(key) {
    activeKeys = new Set([key]);
    notifyChange();
  }

  function toggleActive(key) {
    if (activeKeys.has(key)) {
      activeKeys.delete(key);
    } else {
      activeKeys.add(key);
    }
    notifyChange();
  }

  function clearActive() {
    activeKeys = new Set();
    notifyChange();
  }

  // Keys handled by the GPU shader pipeline (fx.js) — CPU apply skips these so
  // there's no double-filtering during the shader migration.
  let shaderKeys = new Set();
  function setShaderKeys(keys) {
    shaderKeys = new Set(keys);
  }

  function apply(ctx, w, h, frame) {
    if (!activeKeys.size) return;
    const sorted = [...activeKeys].sort((a, b) => a - b);
    for (const key of sorted) {
      if (shaderKeys.has(key)) continue;
      const filter = registry.get(key);
      if (filter) filter.fn(ctx, w, h, frame);
    }
  }

  // For visuals that can't be filtered in place (WebGL canvases have no 2D
  // context): sample the source canvas onto the full-screen overlay canvas
  // and run the filters there. Overlay is only shown when a filter is active.
  let overlayEl = null;
  let overlayCtx = null;
  function applyToOverlay(source, frame) {
    if (!source) return;
    if (!overlayEl) {
      overlayEl = document.getElementById('overlay-canvas');
      overlayCtx = overlayEl ? overlayEl.getContext('2d', { willReadFrequently: true }) : null;
    }
    if (!overlayEl || !overlayCtx) return;
    // Only CPU-handled filters need the overlay; shader keys are drawn by fx.js.
    const cpuActive = [...activeKeys].some(k => !shaderKeys.has(k));
    if (!cpuActive) {
      // Hide AND wipe the buffer so a stale filter frame can't flash back.
      if (overlayEl.style.display !== 'none') {
        overlayEl.style.display = 'none';
        overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
        overlayCtx.clearRect(0, 0, overlayEl.width, overlayEl.height);
      }
      return;
    }
    if (overlayEl.width !== source.width || overlayEl.height !== source.height) {
      overlayEl.width = source.width;
      overlayEl.height = source.height;
    }
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    overlayCtx.clearRect(0, 0, overlayEl.width, overlayEl.height);
    try {
      overlayCtx.drawImage(source, 0, 0, overlayEl.width, overlayEl.height);
    } catch (e) {
      return;
    }
    if (overlayEl.style.display === 'none') overlayEl.style.display = 'block';
    apply(overlayCtx, overlayEl.width, overlayEl.height, frame);
  }

  function getActiveName() {
    if (!activeKeys.size) return 'none';
    const names = [...activeKeys].map(k => {
      const filter = registry.get(k);
      return filter ? filter.name : '';
    }).filter(Boolean);
    return names.join(' + ') || 'none';
  }

  function getActiveKeys() {
    return new Set(activeKeys);
  }

  function hasActiveKey(key) {
    return activeKeys.has(key);
  }

  function getFilter(key) {
    return registry.get(key) || null;
  }

  function getCoverInfo(key) {
    const c = COVERS[key];
    if (!c) return null;
    return { side: `${c.side}${c.track}`, name: registry.get(key)?.name || '', colors: c.colors, pattern: c.pattern };
  }

  function getAllCoverInfo() {
    const info = [];
    for (const [key, c] of Object.entries(COVERS)) {
      const n = registry.get(parseInt(key))?.name || '';
      info.push({ key: parseInt(key), side: `${c.side}${c.track}`, name: n, colors: c.colors, pattern: c.pattern });
    }
    return info;
  }

  function setupKeybindings() {
    window.addEventListener('keydown', (e) => {
      if (e.key === '0') {
        e.preventDefault();
        clearActive();
        return;
      }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const filter = registry.get(num);
        if (filter) {
          e.preventDefault();
          if (e.shiftKey) {
            toggleActive(num);
          } else {
            setActive(num);
          }
        }
      }
    });
  }

  register(1, 'Scanlines', (ctx, w, h, frame) => {
    const spacing = Math.max(3, Math.round(currentThreshold / 5));
    const alpha = Math.min(0.65, 0.15 + currentThreshold / 400);
    ctx.save();
    const offset = (frame * 0.5) % spacing;
    for (let y = -spacing + offset; y < h + spacing; y += spacing) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, y, w, spacing * 0.8);
    }
    ctx.restore();
    ctx.save();
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });

  register(2, 'Circle Sampling', (ctx, w, h, frame) => {
    const block = Math.max(6, Math.round(currentThreshold / 2));
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += block) {
      for (let x = 0; x < w; x += block) {
        const i = (Math.round(y) * w + Math.round(x)) * 4;
        if (i >= data.length - 4) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r + g + b < 15) continue;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(x + block / 2, y + block / 2, block * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  });

  register(3, 'Static Noise', (ctx, w, h, frame) => {
    const intensity = Math.max(10, currentThreshold);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.floor(Math.random() * intensity * 0.5);
      const a = 10 + Math.floor(Math.random() * intensity * 0.3);
      const blend = a / 255;
      data[i] = data[i] * (1 - blend) + v * blend;
      data[i + 1] = data[i + 1] * (1 - blend) + v * blend;
      data[i + 2] = data[i + 2] * (1 - blend) + v * blend;
    }
    ctx.putImageData(imageData, 0, 0);
  });

  register(4, 'Chromatic Aberration', (ctx, w, h, frame) => {
    const shift = Math.max(1, Math.round(currentThreshold / 20)) + Math.sin(frame * 0.02) * 2;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const temp = ctx.getImageData(0, 0, w, h);
    const src = temp.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * w + x) * 4;
        const ri = (y * w + Math.min(w - 1, Math.max(0, x + Math.round(shift)))) * 4;
        const bi = (y * w + Math.min(w - 1, Math.max(0, x - Math.round(shift)))) * 4;
        if (ri >= data.length - 4 || bi >= data.length - 4) continue;
        data[si] = src[ri];
        data[si + 1] = src[si + 1];
        data[si + 2] = src[bi + 2];
      }
    }
    ctx.putImageData(imageData, 0, 0);
  });

  register(5, 'VHS Tracking', (ctx, w, h, frame) => {
    const bandH = Math.max(2, Math.round(currentThreshold / 15)) + Math.floor(Math.sin(frame * 0.003) * 3);
    const offset = (frame * 0.7) % (h + bandH);
    ctx.save();
    for (let y = -bandH + offset; y < h + bandH; y += bandH * 2 + Math.sin(frame * 0.01 + y * 0.01) * 2) {
      const bw = w * (0.5 + Math.sin(frame * 0.005 + y * 0.02) * 0.3);
      const bx = (w - bw) / 2;
      ctx.globalAlpha = Math.min(0.25, 0.04 + Math.sin(frame * 0.01 + y) * 0.03 + currentThreshold / 2000);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, y, bw, bandH);
    }
    ctx.restore();
  });

  register(6, 'Posterize', (ctx, w, h, frame) => {
    const levels = Math.max(2, Math.round((255 - currentThreshold) / 40) + 2);
    const step = 255 / (levels - 1);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i] / step) * step;
      data[i + 1] = Math.round(data[i + 1] / step) * step;
      data[i + 2] = Math.round(data[i + 2] / step) * step;
    }
    ctx.putImageData(imageData, 0, 0);
  });

  register(7, 'Pixelate', (ctx, w, h, frame) => {
    const block = Math.max(4, Math.round(currentThreshold / 3));
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += block) {
      for (let x = 0; x < w; x += block) {
        const i = (Math.round(y) * w + Math.round(x)) * 4;
        if (i >= data.length - 4) continue;
        ctx.fillStyle = `rgb(${data[i]},${data[i+1]},${data[i+2]})`;
        ctx.fillRect(x, y, block + 1, block + 1);
      }
    }
    ctx.restore();
  });

  register(8, 'Color Invert', (ctx, w, h, frame) => {
    const src = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const s = src.data;
    const d = out.data;
    for (let i = 0; i < s.length; i += 4) {
      d[i] = 255 - s[i];
      d[i + 1] = 255 - s[i + 1];
      d[i + 2] = 255 - s[i + 2];
      d[i + 3] = s[i + 3];
    }
    ctx.putImageData(out, 0, 0);
  });

  let currentThreshold = 40;
  window.ledThreshold = currentThreshold;

  function setThreshold(val) {
    currentThreshold = val;
    window.ledThreshold = val;
  }

  register(9, 'LED Grid', (ctx, w, h, frame) => {
    const sz = 16;
    const stripeSz = 24;
    const threshold = currentThreshold;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgb(40, 28, 28)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < w; x += stripeSz) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += stripeSz) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < h; y += sz) {
      for (let x = 0; x < w; x += sz) {
        const idx = (Math.round(y) * w + Math.round(x)) * 4;
        if (idx >= data.length - 4) continue;
        const c = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const level = (c - threshold) / (255 - threshold);
        if (level > 0) {
          const alpha = Math.min(1, level * 1.5);
          ctx.globalAlpha = alpha;
          ctx.fillRect(x, y, sz - 1, sz - 1);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  });

  return { register, setActive, toggleActive, clearActive, apply, applyToOverlay, setShaderKeys, setOnFilterChange, getActiveName, getActiveKeys, hasActiveKey, getFilter, setupKeybindings, getCoverInfo, getAllCoverInfo, coverStyles, COVERS, setThreshold };
})();

canvasFilters.setupKeybindings();
