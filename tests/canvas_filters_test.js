'use strict';

// The FX unit: three slots of shader filters, two parameters each, dry/wet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/visuals/filters.js'), 'utf8');

function loadFilters() {
  const win = { addEventListener() {} };
  const factory = new Function('window', 'document', `${source}\nreturn canvasFilters;`);
  return { win, fx: factory(win, {}) };
}

test('every filter has a name, two named parameters with 0-1 defaults, and a shader body', () => {
  const { fx } = loadFilters();
  const keys = new Set();
  for (const f of fx.FILTERS) {
    assert.ok(f.name, `filter ${f.key} has a name`);
    assert.ok(!keys.has(f.key), `key ${f.key} is unique`);
    keys.add(f.key);
    assert.equal(f.params.length, 2, `${f.name} has two parameters`);
    for (const [label, v] of f.params) {
      assert.ok(label && label.length <= 8, `${f.name} parameter label "${label}" fits under a knob`);
      assert.ok(v >= 0 && v <= 1, `${f.name} default ${v} is 0-1`);
    }
    assert.match(f.body, /return /, `${f.name} returns a colour`);
  }
  // The old number keys still pick the same filters.
  for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) assert.ok(keys.has(k), `key ${k} kept`);
});

test('picking a filter fills the focused slot and turns it on; 0 clears', () => {
  const { fx } = loadFilters();
  fx.setFocus(1);
  fx.setActive(10);
  assert.deepEqual([...fx.getActiveKeys()], [10]);
  assert.equal(fx.getSlots()[1].key, 10);
  assert.equal(fx.getSlots()[0].key, null);
  fx.setFocus(0);
  fx.setActive(4);
  assert.deepEqual([...fx.getActiveKeys()].sort((a, b) => a - b), [4, 10]);
  assert.equal(fx.getActiveName(), 'Chromatic Aberration + Dither');
  fx.clearActive();
  assert.equal(fx.getActiveKeys().size, 0);
  assert.equal(fx.getSlots()[1].key, 10, 'clearing switches off, keeps the filter in the slot');
});

test('a slot cannot be switched on empty, and a new filter starts at its defaults', () => {
  const { fx } = loadFilters();
  fx.setSlotOn(2, true);
  assert.equal(fx.getSlots()[2].on, false);
  fx.setSlotFilter(2, 7);
  fx.setParam(2, 0, 0.9);
  fx.setSlotFilter(2, 6);
  const posterize = fx.FILTERS.find((f) => f.key === 6);
  assert.deepEqual(fx.getSlots()[2].p, posterize.params.map(([, v]) => v));
});

test('state round-trips for slot presets', () => {
  const { fx } = loadFilters();
  fx.setSlotFilter(0, 2);
  fx.setSlotOn(0, true);
  fx.setParam(0, 1, 0.8);
  fx.setSlotFilter(2, 13);
  const saved = JSON.parse(JSON.stringify(fx.getState()));
  fx.clearActive();
  fx.setSlotFilter(0, null);
  fx.setState(saved);
  assert.deepEqual(fx.getState(), saved);
  assert.equal(fx.getSlots()[0].p[1], 0.8);
});

test('dry/wet takes the old 0-100 strength and clamps', () => {
  const { fx, win } = loadFilters();
  fx.setStrength(40);
  assert.equal(fx.getWet(), 0.4);
  assert.equal(win.filterStrength, 40);
  fx.setWet(3);
  assert.equal(fx.getWet(), 1);
});
