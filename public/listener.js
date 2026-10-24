'use strict';

// Now and then, the station reads the listener back to themselves: a full-
// screen black poster of what the browser gives away without asking — where
// their clock says they are, the time there, their device, their history with
// this station. Nothing here leaves the browser; visits and listening time are
// kept in localStorage for this page only.
//
// window.showListenerReport() shows it at once; ?listener in the URL does too.
const listenerReport = (() => {
  const SHOW_MS = 12000;
  const STORE = 'dir-listener';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function save(data) {
    try { localStorage.setItem(STORE, JSON.stringify(data)); } catch (e) {}
  }

  // Count this visit and keep the first referrer we ever saw.
  const memory = load();
  memory.visits = (memory.visits || 0) + 1;
  memory.listenedMs = memory.listenedMs || 0;
  if (!memory.firstSeen) memory.firstSeen = Date.now();
  if (!memory.from && document.referrer) {
    try {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host && host !== location.hostname) memory.from = host;
    } catch (e) {}
  }
  save(memory);

  // Listening time, counted while the stream plays.
  setInterval(() => {
    const a = document.getElementById('player');
    if (a && !a.paused) {
      memory.listenedMs += 1000;
      if (memory.listenedMs % 10000 === 0) save(memory);
    }
  }, 1000);
  addEventListener('pagehide', () => save(memory));

  function place() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const parts = tz.split('/');
    const city = (parts[parts.length - 1] || 'NOWHERE').replace(/_/g, ' ');
    const region = parts.length > 1 ? parts[0] : '';
    return { city: city.toUpperCase(), region: region.toUpperCase() };
  }

  function device() {
    const ua = navigator.userAgent;
    const os = /Mac OS X|Macintosh/.test(ua) && !/iPhone|iPad/.test(ua) ? 'MACOS'
      : /iPhone|iPad|iPod/.test(ua) ? 'IOS'
      : /Android/.test(ua) ? 'ANDROID'
      : /Windows/.test(ua) ? 'WINDOWS'
      : /Linux/.test(ua) ? 'LINUX' : 'UNKNOWN';
    const browser = /Edg\//.test(ua) ? 'EDGE'
      : /Firefox\//.test(ua) ? 'FIREFOX'
      : /Chrome\//.test(ua) ? 'CHROME'
      : /Safari\//.test(ua) ? 'SAFARI' : 'BROWSER';
    return { os, browser };
  }

  function gpu() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      const m = String(name).match(/Apple M\d\w*( (Pro|Max|Ultra))?|RTX \d+\w*|GTX \d+\w*|Radeon[\w ]*\d+|Intel[\w ()]*?Graphics|Mali-\w+|Adreno \w+/i);
      return m ? m[0].toUpperCase().replace(/\s+/g, ' ') : '';
    } catch (e) {
      return '';
    }
  }

  function duration(ms) {
    const m = Math.floor(ms / 60000);
    return m >= 60 ? `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M` : `${m}M`;
  }

  // The poster: [text, alignment] lines; 'c' lines are the section labels.
  function lines() {
    const p = place();
    const d = device();
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    const day = now.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
    const lang = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])
      .slice(0, 2).map((l) => l.toUpperCase()).join(' ');
    const cores = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} CORES` : '';
    const mem = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : '';
    const scr = `${screen.width}×${screen.height}`;
    const out = [
      [`${p.city}`, 'l', p.region || 'LISTENER'],
      ['LOCAL', 'c'],
      [`${time} ${day}`, 'l'],
      [`(VISIT ${String(memory.visits).padStart(2, '0')}  ${duration(memory.listenedMs)})`, 'l'],
      ['DEVICE', 'c'],
      [`${d.os}  ${d.browser}`, 'l'],
      [`(${[scr, cores || mem].filter(Boolean).join('  ')})`, 'l'],
    ];
    const g = gpu();
    if (g) out.push(['GPU', 'c'], [g, 'l']);
    out.push(['LANGUAGE', 'c'], [lang + (matchMedia('(prefers-color-scheme: dark)').matches ? '  DARK' : ''), 'l']);
    if (memory.from) out.push(['FROM', 'c'], [memory.from.toUpperCase(), 'l']);
    return out;
  }

  let el = null;
  let timer = null;

  function render() {
    if (!el) {
      el = document.createElement('div');
      el.id = 'listener-report';
      document.body.appendChild(el);
    }
    const rows = lines();
    // One font size for everything, as large as the longest line allows.
    const longest = Math.max(...rows.map((r) => r[0].length + (r[2] ? r[2].length + 3 : 0)));
    const byWidth = (innerWidth * 0.92) / (longest * 0.6);
    const byHeight = (innerHeight * 0.88) / (rows.length * 1.02);
    el.style.setProperty('--fs', `${Math.floor(Math.min(byWidth, byHeight))}px`);
    el.innerHTML = rows.map(([text, align, right], i) => {
      const cls = align === 'c' ? 'lr-row lr-label' : 'lr-row';
      const r = right ? `<span class="lr-right">${right}</span>` : '';
      return `<div class="${cls}" style="--i:${i}"><span>${text}</span>${r}</div>`;
    }).join('');
  }

  function show() {
    render();
    el.classList.remove('lr-on');
    void el.offsetWidth;
    el.classList.add('lr-on');
    clearTimeout(el._hide);
    el._hide = setTimeout(() => el.classList.remove('lr-on'), SHOW_MS);
  }

  // Random, roughly every five minutes (3-7), never while the deck is open.
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const deck = document.getElementById('deck');
      const splash = document.getElementById('welcome-splash');
      const busy = (deck && deck.classList.contains('ejected')) || (splash && splash.style.display !== 'none' && splash.offsetParent);
      if (!busy) show();
      schedule();
    }, (3 + Math.random() * 4) * 60000);
  }

  schedule();
  if (/[?&]listener\b/.test(location.search)) setTimeout(show, 1500);
  window.showListenerReport = show;
  return { show };
})();
