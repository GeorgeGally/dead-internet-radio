'use strict';

const gallery = (() => {
  // Baseline filter/cutoff/resonance every user sees on an artwork before
  // they've customized it themselves this session.
  const DEFAULT_PRESETS = {
    bouncy: { filters: [6], cutoff: 110, resonance: 60 },
    branches: { filters: [1], cutoff: 90, resonance: 40 },
    bubbles: { filters: [2], cutoff: 140, resonance: 55 },
    bugs3: { filters: [3], cutoff: 70, resonance: 50 },
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
    word_sparks: { filters: [4], cutoff: 90, resonance: 55 },
    rising_triangles: { filters: [6], cutoff: 120, resonance: 60 },
    pulsing_squares: { filters: [1], cutoff: 100, resonance: 45 },
    grid: { filters: [1], cutoff: 100, resonance: 45 },
    trail: { filters: [4], cutoff: 140, resonance: 60 },
    sound_investigation1: { filters: [5], cutoff: 130, resonance: 75 },
    particle_machine: { filters: [7], cutoff: 110, resonance: 50 },
    self_avoiding_walk_3d: { filters: [1], cutoff: 120, resonance: 45 },
    bonk: { filters: [6], cutoff: 130, resonance: 50 },
    sound_investigation2: { filters: [5], cutoff: 145, resonance: 80 },
    wall_drawing_26: { filters: [6], cutoff: 95, resonance: 40 },
    twirlz: { filters: [2], cutoff: 150, resonance: 65 },
  };

  let panel = null;
  let grid = null;
  let gridRows = [];
  let fxStrip = null;
  let isOpen = false;
  let wasExpanded = false;
  const presets = {};
  let _suppressSave = false;

  // Per-artwork slot presets (slots 1-9, slot 0 = live state)
  let artPresets = {};
  let activeSlot = 0;
  // A saved slot stops being "the saved look" the moment a control moves.
  let slotDirty = false;
  let saveLit = false;

  function loadArtPresets() {
    try {
      const raw = localStorage.getItem('visual-slot-presets');
      if (raw) artPresets = JSON.parse(raw);
    } catch (e) {}
  }
  loadArtPresets();

  function saveArtPresets() {
    try {
      localStorage.setItem('visual-slot-presets', JSON.stringify(artPresets));
    } catch (e) {}
  }

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
    let dragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;
    let moved = false;

    el.addEventListener('mousemove', (e) => {
      if (dragging) {
        if (Math.abs(e.clientX - dragStartX) > 3) moved = true;
        el.scrollLeft = dragStartScroll - (e.clientX - dragStartX);
        return;
      }
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const norm = (x / rect.width) * 2 - 1;
      speed = Math.abs(norm) > 0.15 ? Math.pow(Math.abs(norm), 3) * Math.sign(norm) * 40 : 0;
    });

    el.addEventListener('mousedown', (e) => {
      dragging = true;
      moved = false;
      dragStartX = e.clientX;
      dragStartScroll = el.scrollLeft;
      speed = 0;
    });

    el.addEventListener('mouseup', () => {
      dragging = false;
    });

    el.addEventListener('mouseleave', () => {
      speed = 0;
      dragging = false;
    });

    el.addEventListener('click', (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    }, true);

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      dragging = true;
      moved = false;
      dragStartX = e.touches[0].clientX;
      dragStartScroll = el.scrollLeft;
      speed = 0;
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const x = e.touches[0].clientX;
      if (Math.abs(x - dragStartX) > 3) moved = true;
      el.scrollLeft = dragStartScroll - (x - dragStartX);
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchend', () => {
      dragging = false;
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

    const fxLabel = document.createElement('div');
    fxLabel.className = 'gallery-section-label';
    fxLabel.textContent = 'FX';
    panel.appendChild(fxLabel);

    fxStrip = buildFxStrip();
    panel.appendChild(fxStrip);

    const artLabel = document.createElement('div');
    artLabel.className = 'gallery-section-label gallery-section-label--art';
    artLabel.textContent = 'Artwork';
    panel.appendChild(artLabel);

    grid = document.createElement('div');
    grid.className = 'gallery-grid';
    panel.appendChild(grid);

    gridRows = [0, 1, 2].map(() => {
      const row = document.createElement('div');
      row.className = 'gallery-row';
      grid.appendChild(row);
      return row;
    });

    gridRows.forEach(setupMouseScroll);

    document.addEventListener('keydown', handleKeyDown);
  }

  // ---- FX strip: dry/wet, three slots, a filter dial and two parameter knobs ----
  // Click a slot's name to focus it; the filter dial turns through the filters
  // for the focused slot, and the two knobs set its parameters.
  function knobHtml(cls, label) {
    return `<span class="ctrl"><span class="led"></span><div class="rams-knob ${cls}"><div class="knob-body"><div class="knob-tick"></div></div></div><div class="knob-label">${label}</div></span>`;
  }

  // Drag up/down or scroll. A detented knob steps once per `detent` pixels.
  function bindKnob(el, { get, set, reset, detent }) {
    let dragging = false;
    let acc = 0;
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      acc = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (detent) {
        acc -= e.movementY;
        while (Math.abs(acc) >= detent) {
          set(get() + Math.sign(acc));
          acc -= Math.sign(acc) * detent;
        }
      } else {
        set(get() - e.movementY * 0.005);
      }
    });
    const end = () => { dragging = false; el.classList.remove('dragging'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      set(get() - Math.sign(e.deltaY) * (detent ? 1 : 0.03));
    }, { passive: false });
    if (reset) el.addEventListener('dblclick', reset);
  }

  const FX_KEYS = [null, ...canvasFilters.list().map((f) => f.key)];
  const fxName = (key) => (canvasFilters.list().find((f) => f.key === key) || {}).name || '';

  function buildFxStrip() {
    const el = document.createElement('div');
    el.className = 'fx-unit';
    el.innerHTML = `
      ${knobHtml('fx-wet', 'dry/wet')}
      <div class="fx-lcd">
        ${[0, 1, 2].map((i) => `<div class="fx-row" data-slot="${i}"><span class="fx-num">${i + 1}</span><span class="fx-name"></span><button class="fx-on" data-slot="${i}">off</button></div>`).join('')}
      </div>
      ${knobHtml('fx-pick', 'filter')}
      ${knobHtml('fx-p1', '')}
      ${knobHtml('fx-p2', '')}`;

    el.querySelectorAll('.fx-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        const i = Number(row.dataset.slot);
        if (e.target.closest('.fx-on')) {
          const s = canvasFilters.getSlots()[i];
          canvasFilters.setFocus(i);
          canvasFilters.setSlotOn(i, !s.on);
        } else {
          canvasFilters.setFocus(i);
        }
      });
    });

    const focused = () => canvasFilters.getSlots()[canvasFilters.getFocus()];
    bindKnob(el.querySelector('.fx-wet'), {
      get: () => canvasFilters.getWet(),
      set: (v) => canvasFilters.setWet(v),
      reset: () => canvasFilters.setWet(1),
    });
    bindKnob(el.querySelector('.fx-pick'), {
      detent: 14,
      get: () => FX_KEYS.indexOf(focused().key),
      set: (i) => {
        const f = canvasFilters.getFocus();
        const key = FX_KEYS[Math.max(0, Math.min(FX_KEYS.length - 1, i))];
        canvasFilters.setSlotFilter(f, key);
        // A filter dialled in starts playing; dialling back to nothing stops it.
        if (key != null) canvasFilters.setSlotOn(f, true);
      },
    });
    [0, 1].forEach((j) => {
      bindKnob(el.querySelector(`.fx-p${j + 1}`), {
        get: () => focused().p[j],
        set: (v) => canvasFilters.setParam(canvasFilters.getFocus(), j, v),
        reset: () => {
          const f = canvasFilters.list().find((x) => x.key === focused().key);
          if (f) canvasFilters.setParam(canvasFilters.getFocus(), j, canvasFilters.FILTERS.find((x) => x.key === f.key).params[j][1]);
        },
      });
    });

    canvasFilters.subscribe(() => updateFxStrip(el));
    updateFxStrip(el);
    return el;
  }

  function turn(el, frac) {
    el.querySelector('.knob-tick').style.transform = `rotate(${frac * 300 - 150}deg)`;
  }

  function updateFxStrip(el) {
    const slots = canvasFilters.getSlots();
    const focus = canvasFilters.getFocus();
    el.querySelectorAll('.fx-row').forEach((row, i) => {
      const s = slots[i];
      row.classList.toggle('focus', i === focus);
      row.classList.toggle('on', s.on);
      row.querySelector('.fx-name').textContent = s.key == null ? '\u2014' : fxName(s.key);
      const btn = row.querySelector('.fx-on');
      btn.textContent = s.on ? 'on' : 'off';
      btn.disabled = s.key == null;
    });
    const s = slots[focus];
    const info = canvasFilters.list().find((f) => f.key === s.key);
    const ctrl = (cls) => el.querySelector(`.${cls}`).closest('.ctrl');
    turn(el.querySelector('.fx-wet'), canvasFilters.getWet());
    ctrl('fx-wet').querySelector('.led').classList.toggle('on', slots.some((x) => x.on));
    turn(el.querySelector('.fx-pick'), FX_KEYS.indexOf(s.key) / (FX_KEYS.length - 1));
    ctrl('fx-pick').querySelector('.led').classList.toggle('on', s.on);
    [0, 1].forEach((j) => {
      const c = ctrl(`fx-p${j + 1}`);
      turn(c.querySelector('.rams-knob'), s.p[j]);
      c.querySelector('.knob-label').textContent = info ? info.params[j] : '\u2014';
      c.classList.toggle('idle', !info);
      c.querySelector('.led').classList.toggle('on', s.on);
    });
  }

  // Saved looks keep the whole FX unit. Older saves held one filter key.
  function fxOf(p) {
    if (p.fx) return p.fx;
    const k = (p.filters || [])[0];
    return { slots: [[k ?? null, k != null]], focus: 0 };
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
      // Fixed screenshot per artwork: bin/capture-thumbnails.mjs <id>
      art.style.backgroundImage = `url(visuals/thumbs/${item.id}.jpg)`;
      art.style.backgroundSize = 'cover';
      art.style.backgroundPosition = 'center';
      art.dataset.thumbnail = 'true';

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
        visuals.resetTimer(item.id);
        close();
      });

      gridRows[i % gridRows.length].appendChild(card);
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    build();
    gridRows.forEach((row) => { row.innerHTML = ''; });
    buildGrid();
    const deck = document.getElementById('deck');
    deck.classList.remove('closing');
    deck.classList.add('ejected', 'expanded');
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
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
    if (_suppressSave || !id || activeSlot > 0) return;
    presets[id] = {
      fx: canvasFilters.getState(),
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
    canvasFilters.setState(fxOf(p));
    if (window._restoreCutoff) window._restoreCutoff(p.cutoff);
    if (window._restoreResonance) window._restoreResonance(p.resonance);
    if (window._restoreStrength) window._restoreStrength(p.strength != null ? p.strength : 100);
    _suppressSave = false;
  }

  function saveCurrentPreset() {
    markAltered();
    savePreset(visuals.getCurrentId());
  }

  // Any dial, filter or strength move: the slot light goes out and the save
  // light clears until the user saves again.
  function markAltered() {
    if (_suppressSave) return;
    if (activeSlot > 0) slotDirty = true;
    saveLit = false;
    updateSlotUI();
  }

  function getActiveSlot() {
    return activeSlot;
  }

  function saveSlot(slot) {
    const id = visuals.getCurrentId();
    if (!id || slot < 1 || slot > 9) return;
    if (!artPresets[id]) artPresets[id] = {};
    artPresets[id][slot] = {
      fx: canvasFilters.getState(),
      cutoff: window._cutoffVal != null ? window._cutoffVal : 130,
      resonance: window._resonanceVal != null ? window._resonanceVal : 50,
      strength: window._filterStrengthVal != null ? window._filterStrengthVal : 100,
    };
    saveArtPresets();
    slotDirty = false;
    saveLit = true;
    updateSlotUI();
    const el = document.getElementById('visual-notification');
    if (el) {
      el.textContent = `Slot ${slot} saved`;
      el.classList.add('visible');
      clearTimeout(el._hideTimer);
      el._hideTimer = setTimeout(() => el.classList.remove('visible'), 1500);
    }
  }

  function loadSlot(id, slot) {
    if (slot < 1 || slot > 9) return;
    slotDirty = false;
    const p = artPresets[id] && artPresets[id][slot];
    // Landing on a saved slot lights both: the slot and its save.
    saveLit = !!p;
    if (!p) { updateSlotUI(); return; }
    _suppressSave = true;
    canvasFilters.setState(fxOf(p));
    if (window._restoreCutoff) window._restoreCutoff(p.cutoff);
    if (window._restoreResonance) window._restoreResonance(p.resonance);
    if (window._restoreStrength) window._restoreStrength(p.strength != null ? p.strength : 100);
    _suppressSave = false;
    updateSlotUI();
  }

  // Point the dial at a slot without loading it (used when saving into it).
  function selectSlot(slot) {
    if (slot < 0 || slot > 9) return;
    activeSlot = slot;
    updateSlotUI();
  }

  function slotHasPreset(id, slot) {
    return !!(artPresets[id] && artPresets[id][slot]);
  }

  function nextSlot(step) {
    step = step || 1;
    const target = activeSlot + step;
    if (target < 0 || target > 9) return;
    activeSlot = target;
    updateSlotUI();
    const id = visuals.getCurrentId();
    if (activeSlot > 0) {
      loadSlot(id, activeSlot);
    }
  }

  function resetSlot() {
    activeSlot = 0;
    slotDirty = false;
    saveLit = false;
    updateSlotUI();
  }

  // A new artwork lands on one of its saved slots, not always on slot 0, so the
  // same artwork returns looking different across switches.
  function applyRandomSlot(id) {
    id = id || visuals.getCurrentId();
    const saved = artPresets[id] || {};
    const slots = [];
    for (let s = 1; s <= 9; s++) if (saved[s]) slots.push(s);
    if (!slots.length) {
      resetSlot();
      return 0;
    }
    const pick = slots[Math.floor(Math.random() * slots.length)];
    activeSlot = pick;
    updateSlotUI();
    loadSlot(id, pick);
    return pick;
  }

  // Now and then the dial moves on its own to another saved slot of the
  // current artwork, at random times. It keeps its hands off while someone is
  // at the deck or the drawer is open.
  // Timing: every 20-75 s.
  let _lastTouch = 0;
  function driftSlot() {
    setTimeout(driftSlot, 20000 + Math.random() * 55000);
    if (isOpen || slotDirty || Date.now() - _lastTouch < 60000) return;
    const id = visuals.getCurrentId();
    const saved = artPresets[id] || {};
    const slots = [];
    for (let s = 1; s <= 9; s++) if (saved[s] && s !== activeSlot) slots.push(s);
    if (!slots.length) return;
    activeSlot = slots[Math.floor(Math.random() * slots.length)];
    updateSlotUI();
    loadSlot(id, activeSlot);
  }

  let _ticksCreated = false;

  function updateSlotUI() {
    const knob = document.getElementById('slot-knob');
    if (!knob) return;
    // Create tick marks on first call
    if (!_ticksCreated) {
      const c = document.createElement('div');
      c.className = 'slot-ticks';
      for (let i = 0; i < 10; i++) {
        const t = document.createElement('div');
        t.className = 'slot-tick';
        t.style.transform = `rotate(${-150 + i * 30}deg)`;
        c.appendChild(t);
      }
      knob.appendChild(c);
      _ticksCreated = true;
    }
    const tick = knob.querySelector('.knob-tick');
    if (tick) tick.style.transform = `rotate(${-150 + activeSlot * 30}deg)`;
    const id = visuals.getCurrentId();
    const el = document.getElementById('slot-led');
    if (el) el.classList.toggle('on', activeSlot > 0 && slotHasPreset(id, activeSlot) && !slotDirty);
    const sl = document.getElementById('save-slot-led');
    if (sl) sl.classList.toggle('on', saveLit);
  }

  function init() {
    const deckEl = document.getElementById('deck');
    if (deckEl) ['pointerdown', 'wheel', 'keydown'].forEach((ev) => deckEl.addEventListener(ev, () => { _lastTouch = Date.now(); }, { passive: true }));
    setTimeout(driftSlot, 20000 + Math.random() * 55000);
    document.addEventListener('keydown', (e) => {
      // Up and down turn the slot dial, like left and right step artworks.
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.metaKey && !e.ctrlKey && !e.altKey
        && !e.target.closest('input,textarea,select,[contenteditable]')) {
        e.preventDefault();
        _lastTouch = Date.now();
        nextSlot(e.key === 'ArrowUp' ? 1 : -1);
        return;
      }
      if ((e.key === 'g' || e.key === '/') && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea')) {
        e.preventDefault();
        toggle();
      }
    });
  }

  return { init, open, close, toggle, savePreset, loadPreset, saveCurrentPreset, saveSlot, loadSlot, nextSlot, selectSlot, resetSlot, applyRandomSlot, markAltered, getActiveSlot, slotHasPreset, updateSlotUI };
})();
