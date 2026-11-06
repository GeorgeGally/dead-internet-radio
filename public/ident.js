'use strict';

// Station idents are the versions in labs/station-ident-lab.html, played full
// frame in an iframe. The welcome splash draws from the same pool. Retired
// ones stay in the lab but never air: V5 (X-Y oscilloscope), V7 (radar), V11
// (round amber oscilloscope).

(function () {
  const COUNT = 24;
  const RETIRED = [5, 7, 11];
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

  // A random ident, never the one before it.
  function pick() {
    const skip = last || stored(LAST_KEY);
    const pool = Array.from({ length: COUNT }, (_, i) => i + 1).filter((n) => !RETIRED.includes(n) && n !== skip);
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

  function play() {
    if (!frame || splashUp() || Date.now() - Math.max(shownAt, stored(SHOWN_KEY)) < MIN_GAP_MS) return;
    stop();
    markShown();
    starting = true;
    frame.src = pick() + '&once';
  }

  function stop() {
    if (!frame) return;
    clearTimeout(timer);
    timer = 0;
    starting = false;
    frame.classList.remove('on');
    frame.src = 'about:blank';
  }

  window.idents = { init, play, stop, pick };
})();
