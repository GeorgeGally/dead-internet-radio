'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/visuals/gallery.js'), 'utf8');

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
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
  addEventListener() {}
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
function drawer() {
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
    visuals: {
      getList: () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      getCurrentId: () => currentId,
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(`${source}\nthis.gallery = gallery;`, sandbox);
  const active = () => container.querySelectorAll('.wall-panel.art')
    .filter((t) => t.classList.contains('active'))
    .map((t) => t.dataset.id);
  return { gallery: sandbox.gallery, active, play: (id) => { currentId = id; } };
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
