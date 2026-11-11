'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/visuals/bugs3.js'), 'utf8');

function drawnWord(roll) {
  let artwork = null;
  let word = null;
  const graphics = {
    pixelDensity() {}, background() {}, textFont() {}, textSize() {}, textAlign() {}, fill() {}, noStroke() {},
    text(w) { word = w; },
    loadPixels() {}, remove() {},
    pixels: [],
  };
  const context = {
    Math: Object.assign(Object.create(Math), { random: () => roll }),
    document: { getElementById: () => null },
    visuals: { register(id, a) { artwork = a; }, setupP5Canvas() {}, stopP5() {} },
    p5: function (sketch) {
      const p = { windowWidth: 0, windowHeight: 0, CENTER: 'center', createGraphics: () => graphics };
      sketch(p);
      p.setup();
    },
  };
  vm.runInNewContext(source, context);
  artwork.start();
  return word;
}

test('Bugs3 writes silence and internet, never gentleness or kindness', () => {
  const words = new Set();
  for (let i = 0; i < 100; i++) words.add(drawnWord((i + 0.5) / 100));
  assert.ok(words.has('silence'));
  assert.ok(words.has('internet'));
  assert.ok(!words.has('gentleness'));
  assert.ok(!words.has('kindness'));
});
