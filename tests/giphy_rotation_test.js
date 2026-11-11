'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/visuals/giphy.js'), 'utf8');

function loadGiphy({ fetchOk = true } = {}) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const element = () => ({ style: {}, setAttribute() {}, removeAttribute() {}, load() {}, decode: () => new Promise(() => {}), classList: { add() {}, remove() {} }, getContext: () => null, width: 0, height: 0 });
  const gifBg = { ...element(), tagName: 'VIDEO', readyState: 4, videoWidth: 320, play: () => Promise.resolve(), pause() {} };
  const fetches = [];
  let artwork = null;
  const context = {
    console: { log() {}, warn() {} },
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    performance: { now: () => now },
    Date: { now: () => now },
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { fn, due: now + (ms || 0), ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
    localStorage: { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
    playlist: { tracks: [{ title: 'x' }] },
    fetch(url) {
      fetches.push(url);
      if (!fetchOk) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ images: { original: { mp4: `https://media.test/${fetches.length}.mp4` } } }] }) });
    },
    document: {
      getElementById: (id) => (id === 'gif-bg' ? gifBg : null),
      createElement: element,
      body: { prepend() {} },
    },
    visuals: { register(id, a) { artwork = a; }, getList: () => [{ id: 'giphy' }] },
    musicHasCushion: () => true,
  };
  context.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 800 };
  vm.runInNewContext(source, context);
  const pending = (pred) => [...timers.values()].filter(pred);
  const advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].due;
      due[1].fn();
      await new Promise((r) => setImmediate(r));
    }
    now = end;
    await new Promise((r) => setImmediate(r));
  };
  return { artwork, pending, advance, fetches };
}

const isDwell = (t) => t.ms > 0 && t.ms < 20000 && t.ms !== 1500;

test('a return finishes the dwell it left instead of starting a new one', async () => {
  const g = loadGiphy();
  g.artwork.start();
  const [first] = g.pending(isDwell);
  assert.equal(first.ms, 15000);
  await g.advance(6000);
  g.artwork.stop();
  await g.advance(4000);
  g.artwork.start();
  const [second] = g.pending(isDwell);
  assert.equal(second.ms, 9000);
});

test('the clip pool refreshes on the wall clock while Giphy is off screen', async () => {
  const g = loadGiphy();
  g.artwork.start();
  await g.advance(10);
  const searches = g.fetches.length;
  g.artwork.stop();
  await g.advance(60000);
  g.artwork.start();
  g.artwork.stop();
  await g.advance(121000);
  assert.equal(g.fetches.length, searches + 1);
});

test('a failed search is retried while Giphy is off screen', async () => {
  const g = loadGiphy({ fetchOk: false });
  g.artwork.start();
  g.artwork.stop();
  await g.advance(10);
  const searches = g.fetches.length;
  await g.advance(181000);
  assert.equal(g.fetches.length, searches + 1);
});
