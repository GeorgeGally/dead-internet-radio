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
  let wall = null;
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

  function build() {
    if (panel) return;

    const container = document.querySelector('.deck-gallery');
    if (!container) return;

    panel = container;

    wall = document.createElement('div');
    wall.className = 'gallery-wall';
    panel.appendChild(wall);
    addEventListener('resize', () => { if (isOpen) buildWall(); });

    document.addEventListener('keydown', handleKeyDown);
  }

  // ---- FX unit in the menubar: dry/wet, a four-row display, a filter dial
  // and two parameter knobs ----
  // Rows 1-3 are the filter slots, stacked bottom-up over the artwork row:
  // slot 1 is applied first. Click one to focus it, its box switches it on and
  // off, drag it onto another row to reorder. The filter dial turns through filters for the focused slot and
  // the two knobs set its parameters. Row A is the playing artwork: focused, the
  // dial is its sensitivity and the knobs its cutoff and resonance.
  let artFocus = false;

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
      const step = detent();
      if (step) {
        acc -= e.movementY;
        while (Math.abs(acc) >= step) {
          set(get() + Math.sign(acc));
          acc -= Math.sign(acc) * step;
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
      set(get() - Math.sign(e.deltaY) * (detent() ? 1 : 0.03));
    }, { passive: false });
    if (reset) el.addEventListener('dblclick', reset);
  }

  const FX_KEYS = [null, ...canvasFilters.list().map((f) => f.key)];
  const fxInfo = (key) => canvasFilters.list().find((f) => f.key === key);
  const ART_KNOBS = ['sensitivity', 'cutoff', 'resonance']; // filter dial, p1, p2

  function bindFxUnit() {
    const el = document.querySelector('.deck-content');
    if (!el || !el.querySelector('.fx-lcd')) return;

    // Drag a filter row onto another to reorder the stack. The artwork row
    // stays at the bottom; a plain click still focuses.
    let drag = null;
    const slotRows = [...el.querySelectorAll('.fx-row')].filter((r) => Number(r.dataset.slot) >= 0);
    const rowAt = (y) => slotRows.find((r) => { const b = r.getBoundingClientRect(); return y >= b.top && y < b.bottom; });
    slotRows.forEach((row) => {
      row.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.fx-on') || canvasFilters.getSlots()[Number(row.dataset.slot)].key == null) return;
        drag = { row, from: Number(row.dataset.slot), y: e.clientY, moved: false };
        try { row.setPointerCapture(e.pointerId); } catch (err) {}
      });
      row.addEventListener('pointermove', (e) => {
        if (!drag || drag.row !== row) return;
        if (!drag.moved && Math.abs(e.clientY - drag.y) < 4) return;
        drag.moved = true;
        row.classList.add('dragging');
        const over = rowAt(e.clientY);
        slotRows.forEach((r) => r.classList.toggle('drop', r === over && r !== row));
      });
      const end = (e) => {
        if (!drag || drag.row !== row) return;
        const d = drag;
        drag = null;
        row.classList.remove('dragging');
        slotRows.forEach((r) => r.classList.remove('drop'));
        if (!d.moved) return;
        const over = e && e.type === 'pointerup' ? rowAt(e.clientY) : null;
        if (over) {
          artFocus = false;
          canvasFilters.moveSlot(d.from, Number(over.dataset.slot));
        }
        // Swallow the click that follows this pointerup, but only that one.
        row._skipClick = true;
        setTimeout(() => { row._skipClick = false; }, 0);
      };
      row.addEventListener('pointerup', end);
      row.addEventListener('pointercancel', end);
    });

    el.querySelectorAll('.fx-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (row._skipClick) { row._skipClick = false; return; }
        const i = Number(row.dataset.slot);
        if (i < 0) {
          artFocus = true;
          updateFxUnit(el);
          return;
        }
        artFocus = false;
        canvasFilters.setFocus(i);
        if (e.target.closest('.fx-on')) canvasFilters.setSlotOn(i, !canvasFilters.getSlots()[i].on);
        updateFxUnit(el);
      });
    });

    const focused = () => canvasFilters.getSlots()[canvasFilters.getFocus()];
    bindKnob(el.querySelector('.fx-wet'), {
      detent: () => 0,
      get: () => canvasFilters.getWet(),
      set: (v) => canvasFilters.setWet(v),
      reset: () => canvasFilters.setWet(1),
    });
    bindKnob(el.querySelector('.fx-pick'), {
      detent: () => (artFocus ? 0 : 14),
      get: () => (artFocus ? window.artDials.get(ART_KNOBS[0]) : FX_KEYS.indexOf(focused().key)),
      set: (v) => {
        if (artFocus) { window.artDials.set(ART_KNOBS[0], Math.max(0, Math.min(1, v))); return; }
        const f = canvasFilters.getFocus();
        const key = FX_KEYS[Math.max(0, Math.min(FX_KEYS.length - 1, v))];
        canvasFilters.setSlotFilter(f, key);
        // A filter dialled in starts playing; dialling back to nothing stops it.
        if (key != null) canvasFilters.setSlotOn(f, true);
      },
      reset: () => { if (artFocus) window.artDials.reset(ART_KNOBS[0]); },
    });
    [0, 1].forEach((j) => {
      bindKnob(el.querySelector(`.fx-p${j + 1}`), {
        detent: () => 0,
        get: () => (artFocus ? window.artDials.get(ART_KNOBS[j + 1]) : focused().p[j]),
        set: (v) => {
          if (artFocus) window.artDials.set(ART_KNOBS[j + 1], Math.max(0, Math.min(1, v)));
          else canvasFilters.setParam(canvasFilters.getFocus(), j, v);
        },
        reset: () => {
          if (artFocus) { window.artDials.reset(ART_KNOBS[j + 1]); return; }
          const f = canvasFilters.FILTERS.find((x) => x.key === focused().key);
          if (f) canvasFilters.setParam(canvasFilters.getFocus(), j, f.params[j][1]);
        },
      });
    });

    canvasFilters.subscribe(() => updateFxUnit(el));
    window.artDials.subscribe(() => updateFxUnit(el));
    updateFxUnit(el);
  }

  function turn(el, frac) {
    el.querySelector('.knob-tick').style.transform = `rotate(${frac * 300 - 150}deg)`;
  }

  function updateFxUnit(el) {
    const slots = canvasFilters.getSlots();
    const focus = canvasFilters.getFocus();
    el.querySelectorAll('.fx-row').forEach((row) => {
      const i = Number(row.dataset.slot);
      if (i < 0) {
        row.classList.add('on');
        row.classList.toggle('focus', artFocus);
        row.querySelector('.fx-name').textContent = 'Artwork';
        return;
      }
      const s = slots[i];
      row.classList.toggle('focus', !artFocus && i === focus);
      row.classList.toggle('on', s.on);
      row.querySelector('.fx-name').textContent = s.key == null ? '\u2014' : fxInfo(s.key).name;
      const btn = row.querySelector('.fx-on');
      btn.textContent = s.on ? 'on' : 'off';
      btn.disabled = s.key == null;
    });
    const s = slots[focus];
    const info = fxInfo(s.key);
    const ctrl = (cls) => el.querySelector(`.${cls}`).closest('.ctrl');
    const anyOn = slots.some((x) => x.on);
    turn(el.querySelector('.fx-wet'), canvasFilters.getWet());
    ctrl('fx-wet').querySelector('.led').classList.toggle('on', anyOn);
    const pick = ctrl('fx-pick');
    pick.querySelector('.knob-label').textContent = artFocus ? ART_KNOBS[0] : 'filter';
    turn(pick.querySelector('.rams-knob'), artFocus ? window.artDials.get(ART_KNOBS[0]) : FX_KEYS.indexOf(s.key) / (FX_KEYS.length - 1));
    pick.querySelector('.led').classList.toggle('on', artFocus || s.on);
    [0, 1].forEach((j) => {
      const c = ctrl(`fx-p${j + 1}`);
      turn(c.querySelector('.rams-knob'), artFocus ? window.artDials.get(ART_KNOBS[j + 1]) : s.p[j]);
      c.querySelector('.knob-label').textContent = artFocus ? ART_KNOBS[j + 1] : info ? info.params[j] : '\u2014';
      c.classList.toggle('idle', !artFocus && !info);
      c.querySelector('.led').classList.toggle('on', artFocus || s.on);
    });
  }

  // Saved looks keep the whole FX unit. Older saves held one filter key.
  function fxOf(p) {
    if (p.fx) return p.fx;
    const k = (p.filters || [])[0];
    return { slots: [[k ?? null, k != null]], focus: 0 };
  }

  // The artwork wall: panels edge to edge across the whole drawer, every
  // artwork showing, a cross at the centre of every panel like an LED video
  // wall. Hover names the artwork in place of the cross; the playing one's
  // cross is orange. Only the last row can end short.
  function buildWall() {
    const list = visuals.getList();
    const currentId = visuals.getCurrentId();
    // From the window, not the drawer, which is still sliding open.
    const W = wall.clientWidth || innerWidth;
    const H = innerHeight - panel.offsetTop - wall.offsetTop;
    if (!W || !H) return;
    const n = list.length;
    // Fill the drawer edge to edge; pick the column count whose panels come
    // closest to square.
    let best = null;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const err = Math.abs(Math.log((W / c) / (H / r)));
      if (!best || err < best.err) best = { cols: c, rows: r, err };
    }
    const { cols, rows } = best;
    const ph = H / rows;
    const total = n;
    const at = new Map(list.map((item, i) => [i, item]));
    const board = document.createElement('div');
    board.className = 'wall-board';
    board.style.width = `${W}px`;
    board.style.height = `${H}px`;
    board.style.setProperty('--cols', cols);
    board.style.setProperty('--ph', `${ph}px`);
    for (let slot = 0; slot < total; slot++) {
      const item = at.get(slot);
      const t = document.createElement(item ? 'button' : 'div');
      t.className = 'wall-panel';
      if (item) {
        t.classList.add('art');
        t.classList.toggle('active', item.id === currentId);
        // Fixed screenshot per artwork: bin/capture-thumbnails.mjs <id>
        t.style.backgroundImage = `url(visuals/thumbs/${item.id}.jpg)`;
        const name = document.createElement('span');
        name.className = 'wall-name';
        name.textContent = item.name;
        t.appendChild(name);
        t.title = '';
        t.addEventListener('click', () => {
          visuals.activate(item.id);
          visuals.resetTimer(item.id);
          close();
        });
      }
      const x = document.createElement('i');
      x.className = 'wall-x';
      t.appendChild(x);
      board.appendChild(t);
    }
    wall.replaceChildren(board);
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    build();
    const deck = document.getElementById('deck');
    deck.classList.remove('closing');
    deck.classList.add('ejected', 'expanded');
    // Measure once the drawer has its height.
    requestAnimationFrame(buildWall);
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

  // Nothing changes on its own (artwork, slot) within 30 s of the listener
  // touching the deck or pressing a key. Automatic changes go through
  // whenQuiet: run now, or once 30 s have passed since the last touch (only
  // the latest held change runs).
  const QUIET_MS = 30000;
  let _lastTouch = 0;
  let _held = null;
  let _heldTimer = 0;
  function touched() { _lastTouch = Date.now(); }
  function isQuiet() { return Date.now() - _lastTouch >= QUIET_MS; }
  function whenQuiet(fn) {
    if (isQuiet() && !isOpen) { fn(); return; }
    _held = fn;
    clearTimeout(_heldTimer);
    const wait = () => {
      _heldTimer = setTimeout(() => {
        if (!isQuiet() || isOpen) { wait(); return; }
        const f = _held;
        _held = null;
        if (f) f();
      }, Math.max(1000, QUIET_MS - (Date.now() - _lastTouch)));
    };
    wait();
  }

  // Now and then the dial moves on its own to another saved slot of the
  // current artwork, at random times. Timing: every 20-75 s, never within
  // 30 s of a touch or while the drawer is open.
  function driftSlot() {
    setTimeout(driftSlot, 20000 + Math.random() * 55000);
    if (isOpen || slotDirty || !isQuiet()) return;
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
    if (deckEl) ['pointerdown', 'wheel', 'pointermove'].forEach((ev) => deckEl.addEventListener(ev, (e) => { if (ev !== 'pointermove' || e.buttons) touched(); }, { passive: true }));
    document.addEventListener('keydown', touched, true);
    setTimeout(driftSlot, 20000 + Math.random() * 55000);
    document.addEventListener('keydown', (e) => {
      // Up and down turn the slot dial, like left and right step artworks.
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.metaKey && !e.ctrlKey && !e.altKey
        && !e.target.closest('input,textarea,select,[contenteditable]')) {
        e.preventDefault();
        nextSlot(e.key === 'ArrowUp' ? 1 : -1);
        return;
      }
      if ((e.key === 'g' || e.key === '/') && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea')) {
        e.preventDefault();
        toggle();
      }
    });
  }

  return { init, bindFxUnit, whenQuiet, isQuiet, open, close, toggle, savePreset, loadPreset, saveCurrentPreset, saveSlot, loadSlot, nextSlot, selectSlot, resetSlot, applyRandomSlot, markAltered, getActiveSlot, slotHasPreset, updateSlotUI };
})();
