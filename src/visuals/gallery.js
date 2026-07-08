'use strict';

const gallery = (() => {
  const FILTER_NAMES = {
    1: 'Scanlines',
    2: 'Circle Sampling',
    3: 'Static Noise',
    4: 'Chromatic Aberration',
    5: 'VHS Tracking',
    6: 'Posterize',
    7: 'Pixelate',
    8: 'Color Invert',
    9: 'LED Grid',
  };

  // Baseline filter/cutoff/resonance every user sees on an artwork before
  // they've customized it themselves this session.
  const DEFAULT_PRESETS = {
    bouncy: { filters: [6], cutoff: 110, resonance: 60 },
    branches: { filters: [1], cutoff: 90, resonance: 40 },
    bubbles: { filters: [2], cutoff: 140, resonance: 55 },
    delayed_lerp_points2c: { filters: [4], cutoff: 120, resonance: 45 },
    blocks: { filters: [7], cutoff: 100, resonance: 50 },
    delayed_lerp_points7: { filters: [5], cutoff: 130, resonance: 50 },
    delayed_lerp_points7b: { filters: [5], cutoff: 150, resonance: 60 },
    delayed_lerp_points_1600: { filters: [3], cutoff: 80, resonance: 70 },
    cubes_token_sha: { filters: [4], cutoff: 160, resonance: 65 },
    delayed_lerp_points8: { filters: [2], cutoff: 125, resonance: 50 },
    isocubes: { filters: [6], cutoff: 100, resonance: 40 },
    giphy: { filters: [], cutoff: 130, resonance: 50 },
    four_dots: { filters: [9], cutoff: 60, resonance: 30 },
    patterns2: { filters: [6], cutoff: 140, resonance: 55 },
    led_grid: { filters: [9], cutoff: 50, resonance: 35 },
    particle_drawings: { filters: [3], cutoff: 70, resonance: 60 },
    grid: { filters: [1], cutoff: 100, resonance: 45 },
    trail: { filters: [4], cutoff: 140, resonance: 60 },
    sound_investigation1: { filters: [5], cutoff: 130, resonance: 75 },
    particle_machine: { filters: [7], cutoff: 110, resonance: 50 },
    self_avoiding_walk_3d: { filters: [1], cutoff: 120, resonance: 45 },
    sound_investigation2: { filters: [5], cutoff: 145, resonance: 80 },
    wall_drawing_26: { filters: [6], cutoff: 95, resonance: 40 },
    twirlz: { filters: [2], cutoff: 150, resonance: 65 },
  };

  let panel = null;
  let grid = null;
  let filterRow = null;
  let isOpen = false;
  let ledPreviewTimer = null;
  let wasExpanded = false;
  const presets = {};
  let _suppressSave = false;

  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function cardTint(id) {
    const hues = [0, 30, 60, 120, 180, 210, 240, 300];
    return hues[hashStr(id) % hues.length];
  }

  function cardPattern(id) {
    return hashStr(id) % 8;
  }

  function setupMouseScroll(el) {
    let raf = null;
    let speed = 0;

    el.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const norm = (x / rect.width) * 2 - 1;
      speed = Math.abs(norm) > 0.15 ? Math.pow(Math.abs(norm), 3) * Math.sign(norm) * 40 : 0;
    });

    el.addEventListener('mouseleave', () => {
      speed = 0;
    });

    function tick() {
      if (speed) {
        el.scrollLeft += speed;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  function build() {
    if (panel) return;

    const container = document.querySelector('.deck-gallery');
    if (!container) return;

    panel = container;

    const header = document.createElement('div');
    header.className = 'gallery-header';

    const title = document.createElement('span');
    title.className = 'gallery-title';
    title.textContent = 'Visuals';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'gallery-close';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', close);

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const filterLabel = document.createElement('div');
    filterLabel.className = 'gallery-section-label';
    filterLabel.textContent = 'Filters';
    panel.appendChild(filterLabel);

    filterRow = document.createElement('div');
    filterRow.className = 'gallery-filter-row';
    buildFilterRow();
    panel.appendChild(filterRow);

    const artLabel = document.createElement('div');
    artLabel.className = 'gallery-section-label gallery-section-label--art';
    artLabel.textContent = 'Artwork';
    panel.appendChild(artLabel);

    grid = document.createElement('div');
    grid.className = 'gallery-grid';
    panel.appendChild(grid);

    setupMouseScroll(filterRow);
    setupMouseScroll(grid);

    document.addEventListener('keydown', handleKeyDown);
  }

  function filterCoverBg(key) {
    switch (key) {
      case 1:
        return `repeating-linear-gradient(0deg, #e9e6df 0px, #e9e6df 30px, #1a1a1a 30px, #1a1a1a 38px, #e9e6df 38px, #e9e6df 42px, #1a1a1a 42px, #1a1a1a 44px)`;
      case 2:
        return `radial-gradient(circle at 50% 50%, transparent 0%, transparent 13%, #c94814 13%, #c94814 14.5%, transparent 14.5%, transparent 30%, #c94814 30%, #c94814 31.5%, transparent 31.5%, transparent 46%, #c94814 46%, #c94814 47.5%, transparent 47.5%), linear-gradient(#e9e6df, #e9e6df)`;
      case 3:
        return `radial-gradient(#c94814 1px, transparent 1px) 0 0 / 8px 8px, linear-gradient(#1a1a1a, #1a1a1a)`;
      case 4:
        return `linear-gradient(rgba(220,60,60,0.7), rgba(220,60,60,0.7)) no-repeat 32% 50% / 36px 36px, linear-gradient(rgba(60,200,60,0.7), rgba(60,200,60,0.7)) no-repeat 50% 50% / 36px 36px, linear-gradient(rgba(60,100,220,0.7), rgba(60,100,220,0.7)) no-repeat 68% 50% / 36px 36px, linear-gradient(#1a1a1a, #1a1a1a)`;
      case 5:
        return `linear-gradient(#e9e6df, #e9e6df),` +
          `repeating-linear-gradient(90deg, #1a1a1a 0px, #1a1a1a 1.5px, transparent 1.5px, transparent 7px) no-repeat 0 20px / 100% 8px,` +
          `repeating-linear-gradient(90deg, #1a1a1a 0px, #1a1a1a 1.5px, transparent 1.5px, transparent 7px) no-repeat -10px 36px / 100% 8px,` +
          `repeating-linear-gradient(90deg, #c94814 0px, #c94814 1.5px, transparent 1.5px, transparent 7px) no-repeat 12px 52px / 100% 6px,` +
          `repeating-linear-gradient(90deg, #1a1a1a 0px, #1a1a1a 1.5px, transparent 1.5px, transparent 7px) no-repeat -16px 66px / 100% 8px,` +
          `repeating-linear-gradient(90deg, #1a1a1a 0px, #1a1a1a 1.5px, transparent 1.5px, transparent 7px) no-repeat 8px 82px / 100% 8px,` +
          `repeating-linear-gradient(90deg, #1a1a1a 0px, #1a1a1a 1.5px, transparent 1.5px, transparent 7px) no-repeat -6px 98px / 100% 8px`;
      case 6:
        return `linear-gradient(0deg, #111 0%, #111 25%, #555 25%, #555 50%, #999 50%, #999 75%, #ddd 75%, #ddd 100%)`;
      case 7:
        return `repeating-linear-gradient(0deg, #1a1a1a 0px, #1a1a1a 6px, transparent 6px, transparent 18px), repeating-linear-gradient(90deg, #1a1a1a 0px, #1a1a1a 6px, transparent 6px, transparent 18px), linear-gradient(#e9e6df, #e9e6df)`;
      case 8:
        return `linear-gradient(135deg, #111 0%, #111 50%, #ddd 50%, #ddd 100%)`;
      case 9:
        return `radial-gradient(#8a7a6a 1px, transparent 1px) 0 0 / 16px 16px, linear-gradient(#ece8e2, #ece8e2)`;
      default:
        return `#111`;
    }
  }

  function buildFilterRow() {
    const noneCard = document.createElement('button');
    noneCard.className = 'gallery-filter-card';
    noneCard.innerHTML = `
      <div class="gfc-pattern" style="background: #111;"></div>
      <div class="gfc-name">off</div>
    `;
    noneCard.dataset.filter = '';
    noneCard.addEventListener('click', () => {
      canvasFilters.clearActive();
      updateFilterRow();
      close();
    });
    filterRow.appendChild(noneCard);

    for (const [key, name] of Object.entries(FILTER_NAMES)) {
      const k = parseInt(key);
      const info = canvasFilters.getCoverInfo(k);
      const card = document.createElement('button');
      card.className = 'gallery-filter-card';
      const displayName = name.toLowerCase().split(' ').join('<br>');
      card.innerHTML = `
        <div class="gfc-pattern" style="background: ${filterCoverBg(k)};"></div>
        <div class="gfc-name">${displayName}</div>
      `;
      card.dataset.filter = String(key);
      if ([1, 2, 5, 7, 8, 9].includes(k)) {
        card.dataset.text = 'dark';
      }
      card.addEventListener('click', () => {
        canvasFilters.setActive(k);
        updateFilterRow();
        close();
      });
      filterRow.appendChild(card);
    }

    updateFilterRow();
  }

  function showFilterNotif() {
    const el = document.getElementById('visual-notification');
    if (el) {
      el.classList.add('visible');
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => el.classList.remove('visible'), 1500);
    }
  }

  function updateFilterRow() {
    if (!filterRow) return;
    const cards = filterRow.querySelectorAll('.gallery-filter-card');
    for (const card of cards) {
      const key = card.dataset.filter;
      if (key === '') {
        card.classList.toggle('active', canvasFilters.getActiveKeys().size === 0);
      } else {
        card.classList.toggle('active', canvasFilters.hasActiveKey(parseInt(key)));
      }
    }
  }

  function getTrackLabel() {
    if (typeof playlist !== 'undefined' && playlist && playlist.tracks && playlist.tracks[currentTrack]) {
      const t = playlist.tracks[currentTrack];
      return [t.artist, t.title].filter(Boolean).join(' \u2014 ') || t.caption || '';
    }
    return '';
  }

  function buildGrid() {
    const list = visuals.getList();
    const currentId = visuals.getCurrentId();
    const trackLabel = getTrackLabel();

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const card = document.createElement('button');
      card.className = 'gallery-card';
      card.dataset.id = item.id;
      card.dataset.pattern = cardPattern(item.id);
      card.style.setProperty('--card-hue', cardTint(item.id));

      const art = document.createElement('div');
      art.className = 'gallery-card-art';
      const thumb = visuals.getThumbnail(item.id);
      if (thumb) {
        art.style.backgroundImage = `url(${thumb})`;
        art.style.backgroundSize = 'cover';
        art.style.backgroundPosition = 'center';
        art.dataset.thumbnail = 'true';
      }

      const label = document.createElement('div');
      label.className = 'gallery-card-label';

      const nameLine = document.createElement('div');
      nameLine.className = 'gallery-card-name';
      nameLine.textContent = item.name;

      const trackLine = document.createElement('div');
      trackLine.className = 'gallery-card-track';
      trackLine.textContent = trackLabel;

      label.appendChild(nameLine);
      label.appendChild(trackLine);
      card.appendChild(art);
      card.appendChild(label);

      if (item.id === currentId) {
        card.classList.add('active');
      }

      card.style.animationDelay = `${i * 16}ms`;

      card.addEventListener('click', () => {
        visuals.activate(item.id);
        close();
      });

      grid.appendChild(card);
    }

    setupMouseScroll(grid);
  }

  function updateLedPreview() {
    const ledCard = filterRow.querySelector('[data-filter="9"]');
    if (!ledCard) return;
    const patternEl = ledCard.querySelector('.gfc-pattern');
    if (!patternEl) return;
    const t = window.ledThreshold || 40;
    const frac = t / 255;
    const dotBright = Math.max(30, 255 - Math.round(frac * 200));
    const bgBright = Math.max(5, Math.round(dotBright * 0.08));
    const dim = Math.round(frac * 6 + 1.5);
    const dot = `rgb(${dotBright}, ${Math.round(dotBright * 0.5)}, ${Math.round(dotBright * 0.1)})`;
    const bg = `rgb(${bgBright}, ${Math.round(bgBright * 0.35)}, ${Math.round(bgBright * 0.08)})`;
    const spc = Math.round(frac * 16 + 8);
    patternEl.style.background = `radial-gradient(${dot} ${dim}px, transparent ${dim}px) 0 0 / ${spc}px ${spc}px, linear-gradient(${bg}, ${bg})`;
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    build();
    grid.innerHTML = '';
    buildGrid();
    updateFilterRow();
    updateLedPreview();
    ledPreviewTimer = setInterval(updateLedPreview, 150);
    const deck = document.getElementById('deck');
    deck.classList.remove('closing');
    deck.classList.add('ejected', 'expanded');
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearInterval(ledPreviewTimer);
    ledPreviewTimer = null;
    const deck = document.getElementById('deck');
    deck.classList.add('closing');
    deck.dispatchEvent(new CustomEvent('galleryclose'));
    setTimeout(() => {
      deck.classList.remove('closing', 'ejected');
    }, 300);
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function handleKeyDown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function savePreset(id) {
    if (_suppressSave || !id) return;
    presets[id] = {
      filters: Array.from(canvasFilters.getActiveKeys()),
      cutoff: window._cutoffVal != null ? window._cutoffVal : 130,
      resonance: window._resonanceVal != null ? window._resonanceVal : 50,
      strength: window._filterStrengthVal != null ? window._filterStrengthVal : 100,
    };
  }

  function loadPreset(id) {
    if (!id) return;
    const p = presets[id] || DEFAULT_PRESETS[id];
    if (!p) return;
    _suppressSave = true;
    canvasFilters.clearActive();
    for (const key of p.filters) {
      canvasFilters.setActive(key);
    }
    updateFilterRow();
    if (window._restoreCutoff) window._restoreCutoff(p.cutoff);
    if (window._restoreResonance) window._restoreResonance(p.resonance);
    if (window._restoreStrength) window._restoreStrength(p.strength != null ? p.strength : 100);
    _suppressSave = false;
  }

  function saveCurrentPreset() {
    savePreset(visuals.getCurrentId());
  }

  function init() {
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'g' || e.key === '/') && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea')) {
        e.preventDefault();
        toggle();
      }
    });
  }

  return { init, open, close, toggle, savePreset, loadPreset, saveCurrentPreset };
})();