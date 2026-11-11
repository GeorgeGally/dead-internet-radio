'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../public/visuals/bugs3.js'), 'utf8');
const words = JSON.parse(source.match(/const WORDS = (\[[^\]]*\])/)[1].replace(/'/g, '"'));

test('Bugs3 writes silence and internet in place of gentleness and kindness', () => {
  assert.deepEqual(words, ['internet', 'silence', 'compassion', 'generosity', 'dream', 'chill', 'gratitude', 'live', 'relax', 'peace']);
});
