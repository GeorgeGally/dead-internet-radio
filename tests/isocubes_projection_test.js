'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/visuals/isocubes.js'), 'utf8');

test('isocubes orthographic projection preserves viewport aspect ratio', () => {
  assert.match(source, /const\s+aspect\s*=\s*p\.width\s*\/\s*p\.height/);
  assert.match(source, /const\s+viewWidth\s*=\s*viewSize\s*\*\s*Math\.max\(1,\s*aspect\)/);
  assert.match(source, /const\s+viewHeight\s*=\s*viewSize\s*\*\s*Math\.max\(1,\s*1\s*\/\s*aspect\)/);
  assert.match(source, /p\.ortho\(-viewWidth\s*\/\s*2,\s*viewWidth\s*\/\s*2,\s*viewHeight\s*\/\s*2,\s*-viewHeight\s*\/\s*2,\s*0,\s*1000\)/);
  assert.doesNotMatch(source, /p\.ortho\(-400,\s*400,\s*400,\s*-400,\s*0,\s*1000\)/);
});
