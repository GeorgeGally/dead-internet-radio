'use strict';

// The rotation's erratic clock lands on the video artworks for a second or two
// at a time, far faster than a film loads, so everything buffered has to
// survive the artwork leaving.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
async function until(check) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await tick();
  }
  assert.fail('condition never met');
}

function fakeVideo(videos) {
  const listeners = {};
  const v = {
    tagName: 'VIDEO',
    style: {},
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    duration: 12,
    currentTime: 0,
    paused: true,
    removed: false,
    buffered: { length: 1, start: () => 0, end: () => 5 },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatch(type) { (listeners[type] || []).forEach((fn) => fn()); },
    setAttribute() {},
    removeAttribute(name) { if (name === 'src') delete v.url; },
    load() {},
    remove() { v.removed = true; },
    replaceWith() {},
    play() { v.paused = false; return Promise.resolve(); },
    pause() { v.paused = true; },
    set src(url) {
      v.url = url;
      videos.push(v);
      setTimeout(() => {
        v.readyState = 4;
        v.videoWidth = 640;
        v.videoHeight = 480;
        ['loadedmetadata', 'canplay'].forEach((t) => (listeners[t] || []).forEach((fn) => fn()));
        if (v.oncanplaythrough) v.oncanplaythrough();
      }, 0);
    },
  };
  return v;
}

function createPage(file, enabledIds = ['giphy', 'prelinger_broll']) {
  const fetches = [];
  const videos = [];
  const artworks = {};
  const instances = [];
  const context = {
    console: { warn() {}, error() {} },
    performance,
    setTimeout,
    clearTimeout,
    URL,
    Promise,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    addEventListener() {},
    removeEventListener() {},
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 1,
    playlist: { tracks: [{ artist: 'Void Riders', title: 'Soft Focus', genre: 'synth', bpm: 80 }] },
    currentTrack: 0,
    audioAnalysisReady: false,
    canvasFilters: { applyToP5() {}, apply() {} },
    visuals: {
      register(id, art) { artworks[id] = art; },
      getList: () => enabledIds.map((id) => ({ id })),
    },
    document: {
      body: { appendChild() {}, prepend() {} },
      getElementById: () => null,
      createElement(tag) {
        if (tag === 'video') return fakeVideo(videos);
        return { style: {}, getContext: () => ({ drawImage() {}, getImageData: () => { throw new Error('no pixels'); } }) };
      },
    },
    p5: class {
      constructor(sketch) {
        this.leaderDrawn = 0;
        const instance = this;
        const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
        this.p = new Proxy({ width: 390, height: 844, drawingContext: ctx, background() { instance.leaderDrawn++; }, floor: Math.floor }, {
          get: (t, k) => (k in t ? t[k] : () => ({ position() {}, style() {} })),
          set: (t, k, v) => { t[k] = v; return true; },
        });
        sketch(this.p);
        instances.push(this);
      }
      remove() {}
    },
    async fetch(url) {
      fetches.push(url);
      const body = url.includes('broll-index/search')
        ? { response: { numFound: 40, docs: [{ identifier: 'one' }, { identifier: 'two' }, { identifier: 'three' }] } }
        : url.includes('giphy')
          ? { data: [1, 2, 3, 4].map((i) => ({ images: { original: { mp4: `https://media.test/${i}.mp4` } } })) }
          : { files: [{ name: 'film.mp4', size: 4e6, height: 360 }] };
      return { ok: true, json: async () => body };
    },
  };
  context.window = context;
  vm.createContext(context);
  for (const script of [file].flat()) {
    vm.runInContext(fs.readFileSync(path.join(root, 'public/visuals', script), 'utf8'), context);
  }
  return { context, artworks, videos, instances, fetches };
}

test('the b-roll reel loads before the artwork is ever on screen', async () => {
  const { artworks, context, videos, instances, fetches } = createPage('prelinger_broll.js');
  await until(() => videos.filter((v) => v.url?.startsWith('/broll/')).length === 3);
  await tick();

  artworks.prelinger_broll.start();
  instances.at(-1).p.draw();

  assert.equal(context.__pb.ready, true);
  assert.deepEqual(videos.filter((v) => v.url?.startsWith('/broll/')).map((v) => v.url).sort(), ['/broll/one/film.mp4', '/broll/three/film.mp4', '/broll/two/film.mp4']);
  assert.ok(fetches.some((url) => decodeURIComponent(url).includes('collection:classic_tv_commercials')));
  assert.equal(instances.at(-1).leaderDrawn, 0);
});

