'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function stubContext(log) {
  const ctx = {
    font: '', fillStyle: '', globalAlpha: 1, textAlign: 'left', textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    save() {}, restore() {},
    measureText(s) { return { width: 10 * String(s).length }; },
    fillText(s, x, y) { log.push({ text: String(s), x, y, style: ctx.fillStyle, alpha: ctx.globalAlpha }); },
    fillRect() {},
    clearRect() { log.push({ clear: true }); },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {}, drawImage() {},
  };
  return ctx;
}

function loadIdents() {
  const log = [];
  const classes = new Set();
  const timers = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => stubContext(log),
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
  };
  let rafCallback = null;
  const sandbox = {
    document: {
      createElement: () => ({ width: 0, height: 0, getContext: () => stubContext(log) }),
      getElementById: (id) => (id === 'ident-canvas' ? canvas : null),
    },
    window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, addEventListener() {} },
    performance: { now: () => 0 },
    requestAnimationFrame: (cb) => { rafCallback = cb; return 1; },
    cancelAnimationFrame: () => { rafCallback = null; },
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(read('public/ident.js'), sandbox);
  return {
    idents: sandbox.window.idents,
    canvas,
    classes,
    log,
    frame: (ms) => rafCallback(ms),
    flush: () => { const due = timers.splice(0); due.forEach((fn) => fn && fn()); },
  };
}

test('ident.js keeps the lab ident contract', () => {
  const { idents } = loadIdents();
  assert.ok(idents, 'window.idents is exposed');
  assert.equal(typeof idents.init, 'function');
  assert.equal(typeof idents.play, 'function');
  assert.equal(typeof idents.stop, 'function');
  assert.ok(Array.isArray(idents.list) && idents.list.length >= 1);

  for (const ident of idents.list) {
    assert.equal(typeof ident.id, 'string');
    assert.equal(typeof ident.name, 'string');
    assert.equal(typeof ident.L, 'number');
    assert.ok(ident.L > 0);
    assert.equal(typeof ident.draw, 'function');
    assert.equal(ident.draw.length, 5, 'draw(ctx, w, h, t, state)');
  }
});

test('the block wall renders and the player ends on its own length', () => {
  const { idents, canvas, classes, log, frame } = loadIdents();
  idents.init();
  idents.play();
  assert.ok(classes.has('on'), 'ident canvas takes the stage');
  assert.equal(canvas.width, 1920, 'sized to the viewport at capped dpr');
  assert.equal(canvas.height, 1080);

  frame(3000);
  const text = log.filter((entry) => entry.text);
  assert.ok(text.some((entry) => entry.text === '█'), 'block glyphs are drawn');
  assert.ok(text.some((entry) => entry.style === '#ff5a1f'), 'the band locks in station orange');

  frame(12000);
  assert.ok(!classes.has('on'), 'hides itself once its length is up');
});

test('stop clears the frame so a skipped track cannot leave a half-drawn ident', () => {
  const { idents, canvas, classes, log, frame } = loadIdents();
  idents.init();
  idents.play();
  frame(3000);
  log.length = 0;
  idents.stop();
  assert.ok(!classes.has('on'));
  assert.ok(log.some((entry) => entry.clear), 'canvas is cleared');
  assert.equal(canvas.width, 1920);
});

test('a load ident fills the wait, rotating until the audio starts', () => {
  const { idents, classes, frame, flush } = loadIdents();
  idents.init();
  idents.load();
  assert.ok(!classes.has('on'), 'a fast load does not flash an ident frame');
  flush();
  assert.ok(classes.has('on'), 'a real wait gets an ident');
  frame(12000);
  assert.ok(classes.has('on'), 'rolls on to the next ident instead of going blank');
  idents.loadDone();
  assert.ok(!classes.has('on'), 'clears the moment the audio starts');
});

test('audio that starts first cancels a queued load ident', () => {
  const { idents, classes, flush } = loadIdents();
  idents.init();
  idents.load();
  idents.loadDone();
  flush();
  assert.ok(!classes.has('on'), 'a load that finished waiting never flashes an ident');
});

test('the site wires the ident without per-ident branching', () => {
  const html = read('public/index.html');
  const css = read('public/style.css');
  const app = read('public/app.js');
  const build = read('build_site.py');

  assert.match(html, /id="ident-canvas"/);
  assert.ok(html.indexOf('src="ident.js"') > -1);
  assert.ok(html.indexOf('src="ident.js"') < html.indexOf('src="app.js"'));
  assert.match(css, /#ident-canvas[\s\S]*pointer-events:\s*none/);
  assert.match(css, /#ident-canvas[\s\S]*z-index:\s*6/);
  assert.match(app, /idents\.init\(\)/);
  assert.match(app, /idents\.play\(\)/);
  assert.match(app, /idents\.stop\(\)/);
  assert.match(app, /idents\.load\(\)/);
  assert.ok(app.indexOf("addEventListener('playing', idents.loadDone)") > -1);
  assert.doesNotMatch(app, /ascii-block-wall/);
  assert.match(build, /"ident\.js"/);
});
