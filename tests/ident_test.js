'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const ALL = Array.from({ length: 25 }, (_, i) => i + 1);

function loadIdents({ stored = {}, random = 0, onAir = { visual: ALL, audio: [1] } } = {}) {
  const server = { onAir, asks: 0 };
  const classes = new Set();
  const store = new Map(Object.entries(stored).map(([k, v]) => [k, String(v)]));
  const listeners = {};
  const frame = {
    src: '',
    contentWindow: {},
    addEventListener: (type, fn) => { listeners[type] = fn; },
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
  };
  let messages = null;
  const sandbox = {
    document: { getElementById: (id) => (id === 'ident-frame' ? frame : null) },
    window: { addEventListener: (type, fn) => { if (type === 'message') messages = fn; } },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
    },
    fetch: async () => {
      server.asks += 1;
      if (!server.onAir) throw new Error('offline');
      return { ok: true, json: async () => server.onAir };
    },
    setTimeout: () => 1,
    clearTimeout() {},
    Math: Object.create(Math, { random: { value: () => random } }),
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(read('public/ident.js'), sandbox);
  const idents = sandbox.window.idents;
  idents.init();
  return { idents, frame, classes, store, server, loaded: () => listeners.load(), message: (e) => messages(e) };
}

const MINUTE = 60 * 1000;

test('every set change gets its ident, however recent the last one', async () => {
  const page = loadIdents({ stored: { 'ident-shown-at': Date.now() - MINUTE } });
  await page.idents.play();
  assert.match(page.frame.src, /^labs\/station-ident-lab\.html\?only=\d+&once$/);
  page.idents.stop();
  assert.equal(page.frame.src, 'about:blank');
  await page.idents.play();
  assert.match(page.frame.src, /only=\d+&once$/);
});

test('an ident shows once loaded and leaves when its run ends', async () => {
  const { idents, frame, classes, loaded, message } = loadIdents();
  await idents.play();
  assert.ok(!classes.has('on'));
  loaded();
  assert.ok(classes.has('on'));
  message({ source: frame.contentWindow, data: 'ident-done' });
  assert.ok(!classes.has('on'));
  assert.equal(frame.src, 'about:blank');
});

test('every ident on air can be picked, never twice running', () => {
  const on = ALL.filter((n) => ![5, 7, 11].includes(n));
  const seen = new Set();
  for (let i = 0; i < 25; i += 1) {
    const { idents } = loadIdents({ random: i / 25 });
    seen.add(Number(idents.pick(on).split('only=')[1]));
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), on);

  const { idents } = loadIdents({ stored: { 'ident-last': 1 } });
  assert.equal(idents.pick(on), 'labs/station-ident-lab.html?only=2');
  assert.equal(idents.pick(on), 'labs/station-ident-lab.html?only=1');
});

test('an ident switched off never airs, even on a page already open', async () => {
  const page = loadIdents({ stored: { 'ident-shown-at': 1 }, onAir: { visual: [3, 9], audio: [] } });
  page.server.onAir = { visual: [9], audio: [] };
  await page.idents.play();
  assert.match(page.frame.src, /only=9&once$/);
});

test('the only ident on air still airs after itself', async () => {
  const { idents, frame } = loadIdents({ stored: { 'ident-shown-at': 1, 'ident-last': 3 }, onAir: { visual: [3], audio: [] } });
  await idents.play();
  assert.match(frame.src, /only=3&once$/);
});

test('with every ident off, or no answer, nothing airs', async () => {
  for (const onAir of [{ visual: [], audio: [] }, null]) {
    const { idents, frame, classes } = loadIdents({ stored: { 'ident-shown-at': 1 }, onAir });
    await idents.play();
    assert.ok(!/only=/.test(frame.src));
    assert.ok(!classes.has('on'));
  }
  assert.equal(loadIdents().idents.pick([]), null);
});

test('a stop while the list is on its way cancels the ident', async () => {
  const { idents, frame } = loadIdents({ stored: { 'ident-shown-at': 1 } });
  const playing = idents.play();
  idents.stop();
  await playing;
  assert.equal(frame.src, 'about:blank');
});

