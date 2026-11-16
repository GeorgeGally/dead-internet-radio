'use strict';

// Station idents are the versions in labs/station-ident-lab.html, played full
// frame in an iframe. The welcome splash draws from the same pool. What's on
// air is switched at /admin/idents and asked for fresh before every ident, so
// one turned off never airs, even on a page that's been open for hours.

(function () {
  // An ident marks a change of set, every time: a station ID clip booked
  // between sets puts one up, or, with none booked, the next set's opening.
  const LONGEST_MS = 12 * 1000;
  const LAST_KEY = 'ident-last';

  let frame = null;
  let last = 0;
  let starting = false;
  let timer = 0;
  let runs = 0;
  let own = null;
  let clip = null;
  let clipDone = null;

  function stored(key) {
    try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
  }

  function store(key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) {}
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
  }

  // A station ID clip, one of those on air. Resolves once it has played, or
  // at once with none on air; a stop ends it early.
  function clipName(clips) {
    if (!clips.length) return '';
    const n = clips[Math.floor(Math.random() * clips.length)];
    return 'station-ids/id-' + String(n).padStart(2, '0') + '.wav';
  }

  function playClip(src, el) {
    endClip();
    if (!src) return Promise.resolve();
    // The station's own element unless one is given: the splash brings its own.
    if (!el) el = own || (own = new Audio());
    clip = el;
    if (clip.getAttribute('src') !== src) clip.src = src;
    return new Promise((resolve) => {
      const timer = setTimeout(() => clipDone(), LONGEST_MS);
      clipDone = () => {
        clearTimeout(timer);
        clip.onended = clip.onerror = null;
        clipDone = null;
        resolve();
      };
      clip.onended = clip.onerror = clipDone;
      const started = clip.play();
      if (started && started.catch) started.catch(() => clipDone && clipDone());
    });
  }

  function endClip() {
    if (!clipDone) return;
    clip.pause();
    clipDone();
  }

  function show(visual) {
    if (!frame || splashUp()) return;
    const src = pick(visual);
    if (!src) return;
    starting = true;
    frame.src = src + '&once';
  }

  async function play() {
    if (!frame || splashUp()) return;
    stop();
    const run = runs;
    const { visual } = await onAir();
    if (run !== runs) return;
    show(visual);
  }

  function stop() {
    runs += 1;
    endClip();
    if (!frame) return;
    clearTimeout(timer);
    timer = 0;
    starting = false;
    frame.classList.remove('on');
    frame.src = 'about:blank';
  }

  window.idents = { init, play, stop, pick, onAir, playClip, clipName };
})();
