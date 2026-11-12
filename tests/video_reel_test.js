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

function themedPage(id, results) {
  const page = createPage(['prelinger_broll.js', 'aliens.js', 'robots.js'], [id]);
  page.searches = [];
  page.context.fetch = async (url) => {
    page.fetches.push(url);
    if (url.includes('broll-index/search')) {
      const q = decodeURIComponent(url.split('q=')[1].split('&')[0]);
      page.searches.push(q);
      const docs = url.includes('rows=0') ? [] : results(q).map((identifier) => ({ identifier }));
      return { ok: true, json: async () => ({ response: { numFound: 40, docs } }) };
    }
    return { ok: true, json: async () => ({ files: [{ name: 'film.mp4', size: 4e6, height: 360 }] }) };
  };
  return page;
}
const aliensPage = (results) => themedPage('aliens', results);
const robotsPage = (results) => themedPage('robots', results);

const alienFilms = (videos) => videos.filter((v) => v.url?.startsWith('/broll/')).map((v) => v.url.split('/')[2]);

test('Aliens plays what its archive.org UFO searches find, not a fixed list', async () => {
  const { artworks, context, videos, instances, searches, fetches } = aliensPage((q) => (q.includes('title:(ufo') ? ['saucer-reel', 'ufo-newsreel'] : ['martians-trailer']));
  assert.equal(artworks.prelinger_broll.name, 'B-roll');
  assert.equal(artworks.aliens.name, 'Aliens');
  await until(() => alienFilms(videos).length === 3);
  await tick();
  artworks.aliens.start();
  instances.at(-1).p.draw();

  assert.equal(context.__pb.ready, true);
  assert.equal(instances.at(-1).leaderDrawn, 0);
  assert.deepEqual(alienFilms(videos).sort(), ['martians-trailer', 'saucer-reel', 'ufo-newsreel']);
  assert.ok(searches.length >= 2);
  assert.ok(searches.every((q) => /ufo/i.test(q) && /flying saucer/i.test(q) && q.endsWith('AND mediatype:movies')));
  assert.ok(searches.some((q) => /martian/i.test(q)));
  assert.ok(!searches.some((q) => q.includes('classic_tv_commercials')));
  assert.ok(!fetches.some((url) => url.includes('giphy')));
});

test('Aliens searches again on a new track and plays the new results', async () => {
  let round = 0;
  const { artworks, context, videos, instances } = aliensPage(() => (round === 0 ? ['saucer-1', 'saucer-2'] : ['saucer-3', 'saucer-4']));
  await until(() => alienFilms(videos).length === 2);
  await tick();
  artworks.aliens.start();
  const before = context.__pb.films;
  assert.deepEqual(Array.from(before, (f) => f.id).sort(), ['saucer-1', 'saucer-2']);

  round = 1;
  context.playlist.tracks.push({ artist: 'Void Riders', title: 'Cold Signal', genre: 'industrial', bpm: 74 });
  context.currentTrack = 1;
  instances.at(-1).p.draw();

  await until(() => context.__pb.films !== before);
  assert.deepEqual(Array.from(context.__pb.films, (f) => f.id).sort(), ['saucer-3', 'saucer-4']);
  assert.ok(before.every((f) => f.video.removed));
});

test('Aliens picks films it has not shown lately, then the ones shown longest ago', async () => {
  const page = aliensPage((q) => (q.includes('title:(ufo') ? ['saucer-1', 'saucer-2', 'saucer-3'] : ['saucer-1', 'martian-1']));
  const store = { 'broll-recent:aliens': JSON.stringify(['saucer-1', 'saucer-2']) };
  page.context.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  page.artworks.aliens.start();
  await until(() => page.context.__pb.ready && !page.context.__pb.loading);

  assert.deepEqual(Array.from(page.context.__pb.films, (f) => f.id).sort(), ['martian-1', 'saucer-1', 'saucer-3']);
  const recent = JSON.parse(store['broll-recent:aliens']);
  assert.equal(recent[0], 'saucer-2');
  assert.deepEqual(recent.slice(1).sort(), ['martian-1', 'saucer-1', 'saucer-3']);
});

test('Aliens with no archive.org results shows nothing else in their place', async () => {
  const { artworks, context, videos, instances, fetches } = aliensPage(() => []);
  artworks.aliens.start();
  await until(() => context.__pb.failed);
  instances.at(-1).p.draw();

  assert.equal(context.__pb.failed, true);
  assert.equal(videos.length, 0);
  assert.ok(!fetches.some((url) => url.includes('giphy') || url.startsWith('/broll/')));
  assert.ok(instances.at(-1).leaderDrawn > 0);
});

