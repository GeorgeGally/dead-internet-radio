'use strict';

// Now and then, the station reads the listener back to themselves: a full-
// screen black poster of what the browser gives away without asking — where
// their clock says they are, the time there, their device, their history with
// this station. Visits and listening time are kept in localStorage for this
// page only. Where they are comes from their IP (geojs.io, no key) rounded to
// a 0.1° cell, about 11 km a side, and the weather there from Open-Meteo.
//
// window.showListenerReport() shows it at once; ?listener in the URL does too.
const listenerReport = (() => {
  const SHOW_MS = 3000;
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

  // IP location and the weather there, fetched once per session.
  const WMO = [[0, 'CLEAR'], [1, 'MOSTLY CLEAR'], [2, 'PARTLY CLOUDY'], [3, 'OVERCAST'], [48, 'FOG'],
    [57, 'DRIZZLE'], [67, 'RAIN'], [77, 'SNOW'], [82, 'SHOWERS'], [86, 'SNOW SHOWERS'], [99, 'THUNDERSTORM']];
  let where = null;
  async function locate() {
    try { where = JSON.parse(sessionStorage.getItem('dir-where')); } catch (e) {}
    if (where) return;
    try {
      const g = await (await fetch('https://get.geojs.io/v1/ip/geo.json')).json();
      const lat = Math.round(g.latitude * 10) / 10;
      const lon = Math.round(g.longitude * 10) / 10;
      if (!isFinite(lat) || !isFinite(lon)) return;
      const w = await (await fetch('https://api.open-meteo.com/v1/forecast'
        + `?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1`
        + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=sunset')).json();
      const c = w.current || {};
      where = {
        city: (g.city || '').toUpperCase(),
        country: (g.country || '').toUpperCase(),
        lat, lon,
        net: (g.organization_name || '').toUpperCase(),
        temp: c.temperature_2m,
        sky: c.weather_code != null ? (WMO.find(([max]) => c.weather_code <= max) || [0, ''])[1] : '',
        wind: c.wind_speed_10m,
        humidity: c.relative_humidity_2m,
        sunset: (w.daily?.sunset?.[0] || '').slice(11, 16),
        elevation: w.elevation,
      };
      sessionStorage.setItem('dir-where', JSON.stringify(where));
    } catch (e) {}
  }
  const located = locate();

  function coord(v, pos, neg) {
    return `${v < 0 ? neg : pos} ${Math.abs(v).toFixed(1)}°`;
  }

  function place() {
    if (where && where.city) return { city: where.city, region: where.country };
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
    ];
    if (where) {
      out.push([`${coord(where.lat, 'N', 'S')}  ${coord(where.lon, 'E', 'W')}`, 'l'],
        [`(11 KM CELL${where.elevation != null ? `  ${Math.round(where.elevation)} M` : ''})`, 'l']);
      if (where.temp != null) {
        out.push(['WEATHER', 'c'], [`${Math.round(where.temp)}°C  ${where.sky}`, 'l'],
          [`(WIND ${Math.round(where.wind)} KM/H  ${where.humidity}%${where.sunset ? `  SUNSET ${where.sunset}` : ''})`, 'l']);
      }
    }
    out.push(
      ['LOCAL', 'c'],
      [`${time} ${day}`, 'l'],
      [`(VISIT ${String(memory.visits).padStart(2, '0')}  ${duration(memory.listenedMs)})`, 'l'],
      ['DEVICE', 'c'],
      [`${d.os}  ${d.browser}`, 'l'],
      [`(${[scr, cores || mem].filter(Boolean).join('  ')})`, 'l'],
    );
    if (where && where.net) out.push(['NETWORK', 'c'], [where.net, 'l']);
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
    const byWidth = (innerWidth * 0.75) / (longest * 0.6);
    const byHeight = (innerHeight * 0.72) / (rows.length * 1.02);
    el.style.setProperty('--fs', `${Math.floor(Math.min(byWidth, byHeight))}px`);
    el.innerHTML = rows.map(([text, align, right], i) => {
      const cls = align === 'c' ? 'lr-row lr-label' : 'lr-row';
      const r = right ? `<span class="lr-right">${right}</span>` : '';
      return `<div class="${cls}" style="--i:${i}"><span>${text}</span>${r}</div>`;
    }).join('');
  }

  // A flash: it flickers on like a bad signal, holds a moment, flickers off.
  function flicker(on, done) {
    const steps = 2 + Math.floor(Math.random() * 3);
    let i = 0;
    const tick = () => {
      el.classList.toggle('lr-on', i % 2 === (on ? 0 : 1));
      i += 1;
      if (i < steps * 2) setTimeout(tick, 40 + Math.random() * 110);
      else { el.classList.toggle('lr-on', on); if (done) done(); }
    };
    tick();
  }

  function show() {
    render();
    el.classList.remove('lr-on');
    clearTimeout(el._hide);
    flicker(true, () => { el._hide = setTimeout(() => flicker(false), SHOW_MS); });
  }

  // Flashes up at random, every 2-5 minutes, never while the deck is open.
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const deck = document.getElementById('deck');
      const splash = document.getElementById('welcome-splash');
      const busy = (deck && deck.classList.contains('ejected')) || (splash && splash.style.display !== 'none' && splash.offsetParent);
      if (!busy) show();
      schedule();
    }, (2 + Math.random() * 3) * 60000);
  }

  schedule();
  if (/[?&]listener\b/.test(location.search)) setTimeout(() => located.then(show), 1500);
  window.showListenerReport = show;
  return { show };
})();
