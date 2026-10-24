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

function stubContext(log) {
  const ctx = {
    font: '', fillStyle: '', globalAlpha: 1, textAlign: 'left', textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    save() {}, restore() {},
    measureText(s) { return { width: 10 * String(s).length }; },
    fillText(s, x, y) { log.push({ text: String(s), x, y, style: ctx.fillStyle, alpha: ctx.globalAlpha }); },
    fillRect() {},
    clearRect() { log.push({ clear: true }); },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, drawImage() {},
  };
  return ctx;
}

function loadIdents() {
  const log = [];
  const classes = new Set();
  const timers = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => stubContext(log),
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
  let rafCallback = null;
  let nowMs = 0;
  const sandbox = {
    document: {
      createElement: () => ({ width: 0, height: 0, getContext: () => stubContext(log) }),
      getElementById: (id) => (id === 'ident-canvas' ? canvas : null),
    },
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, addEventListener() {} },
    performance: { now: () => nowMs },
    requestAnimationFrame: (cb) => { rafCallback = cb; return 1; },
    cancelAnimationFrame: () => { rafCallback = null; },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(read('public/ident.js'), sandbox);
  return {
    idents: sandbox.window.idents,
    canvas,
    classes,
    log,
    frame: (ms) => rafCallback(ms),
    setNow: (ms) => { nowMs = ms; },
    flush: () => { const due = timers.splice(0); due.forEach((fn) => fn && fn()); },
  };
}

test('ident.js keeps the lab ident contract', () => {
  const { idents } = loadIdents();
  assert.ok(idents, 'window.idents is exposed');
  assert.equal(typeof idents.init, 'function');
  assert.equal(typeof idents.play, 'function');
  assert.equal(typeof idents.stop, 'function');
  assert.ok(Array.isArray(idents.list) && idents.list.length >= 1);

  for (const ident of idents.list) {
    assert.equal(typeof ident.id, 'string');
    assert.equal(typeof ident.name, 'string');
    assert.equal(typeof ident.L, 'number');
    assert.ok(ident.L > 0);
    assert.equal(typeof ident.draw, 'function');
    assert.equal(ident.draw.length, 5, 'draw(ctx, w, h, t, state)');
  }
});

test('the block wall renders and the player ends on its own length', () => {
  const { idents, canvas, classes, log, frame } = loadIdents();
  idents.init();
  idents.play();
  assert.ok(classes.has('on'), 'ident canvas takes the stage');
  assert.equal(canvas.width, 1920, 'sized to the viewport at capped dpr');
  assert.equal(canvas.height, 1080);

  frame(3000);
  const text = log.filter((entry) => entry.text);
  assert.ok(text.some((entry) => entry.text === '█'), 'block glyphs are drawn');
  assert.ok(text.some((entry) => entry.style === '#ff5a1f'), 'the band locks in station orange');

  frame(12000);
  assert.ok(!classes.has('on'), 'hides itself once its length is up');
});

test('stop clears the frame so a skipped track cannot leave a half-drawn ident', () => {
  const { idents, canvas, classes, log, frame } = loadIdents();
  idents.init();
  idents.play();
  frame(3000);
  log.length = 0;
  idents.stop();
  assert.ok(!classes.has('on'));
  assert.ok(log.some((entry) => entry.clear), 'canvas is cleared');
  assert.equal(canvas.width, 1920);
});

test('a load ident fills the wait, rotating until the audio starts', () => {
  const { idents, classes, frame, flush } = loadIdents();
  idents.init();
  idents.load();
  assert.ok(!classes.has('on'), 'a fast load does not flash an ident frame');
  flush();
  assert.ok(classes.has('on'), 'a real wait gets an ident');
  frame(12000);
  assert.ok(classes.has('on'), 'rolls on to the next ident instead of going blank');
  idents.loadDone();
  assert.ok(!classes.has('on'), 'clears the moment the audio starts');
});

test('audio that starts first cancels a queued load ident', () => {
  const { idents, classes, flush } = loadIdents();
  idents.init();
  idents.load();
  idents.loadDone();
  flush();
  assert.ok(!classes.has('on'), 'a load that finished waiting never flashes an ident');
});

