'use strict';

// The set on air, start to finish, under the open deck: what has played,
// what is on, what is still to come, each at its time on the station clock.
const setList = (() => {
  const REFRESH_MS = 30000;
  const READ_WAIT = 10000;
  let page, rows, led, btn, segments = [], offsetMs = 0, ticker = 0, refresher = 0, loadedAt = 0;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function now() { return Date.now() + offsetMs; }

  function clock(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function length(ms) {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function state(seg, at) {
    if (at >= seg.startsAt + seg.durationMs) return 'played';
    if (at >= seg.startsAt) return 'now';
    return 'next';
  }

  async function fetchAiring() {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), READ_WAIT);
    try {
      const sent = Date.now();
      const res = await fetch('/api/v1/airing', { signal: stop.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (typeof data.serverTime === 'number') offsetMs = data.serverTime - (sent + Date.now()) / 2;
      return Array.isArray(data.segments) ? data.segments : [];
    } finally {
      clearTimeout(timer);
    }
  }

  function render() {
    const at = now();
    rows.replaceChildren(...segments.map((seg) => {
      const row = el('div', `set-row ${state(seg, at)}`);
      const what = el('span', 'set-what');
      what.append(el('span', 'set-title', seg.title || seg.caption || '—'), el('span', 'set-who', seg.artist || ''));
      row.append(el('span', 'set-when', clock(seg.startsAt)), what, el('span', 'set-len', length(seg.durationMs)));
      return row;
    }));
    if (!segments.length) rows.append(el('p', 'set-empty', 'The set list is out of reach.'));
  }

  // Played, on, next: only the classes move while the page is open.
  function mark() {
    const at = now();
    const list = rows.querySelectorAll('.set-row');
    segments.forEach((seg, i) => {
      if (list[i]) list[i].className = `set-row ${state(seg, at)}`;
    });
    const last = segments[segments.length - 1];
    if (last && at >= last.startsAt + last.durationMs && Date.now() - loadedAt > 2000) load();
  }

  // The current track sits two rows from the top, with what led into it above.
  function align() {
    const current = rows.querySelector('.set-row.now') || rows.querySelector('.set-row.next');
    if (!current) return;
    const list = [...rows.children];
    const anchor = list[Math.max(0, list.indexOf(current) - 2)] || current;
    rows.scrollTop = anchor.offsetTop - rows.firstElementChild.offsetTop;
  }

  async function load() {
    loadedAt = Date.now();
    try {
      segments = await fetchAiring();
    } catch (_) {
      segments = [];
    }
    if (!isOpen()) return;
    render();
    align();
  }

  function open() {
    if (isOpen()) return;
    if (typeof gallery !== 'undefined' && gallery.close) gallery.close();
    if (typeof requestLine !== 'undefined' && requestLine.isOpen()) requestLine.close();
    document.body.classList.add('set-open');
    page.classList.add('open');
    led.classList.add('on');
    btn.setAttribute('aria-expanded', 'true');
    document.getElementById('deck')?.classList.add('expanded');
    load();
    ticker = setInterval(mark, 1000);
    refresher = setInterval(load, REFRESH_MS);
  }

  function close() {
    if (!isOpen()) return;
    clearInterval(ticker);
    clearInterval(refresher);
    document.body.classList.remove('set-open');
    page.classList.remove('open');
    led.classList.remove('on');
    btn.setAttribute('aria-expanded', 'false');
  }

  function isOpen() { return !!page && page.classList.contains('open'); }

  function init() {
    btn = document.getElementById('btn-set');
    led = document.getElementById('set-led');
    if (!btn || !led) return;
    page = el('div');
    page.id = 'set-page';
    page.setAttribute('role', 'dialog');
    page.setAttribute('aria-label', 'Set list');
    const column = el('div', 'set-column');
    rows = el('div', 'set-rows');
    column.append(rows);
    page.append(column);
    document.body.appendChild(page);

    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => (isOpen() ? close() : open()));
    // The picture around the list closes it, like the deck's other pages.
    page.addEventListener('click', (e) => { if (!column.contains(e.target)) close(); });
    document.getElementById('btn-gallery')?.addEventListener('click', close);
    document.getElementById('btn-request')?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) close();
    });
    window.addEventListener('resize', () => { if (isOpen()) align(); });
  }

  return { init, open, close, isOpen, state, clock, length };
})();

setList.init();
