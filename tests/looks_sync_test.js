'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/visuals/gallery.js'), 'utf8');
const look = (cutoff) => ({ fx: { slots: [], focus: 0 }, cutoff, resonance: 50, strength: 100 });

// Runs gallery.js against a fake browser. `server` answers each fetch.
function player({ stored = {}, server }) {
  const store = new Map(Object.entries(stored));
  const calls = [];
  const saveCtrl = { hidden: true };
  const box = { classList: { add() {}, remove() {} }, textContent: '' };
  const sandbox = {
    console,
    setTimeout() { return 0; },
    clearTimeout() {},
    addEventListener() {},
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    document: {
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => (id === 'save-slot-ctrl' ? saveCtrl : null),
      createElement: () => box,
      body: { appendChild() {} },
    },
    canvasFilters: { list: () => [], getState: () => ({ slots: [], focus: 0 }), setState() {} },
    visuals: { getCurrentId: () => 'bouncy' },
    async fetch(url, options = {}) {
      calls.push({ url, method: options.method || 'GET', body: options.body && JSON.parse(options.body), headers: options.headers });
      const answer = server(url, options.method || 'GET', calls.at(-1).body);
      return { ok: answer !== null, json: async () => answer };
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(`${source}\nthis.gallery = gallery;`, sandbox);
  return { gallery: sandbox.gallery, store, calls, saveCtrl, box };
}

test('a listener takes the server looks and cannot save', async () => {
  const p = player({ server: () => ({ looks: { bouncy: { 2: look(90) } }, admin: false }) });
  await p.gallery.syncLooks();
  assert.equal(p.gallery.slotHasPreset('bouncy', 2), true);
  assert.equal(p.saveCtrl.hidden, true);
  await p.gallery.saveSlot(2);
  assert.equal(p.calls.length, 1);
});

test('the server replaces the cache, but a non-admin leaves old local looks in place', async () => {
  const old = JSON.stringify({ bouncy: { 7: look(70) } });
  const p = player({ stored: { 'visual-slot-presets': old }, server: () => ({ looks: {}, admin: false }) });
  assert.equal(p.gallery.slotHasPreset('bouncy', 7), true);
  await p.gallery.syncLooks();
  assert.equal(p.gallery.slotHasPreset('bouncy', 7), false);
  assert.equal(p.store.get('visual-slot-presets'), old);
  assert.equal(p.calls.length, 1);
});

test('the cached looks stand in when the server is out of reach', async () => {
  const p = player({
    stored: { 'visual-looks-cache': JSON.stringify({ bouncy: { 3: look(60) } }) },
    server: () => null,
  });
  await p.gallery.syncLooks();
  assert.equal(p.gallery.slotHasPreset('bouncy', 3), true);
  assert.equal(p.saveCtrl.hidden, true);
});

test('an admin browser uploads old looks once and confirms in one line', async () => {
  const old = JSON.stringify({ bouncy: { 7: look(70) } });
  const merged = { looks: { bouncy: { 1: look(10), 7: look(70) } }, added: 1, moved: 0, present: 0, left_out: 0 };
  const p = player({
    stored: { 'visual-slot-presets': old },
    server: (url) => (url.endsWith('/merge') ? merged : { looks: { bouncy: { 1: look(10) } }, admin: true, csrf_token: 't' }),
  });
  await p.gallery.syncLooks();

  const merge = p.calls.find((c) => c.url.endsWith('/merge'));
  assert.deepEqual(merge.body, { looks: JSON.parse(old) });
  assert.equal(merge.headers['X-CSRF-Token'], 't');
  assert.equal(p.saveCtrl.hidden, false);
  assert.equal(p.gallery.slotHasPreset('bouncy', 7), true);
  assert.equal(p.box.textContent, '1 look uploaded');
  assert.equal(p.store.has('visual-slot-presets'), false);
  assert.equal(p.store.get('visual-slot-presets-sent'), old);

  await p.gallery.syncLooks();
  assert.equal(p.calls.filter((c) => c.url.endsWith('/merge')).length, 1);
});

test('a failed upload keeps the old looks for next time', async () => {
  const old = JSON.stringify({ bouncy: { 7: look(70) } });
  const p = player({
    stored: { 'visual-slot-presets': old },
    server: (url) => (url.endsWith('/merge') ? null : { looks: {}, admin: true, csrf_token: 't' }),
  });
  await p.gallery.syncLooks();
  assert.equal(p.store.get('visual-slot-presets'), old);
  assert.equal(p.store.has('visual-slot-presets-sent'), false);
});

test('a save reaches the server before it counts', async () => {
  let accept = false;
  const p = player({
    server: (url, method) => {
      if (method === 'GET') return { looks: {}, admin: true, csrf_token: 't' };
      return accept ? {} : null;
    },
  });
  await p.gallery.syncLooks();

  await p.gallery.saveSlot(4);
  assert.equal(p.gallery.slotHasPreset('bouncy', 4), false);
  assert.equal(p.box.textContent, 'Slot 4 not saved');

  accept = true;
  await p.gallery.saveSlot(4);
  const put = p.calls.at(-1);
  assert.equal(put.method, 'PUT');
  assert.equal(put.url, '/api/v1/looks/bouncy/4');
  assert.equal(p.gallery.slotHasPreset('bouncy', 4), true);
  assert.equal(JSON.parse(p.store.get('visual-looks-cache')).bouncy[4].cutoff, 130);
});

test('pressing the slot dial goes round from 9 to off; turning it stops at 9', async () => {
  const p = player({ server: () => ({ looks: { bouncy: { 9: look(90) } }, admin: false }) });
  await p.gallery.syncLooks();
  p.gallery.selectSlot(9);
  p.gallery.nextSlot(1);
  assert.equal(p.gallery.getActiveSlot(), 9);
  p.gallery.nextSlot(1, true);
  assert.equal(p.gallery.getActiveSlot(), 0);
  p.gallery.nextSlot(1, true);
  assert.equal(p.gallery.getActiveSlot(), 1);
});
