'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(path.resolve(__dirname, '../public', file), 'utf8');
const source = read('visuals/gallery.js');

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = { setProperty() {} };
    this.clientWidth = 1600;
    this.offsetTop = 0;
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (n) => classes.has(n),
      toggle: (n, on = !classes.has(n)) => { if (on) classes.add(n); else classes.delete(n); return on; },
    };
    Object.defineProperty(this, 'className', {
      get: () => [...classes].join(' '),
      set: (v) => { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((n) => classes.add(n)); },
    });
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn()); }
  setAttribute() {}
  dispatchEvent() {}
  querySelectorAll(selector) {
    const names = selector.split('.').filter(Boolean);
    const found = [];
    const walk = (el) => el.children.forEach((c) => {
      if (names.every((n) => c.classList.contains(n))) found.push(c);
      walk(c);
    });
    walk(this);
    return found;
  }
}

// gallery.js in a fake browser whose playing artwork the test controls.
function drawer(visuals = null) {
  const container = new FakeElement('div');
  const deck = new FakeElement('div');
  let currentId = 'a';
  const sandbox = {
    console,
    innerWidth: 1600,
    innerHeight: 900,
    setTimeout() { return 0; },
    clearTimeout() {},
    addEventListener() {},
    requestAnimationFrame: (fn) => fn(),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    canvasFilters: { list: () => [], getState: () => ({ slots: [], focus: 0 }), setState() {} },
    document: {
      addEventListener() {},
      querySelector: (sel) => (sel === '.deck-gallery' ? container : null),
      querySelectorAll: () => [],
      getElementById: (id) => (id === 'deck' ? deck : null),
      createElement: (tag) => new FakeElement(tag),
      body: { appendChild() {} },
    },
    CustomEvent: class {},
    visuals: visuals || {
      getList: () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      getCurrentId: () => currentId,
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(`${source}\nthis.gallery = gallery;`, sandbox);
  const active = () => container.querySelectorAll('.wall-panel.art')
    .filter((t) => t.classList.contains('active'))
    .map((t) => t.dataset.id);
  const tiles = () => container.querySelectorAll('.wall-panel.art');
  return { gallery: sandbox.gallery, active, tiles, play: (id) => { currentId = id; } };
}

test('the open drawer marks the playing artwork, and only that one', () => {
  const d = drawer();
  d.gallery.open();
  assert.deepEqual(d.active(), ['a']);
});

test('the mark moves to the new artwork when the playing artwork changes', () => {
  const d = drawer();
  d.gallery.open();
  d.play('b');
  d.gallery.markPlaying();
  assert.deepEqual(d.active(), ['b']);
});

test('marking before the drawer has been built does nothing', () => {
  const d = drawer();
  d.gallery.markPlaying();
  assert.deepEqual(d.active(), []);
});

// The player's own artwork scripts, in index.html order, with the admin's
// on-air list applied as the player applies it.
function playerArtworks(onAir) {
  const sandbox = { console, setTimeout() { return 0; }, clearTimeout() {}, document: {}, performance };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const scripts = [...read('index.html').matchAll(/src="visuals\/(engine|prelinger_broll|aliens|robots|computers)\.js"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['engine', 'prelinger_broll', 'aliens', 'robots', 'computers']);
  for (const name of scripts) vm.runInContext(read(`visuals/${name}.js`), sandbox);
  const visuals = vm.runInContext('visuals', sandbox);
  visuals.setEnabled(onAir);
  const activated = [];
  visuals.activate = (id) => { activated.push(id); return true; };
  visuals.resetTimer = () => {};
  return { visuals, activated };
}

test('Aliens has its own drawer tile beside B-roll, and choosing it plays Aliens', () => {
  const { visuals, activated } = playerArtworks(['prelinger_broll', 'aliens', 'grid']);
  const d = drawer(visuals);
  d.gallery.open();
  const tiles = d.tiles();
  assert.deepEqual(tiles.map((t) => t.dataset.id), ['prelinger_broll', 'aliens']);
  assert.deepEqual(tiles.map((t) => t.children[0].textContent), ['B-roll', 'Aliens']);
  assert.match(tiles[1].style.backgroundImage, /thumbs\/aliens\.jpg/);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../public/visuals/thumbs/aliens.jpg')));
  tiles[1].click();
  assert.deepEqual(activated, ['aliens']);
});

test('switching Aliens off in the admin takes its tile out of the drawer', () => {
  const { visuals } = playerArtworks(['prelinger_broll']);
  const d = drawer(visuals);
  d.gallery.open();
  assert.deepEqual(d.tiles().map((t) => t.dataset.id), ['prelinger_broll']);
});

test('Robots has its own drawer tile beside B-roll and Aliens, and choosing it plays Robots', () => {
  const { visuals, activated } = playerArtworks(['prelinger_broll', 'aliens', 'robots', 'grid']);
  const d = drawer(visuals);
  d.gallery.open();
  const tiles = d.tiles();
  assert.deepEqual(tiles.map((t) => t.dataset.id), ['prelinger_broll', 'aliens', 'robots']);
  assert.deepEqual(tiles.map((t) => t.children[0].textContent), ['B-roll', 'Aliens', 'Robots']);
  assert.match(tiles[2].style.backgroundImage, /thumbs\/robots\.jpg/);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../public/visuals/thumbs/robots.jpg')));
  tiles[2].click();
  assert.deepEqual(activated, ['robots']);
});

test('the drawer shows the admin\'s name for Robots', () => {
  const { visuals } = playerArtworks(['aliens', 'robots']);
  visuals.setNames({ robots: 'Thinking Machines' });
  const d = drawer(visuals);
  d.gallery.open();
  assert.deepEqual(d.tiles().map((t) => t.children[0].textContent), ['Aliens', 'Thinking Machines']);
});

test('Mainframe has its own drawer tile after Robots, and choosing it plays Mainframe', () => {
  const { visuals, activated } = playerArtworks(['prelinger_broll', 'aliens', 'robots', 'computers', 'grid']);
  const d = drawer(visuals);
  d.gallery.open();
  const tiles = d.tiles();
  assert.deepEqual(tiles.map((t) => t.dataset.id), ['prelinger_broll', 'aliens', 'robots', 'computers']);
  assert.deepEqual(tiles.map((t) => t.children[0].textContent), ['B-roll', 'Aliens', 'Robots', 'Mainframe']);
  assert.match(tiles[3].style.backgroundImage, /thumbs\/computers\.jpg/);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../public/visuals/thumbs/computers.jpg')));
  tiles[3].click();
  assert.deepEqual(activated, ['computers']);
});

test('switching Robots off in the admin takes only its tile out of the drawer', () => {
  const { visuals } = playerArtworks(['prelinger_broll', 'aliens']);
  const d = drawer(visuals);
  d.gallery.open();
  assert.deepEqual(d.tiles().map((t) => t.dataset.id), ['prelinger_broll', 'aliens']);
});
