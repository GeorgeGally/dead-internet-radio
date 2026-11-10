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

function loadAdminSwitches(states, respond, names = []) {
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
  const cells = names.map((name, index) => {
    const listeners = {};
    let pending = null;
    return {
      dataset: { visualId: String(index + 1), name },
      textContent: name,
      addEventListener(type, callback) { listeners[type] = callback; },
      blur() { pending = listeners.blur(); return pending; },
      press(key) { listeners.keydown({ key, preventDefault() {} }); return pending; },
      async retype(text) {
        this.textContent = text;
        return listeners.blur();
      },
    };
  });
  const requests = [];
  const tableListeners = {};
  const dialogListeners = {};
  const dialog = {
    open: false,
    addEventListener(type, callback) { dialogListeners[type] = callback; },
    showModal() { this.open = true; },
    close() { this.open = false; dialogListeners.close(); },
  };
  const frame = { src: 'about:blank', title: '' };
  const title = { textContent: '' };
  const actions = {};
  const confirmations = [];
  let confirmReset = true;
  const sandbox = {
    JSON,
    Array,
    Error,
    document: {
      querySelector(selector) {
        if (selector === 'meta[name="csrf-token"]') return { content: 'token' };
        if (selector === '.all-off') return allOff;
        if (selector === '.visuals') return { addEventListener(type, callback) { tableListeners[type] = callback; } };
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '.switch input') return inputs;
        if (selector === '.name-cell') return cells;
        return [];
      },
      getElementById(id) {
        if (id === 'look-preview') return dialog;
        if (id === 'look-preview-frame') return frame;
        if (id === 'look-preview-title') return title;
        if (id === 'look-preview-close' || id === 'look-reset') {
          return { addEventListener(type, callback) { actions[id] = callback; } };
        }
        return { addEventListener() {} };
      },
    },
    async fetch(url, options) {
      requests.push({ url, method: options.method, body: options.body && JSON.parse(options.body) });
      return respond();
    },
    window: { confirm(message) { confirmations.push(message); return confirmReset; } },
  };
  const scriptPath = path.join(root, 'public/admin_visuals.js');
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), sandbox, { filename: scriptPath });
  const clickSlot = async (artwork, slot) => {
    const button = {
      dataset: { artwork, slot: String(slot) },
      removed: false,
      closest() { return { querySelector() { return { dataset: { name: artwork }, focus() {} }; } }; },
      remove() { this.removed = true; },
      focus() {},
    };
    await tableListeners.click({ target: { closest: () => button } });
    return button;
  };
  return { inputs, allOff, cells, requests, dialog, frame, title, confirmations, clickSlot,
    reset: () => actions['look-reset'](), cancelReset: () => { confirmReset = false; } };
}

test('admin slot click opens its own preview without confirmation or mutation', async () => {
  const p = loadAdminSwitches([], () => ({ ok: true }));
  const button = await p.clickSlot('bouncy', 7);
  assert.equal(p.dialog.open, true);
  assert.equal(p.frame.src, '/?preview=bouncy&slot=7');
  assert.equal(p.frame.title, 'bouncy / Slot 7');
  assert.deepEqual(p.confirmations, []);
  assert.deepEqual(p.requests, []);
  assert.equal(button.removed, false);
});

test('explicit reset confirms and deletes only the previewed slot', async () => {
  const p = loadAdminSwitches([], () => ({ ok: true }));
  const first = await p.clickSlot('bouncy', 2);
  const second = await p.clickSlot('grid', 7);
  await p.reset();
  assert.deepEqual(p.confirmations, ['Reset grid slot 7?']);
  assert.deepEqual(p.requests, [{ url: '/api/v1/looks/grid/7', method: 'DELETE', body: undefined }]);
  assert.equal(first.removed, false);
  assert.equal(second.removed, true);
  assert.equal(p.dialog.open, false);
  assert.equal(p.frame.src, 'about:blank');
});

test('cancelling reset or a failed delete keeps the slot and preview', async () => {
  for (const cancel of [true, false]) {
    const p = loadAdminSwitches([], () => ({ ok: false }));
    const button = await p.clickSlot('bouncy', 2);
    if (cancel) p.cancelReset();
    await p.reset();
    assert.equal(p.requests.length, cancel ? 0 : 1);
    assert.equal(button.removed, false);
    assert.equal(p.dialog.open, true);
  }
});

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

test('admin name edit saves the new name on Enter', async () => {
  const { cells, requests } = loadAdminSwitches([true], () => ({ ok: true }), ['Grid']);

  cells[0].textContent = 'Grid Lines';
  await cells[0].press('Enter');
  assert.deepEqual(requests, [{ url: '/admin/visuals/1', method: 'PATCH', body: { visual_module: { name: 'Grid Lines' } } }]);
  assert.equal(cells[0].textContent, 'Grid Lines');
  assert.equal(cells[0].dataset.name, 'Grid Lines');
});

test('admin name edit saves on blur', async () => {
  const { cells, requests } = loadAdminSwitches([true], () => ({ ok: true }), ['Grid']);

  await cells[0].retype('  Grid   Lines  ');
  assert.deepEqual(requests, [{ url: '/admin/visuals/1', method: 'PATCH', body: { visual_module: { name: 'Grid Lines' } } }]);
  assert.equal(cells[0].textContent, 'Grid Lines');
});

test('admin name edit cancels on Escape', async () => {
  const { cells, requests } = loadAdminSwitches([true], () => ({ ok: true }), ['Grid']);

  cells[0].textContent = 'Nope';
  await cells[0].press('Escape');
  assert.deepEqual(requests, []);
  assert.equal(cells[0].textContent, 'Grid');
});

test('admin name edit keeps the old name on an empty or unchanged blur', async () => {
  const { cells, requests } = loadAdminSwitches([true], () => ({ ok: true }), ['Grid']);

  await cells[0].retype('   ');
  await cells[0].retype('Grid');
  assert.deepEqual(requests, []);
  assert.equal(cells[0].textContent, 'Grid');
});

test('admin name edit reverts when the save fails', async () => {
  const { cells } = loadAdminSwitches([true], () => ({ ok: false, status: 422 }), ['Grid']);

  await cells[0].retype('Grid Lines');
  assert.equal(cells[0].textContent, 'Grid');
  assert.equal(cells[0].dataset.name, 'Grid');
});

test('admin names replace the registered artwork names in the player', () => {
  const { visuals } = withArtworks();

  visuals.setNames({ alpha: 'Alpha One', beta: '' });
  assert.equal(visuals.getList().map((v) => v.name).join(','), 'Alpha One,BETA,GAMMA');

  visuals.activate('alpha');
  assert.equal(visuals.getCurrentName(), 'Alpha One');
  visuals.activate('beta');
  assert.equal(visuals.getCurrentName(), 'BETA');

  visuals.setNames({});
  assert.equal(visuals.getCurrentName(), 'BETA');
});

test('preview boot loads the selected slot and exits before broadcast startup', async () => {
  const source = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
  const init = source.slice(source.indexOf('  async function init() {'), source.indexOf('async function tuneIn('));
  const calls = [];
  const body = { classList: { add(name) { calls.push(name); } }, textContent: '' };
  await vm.runInNewContext(`${init}\ninit();`, {
    URLSearchParams,
    location: { search: '?preview=grid&slot=3' },
    document: { body },
    setupControls() { calls.push('controls'); },
    visuals: {},
    gallery: { async previewSlot(id, slot) { calls.push([id, slot]); return true; } },
  });
  assert.deepEqual(calls, ['slot-preview', 'controls', ['grid', 3]]);
  assert.equal(body.textContent, '');
});
