'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function createSandbox() {
  const p5Canvases = [];
  const requestAnimationFrames = [];
  const bodyClasses = new Set();
  const body = {
    classList: {
      add(name) { bodyClasses.add(name); },
      remove(name) { bodyClasses.delete(name); },
      contains(name) { return bodyClasses.has(name); },
    },
    appendChild() {},
  };

  return {
    console: { warn() {} },
    _requestAnimationFrames: requestAnimationFrames,
    Math: Object.create(Math, {
      random: { value: () => 0 },
    }),
    setTimeout(callback) {
      return callback();
    },
    clearTimeout() {},
    requestAnimationFrame(callback) {
      requestAnimationFrames.push(callback);
      return requestAnimationFrames.length;
    },
    document: {
      body,
      _p5Canvases: p5Canvases,
      createElement() {
        return {
          classList: { add() {}, remove() {} },
          style: {},
        };
      },
      querySelectorAll(selector) {
        if (selector === 'canvas.p5Canvas') return p5Canvases;
        return [];
      },
      querySelector() {
        return null;
      },
      getElementById() {
        return null;
      },
    },
    window: {
      addEventListener() {},
    },
    getComputedStyle() {
      return { display: 'block' };
    },
  };
}

function loadVisualsEngine(dir) {
  const enginePath = path.join(root, dir, 'visuals', 'engine.js');
  const source = fs.readFileSync(enginePath, 'utf8');
  const sandbox = createSandbox();
  const visuals = vm.runInNewContext(`${source}\nvisuals;`, sandbox, {
    filename: enginePath,
  });
  return { visuals, sandbox };
}

for (const dir of ['src', 'public']) {
  test(`${dir} skips failed startup visuals and falls back`, () => {
    const { visuals, sandbox } = loadVisualsEngine(dir);
    let goodStarted = false;

    visuals.register('bad-webgl', {
      name: 'Bad WebGL',
      start() {
        const canvas = {
          width: 300,
          height: 150,
          remove() {
            const index = sandbox.document._p5Canvases.indexOf(this);
            if (index !== -1) sandbox.document._p5Canvases.splice(index, 1);
          },
        };
        sandbox.document._p5Canvases.push(canvas);
        throw new Error('Error creating webgl context');
      },
    });

    visuals.register('good-2d', {
      name: 'Good 2D',
      start() {
        goodStarted = true;
      },
    });

    assert.doesNotThrow(() => visuals.activate('bad-webgl'));
    assert.equal(visuals.getCurrentId(), null);
    assert.equal(sandbox.document._p5Canvases.length, 0);

    assert.doesNotThrow(() => visuals.random());
    assert.equal(goodStarted, true);
    assert.equal(visuals.getCurrentId(), 'good-2d');
  });
}

for (const dir of ['src', 'public']) {
  test(`${dir} cancels hidden startup prewarm for first visible visual`, () => {
    const { visuals, sandbox } = loadVisualsEngine(dir);
    let stopCount = 0;

    visuals.register('good-2d', {
      name: 'Good 2D',
      start() {},
      stop() {
        stopCount++;
      },
    });

    visuals.prewarmThumbnails();
    assert.equal(sandbox.document.body.classList.contains('prewarming'), true);
    assert.equal(visuals.getCurrentId(), 'good-2d');

    assert.equal(typeof visuals.cancelPrewarm, 'function');
    visuals.cancelPrewarm();

    assert.equal(sandbox.document.body.classList.contains('prewarming'), false);
    assert.equal(visuals.getCurrentId(), null);
    assert.equal(stopCount, 1);

    assert.equal(visuals.random(), true);
    assert.equal(visuals.getCurrentId(), 'good-2d');
  });

  test(`${dir} welcome dismissal cancels prewarm before hiding splash`, () => {
    const appPath = path.join(root, dir, 'app.js');
    const source = fs.readFileSync(appPath, 'utf8');
    const hideIndex = source.indexOf("splash.style.display = 'none'");
    const cancelIndex = source.indexOf('visuals.cancelPrewarm()');

    assert.notEqual(hideIndex, -1);
    assert.notEqual(cancelIndex, -1);
    assert.ok(cancelIndex < hideIndex);
  });
}
