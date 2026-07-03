'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadVisuals() {
  const listeners = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/visuals/engine.js'), 'utf8');
  const context = {
    console,
    clearTimeout() {},
    setTimeout() { return 1; },
    window: {
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
    },
    document: {
      body: {
        appendChild() {},
      },
      createElement(tagName) {
        return {
          tagName: tagName.toUpperCase(),
          classList: {
            add() {},
            remove() {},
          },
          dataset: {},
          style: {},
          textContent: '',
        };
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.__visuals = visuals;`, context);

  return {
    visuals: context.__visuals,
    dispatchKey(key, options = {}) {
      let prevented = false;
      const event = {
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: { closest: () => null },
        preventDefault() {
          prevented = true;
        },
        ...options,
      };
      for (const fn of listeners.keydown || []) fn(event);
      return prevented;
    },
  };
}

test('letter keys activate artworks by alphabet slot', () => {
  const starts = [];
  const stops = [];
  const { visuals, dispatchKey } = loadVisuals();

  for (const id of ['giphy', 'blocks', 'grid']) {
    visuals.register(id, {
      name: id,
      start() { starts.push(id); },
      stop() { stops.push(id); },
    });
  }

  visuals.init();

  assert.equal(dispatchKey('b'), true);
  assert.equal(visuals.getCurrentId(), 'blocks');
  assert.deepEqual(starts, ['blocks']);

  assert.equal(dispatchKey('C'), true);
  assert.equal(visuals.getCurrentId(), 'grid');
  assert.deepEqual(stops, ['blocks']);

  assert.equal(dispatchKey('z'), true);
  assert.equal(visuals.getCurrentId(), 'blocks');

  assert.equal(dispatchKey('a', { ctrlKey: true }), false);
  assert.equal(visuals.getCurrentId(), 'blocks');

  assert.equal(dispatchKey('a', { target: { closest: () => true } }), false);
  assert.equal(visuals.getCurrentId(), 'blocks');
});
