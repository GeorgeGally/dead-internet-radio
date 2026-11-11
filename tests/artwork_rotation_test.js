'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

const IDS = ['aliens', 'bugs3', 'giphy', 'grid', 'prelinger_broll', 'trail', 'twirlz', 'word_sparks'];

function loadRotation(seed = 7) {
  const snippet = app.match(/const FAVOURED_SHARES[\s\S]*?\nfunction artworkOrder[\s\S]*?\n}\n/);
  assert.ok(snippet, 'artworkOrder is defined in public/app.js');
  let s = seed;
  const random = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return (s + 0.5) / 4294967296;
  };
  const MathSeeded = Object.create(Math);
  MathSeeded.random = random;
  const context = { Math: MathSeeded, visuals: { getList: () => IDS.map((id) => ({ id })) } };
  vm.runInNewContext(`${snippet[0]}\nthis.artworkOrder = artworkOrder;`, context);
  return context.artworkOrder;
}

function firstPickShares(skip, draws = 40000) {
  const artworkOrder = loadRotation();
  const counts = {};
  for (let i = 0; i < draws; i++) {
    const id = artworkOrder(skip)[0];
    counts[id] = (counts[id] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([id, n]) => [id, n / draws]));
}

test('random rotation favours Dead Telly, Giphy and Aliens', () => {
  const shares = firstPickShares([]);
  assert.ok(Math.abs(shares.prelinger_broll - 0.45) < 0.015, `prelinger_broll ${shares.prelinger_broll}`);
  assert.ok(Math.abs(shares.giphy - 0.25) < 0.015, `giphy ${shares.giphy}`);
  assert.ok(Math.abs(shares.aliens - 0.15) < 0.015, `aliens ${shares.aliens}`);
  const rest = IDS.filter((id) => !['prelinger_broll', 'giphy', 'aliens'].includes(id));
  const restShare = rest.reduce((sum, id) => sum + (shares[id] || 0), 0);
  assert.ok(Math.abs(restShare - 0.15) < 0.015, `rest ${restShare}`);
});

test('every other artwork can still be picked at random', () => {
  const shares = firstPickShares(['bugs3']);
  for (const id of IDS.filter((x) => x !== 'bugs3')) assert.ok(shares[id] > 0, `${id} never picked`);
  assert.equal(shares.bugs3, undefined);
});

test('the rotation order still lists every artwork it was not told to skip', () => {
  const artworkOrder = loadRotation();
  assert.deepEqual([...artworkOrder(['grid'])].sort(), IDS.filter((id) => id !== 'grid'));
  assert.deepEqual([...artworkOrder([])].sort(), IDS);
});
