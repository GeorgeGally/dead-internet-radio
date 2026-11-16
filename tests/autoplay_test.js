'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

test('the silent probe is a valid empty WAV header', () => {
  const bytes = Buffer.from(js.match(/data:audio\/wav;base64,([^']+)'/)[1], 'base64');
  assert.equal(bytes.length, 44);
  assert.equal(bytes.toString('latin1', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.readUInt32LE(24), 8000);
});

test('the start button appears only once the browser refuses', () => {
  assert.match(css, /#welcome-splash:not\(\.click-to-start\) \.welcome-letterbox \{\s*visibility: hidden;/);
  assert.match(js, /if \(!allowed\) document\.getElementById\('welcome-splash'\)\.classList\.add\('click-to-start'\)/);
  assert.match(js, /showWelcome\(await autoplay\);/);
});

test('every start runs the story, then the station ID, then the music, sound allowed or not', () => {
  assert.doesNotMatch(js, /skipWelcome/);
  assert.match(js, /if \(allowed\) start\(\);\s*else splash\.addEventListener\('click', start\);/);
  assert.match(js, /Promise\.all\(\[onAir, lore\]\)\.then/);
  assert.match(js, /\.then\(dismiss\);/);
});

test('the story types the five lines, then one tail line that turns over each visit', () => {
  assert.match(js, /'the internet died\.',\s*'nobody switched off the radio\.',\s*'somewhere a server never got the shutdown order\.',\s*"it's been writing music ever since,",\s*'credited to bands that were never born\.',/);
  assert.match(js, /'is anyone out there\?'/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  const lore = css.match(/#welcome-lore \{[^}]*\}/)[0];
  const spacing = parseFloat(lore.match(/letter-spacing:\s*([\d.]+)em/)[1]);
  assert.ok(spacing <= 0.04);
});
