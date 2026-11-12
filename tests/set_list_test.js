'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadSetList() {
  const sandbox = {
    document: { getElementById: () => null, addEventListener() {}, body: { classList: { add() {}, remove() {} } } },
    window: { addEventListener() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${fs.readFileSync(path.join(root, 'public/setlist.js'), 'utf8')}\nthis.setList = setList;`, sandbox);
  return sandbox.setList;
}

test('a segment is played, on, or next by the station clock', () => {
  const setList = loadSetList();
  const seg = { startsAt: 1000, durationMs: 500 };
  assert.equal(setList.state(seg, 999), 'next');
  assert.equal(setList.state(seg, 1000), 'now');
  assert.equal(setList.state(seg, 1499), 'now');
  assert.equal(setList.state(seg, 1500), 'played');
});

test('durations read as minutes and seconds', () => {
  const setList = loadSetList();
  assert.equal(setList.length(190032), '3:10');
  assert.equal(setList.length(8000), '0:08');
  assert.equal(setList.length(240000), '4:00');
});

test('the player opens the set list from its own key', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.match(html, /id="btn-set"[^>]*>.*Tracks/);
  assert.match(html, /id="set-led"/);
  assert.match(html, /<script src="setlist\.js"><\/script>/);
  const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
  for (const [, spacing] of css.slice(css.indexOf('/* ---- Set list')).matchAll(/letter-spacing:\s*([\d.]+)em/g)) {
    assert.ok(Number(spacing) <= 0.04, `letter-spacing ${spacing}em`);
  }
});

test('the set list reads the airing, not the old playlist', () => {
  const js = fs.readFileSync(path.join(root, 'public/setlist.js'), 'utf8');
  assert.match(js, /\/api\/v1\/airing/);
  assert.doesNotMatch(js, /\/playlist/);
  const routes = fs.readFileSync(path.join(root, 'config/routes.rb'), 'utf8');
  assert.match(routes, /get "airing", to: "airing#show"/);
});