test('a load ident already on screen keeps running when the audio re-arms the wait', () => {
  const { idents, classes, frame, flush, log, setNow } = loadIdents();
  idents.init();
  idents.load();
  flush();
  frame(3000);
  setNow(3000);
  idents.load();
  flush();
  log.length = 0;
  frame(3016);
  assert.ok(classes.has('on'), 'the frame never goes blank');
  assert.ok(log.some((entry) => entry.style === '#ff5a1f'), 'the ident carries on mid-reveal instead of restarting');
});

function loadApp() {
  const calls = [];
  const listeners = {};
  const player = {
    src: '', currentTime: 0, volume: 1, paused: true, readyState: 4, duration: 180,
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
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
      return { ok: true, json: async () => responses[key]() };
    },
    setTimeout: () => 0,
    clearTimeout() {},
    requestAnimationFrame: () => 0,
    visuals: { init() {}, next() {}, notify() {} },
    canvasFilters: {},
    gallery: { init() { throw new Error('boot stops after the ident wiring'); } },
    idents: {
      init() {}, load: () => calls.push('load'), loadDone: () => calls.push('loadDone'),
      play: () => calls.push('play'), stop: () => calls.push('stop'),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(read('public/app.js'), sandbox);
  const live = () => {
    const now = Date.now();
    return {
      serverTime: now,
      segments: [
        { startsAt: now - 1000, durationMs: 60000, file: '/media/a.mp3', title: 'A' },
        { startsAt: now + 59000, durationMs: 60000, file: '/media/b.mp3', title: 'B' },
      ],
    };
  };
  responses['/api/v1/broadcast'] = live;
  return {
    calls,
    player,
    listeners,
    responses,
    run: (code) => vm.runInContext(code, sandbox),
    settle: async () => { for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r)); },
    tuneLive: () => vm.runInContext(`playlist = { live: true, tracks: [{ startsAt: 0, durationMs: 1, file: '/media/x.mp3' }] };`, sandbox),
  };
}

test('boot fills the wait with a load ident that the first audio frame clears', async () => {
  const app = loadApp();
  await assert.rejects(app.run('init()'), /boot stops after the ident wiring/);
  assert.deepEqual(app.calls, ['load']);
  app.listeners.playing.forEach((fn) => fn());
  assert.deepEqual(app.calls, ['load', 'loadDone']);
});

test('tuning in leaves a load ident on screen until the audio plays', () => {
  const app = loadApp();
  app.run(`playlist = { tracks: [{ file: '/media/a.mp3', durationMs: 60000 }] }; setupAudio();`);
  assert.deepEqual(app.calls, ['load']);
});

test('live: a set that ends on its own gets the between-set ident', async () => {
  const app = loadApp();
  app.tuneLive();
  app.run('onTrackEnd()');
  await app.settle();
  assert.equal(app.calls.at(-1), 'play');
  assert.equal(app.player.src, '/media/a.mp3', 'tuned to the segment on air');
});

for (const control of ['nextTrack', 'prevTrack']) {
  test(`live: a manual ${control} resyncs without a between-set ident`, async () => {
    const app = loadApp();
    app.tuneLive();
    app.run(`${control}()`);
    await app.settle();
    assert.ok(!app.calls.includes('play'), app.calls.join(','));
    assert.ok(app.calls.includes('load'), 'the fetch wait can still fill with a load ident');
    assert.equal(app.player.src, '/media/a.mp3');
  });
}

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

for (const [label, trackCount, src] of [['playlist', 3, '/media/t1.mp3'], ['single-track show', 1, '/media/n.mp3']]) {
  test(`archive ${label}: natural end plays the ident, a skip does not`, async () => {
    const natural = loadApp();
    tuneArchive(natural, trackCount);
    natural.run('onTrackEnd()');
    await natural.settle();
    assert.equal(natural.calls.at(-1), 'play');
    assert.equal(natural.player.src, src);

    const skipped = loadApp();
    tuneArchive(skipped, trackCount);
    skipped.run('nextTrack()');
    await skipped.settle();
    assert.ok(!skipped.calls.includes('play'), skipped.calls.join(','));
    assert.equal(skipped.player.src, src);
  });
}

test('the static build ships ident.js alongside the player', () => {
  const dist = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'dir-dist-'));
  const result = require('node:child_process').spawnSync('python3', ['-c',
    'import sys, pathlib, build_site as b; b.DIST_DIR = pathlib.Path(sys.argv[1]); b._build_dist_static()', dist,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(dist, 'ident.js'), 'utf8'), read('public/ident.js'));
  fs.rmSync(dist, { recursive: true, force: true });
});
