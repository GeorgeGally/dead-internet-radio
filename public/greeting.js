'use strict';

// Now and then the DJ says hello to one listener, in their own browser, over
// the stream with the music dipped, the way the DJ drops are. The lines are
// clips voiced offline (generate_greetings.py) and listed in
// greetings/manifest.json; this picks the one that best fits what the page
// already knows (the listener report's place, clock and visit count, the
// device, the Signal sign-in) and plays it mid-song when nothing else talks.
//
// Not all the time: once on a first visit, then once a week at most, never
// twice in a session, and never over a station ID, a DJ drop or a song's start.
const greeting = (() => {
  const STORE = 'dir-greeting';
  const SESSION = 'dir-greeted';
  const RETURN_GAP_MS = 7 * 24 * 3600000;
  const SETTLE_MS = 30000;        // listening this long first
  const GIVE_UP_MS = 15 * 60000;  // no clear moment in this much listening: skip it
  const CHECK_MS = 2000;
  const CLEAR_S = 20;             // this far from a song's start and its end
  const SONG_MS = 60000;
  const LOAD_MS = 6000;           // a clip slower than this to start is dropped
  const RECENT = 8;
  const PLACE = { city: 4, region: 3, country: 2 };

  function read(storage, key) {
    try { return JSON.parse(storage.getItem(key)); } catch (e) { return null; }
  }
  function write(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function timeOfDay(hour) {
    if (hour < 5) return 'late';
    if (hour < 8) return 'dawn';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  // Everything here is already on the page; nothing new is asked for.
  function listener(now = new Date()) {
    const memory = read(localStorage, 'dir-listener') || {};
    const where = read(sessionStorage, 'dir-where') || {};
    const visits = memory.visits || 1;
    const regular = visits >= 10 || (memory.listenedMs || 0) >= 5 * 3600000;
    const sky = String(where.sky || '');
    return {
      city: String(where.city || '').toUpperCase(),
      region: String(where.region || '').toUpperCase(),
      country: String(where.country || '').toUpperCase(),
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''),
      time: timeOfDay(now.getHours()),
      day: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()],
      visit: regular ? ['regular', 'return'] : visits > 1 ? ['return'] : ['first'],
      device: /iPhone|iPad|iPod|Android|Mobile/.test(navigator.userAgent) ? 'mobile' : '',
      sky: where.temp >= 30 ? 'hot' : /SNOW/.test(sky) ? 'snow' : /RAIN|DRIZZLE|SHOWER|THUNDER/.test(sky) ? 'rain' : '',
      from: !!memory.from,
      signedIn: !!window.signalHandle,
    };
  }

  // How well a clip's place fits: 0 for a line with no place, -1 for the wrong
  // one. The time zone stands in only until the IP lookup has a country.
  function placeScore(clip, who) {
    if (!clip.city && !clip.region && !clip.country && !clip.tz) return 0;
    let best = -1;
    for (const key of Object.keys(PLACE)) {
      if (key === 'country' && clip.city) continue;
      if (key === 'city' && clip.country && !(who.country && clip.country.includes(who.country))) continue;
      if (clip[key] && who[key] && clip[key].includes(who[key])) best = Math.max(best, PLACE[key]);
    }
    if (best < 0 && !who.country && clip.tz && clip.tz.some((tz) => who.tz.startsWith(tz))) best = 1;
    return best;
  }

  function fits(clip, who) {
    if (placeScore(clip, who) < 0) return false;
    for (const key of ['time', 'day', 'device', 'sky']) {
      if (clip[key] && !clip[key].includes(who[key])) return false;
    }
    if (clip.visit && !clip.visit.some((v) => who.visit.includes(v))) return false;
    if (clip.from && !who.from) return false;
    if (clip.signedIn && !who.signedIn) return false;
    return true;
  }

  // Not always the place: about half the time a line about where they are,
  // otherwise one about their clock, weather or habits, sometimes a plain hello.
  function pick(clips, who, recent = [], random = Math.random) {
    let fit = clips.filter((c) => fits(c, who));
    const fresh = fit.filter((c) => !recent.includes(c.id));
    if (fresh.length) fit = fresh;
    const scored = fit.map((c) => [c, placeScore(c, who)]);
    const top = Math.max(0, ...scored.map(([, s]) => s));
    const places = scored.filter(([, s]) => s > 0 && s === top).map(([c]) => c);
    const plain = fit.filter((c) => placeScore(c, who) === 0);
    const context = plain.filter((c) => ['time', 'day', 'device', 'sky', 'from', 'signedIn'].some((k) => c[k]));
    const hello = plain.filter((c) => !context.includes(c));
    const roll = random();
    const order = roll < 0.45 ? [places, context, hello]
      : roll < 0.8 ? [context, places, hello]
        : [hello, context, places];
    const pool = order.find((p) => p.length);
    return pool ? pool[Math.floor(random() * pool.length)] : null;
  }

  // First visit, then once a week at most, once a session.
  function due(now = Date.now()) {
    try { if (sessionStorage.getItem(SESSION)) return false; } catch (e) { return false; }
    const state = read(localStorage, STORE) || {};
    return !state.at || now - state.at >= RETURN_GAP_MS;
  }

  // Mid-song, with the music really playing and nobody else on the mic.
  function clear() {
    const player = document.getElementById('player');
    if (!player || player.paused || player.readyState < 3) return false;
    const track = typeof playlist !== 'undefined' && playlist && playlist.tracks
      ? playlist.tracks[currentTrack] : null;
    if (!track || track.interlude || !(track.durationMs >= SONG_MS)) return false;
    const at = player.currentTime;
    if (at < CLEAR_S || track.durationMs / 1000 - at < CLEAR_S) return false;
    const vo = document.getElementById('voiceover-el');
    if (vo && vo.getAttribute('src') && !vo.paused && !vo.ended) return false;
    const ident = document.getElementById('ident-frame');
    if (ident && ident.classList.contains('on')) return false;
    const splash = document.getElementById('welcome-splash');
    if (splash && splash.style.display !== 'none') return false;
    return true;
  }

  let voice = null;
  let ducked = false;
  let timer = 0;

  function stop() {
    if (!voice) return;
    clearTimeout(voice._load);
    voice.pause();
    voice.removeAttribute('src');
    voice = null;
    if (ducked) setMusicLevel(1);
    ducked = false;
  }

  function play(clip, now = Date.now()) {
    try { sessionStorage.setItem(SESSION, '1'); } catch (e) {}
    const state = read(localStorage, STORE) || {};
    write(localStorage, STORE, { at: now, recent: [clip.id, ...(state.recent || [])].slice(0, RECENT) });
    const el = new Audio();
    voice = el;
    el.preload = 'auto';
    // Only once the voice is really there does the music go under it.
    el.addEventListener('playing', () => {
      if (voice !== el) return;
      clearTimeout(el._load);
      ducked = true;
      setMusicLevel(MUSIC_UNDER_VOICE);
    });
    el.addEventListener('ended', () => { if (voice === el) stop(); });
    el.addEventListener('error', () => { if (voice === el) stop(); });
    el._load = setTimeout(() => { if (voice === el && !ducked) stop(); }, LOAD_MS);
    el.src = clip.file;
    const started = el.play();
    if (started && started.catch) started.catch(() => { if (voice === el) stop(); });
  }

  async function start() {
    if (!due()) return;
    let clips = [];
    try {
      const response = await fetch('greetings/manifest.json', { cache: 'no-store' });
      if (response.ok) clips = (await response.json()).clips || [];
    } catch (e) {}
    if (!clips.length) return;
    let heard = 0;
    clearInterval(timer);
    timer = setInterval(() => {
      const player = document.getElementById('player');
      if (!player || player.paused) return;
      heard += CHECK_MS;
      if (heard > GIVE_UP_MS || !due()) { clearInterval(timer); return; }
      if (heard < SETTLE_MS || !clear()) return;
      clearInterval(timer);
      const state = read(localStorage, STORE) || {};
      const clip = pick(clips, listener(), state.recent || []);
      if (clip) play(clip);
    }, CHECK_MS);
  }

  document.addEventListener('DOMContentLoaded', () => start());
  return { start, stop, play, pick, fits, placeScore, listener, due, clear, timeOfDay };
})();
