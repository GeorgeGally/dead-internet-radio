'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function cssBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`))[0];
}

function cssDeclaration(block, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`${escaped}:\\s*([^;]+);`));
  return match && match[1].trim();
}

for (const directory of ['src', 'public']) {
  test(`${directory} welcome splash keeps DIR and click prompt readable above noise canvas`, () => {
    const html = read(`${directory}/index.html`);
    const css = read(`${directory}/style.css`);
    const js = read(`${directory}/app.js`);
    const letterbox = cssBlock(css, '.welcome-letterbox');
    const dir = cssBlock(css, '#welcome-dir');
    const prompt = cssBlock(css, '.welcome-prompt');

    assert.match(html, /id="welcome-splash"/);
    assert.match(html, /id="welcome-noise"/);
    assert.match(html, /id="welcome-dir">\/D\.I\.R\.<\/div>/);
    assert.match(html, /class="welcome-prompt">SLICK TO START<\/div>/);

    assert.match(letterbox, /z-index:\s*2/);
    assert.doesNotMatch(letterbox, /display:\s*none/);
    assert.equal(cssDeclaration(letterbox, 'position'), 'absolute');
    assert.equal(cssDeclaration(letterbox, 'align-items'), 'flex-start');
    assert.equal(cssDeclaration(letterbox, 'text-align'), 'left');
    assert.equal(cssDeclaration(letterbox, 'opacity'), '0.58');
    assert.equal(cssDeclaration(letterbox, '--welcome-type-size'), 'clamp(16px, calc(56vw / 13), 56px)');
    assert.equal(cssDeclaration(dir, 'font-size'), cssDeclaration(prompt, 'font-size'));

    assert.doesNotMatch(js, /click-now/);
    assert.doesNotMatch(js, /dirChars/);
  });
}
