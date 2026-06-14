'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');

test('HTML exposes an accessible broadcast shell without remote fonts', () => {
  assert.match(html, /id="broadcast-frame"/);
  assert.match(html, /id="screen"/);
  assert.match(html, /id="page-header"/);
  assert.match(html, /id="page-body"/);
  assert.match(html, /<button[^>]+id="nav-prev"/);
  assert.match(html, /<button[^>]+id="nav-next"/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
});

test('CSS defines the 4:3 frame and 40 by 25 editorial grid', () => {
  assert.match(css, /aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(css, /grid-template-columns:\s*repeat\(40,\s*1fr\)/);
  assert.match(css, /grid-template-rows:\s*repeat\(25,\s*1fr\)/);
  assert.match(css, /\.page--now-playing/);
  assert.match(css, /\.page--headlines/);
  assert.match(css, /\.page--ad-illustration/);
  assert.match(css, /\.page--ad-type/);
  assert.match(css, /\.page--ad-classified/);
  assert.match(css, /\.page--signal/);
});

test('CSS stays within the strict teletext palette', () => {
  const allowed = new Set([
    '#000000', '#ffffff', '#00ffff', '#ffff00',
    '#00ff00', '#ff0000', '#ff00ff', '#0000ff',
  ]);
  const colors = css.match(/#[0-9a-fA-F]{6}\b/g) || [];

  assert.ok(colors.length >= allowed.size);
  for (const color of colors) {
    assert.ok(allowed.has(color.toLowerCase()), `unexpected color ${color}`);
  }
});

test('CSS includes visible focus and reduced-motion behavior', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.is-redrawing/);
});

test('JavaScript renders six editorial page variants', () => {
  assert.match(js, /function renderP100/);
  assert.match(js, /function renderP101/);
  assert.match(js, /function renderP102/);
  assert.match(js, /function renderP103/);
  assert.match(js, /function renderP104/);
  assert.match(js, /function renderP105/);
  assert.match(js, /page--ad-illustration/);
  assert.match(js, /page--ad-type/);
  assert.match(js, /page--ad-classified/);
});

test('P100 implements the split broadcast home and real page menu', () => {
  assert.match(css, /\.home-main/);
  assert.match(css, /\.home-rail/);
  assert.match(css, /\.home-signal/);
  assert.match(css, /\.home-menu/);
  assert.match(js, /ON AIR/);
  assert.match(js, /UP NEXT/);
  assert.match(js, /PAGE_MENU/);
  assert.match(js, /navigateToPage/);
});

test('The visual system uses solid bitmap headlines and dense bulletin bands', () => {
  assert.match(css, /-webkit-text-stroke:/);
  assert.match(css, /\.solid-type/);
  assert.match(css, /\.headline-label[\s\S]*background:\s*var\(--yellow\)/);
  assert.match(css, /\.bulletin-number[\s\S]*background:\s*var\(--blue\)/);
  assert.match(css, /\.page--headlines \.bulletins[\s\S]*grid-template-columns:\s*1fr/);
});

test('JavaScript preserves synchronized playback and navigation contracts', () => {
  assert.match(js, /\(\(rawOffset % totalMs\) \+ totalMs\) % totalMs/);
  assert.match(js, /setInterval\(\(\) => navigate\(1\), 8000\)/);
  assert.match(js, /e\.key === 'ArrowLeft'/);
  assert.match(js, /e\.key === 'ArrowRight'/);
  assert.match(js, /audio\.addEventListener\('ended'/);
  assert.match(js, /audio\.play\(\)/);
});

test('JavaScript includes redraw and designed load failure states', () => {
  assert.match(js, /is-redrawing/);
  assert.match(js, /function renderLoadError/);
  assert.match(js, /BROADCAST DATA UNAVAILABLE/);
});

test('Local src previews can render without colocated broadcast JSON', () => {
  assert.match(js, /LOCAL_PREVIEW_PLAYLIST/);
  assert.match(js, /LOCAL_PREVIEW_PAGES/);
  assert.match(js, /function isLocalPreview/);
  assert.match(js, /function loadBroadcastData/);
  assert.match(js, /'\.\.\/dist\/'/);
  assert.match(js, /fetchJson\(`\$\{base\}playlist\.json`\)/);
});
