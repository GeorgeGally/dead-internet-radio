'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('playing artwork preview in the drawer has an orange outline that follows the artwork', () => {
  assert.match(read('public/style.css'), /\.wall-panel\.active \{ outline: 2px solid #ff5a1f; outline-offset: -2px; \}/);
  const gallery = read('public/visuals/gallery.js');
  assert.match(gallery, /function markPlaying\(id = visuals\.getCurrentId\(\)\)/);
  assert.match(gallery, /t\.classList\.toggle\('active', t\.dataset\.id === id\)/);
  assert.match(read('public/app.js'), /function updateNowPlaying\(\) \{\n  updateTrackInfo\(\);\n  gallery\.markPlaying\(\);/);
});
