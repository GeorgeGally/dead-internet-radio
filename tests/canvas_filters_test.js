'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'public/visuals/filters.js'), 'utf8');

const INK = [0x1a, 0x1a, 0x1a];
const PAPER = [0xe9, 0xe6, 0xdf];

function stubContext(w, h, pixels) {
  const data = new Uint8ClampedArray(pixels || w * h * 4);
  const ctx = {
    data,
    fillStyle: '#000000',
    globalAlpha: 1,
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    createImageData(cw, ch) {
      return { data: new Uint8ClampedArray(cw * ch * 4), width: cw, height: ch };
    },
    getImageData() {
      return { data, width: w, height: h };
    },
    putImageData(img) {
      data.set(img.data);
    },
    fillRect(x, y, rw, rh) {
      const hex = ctx.fillStyle.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      for (let yy = y; yy < y + rh; yy++) {
        for (let xx = x; xx < x + rw; xx++) {
          const i = (yy * w + xx) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    },
  };
  return ctx;
}

function loadFilters() {
  const win = { addEventListener() {}, devicePixelRatio: 1, filterStrength: 100 };
  const factory = new Function('window', 'document', `${source}\nreturn canvasFilters;`);
  return { win, canvasFilters: factory(win, {}) };
}

function solid(w, h, r, g, b) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return data;
}

function countTones(ctx) {
  const counts = new Map();
  for (let i = 0; i < ctx.data.length; i += 4) {
    const key = `${ctx.data[i]},${ctx.data[i + 1]},${ctx.data[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

test('Dither maps brightness onto two ordered tones', () => {
  const { canvasFilters } = loadFilters();
  const dither = canvasFilters.getFilter(10).fn;

  const mid = stubContext(64, 64, solid(64, 64, 128, 128, 128));
  dither(mid, 64, 64, 0);
  const tones = countTones(mid);
  assert.deepEqual([...tones.keys()].sort(), [`${INK.join(',')}`, `${PAPER.join(',')}`].sort());
  const inkShare = tones.get(INK.join(',')) / (64 * 64);
  assert.ok(inkShare > 0.35 && inkShare < 0.65, `mid grey should ink about half the cells, got ${inkShare}`);

  const white = stubContext(64, 64, solid(64, 64, 255, 255, 255));
  dither(white, 64, 64, 1);
  assert.equal(countTones(white).get(INK.join(',')), undefined);

  const black = stubContext(64, 64, solid(64, 64, 0, 0, 0));
  dither(black, 64, 64, 2);
  assert.equal(countTones(black).get(PAPER.join(',')), undefined);
  assert.equal(countTones(black).size, 1);
});

test('Dither keeps the same dot pattern when nothing moves', () => {
  const { canvasFilters } = loadFilters();
  const dither = canvasFilters.getFilter(10).fn;
  const a = stubContext(64, 64, solid(64, 64, 128, 128, 128));
  const b = stubContext(64, 64, solid(64, 64, 128, 128, 128));
  dither(a, 64, 64, 0);
  dither(b, 64, 64, 9);
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});

test('Dither cell size follows the canvas scale, not the device ratio', () => {
  const { win, canvasFilters } = loadFilters();
  const dither = canvasFilters.getFilter(10).fn;
  win.devicePixelRatio = 3;

  const css = stubContext(64, 64, solid(64, 64, 128, 128, 128));
  css.canvas = { clientWidth: 64 };
  dither(css, 64, 64, 0);

  const retina = stubContext(128, 128, solid(128, 128, 128, 128, 128));
  retina.canvas = { clientWidth: 64 };
  dither(retina, 128, 128, 0);

  let mismatches = 0;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (retina.data[((2 * y + 1) * 128 + 2 * x + 1) * 4] !== css.data[(y * 64 + x) * 4]) mismatches++;
    }
  }
  assert.equal(mismatches, 0, 'a 2x canvas must dither on the same CSS-pixel grid');
});

test('Glitch is seeded per frame, moves between frames and leaves the frame changed', () => {
  const { win, canvasFilters } = loadFilters();
  const glitch = canvasFilters.getFilter(11).fn;
  const frame = solid(80, 60, 90, 90, 90);
  for (let i = 0; i < frame.length; i += 4) {
    frame[i] = (i / 4) % 80 * 3;
    frame[i + 2] = 255 - (i / 4) % 80 * 3;
  }

  const first = stubContext(80, 60, frame);
  glitch(first, 80, 60, 0);
  const repeat = stubContext(80, 60, frame);
  glitch(repeat, 80, 60, 0);
  assert.deepEqual(Array.from(first.data), Array.from(repeat.data), 'the same frame must give the same glitch');

  const moved = stubContext(80, 60, frame);
  glitch(moved, 80, 60, 7);
  assert.notDeepEqual(Array.from(moved.data), Array.from(first.data), 'a later frame must glitch differently');
  assert.notDeepEqual(Array.from(first.data), Array.from(frame), 'glitch must change the frame');

  win.filterStrength = 0;
  const muted = stubContext(80, 60, frame);
  glitch(muted, 80, 60, 0);
  const shifted = Array.from(muted.data).filter((v, i) => v !== frame[i]).length;
  const loud = Array.from(first.data).filter((v, i) => v !== frame[i]).length;
  assert.ok(shifted < loud, 'filterStrength must dial the glitch back');
});