test('Aliens hands its frame to the filters', async () => {
  const { artworks, context, videos, instances } = aliensPage(() => ['saucer-reel']);
  const filtered = [];
  context.canvasFilters.applyToP5 = (p) => filtered.push(p);
  artworks.aliens.start();
  await until(() => context.__pb.ready && !context.__pb.loading);
  instances.at(-1).p.draw();
  assert.equal(context.__pb.ready, true);
  assert.deepEqual(filtered, [instances.at(-1).p]);
});

test('Robots plays what its archive.org robot and AI searches find, not a fixed list', async () => {
  const { artworks, context, videos, instances, searches, fetches } = robotsPage((q) => (q.includes('title:(robot') ? ['grasp-lab', 'robot-monster'] : ['short-circuit']));
  assert.equal(artworks.robots.name, 'Robots');
  assert.equal(artworks.aliens.name, 'Aliens');
  await until(() => alienFilms(videos).length === 3);
  await tick();
  artworks.robots.start();
  instances.at(-1).p.draw();

  assert.equal(context.__pb.ready, true);
  assert.equal(instances.at(-1).leaderDrawn, 0);
  assert.deepEqual(alienFilms(videos).sort(), ['grasp-lab', 'robot-monster', 'short-circuit']);
  assert.equal(new Set(searches).size, 2);
  assert.ok(searches.every((q) => /\brobots?\b/.test(q) && q.includes('"artificial intelligence"') && q.endsWith('AND mediatype:movies')));
  assert.ok(searches.every((q) => q.length <= 500 && q.includes('item_size:[1000000 TO 90000000]')));
  assert.ok(!searches.some((q) => /\bai\b/i.test(q) || /ufo|saucer/i.test(q) || q.includes('classic_tv_commercials')));
  assert.ok(!fetches.some((url) => url.includes('giphy')));
});

test('Robots searches again on a new track and plays the new results', async () => {
  let round = 0;
  const { artworks, context, videos, instances } = robotsPage(() => (round === 0 ? ['robot-1', 'robot-2'] : ['robot-3', 'robot-4']));
  await until(() => alienFilms(videos).length === 2);
  await tick();
  artworks.robots.start();
  const before = context.__pb.films;

  round = 1;
  context.playlist.tracks.push({ artist: 'Void Riders', title: 'Cold Signal', genre: 'industrial', bpm: 74 });
  context.currentTrack = 1;
  instances.at(-1).p.draw();

  await until(() => context.__pb.films !== before);
  assert.deepEqual(Array.from(context.__pb.films, (f) => f.id).sort(), ['robot-3', 'robot-4']);
  assert.ok(before.every((f) => f.video.removed));
});

test('Robots with no archive.org results shows nothing else in their place', async () => {
  const { artworks, context, videos, instances, fetches } = robotsPage(() => []);
  artworks.robots.start();
  await until(() => context.__pb.failed);
  instances.at(-1).p.draw();

  assert.equal(videos.length, 0);
  assert.ok(!fetches.some((url) => url.includes('giphy') || url.startsWith('/broll/')));
  assert.ok(instances.at(-1).leaderDrawn > 0);
});

test('Robots hands its frame to the filters', async () => {
  const { artworks, context, instances } = robotsPage(() => ['grasp-lab']);
  const filtered = [];
  context.canvasFilters.applyToP5 = (p) => filtered.push(p);
  artworks.robots.start();
  await until(() => context.__pb.ready && !context.__pb.loading);
  instances.at(-1).p.draw();
  assert.deepEqual(filtered, [instances.at(-1).p]);
});

test('the original B-roll keeps its own themed searches', async () => {
  const { videos, fetches } = createPage(['prelinger_broll.js', 'aliens.js', 'robots.js'], ['prelinger_broll']);
  await until(() => videos.filter((v) => v.url?.startsWith('/broll/')).length === 3);
  const searched = fetches.filter((url) => url.includes('broll-index/search')).map(decodeURIComponent);
  assert.ok(searched.some((q) => q.includes('collection:classic_tv_commercials')));
  assert.ok(!searched.some((q) => q.includes('collection:movie_trailers')));
});
