'use strict';

// Every artwork must be reachable by the filter stack. These are the ways new
// artworks have shipped with filters silently doing nothing; see
// docs/solutions/integration-issues/filters-dead-on-new-artwork-2026-10-24.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'public/visuals');
const indexHtml = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

const NOT_ARTWORKS = new Set(['engine.js', 'filters.js', 'face_hud.js', 'gallery.js']);
const artworks = fs.readdirSync(dir)
  .filter((f) => f.endsWith('.js') && !NOT_ARTWORKS.has(f))
  .map((f) => ({ file: f, src: fs.readFileSync(path.join(dir, f), 'utf8') }))
  .filter((a) => a.src.includes('visuals.register('));

test('every artwork hands its frame to the filters', () => {
  const missing = artworks
    .filter((a) => !/canvasFilters\.(applyToP5|applyToOverlay|apply)\(/.test(a.src))
    .map((a) => a.file);
  assert.deepEqual(missing, [], 'call canvasFilters.applyToP5(p) at the end of draw()');
});

test('the filter object is canvasFilters, not filters', () => {
  const wrong = artworks
    .filter((a) => /(^|[^.\w])filters\.apply/.test(a.src))
    .map((a) => a.file);
  assert.deepEqual(wrong, [], '`filters` is undefined at runtime, so the call never runs');
});

test('archive.org media goes through the same-origin /broll/ proxy', () => {
  // archive.org storage hosts send no CORS headers: drawing their video taints
  // the canvas and every filter fails (getImageData / texImage2D throw).
  const direct = artworks
    .filter((a) => /https?:\/\/(\w+\.)*archive\.org\/download\//.test(a.src))
    .map((a) => a.file);
  assert.deepEqual(direct, []);
});

test('every artwork is loaded by the player', () => {
  const unlisted = artworks
    .filter((a) => !indexHtml.includes(`src="visuals/${a.file}"`))
    .map((a) => a.file);
  assert.deepEqual(unlisted, []);
});

test('every artwork has a gallery screenshot', () => {
  // Fixed previews, made with `node bin/capture-thumbnails.mjs <id>`.
  const ids = artworks.flatMap((a) => [...a.src.matchAll(/visuals\.register\('([\w-]+)'/g)].map((m) => m[1]));
  const missing = ids.filter((id) => !fs.existsSync(path.join(dir, 'thumbs', `${id}.jpg`)));
  assert.deepEqual(missing, []);
});
