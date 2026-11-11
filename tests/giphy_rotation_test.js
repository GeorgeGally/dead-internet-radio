'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/visuals/giphy.js'), 'utf8');

function loadGiphy({ fetchOk = true, cacheAge = null, random = () => 0.5 } = {}) {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const element = (tag) => ({
    tagName: tag === 'video' ? 'VIDEO' : undefined,
    play: () => Promise.resolve(),
    pause() {},
    load() {
      if (!this.oncanplaythrough) return;
      this.readyState = 4;
      context.setTimeout(() => this.oncanplaythrough && this.oncanplaythrough(), 0);
    },
    style: {}, setAttribute() {}, removeAttribute() {}, decode: () => new Promise(() => {}), classList: { add() {}, remove() {} }, getContext: () => null, width: 0, height: 0 });
  const gifBg = { ...element('video'), readyState: 4, videoWidth: 320, replaceWith() {} };
  const fetches = [];
  let artwork = null;
  const context = {
    console: { log() {}, warn() {} },
    Math: Object.assign(Object.create(Math), { random }),
    performance: { now: () => now },
    Date: { now: () => now },
    setTimeout(fn, ms) { const id = nextId++; timers.set(id, { fn, due: now + (ms || 0), ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
    localStorage: { store: cacheAge == null ? {} : { dir_gif_cache_v2: JSON.stringify({ ts: -cacheAge, items: [{ mp4: 'https://media.test/cached.mp4' }] }) }, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); }, removeItem(k) { delete this.store[k]; } },
    playlist: { tracks: [{ title: 'x' }] },
    fetch(url) {
      fetches.push(url);
      if (!fetchOk) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [1, 2, 3, 4].map((i) => ({ images: { original: { mp4: `https://media.test/${fetches.length}-${i}.mp4` } } })) }) });
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

const REFRESH_MS = 3 * 60 * 1000;

async function searchesDuring(g, fn) {
  const before = g.fetches.length;
  await fn();
  await g.advance(10);
  return g.fetches.length - before;
}

test('no search happens while Giphy is off screen, however long', async () => {
  const g = loadGiphy();
  g.artwork.start();
  g.artwork.stop();
  assert.equal(await searchesDuring(g, () => g.advance(6 * 60 * 60 * 1000)), 0);
});

test('a start more than three minutes after the last search searches once', async () => {
  const g = loadGiphy();
  g.artwork.start();
  await g.advance(10);
  g.artwork.stop();
  await g.advance(REFRESH_MS + 1000);
  assert.equal(await searchesDuring(g, () => g.artwork.start()), 1);
  g.artwork.stop();
  assert.equal(await searchesDuring(g, () => g.artwork.start()), 0);
});

test('a start within three minutes of the last search does not search', async () => {
  const g = loadGiphy();
  g.artwork.start();
  await g.advance(10);
  g.artwork.stop();
  await g.advance(REFRESH_MS - 1000);
  assert.equal(await searchesDuring(g, () => g.artwork.start()), 0);
});

test('a failed search is retried on the next start after three minutes', async () => {
  const g = loadGiphy({ fetchOk: false });
  g.artwork.start();
  await g.advance(10);
  g.artwork.stop();
  await g.advance(60000);
  assert.equal(await searchesDuring(g, () => g.artwork.start()), 0);
  g.artwork.stop();
  await g.advance(REFRESH_MS);
  assert.equal(await searchesDuring(g, () => g.artwork.start()), 1);
});

test('a recent cached pool is used on page load without a search', async () => {
  const g = loadGiphy({ cacheAge: 60000 });
  assert.equal(await searchesDuring(g, () => g.artwork.start()), 0);
});

test('an old cached pool is refreshed on Giphy\'s first appearance', async () => {
  const g = loadGiphy({ cacheAge: REFRESH_MS + 60000 });
  await g.advance(10);
  assert.equal(g.fetches.length, 0);
  assert.equal(await searchesDuring(g, () => g.artwork.start()), 1);
});

test('Giphy left on screen searches again once the pool is three minutes old', async () => {
  let n = 0;
  const g = loadGiphy({ random: () => ((n++ * 0.618034) % 1) });
  g.artwork.start();
  await g.advance(10);
  assert.equal(await searchesDuring(g, () => g.advance(REFRESH_MS - 20000)), 0);
  assert.equal(await searchesDuring(g, () => g.advance(40000)), 1);
});
