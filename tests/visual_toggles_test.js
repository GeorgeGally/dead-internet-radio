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

test('admin page has a per-artwork on/off switch that saves immediately', () => {
  const view = fs.readFileSync(path.join(root, 'app/views/admin/visuals/index.html.erb'), 'utf8');

  assert.match(view, /class="switch"/);
  assert.match(view, /data-visual-id="<%= v\.id %>"/);
  assert.match(view, /visual_module: \{ active: input\.checked \}/);
  assert.match(view, /method: 'PATCH'/);
});

test('player loads the active artwork list before opening the first artwork', () => {
  const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

  assert.match(app, /fetchJson\(apiUrl\('\/visuals'\)\)/);
  assert.match(app, /visuals\.setEnabled\(/);
  assert.ok(app.indexOf('await loadActiveVisuals()') < app.indexOf('showWelcome();'));
});

test('visual modules are registered from the player source', () => {
  const model = fs.readFileSync(path.join(root, 'app/models/visual_module.rb'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'app/controllers/admin/visuals_controller.rb'), 'utf8');
  const artworkFiles = fs.readdirSync(path.join(root, 'public/visuals'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.replace(/\.js$/, ''))
    .filter((slug) => !['engine', 'filters', 'fx', 'gallery'].includes(slug));

  assert.match(model, /public\/visuals\/\*\.js/);
  assert.match(model, /def self\.sync_from_player!/);
  assert.match(controller, /VisualModule\.sync_from_player!/);
  assert.ok(artworkFiles.length > 0);
});
