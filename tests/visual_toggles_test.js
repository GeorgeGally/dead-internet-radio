'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function createSandbox() {
  const bodyClasses = new Set();
  return {
    console: { warn() {} },
    Math: Object.create(Math, {
      random: { value: () => 0 },
    }),
    setTimeout(callback) {
      return callback();
    },
    clearTimeout() {},
    requestAnimationFrame() {
      return 1;
    },
    document: {
      body: {
        classList: {
          add(name) { bodyClasses.add(name); },
          remove(name) { bodyClasses.delete(name); },
          contains(name) { return bodyClasses.has(name); },
        },
        appendChild() {},
      },
      createElement() {
        return { classList: { add() {}, remove() {} }, style: {} };
      },
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
      getElementById() {
        return null;
      },
    },
    window: { addEventListener() {} },
    getComputedStyle() {
      return { display: 'block' };
    },
  };
}

function loadEngine() {
  const enginePath = path.join(root, 'public/visuals/engine.js');
  const source = fs.readFileSync(enginePath, 'utf8');
  return vm.runInNewContext(`${source}\nvisuals;`, createSandbox(), { filename: enginePath });
}

function withArtworks() {
  const visuals = loadEngine();
  const started = [];
  for (const id of ['alpha', 'beta', 'gamma']) {
    visuals.register(id, {
      name: id.toUpperCase(),
      start() { started.push(id); },
      stop() {},
    });
  }
  return { visuals, started };
}

test('switched-off artworks are hidden and skipped', () => {
  const { visuals, started } = withArtworks();

  visuals.setEnabled(['alpha', 'gamma']);
  assert.equal(visuals.getList().map((v) => v.id).join(','), 'alpha,gamma');

  assert.equal(visuals.random(), true);
  assert.equal(visuals.getCurrentId(), 'alpha');
  visuals.next();
  assert.equal(visuals.getCurrentId(), 'gamma');
  visuals.next();
  assert.equal(visuals.getCurrentId(), 'alpha');
  assert.ok(!started.includes('beta'));
});

test('all artworks switched off falls back to the full list', () => {
  const { visuals } = withArtworks();

  visuals.setEnabled([]);
  assert.equal(visuals.getList().map((v) => v.id).join(','), 'alpha,beta,gamma');
  assert.equal(visuals.random(), true);
  assert.equal(visuals.getCurrentId(), 'alpha');
});

test('unknown ids fall back to the full list', () => {
  const { visuals } = withArtworks();

  visuals.setEnabled(['not-a-registered-artwork']);
  assert.equal(visuals.getList().map((v) => v.id).join(','), 'alpha,beta,gamma');
});

test('artworkEnded picks a switched-on artwork', () => {
  const { visuals } = withArtworks();

  visuals.setEnabled(['beta']);
  visuals.activate('alpha');
  visuals.artworkEnded();
  assert.equal(visuals.getCurrentId(), 'beta');
});

function loadAdminSwitches(states, respond) {
  const inputs = states.map((checked, index) => {
    const listeners = {};
    const classes = new Set(checked ? [] : ['is-off']);
    const row = {
      classList: {
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
    };
    return {
      checked,
      dataset: { visualId: String(index + 1) },
      row,
      closest() { return row; },
      addEventListener(type, callback) { listeners[type] = callback; },
      async toggle() {
        this.checked = !this.checked;
        await listeners.change();
      },
    };
  });
  const allOff = { hidden: true };
  const requests = [];
  const sandbox = {
    JSON,
    Array,
    Error,
    document: {
      querySelector(selector) {
        if (selector === 'meta[name="csrf-token"]') return { content: 'token' };
        if (selector === '.all-off') return allOff;
        return null;
      },
      querySelectorAll(selector) {
        return selector === '.switch input' ? inputs : [];
      },
    },
    async fetch(url, options) {
      requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return respond();
    },
  };
  const scriptPath = path.join(root, 'public/admin_visuals.js');
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), sandbox, { filename: scriptPath });
  return { inputs, allOff, requests };
}

test('admin switch saves the new on-air state', async () => {
  const { inputs, requests } = loadAdminSwitches([true, true], () => ({ ok: true }));

  await inputs[1].toggle();
  assert.deepEqual(requests, [{ url: '/admin/visuals/2', method: 'PATCH', body: { visual_module: { active: false } } }]);
  assert.equal(inputs[1].checked, false);
  assert.equal(inputs[1].row.classList.contains('is-off'), true);
});

test('admin switch reverts when the save fails', async () => {
  const { inputs } = loadAdminSwitches([true], () => ({ ok: false, status: 422 }));

  await inputs[0].toggle();
  assert.equal(inputs[0].checked, true);
  assert.equal(inputs[0].row.classList.contains('is-off'), false);
});

test('admin page says all artworks play when every artwork is switched off', async () => {
  const { inputs, allOff } = loadAdminSwitches([true, false], () => ({ ok: true }));
  assert.equal(allOff.hidden, true);

  await inputs[0].toggle();
  assert.equal(allOff.hidden, false);

  await inputs[1].toggle();
  assert.equal(allOff.hidden, true);
});

test('admin page shows the all-off line on load when nothing is switched on', () => {
  const { allOff } = loadAdminSwitches([false, false], () => ({ ok: true }));
  assert.equal(allOff.hidden, false);
});

test('all-off line hides again when the last switch-off fails to save', async () => {
  const { inputs, allOff } = loadAdminSwitches([true], () => ({ ok: false, status: 500 }));

  await inputs[0].toggle();
  assert.equal(allOff.hidden, true);
});
