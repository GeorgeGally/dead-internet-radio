'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadFilters() {
  const listeners = {};
  const source = fs.readFileSync(path.join(root, 'src/visuals/filters.js'), 'utf8');
  const context = {
    console,
    clearTimeout() {},
    requestAnimationFrame(fn) { fn(); },
    window: {
      ledThreshold: 40,
      addEventListener(type, fn) {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
    },
    document: {
      body: { appendChild() {} },
      createElement() {
        return {
          classList: { add() {}, remove() {} },
          onclick: null,
          innerHTML: '',
        };
      },
    },
    visuals: {
      drawScanlines() {},
    },
  };

  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.__canvasFilters = canvasFilters;`, context);
  return context.__canvasFilters;
}

test('filter kill switch bypasses rendering while preserving selected filter', () => {
  const canvasFilters = loadFilters();
  let calls = 0;

  canvasFilters.register(42, 'Test Filter', () => { calls += 1; });
  canvasFilters.setActive(42);

  canvasFilters.apply({}, 1, 1, 0);
  assert.equal(calls, 1);
  assert.equal(canvasFilters.getActiveName(), 'Test Filter');
  assert.equal(canvasFilters.isEnabled(), true);

  canvasFilters.setEnabled(false);
  canvasFilters.apply({}, 1, 1, 1);

  assert.equal(calls, 1);
  assert.equal(canvasFilters.getActiveName(), 'off');
  assert.equal(canvasFilters.isEnabled(), false);

  canvasFilters.setEnabled(true);
  canvasFilters.apply({}, 1, 1, 2);

  assert.equal(calls, 2);
  assert.equal(canvasFilters.getActiveName(), 'Test Filter');
  assert.equal(canvasFilters.isEnabled(), true);
});

test('topbar exposes a filter kill switch control', () => {
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');

  assert.match(html, /id="filter-led"/);
  assert.match(html, /id="filter-toggle"/);
  assert.match(js, /const filterToggle = document\.getElementById\('filter-toggle'\)/);
  assert.match(js, /canvasFilters\.toggleEnabled\(\)/);
  assert.match(css, /#filter-toggle/);
  assert.match(css, /#filter-led\.on/);
});
