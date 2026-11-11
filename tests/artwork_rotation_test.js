'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

const IDS = ['aliens', 'bugs3', 'giphy', 'grid', 'prelinger_broll', 'trail', 'twirlz', 'word_sparks'];
const FAVOURED = ['prelinger_broll', 'giphy', 'aliens'];
const OTHERS = IDS.filter((id) => !FAVOURED.includes(id));

function loadPlayer(seed = 7) {
  let s = seed;
  const random = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return (s + 0.5) / 4294967296;
  };
  const activated = [];
  let current = null;
  const sandbox = {
    Math: Object.assign(Object.create(Math), { random }),
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
    },
    location: { protocol: 'http:', hostname: 'radio.test', port: '', pathname: '/' },
    window: { location: { pathname: '/' }, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    AbortController,
    requestAnimationFrame: () => 0,
    visuals: {
      init() {}, next() {}, notify() {},
      getList: () => IDS.map((id) => ({ id })),
      getCurrentId: () => current,
      activate(id) { activated.push(id); return true; },
    },
    canvasFilters: {},
    gallery: { init() {}, whenQuiet: (fn) => fn() },
    idents: { init() {}, play() {}, stop() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/app.js'), 'utf8'), sandbox);
  return {
    pick(from) {
      current = from;
      activated.length = 0;
      vm.runInContext('randomArtwork()', sandbox);
      return activated[0];
    },
  };
}

function shares(from, draws = 40000) {
  const player = loadPlayer();
  const counts = Object.fromEntries(IDS.map((id) => [id, 0]));
  for (let i = 0; i < draws; i++) counts[player.pick(from)]++;
  return Object.fromEntries(IDS.map((id) => [id, counts[id] / draws]));
}

test('random changes favour Dead Telly, Giphy and Aliens over every other artwork', () => {
  const got = shares('prelinger_broll');
  const busiestOther = Math.max(...OTHERS.map((id) => got[id]));
  for (const id of FAVOURED) assert.ok(got[id] > 3 * busiestOther, `${id} ${got[id]} vs ${busiestOther}`);
  assert.ok(Math.abs(got.prelinger_broll - 0.45) < 0.015, `prelinger_broll ${got.prelinger_broll}`);
  assert.ok(Math.abs(got.giphy - 0.25) < 0.015, `giphy ${got.giphy}`);
  assert.ok(Math.abs(got.aliens - 0.15) < 0.015, `aliens ${got.aliens}`);
  const restShare = OTHERS.reduce((sum, id) => sum + got[id], 0);
  assert.ok(Math.abs(restShare - 0.15) < 0.015, `rest ${restShare}`);
});

test('every artwork stays reachable, and a non-favoured one hands the screen on', () => {
  const got = shares('bugs3');
  assert.equal(got.bugs3, 0);
  for (const id of IDS.filter((x) => x !== 'bugs3')) assert.ok(got[id] > 0.01, `${id} ${got[id]}`);
});
