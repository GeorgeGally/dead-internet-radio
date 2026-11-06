'use strict';

// Station idents are the versions in labs/station-ident-lab.html, played full
// frame in an iframe. The welcome splash draws from the same pool. What's on
// air is switched at /admin/idents and asked for fresh before every ident, so
// one turned off never airs, even on a page that's been open for hours.

(function () {
  // However often the sets change, the screen sees an ident at most this
  // often. The clock outlives a reload.
  const MIN_GAP_MS = 30 * 60 * 1000;
  const LONGEST_MS = 14 * 1000;
  const SHOWN_KEY = 'ident-shown-at';
  const LAST_KEY = 'ident-last';

  let frame = null;
  let shownAt = 0;
  let last = 0;
  let starting = false;
  let timer = 0;
  let runs = 0;

  function stored(key) {
    try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
  }

  function store(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) {}
  }

  function markShown() {
    shownAt = Date.now();
    store(SHOWN_KEY, shownAt);
  }

  // No answer airs nothing: an ident that's off must never slip through.
  async function onAir() {
    try {
      const response = await fetch('/api/v1/idents', { cache: 'no-store' });
      if (response.ok) return await response.json();
    } catch (e) {}
    return { visual: [], audio: [] };
  }

  // A random ident, never the one before it unless it's the only one on.
  function pick(visual) {
    if (!visual.length) return null;
    const skip = last || stored(LAST_KEY);
    const fresh = visual.filter((n) => n !== skip);
    const pool = fresh.length ? fresh : visual;
    last = pool[Math.floor(Math.random() * pool.length)];
    store(LAST_KEY, last);
    return 'labs/station-ident-lab.html?only=' + last;
  }

  // The welcome splash plays its own ident; nothing goes over it.
  function splashUp() {
    const el = document.getElementById('welcome-splash');
    return !!el && el.style.display !== 'none' && !el.classList.contains('fade-out');
  }

  function init() {
    frame = document.getElementById('ident-frame');
    if (!frame) return;
    frame.addEventListener('load', () => {
      if (!starting) return;
      starting = false;
      frame.classList.add('on');
      timer = setTimeout(stop, LONGEST_MS);
    });
    window.addEventListener('message', (e) => {
      if (e.source === frame.contentWindow && e.data === 'ident-done') stop();
    });
    // The splash is an ident too: the gap starts there.
    if (splashUp()) markShown();
  }

  async function play() {
    if (!frame || splashUp() || Date.now() - Math.max(shownAt, stored(SHOWN_KEY)) < MIN_GAP_MS) return;
    stop();
    markShown();
    const run = runs;
    const { visual } = await onAir();
    if (run !== runs) return;
    const src = pick(visual);
    if (!src) return;
    starting = true;
    frame.src = src + '&once';
  }

  function stop() {
    if (!frame) return;
    runs += 1;
    clearTimeout(timer);
    timer = 0;
    starting = false;
    frame.classList.remove('on');
    frame.src = 'about:blank';
  }

  window.idents = { init, play, stop, pick, onAir };
})();
