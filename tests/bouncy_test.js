'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/visuals/bouncy.js'), 'utf8');

function runSketch(random, width = 1728, height = 1117) {
  const seen = { xs: [], ys: [] };
  const graphics = () => ({
    stroke() {}, fill() {}, push() {}, pop() {}, rotate() {}, beginShape() {}, vertex() {},
    endShape() {}, image() {}, remove() {},
    translate(x, y) { seen.xs.push(x); seen.ys.push(y); },
  });
  const p = {
    width, height, windowWidth: width, windowHeight: height, DEGREES: 'deg', CLOSE: 'close',
    angleMode() {}, background() {}, image() {},
    createGraphics: graphics,
    resizeCanvas(w, h) { p.width = w; p.height = h; },
  };
  const sandbox = {
    Math: Object.assign(Object.create(Math), { random }),
    document: { getElementById: () => null },
    canvasFilters: { applyToP5() {} },
    visuals: {
      register(_, artwork) { sandbox.artwork = artwork; },
      setupP5Canvas() {},
      stopP5() {},
    },
    p5: function (sketch) { sketch(p); },
  };
  vm.runInNewContext(source, sandbox);
  sandbox.artwork.start();
  p.setup();
  return { p, seen, frames: (n) => { for (let i = 0; i < n; i++) p.draw(); } };
}

test('the ball leaves the left wall from the lowest possible spawn', () => {
  const { seen, frames } = runSketch(() => 0);
  frames(600);
  assert.ok(Math.max(...seen.xs) > 400);
  assert.ok(Math.max(...seen.ys) > 400);
});

test('the ball spawns inside the walls at the highest possible spawn', () => {
  const { seen, frames } = runSketch(() => 0.999);
  frames(1);
  assert.ok(seen.xs[0] <= 1728 - 40 + 3);
  assert.ok(seen.ys[0] <= 1117 - 40 + 3);
});

test('the ball comes back when a resize leaves it outside the walls', () => {
  const { p, seen, frames } = runSketch(() => 0.999);
  p.windowWidth = 390;
  p.windowHeight = 844;
  p.windowResized();
  seen.xs.length = 0;
  frames(1500);
  assert.ok(seen.xs.at(-1) < 390);
  assert.ok(Math.min(...seen.xs) < 200);
});
