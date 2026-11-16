'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const DAY = 24 * 3600000;

function storage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

class FakeAudio {
  constructor() {
    this.handlers = {};
    this.paused = true;
    this.src = '';
    FakeAudio.made.push(this);
  }
  addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
  emit(type) { (this.handlers[type] || []).forEach((fn) => fn()); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
}
FakeAudio.made = [];

function load({ local = {}, session = {}, tz = 'Europe/London', ua = 'Mozilla/5.0 (Macintosh)', elements = {} } = {}) {
  FakeAudio.made = [];
  const levels = [];
  const timers = [];
  const sandbox = {
    console,
    Date,
    Math,
    Promise,
    JSON,
    String,
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) },
    navigator: { userAgent: ua },
    localStorage: storage(local),
    sessionStorage: storage(session),
    window: {},
    Audio: FakeAudio,
    MUSIC_UNDER_VOICE: 0.25,
    setMusicLevel: (v) => levels.push(v),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    fetch: async () => ({ ok: false }),
    document: {
      addEventListener() {},
      getElementById: (id) => elements[id] || null,
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/greeting.js'), 'utf8') + '\nthis.greeting = greeting;', sandbox);
  return { g: sandbox.greeting, sandbox, levels, timers };
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/greetings/manifest.json'), 'utf8')).clips;

function who(over = {}) {
  return {
    city: '', region: '', country: '', tz: 'Europe/London', time: 'afternoon', day: 'tue',
    visit: ['first'], device: '', sky: '', from: false, signedIn: false, ...over,
  };
}

test('every greeting clip in the manifest exists on disk', () => {
  assert.ok(manifest.length >= 40, `only ${manifest.length} clips`);
  for (const clip of manifest) {
    assert.ok(fs.existsSync(path.join(root, 'public', clip.file)), clip.file);
  }
});

test('a Bali listener hears the Bali massive when the roll lands on place', () => {
  const { g } = load();
  const bali = who({ city: 'DENPASAR', region: 'BALI', country: 'INDONESIA', tz: 'Asia/Makassar' });
  const clip = g.pick(manifest, bali, [], () => 0.1);
  assert.match(clip.id, /^bali/);
  // Bali beats Indonesia: region is more specific than country.
  assert.ok(g.placeScore(manifest.find((c) => c.id === 'bali'), bali) > g.placeScore(manifest.find((c) => c.id === 'indonesia'), bali));
});

test('not always the place: other rolls pick a line about something else', () => {
  const { g } = load();
  const bali = who({ city: 'DENPASAR', region: 'BALI', country: 'INDONESIA', time: 'afternoon' });
  const clip = g.pick(manifest, bali, [], () => 0.6);
  assert.equal(g.placeScore(clip, bali), 0);
  assert.ok(g.fits(clip, bali));
});

test('a line for somewhere else never plays, and time zone stands in only without a country', () => {
  const { g } = load();
  const london = manifest.find((c) => c.id === 'london');
  assert.equal(g.fits(london, who({ city: 'BERLIN', country: 'GERMANY', tz: 'Europe/Berlin' })), false);
  assert.equal(g.fits(london, who({ tz: 'Europe/London' })), true);
  assert.equal(g.fits(london, who({ country: 'UNITED KINGDOM', city: 'LEEDS', tz: 'Europe/London' })), false);
});

test('a city line needs its country: same-named or neighbouring places do not hear it', () => {
  const { g } = load();
  const london = manifest.find((c) => c.id === 'london');
  const paris = manifest.find((c) => c.id === 'paris');
  assert.equal(g.fits(london, who({ city: 'LONDON', country: 'CANADA', tz: 'America/Toronto' })), false);
  assert.equal(g.fits(london, who({ city: 'LONDON', country: 'UNITED KINGDOM', tz: 'Europe/London' })), true);
  assert.equal(g.fits(paris, who({ city: 'LYON', country: 'FRANCE', tz: 'Europe/Paris' })), false);
  assert.equal(g.fits(paris, who({ city: 'PARIS', country: 'FRANCE', tz: 'Europe/Paris' })), true);
});

test('a returning listener is never greeted as new', () => {
  const { g } = load();
  const back = who({ visit: ['return'], time: 'late' });
  for (let r = 0; r < 1; r += 0.05) {
    const clip = g.pick(manifest, back, [], () => r);
    assert.ok(clip, 'something fits');
    assert.doesNotMatch(clip.text, /new listener|someone new|somebody new/i, clip.id);
  }
});

test('an unknown place falls back to a line with no place', () => {
  const { g } = load();
  const nowhere = who({ tz: 'Antarctica/Troll' });
  for (let r = 0; r < 1; r += 0.05) {
    const clip = g.pick(manifest, nowhere, [], () => r);
    assert.equal(g.placeScore(clip, nowhere), 0, clip.id);
  }
});

test('the listener is read from what the page already stored', () => {
  const { g } = load({
    local: { 'dir-listener': JSON.stringify({ visits: 12, listenedMs: 0, from: 'example.com' }) },
    session: { 'dir-where': JSON.stringify({ city: 'DENPASAR', region: 'BALI', country: 'INDONESIA', sky: 'RAIN', temp: 27 }) },
    tz: 'Asia/Makassar',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  });
  const l = g.listener(new Date(2026, 10, 16, 2, 0));
  assert.equal(l.region, 'BALI');
  assert.deepEqual([...l.visit], ['regular', 'return']);
  assert.equal(l.device, 'mobile');
  assert.equal(l.sky, 'rain');
  assert.equal(l.time, 'late');
  assert.equal(l.from, true);
});

test('cap: first visit, then not again for a week, and once a session', () => {
  const now = Date.now();
  assert.equal(load().g.due(now), true);
  assert.equal(load({ session: { 'dir-greeted': '1' } }).g.due(now), false);
  const recent = JSON.stringify({ at: now - 2 * DAY, recent: ['hello-1'] });
  assert.equal(load({ local: { 'dir-greeting': recent } }).g.due(now), false);
  const old = JSON.stringify({ at: now - 8 * DAY, recent: ['hello-1'] });
  assert.equal(load({ local: { 'dir-greeting': old } }).g.due(now), true);
});

test('playing a greeting records it, ducks the music only once it sounds, and brings it back', () => {
  const { g, sandbox, levels } = load();
  g.play(manifest[0], 1000);
  assert.equal(sandbox.sessionStorage.getItem('dir-greeted'), '1');
  assert.equal(JSON.parse(sandbox.localStorage.getItem('dir-greeting')).at, 1000);
  const el = FakeAudio.made[0];
  assert.equal(el.src, manifest[0].file);
  assert.deepEqual(levels, []);
  el.emit('playing');
  assert.deepEqual(levels, [0.25]);
  el.emit('ended');
  assert.deepEqual(levels, [0.25, 1]);
});

test('a track change cuts the greeting and lifts the music', () => {
  const { g, levels } = load();
  g.play(manifest[0]);
  FakeAudio.made[0].emit('playing');
  g.stop();
  assert.equal(FakeAudio.made[0].paused, true);
  assert.deepEqual(levels, [0.25, 1]);
});

test('clear moment: mid-song only, never over a DJ drop, a station ID or an interlude', () => {
  const player = { paused: false, readyState: 4, currentTime: 60 };
  const vo = { paused: true, ended: false, getAttribute: () => '' };
  const ident = { classList: { contains: () => false } };
  const elements = { player, 'voiceover-el': vo, 'ident-frame': ident };
  const { g, sandbox } = load({ elements });
  vm.runInContext('var playlist = { tracks: [{ durationMs: 180000 }] }; var currentTrack = 0;', sandbox);
  assert.equal(g.clear(), true);
  player.currentTime = 5;
  assert.equal(g.clear(), false, 'song start');
  player.currentTime = 170;
  assert.equal(g.clear(), false, 'song end');
  player.currentTime = 60;
  vo.paused = false;
  vo.getAttribute = () => '/media/tracks/1/voiceover';
  assert.equal(g.clear(), false, 'DJ drop');
  vo.paused = true;
  ident.classList.contains = (c) => c === 'on';
  assert.equal(g.clear(), false, 'station ID');
  ident.classList.contains = () => false;
  vm.runInContext('playlist.tracks[0].interlude = true;', sandbox);
  assert.equal(g.clear(), false, 'interlude');
  vm.runInContext('playlist.tracks[0] = { durationMs: 8000 };', sandbox);
  assert.equal(g.clear(), false, 'short clip');
});

test('the player loads the greeting script and a track change stops it', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  assert.match(html, /<script src="greeting\.js"><\/script>/);
  assert.match(app, /function stopVoiceover\(\) \{\n  if \(typeof greeting !== 'undefined'\) greeting\.stop\(\);/);
});
