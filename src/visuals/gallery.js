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

  let panel = null;
  let backdrop = null;
  let grid = null;
  let filterRow = null;
  let isOpen = false;

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

  function build() {
    if (panel) return;

    backdrop = document.createElement('div');
    backdrop.className = 'gallery-backdrop';

    panel = document.createElement('div');
    panel.className = 'gallery-panel';

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

    filterRow = document.createElement('div');
    filterRow.className = 'gallery-filter-row';
    buildFilterRow();
    panel.appendChild(filterRow);

    grid = document.createElement('div');
    grid.className = 'gallery-grid';
    panel.appendChild(grid);

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);

    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', handleKeyDown);
  }

  function filterCoverBg(key) {
    const colors = canvasFilters.COVERS[key]?.colors || ['#333', '#666'];
    const pats = {
      bars_h: `repeating-linear-gradient(0deg, ${colors[0]} 0px, ${colors[0]} 4px, ${colors[1]} 4px, ${colors[1]} 8px)`,
      circles: `radial-gradient(circle at 30% 30%, ${colors[1]} 0%, ${colors[0]} 60%)`,
      noise: `repeating-conic-gradient(${colors[0]} 0% 25%, ${colors[1]} 25% 50%)`,
      rgb: `linear-gradient(135deg, ${colors[0]}, ${colors[1]}, ${colors[2] || colors[1]})`,
      blocks: `repeating-linear-gradient(45deg, ${colors[0]} 0px, ${colors[0]} 12px, ${colors[1]} 12px, ${colors[1]} 24px, ${colors[2] || colors[1]} 24px, ${colors[2] || colors[1]} 36px)`,
      grid: `repeating-linear-gradient(0deg, ${colors[0]} 0px, ${colors[0]} 1px, transparent 1px, transparent 12px), repeating-linear-gradient(90deg, ${colors[0]} 0px, ${colors[0]} 1px, transparent 1px, transparent 12px)`,
      negate: `linear-gradient(45deg, ${colors[0]} 25%, ${colors[1]} 25%, ${colors[1]} 50%, ${colors[0]} 50%, ${colors[0]} 75%, ${colors[1]} 75%)`,
      dots: `radial-gradient(${colors[1]} 1px, transparent 1px) 0 0 / 6px 6px, linear-gradient(${colors[0]}, ${colors[0]})`,
    };
    return pats[canvasFilters.COVERS[key]?.pattern] || `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
  }

  function buildFilterRow() {
    const noneCard = document.createElement('button');
    noneCard.className = 'gallery-filter-card';
    noneCard.innerHTML = `
      <div class="gfc-art"><div class="gfc-pattern" style="background: #111;"></div></div>
      <div class="gfc-name">off</div>
    `;
    noneCard.dataset.filter = '';
    noneCard.addEventListener('click', () => {
      canvasFilters.clearActive();
      updateFilterRow();
    });
    filterRow.appendChild(noneCard);

    for (const [key, name] of Object.entries(FILTER_NAMES)) {
      const k = parseInt(key);
      const info = canvasFilters.getCoverInfo(k);
      const card = document.createElement('button');
      card.className = 'gallery-filter-card';
      card.innerHTML = `
        <div class="gfc-art">
          <div class="gfc-pattern" style="background: ${filterCoverBg(k)};"></div>
          <div class="gfc-side">${info ? info.side : ''}</div>
        </div>
        <div class="gfc-name">${name.toLowerCase()}</div>
      `;
      card.dataset.filter = String(key);
      card.addEventListener('click', () => {
        canvasFilters.setActive(k);
        updateFilterRow();
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
    const active = canvasFilters.getActiveName();
    const cards = filterRow.querySelectorAll('.gallery-filter-card');
    for (const card of cards) {
      const key = card.dataset.filter;
      const isActive = key === '' ? active === 'none' : FILTER_NAMES[parseInt(key)] === active;
      card.classList.toggle('active', isActive);
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
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    build();
    grid.innerHTML = '';
    buildGrid();
    updateFilterRow();
    requestAnimationFrame(() => {
      panel.classList.add('open');
      backdrop.classList.add('visible');
    });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('open');
    backdrop.classList.remove('visible');
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

  function init() {}

  return { init, open, close, toggle };
})();
