'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/visuals/gallery.js'), 'utf8');
const look = (cutoff) => ({ fx: { slots: [], focus: 0 }, cutoff, resonance: 50, strength: 100 });

// Just enough of an element for the slot message.
function fakeElement() {
  const classes = new Set();
  return {
    id: '',
    hidden: false,
    textContent: '',
    children: [],
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(' ').filter(Boolean).forEach((c) => classes.add(c)); },
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    setAttribute() {},
    appendChild(child) { this.children.push(child); return child; },
  };
}

// The slot message as a listener sees it: which keys show, and their state.
function message(box) {
  const part = (cls) => box.children.find((c) => c.classList.contains(cls));
  const keys = part('pads');
  const line = part('line');
  return {
    shown: box.classList.contains('show'),
    fail: box.classList.contains('fail'),
    keys: keys.hidden ? null : keys.children.map((k) => k.className.replace('pad', '').trim() || '-').join(' '),
    name: line.children[0].textContent,
    words: line.children[1].textContent,
  };
}

// Runs gallery.js against a fake browser. `server` answers each fetch.
function player({ stored = {}, server }) {
  const store = new Map(Object.entries(stored));
  const calls = [];
  const saveCtrl = { hidden: true };
  const activated = [];
  const restored = {};
  let currentId = 'bouncy';
  let box = null;
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
      createElement: () => fakeElement(),
      body: { appendChild(el) { if (el.id === 'saved-box') box = el; } },
    },
    canvasFilters: { list: () => [], getState: () => ({ slots: [], focus: 0 }), setState(state) { restored.fx = state; } },
    visuals: { getCurrentId: () => currentId, getCurrentName: () => currentId === 'bouncy' ? 'Bouncy' : 'Other', activate(id) { activated.push(id); currentId = id; return true; } },
    _restoreCutoff: (v) => { restored.cutoff = v; },
    _restoreResonance: (v) => { restored.resonance = v; },
    _restoreStrength: (v) => { restored.strength = v; },
    async fetch(url, options = {}) {
      calls.push({ url, method: options.method || 'GET', body: options.body && JSON.parse(options.body), headers: options.headers });
      const answer = await server(url, options.method || 'GET', calls.at(-1).body);
      return { ok: answer !== null, json: async () => answer };
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(`${source}\nthis.gallery = gallery;`, sandbox);
  return { gallery: sandbox.gallery, store, calls, saveCtrl, message: () => message(box), activated, restored, activate: sandbox.visuals.activate };
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
  assert.deepEqual(p.message(), { shown: true, fail: false, keys: null, name: '', words: '1 look uploaded' });
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
  assert.deepEqual(p.message(), { shown: true, fail: true, keys: '- - - now - - - - -', name: 'Bouncy', words: 'Slot 4 not saved' });

  accept = true;
  await p.gallery.saveSlot(4);
  const put = p.calls.at(-1);
  assert.equal(put.method, 'PUT');
  assert.equal(put.url, '/api/v1/looks/bouncy/4');
  assert.equal(p.gallery.slotHasPreset('bouncy', 4), true);
  assert.equal(JSON.parse(p.store.get('visual-looks-cache')).bouncy[4].cutoff, 130);
  assert.deepEqual(p.message(), { shown: true, fail: false, keys: '- - - now - - - - -', name: 'Bouncy', words: 'Slot 4 saved' });
});

test('a saved slot shows the keypad: filled slots cream, the new one orange, the artwork named', async () => {
  const p = player({
    server: (url, method) => (method === 'GET' ? { looks: { bouncy: { 1: look(10), 5: look(50) }, other: { 2: look(20) } }, admin: true, csrf_token: 't' } : {}),
  });
  await p.gallery.syncLooks();
  await p.gallery.saveSlot(3);
  assert.deepEqual(p.message(), { shown: true, fail: false, keys: 'full - now - full - - - -', name: 'Bouncy', words: 'Slot 3 saved' });
});

test('a pending save reports the artwork it started with on success and failure', async () => {
  for (const succeeds of [true, false]) {
    let finish;
    const p = player({
      server: (url, method) => method === 'GET'
        ? { looks: { bouncy: { 1: look(10) }, other: { 2: look(20) } }, admin: true }
        : new Promise((resolve) => { finish = resolve; }),
    });
    await p.gallery.syncLooks();
    const saving = p.gallery.saveSlot(3);
    p.activate('other');
    finish(succeeds ? {} : null);
    await saving;
    assert.deepEqual(p.message(), {
      shown: true, fail: !succeeds, keys: 'full - now - - - - - -',
      name: 'Bouncy', words: succeeds ? 'Slot 3 saved' : 'Slot 3 not saved',
    });
  }
});

test('turning the slot dial names the slot without the keypad', async () => {
  const p = player({ server: () => ({ looks: {}, admin: false }) });
  await p.gallery.syncLooks();
  p.gallery.nextSlot(1);
  assert.deepEqual(p.message(), { shown: true, fail: false, keys: null, name: '', words: 'Slot 1' });
  p.gallery.nextSlot(-1);
  assert.equal(p.message().words, 'Slot off');
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

test('slot preview loads its artwork and exact saved settings without uploading old looks', async () => {
  const old = JSON.stringify({ bouncy: { 7: look(70) } });
  const p = player({ stored: { 'visual-slot-presets': old }, server: () => ({
    looks: { bouncy: { 2: look(55), 7: look(200) }, grid: { 2: { ...look(180), fx: { slots: [[6, true, 0.2, 0.8]], focus: 0 } } } }, admin: true,
  }) });
  assert.equal(await p.gallery.previewSlot('grid', 2), true);
  assert.deepEqual(p.activated, ['grid']);
  assert.equal(p.gallery.getActiveSlot(), 2);
  assert.equal(p.restored.cutoff, 180);
  assert.equal(p.restored.resonance, 50);
  assert.equal(p.restored.strength, 100);
  assert.equal(JSON.stringify(p.restored.fx), JSON.stringify({ slots: [[6, true, 0.2, 0.8]], focus: 0 }));
  assert.equal(await p.gallery.previewSlot('bouncy', 7), true);
  assert.deepEqual(p.activated, ['grid', 'bouncy']);
  assert.equal(p.gallery.getActiveSlot(), 7);
  assert.equal(p.restored.cutoff, 200);
  assert.deepEqual(p.calls.map(c => [c.url, c.method]), [['/api/v1/looks', 'GET'], ['/api/v1/looks', 'GET']]);
  assert.equal(p.store.get('visual-slot-presets'), old);
  assert.equal(p.store.size, 1);
});

test('slot preview fails without substituting another slot or cached look', async () => {
  for (const response of [null, { looks: {} }]) {
    const p = player({ stored: { 'visual-looks-cache': JSON.stringify({ bouncy: { 2: look(55) } }) }, server: () => response });
    assert.equal(await p.gallery.previewSlot('bouncy', 2), false);
    assert.deepEqual(p.activated, []);
    assert.deepEqual(p.restored, {});
  }
});
