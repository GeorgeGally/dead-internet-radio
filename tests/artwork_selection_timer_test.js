'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadVisuals() {
  const source = fs.readFileSync(path.join(root, 'public/visuals/engine.js'), 'utf8');
  const artwork = {
    start() {},
    resetTimerCalls: 0,
    resetTimer() { this.resetTimerCalls++; },
  };
  const visuals = vm.runInNewContext(`${source}\nvisuals;`, {
    console: { warn() {} },
    document: {
      body: { appendChild() {}, classList: { add() {}, remove() {} } },
      createElement() { return { classList: { add() {}, remove() {} } }; },
      getElementById() { return null; },
      querySelectorAll() { return []; },
    },
    window: { addEventListener() {} },
    setTimeout() { return null; },
    clearTimeout() {},
  });
  visuals.register('giphy', artwork);
  return { visuals, artwork };
}

test('selecting an artwork resets its pending change timer', () => {
  const { visuals, artwork } = loadVisuals();

  visuals.activate('giphy');
  visuals.resetTimer('giphy');

  assert.equal(artwork.resetTimerCalls, 1);
});

test('gallery selection resets the selected artwork timer', () => {
  const source = fs.readFileSync(path.join(root, 'public/visuals/gallery.js'), 'utf8');

  assert.match(source, /card\.addEventListener\('click',[\s\S]*?visuals\.activate\(item\.id\);[\s\S]*?visuals\.resetTimer\(item\.id\);/);
});