test('leaving the b-roll artwork keeps the reel and coming back plays it', async () => {
  const { artworks, context, videos, instances } = createPage('prelinger_broll.js');
  const art = artworks.prelinger_broll;
  await until(() => videos.filter((v) => v.url?.startsWith('/broll/')).length === 3);
  await tick();

  art.start();
  const reel = [...context.__pb.films];
  const opened = videos.length;
  art.stop();

  assert.ok(reel.every((f) => f.video.paused && !f.video.removed && f.video.url));

  art.start();
  instances.at(-1).p.draw();

  assert.deepEqual(Array.from(context.__pb.films, (f) => f.id), reel.map((f) => f.id));
  assert.equal(videos.length, opened);
  assert.equal(instances.at(-1).leaderDrawn, 0);
  assert.equal(reel.some((f) => !f.video.paused), true);
});

test('a load in flight carries on after the artwork leaves', async () => {
  const { artworks, context, videos } = createPage('prelinger_broll.js');
  const art = artworks.prelinger_broll;
  art.start();
  art.stop();

  await until(() => videos.filter((v) => v.url?.startsWith('/broll/')).length === 3);
  await tick();

  assert.equal(context.__pb.ready, true);
  assert.ok(context.__pb.films.every((f) => f.video.paused));
});

test('a new track hands over only when the new reel can play', async () => {
  const { artworks, context, videos, instances } = createPage('prelinger_broll.js');
  const art = artworks.prelinger_broll;
  await until(() => videos.filter((v) => v.url?.startsWith('/broll/')).length === 3);
  await tick();
  art.start();
  const before = context.__pb.films;

  context.playlist.tracks.push({ artist: 'Void Riders', title: 'Cold Signal', genre: 'industrial', bpm: 74 });
  context.currentTrack = 1;
  instances.at(-1).p.draw();

  assert.equal(context.__pb.films, before);
  await until(() => context.__pb.films !== before);
  assert.ok(before.every((f) => f.video.removed));
});

test('giphy holds two buffered clips and keeps them when the artwork leaves', async () => {
  const { artworks, videos } = createPage('giphy.js');
  const art = artworks.giphy;
  await until(() => videos.length === 2);
  await tick();

  art.start();
  art.stop();
  await tick();

  assert.ok(videos.length >= 2);
  assert.ok(videos.every((v) => v.url));
});


test('Aliens plays only its verified shots, including after a track change and rotation', async () => {
  const { artworks, context, videos, instances, fetches } = createPage(['prelinger_broll.js', 'aliens.js'], ['aliens']);
  assert.equal(artworks.prelinger_broll.name, 'B-roll');
  assert.equal(artworks.aliens.name, 'Aliens');
  artworks.aliens.start();
  instances.at(-1).p.draw();
  await until(() => videos.length === 2);
  await tick();
  const expected = [
    '/broll/trailer-killers-from-space-1954/Trailer%20Killers%20from%20Space%20(1954).ia.mp4',
    '/broll/invaders-from-mars/Invaders%20From%20Mars.ia.mp4',
  ];
  assert.deepEqual(videos.map((v) => v.url).sort(), [...expected].sort());
  assert.deepEqual(videos.map((v) => v.currentTime), [39, 94.6]);
  videos[0].currentTime = 47.7;
  videos[1].currentTime = 98.2;
  videos.forEach((v) => v.dispatch('timeupdate'));
  assert.deepEqual(videos.map((v) => v.currentTime), [39, 94.6]);
  assert.deepEqual(fetches, []);
  artworks.aliens.stop();
  artworks.aliens.start();
  instances.at(-1).p.draw();
  assert.equal(videos.length, 2);
  for (const v of videos) v.currentTime = 0;
  instances.at(-1).p.draw();
  assert.equal(videos.some((v) => v.currentTime === 39 || v.currentTime === 94.6), true);
  context.playlist.tracks.push({ title: 'Factory Radio Highway', artist: 'Computer Ads', bpm: 140 });
  context.currentTrack = 1;
  instances.at(-1).p.draw();
  await until(() => videos.length === 4);
  await tick();
  assert.deepEqual([...new Set(videos.map((v) => v.url).filter(Boolean))].sort(), [...expected].sort());
  assert.deepEqual(fetches, []);
});