test('the welcome splash plays only what is on air', () => {
  const app = read('public/app.js');
  assert.doesNotMatch(app, /STATION_ID_COUNT/);
  assert.match(app, /idents\.onAir\(\)\.then\(\(\{ visual, audio: clips \}\)/);
  assert.match(app, /if \(!clips\.length\) return;/);
});

function grids() {
  const lab = read('public/labs/station-ident-lab.html');
  const code = lab.slice(lab.indexOf("const BLK_RAMP"), lab.indexOf("V.push({\n  name: 'ASCII · block wall'"));
  const sandbox = {
    ORANGE: '#ff5a1f',
    MONO: () => '',
    ramp: (t, s, d) => Math.min(1, Math.max(0, (t - s) / d)),
    h32: (n) => n >>> 0,
    document: {
      createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 60 }), fillText() {} }) }),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${code}\nthis.blkWall = blkWall;`, sandbox);
  return [[2592, 1676], [2880, 1620], [5160, 2160], [780, 1688]].map(([w, h]) => {
    const rects = [];
    const stamps = [];
    const c = { fillRect() {}, drawImage(img, sx, sy, sw, sh, x, y) { stamps.push({ x, y, size: sw }); } };
    sandbox.blkWall(c, w, h, 5, { r: () => 0.5 }, (px, cell) => rects.push({ x: px.x, y: px.y, rw: cell }));
    return { w, h, rects, stamps };
  });
}

test('the wall reaches every edge at every size', () => {
  for (const { w, h, stamps } of grids()) {
    const cell = stamps[0].size;
    assert.equal(cell, Math.round(cell), 'whole device pixels');
    assert.ok(Math.min(...stamps.map((s) => s.x)) <= 0, `left ${w}x${h}`);
    assert.ok(Math.max(...stamps.map((s) => s.x)) + cell >= w, `right ${w}x${h}`);
    assert.ok(Math.min(...stamps.map((s) => s.y)) <= 0, `top ${w}x${h}`);
    assert.ok(Math.max(...stamps.map((s) => s.y)) + cell >= h, `bottom ${w}x${h}`);
  }
});

test('the word sits centred with wall on both sides', () => {
  for (const { w, rects } of grids()) {
    const left = Math.min(...rects.map((r) => r.x));
    const right = w - Math.max(...rects.map((r) => r.x + r.rw));
    assert.ok(left > w * 0.12, `left margin at ${w}`);
    assert.ok(Math.abs(left - right) <= rects[0].rw, `centred at ${w}`);
  }
});

function loadApp() {
  const calls = [];
  const listeners = {};
  const timers = [];
  const player = {
    src: '', currentTime: 0, volume: 1, paused: true, readyState: 4, duration: 180,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
    getAttribute() { return this.src; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
  };
  const responses = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: (id) => (id === 'player' ? player : null),
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
    },
    location: { protocol: 'http:', hostname: 'radio.test', port: '', pathname: '/' },
    window: { location: { pathname: '/' }, addEventListener() {} },
    fetch: async (url) => {
      const key = Object.keys(responses).find((k) => url.endsWith(k));
      if (!key) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, json: async () => responses[key](), blob: async () => url };
    },
    setTimeout: (fn) => { timers.push(fn); return 0; },
    clearTimeout() {},
    setInterval: () => 0,
    AbortController,
    URL: { createObjectURL: (blob) => `blob:${blob}`, revokeObjectURL() {} },
    requestAnimationFrame: () => 0,
    visuals: { init() {}, next() {}, notify() {}, getList: () => [], getCurrentId: () => null, activate() {} },
    canvasFilters: {},
    gallery: { init() {}, whenQuiet: (fn) => fn() },
    idents: {
      init() {}, play: () => calls.push('play'), stop: () => calls.push('stop'),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(read('public/app.js'), sandbox);
  const live = () => {
    const now = Date.now();
    return {
      serverTime: now,
      segments: [
        { startsAt: now - 1000, durationMs: 60000, file: '/media/a.mp3', title: 'A', showName: 'Next Show' },
        { startsAt: now + 59000, durationMs: 60000, file: '/media/b.mp3', title: 'B', showName: 'Next Show' },
      ],
    };
  };
  responses['/api/v1/broadcast'] = live;
  return {
    calls,
    player,
    listeners,
    responses,
    timers,
    run: (code) => vm.runInContext(code, sandbox),
    settle: async () => { for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r)); },
    tuneLive: (showName = 'This Show') => vm.runInContext(`playlist = { live: true, tracks: [{ startsAt: 0, durationMs: 1, file: '/media/x.mp3', showName: ${JSON.stringify(showName)} }] }; currentTrack = 0;`, sandbox),
  };
}

test('a wait for audio never puts up an ident', async () => {
  const app = loadApp();
  app.run(`playlist = { tracks: [{ file: '/media/a.mp3', durationMs: 60000 }] }; setupAudio();`);
  app.tuneLive('Next Show');
  app.run('onTrackEnd()');
  await app.settle();
  assert.deepEqual(app.calls, []);
});

test('live: a set that ends on its own gets the between-set ident', async () => {
  const app = loadApp();
  app.tuneLive();
  app.run('onTrackEnd()');
  await app.settle();
  assert.equal(app.calls.at(-1), 'play');
  assert.equal(app.player.src, '/media/a.mp3', 'tuned to the segment on air');
});

test('live: the next track of the same show plays without an ident', async () => {
  const app = loadApp();
  app.tuneLive('Next Show');
  app.run('onTrackEnd()');
  await app.settle();
  assert.ok(!app.calls.includes('play'), app.calls.join(','));
  assert.equal(app.player.src, '/media/a.mp3');
});

function handOver(app, before, segments) {
  const now = Date.now();
  app.responses['/api/v1/broadcast'] = () => ({
    serverTime: now,
    segments: segments.map((seg, i) => ({ id: 10 + i, startsAt: now - 1000 + i * 60000, durationMs: 60000, file: `/media/${i}.mp3`, ...seg })),
  });
  app.run(`playlist = { live: true, tracks: [{ id: 1, startsAt: 0, durationMs: 1, file: '/media/x.mp3', ...${JSON.stringify(before)} }] }; currentTrack = 0;`);
}

test('live: the station talk between sets opens with the ident', async () => {
  const app = loadApp();
  handOver(app, { showName: 'Set A' }, [{ showName: 'Between Shows', interlude: true }]);
  app.run('onTrackEnd()');
  await app.settle();
  assert.equal(app.calls.at(-1), 'play');
});

test('live: talk running on, and the set after it, bring no second ident', async () => {
  for (const next of [{ showName: 'Between Shows', interlude: true }, { showName: 'Set B' }]) {
    const app = loadApp();
    handOver(app, { showName: 'Between Shows', interlude: true }, [next]);
    app.run('onTrackEnd()');
    await app.settle();
    assert.ok(!app.calls.includes('play'), JSON.stringify(next));
  }
});

for (const control of ['nextTrack', 'prevTrack']) {
  test(`live: a manual ${control} resyncs without a between-set ident`, async () => {
    const app = loadApp();
    app.tuneLive();
    app.run(`${control}()`);
    await app.settle();
    assert.ok(!app.calls.includes('play'), app.calls.join(','));
    assert.equal(app.player.src, '/media/a.mp3');
  });
}

function onAirNow(app) {
  const now = Date.now();
  app.run(`
    playlistBase = '';
    playlist = { live: true, tracks: [
      { id: 1, startsAt: ${now - 60000}, durationMs: 59000, file: '/media/a.mp3', showName: 'S' },
      { id: 2, startsAt: ${now - 1000}, durationMs: 60000, file: '/media/b.mp3', showName: 'S' },
      { id: 3, startsAt: ${now + 59000}, durationMs: 60000, file: '/media/c.mp3', showName: 'S' },
    ] };
    currentTrack = 0;
  `);
}

test('live: a track change plays on when the broadcast call fails', async () => {
  const app = loadApp();
  delete app.responses['/api/v1/broadcast'];
  onAirNow(app);
  app.run('onTrackEnd()');
  await app.settle();
  assert.equal(app.player.src, '/media/b.mp3');
});

test('live: a track change with no timeline keeps trying', async () => {
  const app = loadApp();
  const answer = app.responses['/api/v1/broadcast'];
  delete app.responses['/api/v1/broadcast'];
  app.tuneLive();
  app.run('onTrackEnd()');
  await app.settle();
  assert.equal(app.player.src, '');

  app.responses['/api/v1/broadcast'] = answer;
  app.timers.at(-1)();
  await app.settle();
  assert.equal(app.player.src, '/media/a.mp3');
});

test('the next track plays from memory once it has arrived', async () => {
  const app = loadApp();
  app.responses['/media/c.mp3'] = () => ({});
  onAirNow(app);
  app.run('setupAudio()');
  await app.settle();
  assert.equal(app.player.src, '/media/b.mp3');

  app.run('currentTrack = 1; playlist.tracks[2].startsAt = 0; playlist.tracks[2].durationMs = 9e15; playlist.tracks.splice(1, 1); playlist.tracks[0].durationMs = 1; setupAudio()');
  await app.settle();
  assert.match(app.player.src, /^blob:/);
});

test('a new timeline leaves the track on air alone', async () => {
  const app = loadApp();
  onAirNow(app);
  app.run('setupAudio()');
  await app.settle();
  app.player.src = 'on-air';
  await app.run('refreshTimeline()');
  assert.equal(app.player.src, 'on-air');
});

test('a dropped stream comes back on its own', async () => {
  const app = loadApp();
  onAirNow(app);
  app.run('setupAudio()');
  await app.settle();
  app.player.src = '/media/dropped.mp3';
  app.player.error = { code: 2 };
  app.run('retryAudio()');
  app.timers.at(-1)();
  assert.equal(app.player.src, '/media/b.mp3');
});

test('background loading waits until the music has a cushion', () => {
  const app = loadApp();
  app.player.src = '/media/a.mp3';
  app.player.currentTime = 10;
  app.player.buffered = { length: 1, start: () => 0, end: () => 15 };
  assert.equal(app.run('musicHasCushion()'), false);

  app.player.buffered = { length: 1, start: () => 0, end: () => 40 };
  assert.equal(app.run('musicHasCushion()'), true);
});

test('a stream the listener stopped stays stopped', () => {
  const app = loadApp();
  onAirNow(app);
  app.player.error = { code: 2 };
  app.player.src = '/media/a.mp3';
  app.run('listenerStopped = true');
  const before = app.timers.length;
  app.run('retryAudio()');
  assert.equal(app.timers.length, before);
});

function tuneArchive(app, trackCount) {
  app.responses['/api/v1/shows/next'] = () => ({
    id: 'next', name: 'Next', tracks: [{ file: '/media/n.mp3', durationMs: 60000, title: 'N' }],
  });
  app.run(`
    showsList = [{ id: 'here' }, { id: 'next' }, { id: 'last' }];
    currentShowId = 'here';
    playlistBase = '';
    playlist = { tracks: ${JSON.stringify(Array.from({ length: trackCount }, (_, i) => ({ file: `/media/t${i}.mp3`, durationMs: 60000 })))} };
  `);
}

test('archive: the next track of the same show plays without an ident', async () => {
  const app = loadApp();
  tuneArchive(app, 3);
  app.run('onTrackEnd()');
  await app.settle();
  assert.ok(!app.calls.includes('play'), app.calls.join(','));
  assert.equal(app.player.src, '/media/t1.mp3');
});

test('archive: a show that ends on its own plays the ident into the next, a skip does not', async () => {
  const natural = loadApp();
  tuneArchive(natural, 1);
  natural.run('onTrackEnd()');
  await natural.settle();
  assert.equal(natural.calls.at(-1), 'play');
  assert.equal(natural.player.src, '/media/n.mp3');

  const skipped = loadApp();
  tuneArchive(skipped, 1);
  skipped.run('nextTrack()');
  await skipped.settle();
  assert.ok(!skipped.calls.includes('play'), skipped.calls.join(','));
  assert.equal(skipped.player.src, '/media/n.mp3');
});

test('the static build ships ident.js alongside the player', () => {
  const dist = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dir-dist-'));
  const result = require('node:child_process').spawnSync('python3', ['-c',
    'import sys, pathlib, build_site as b; b.DIST_DIR = pathlib.Path(sys.argv[1]); b._build_dist_static()', dist,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(dist, 'ident.js'), 'utf8'), read('public/ident.js'));
  fs.rmSync(dist, { recursive: true, force: true });
});
