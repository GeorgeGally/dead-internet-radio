'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function element() {
  const classes = new Set();
  const attrs = {};
  return {
    title: '',
    textContent: '',
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute: (name) => attrs[name],
  };
}

function loadPlayer() {
  const els = {
    player: { paused: true, readyState: 0 },
    'btn-play': element(),
    'play-word': element(),
    'led-play': element(),
  };
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: (id) => els[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
    },
    location: { protocol: 'http:', hostname: 'radio.test', port: '', pathname: '/' },
    window: { location: { pathname: '/' }, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }),
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    AbortController,
    requestAnimationFrame: () => 0,
    visuals: { init() {}, next() {}, notify() {}, getList: () => [], getCurrentId: () => null, activate: () => true },
    canvasFilters: {},
    gallery: { init() {}, whenQuiet: (fn) => fn() },
    idents: { init() {}, play() {}, stop() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/app.js'), 'utf8'), sandbox);
  return {
    render(audio) {
      Object.assign(els.player, audio);
      vm.runInContext('updatePlayBtn()', sandbox);
      const btn = els['btn-play'];
      const led = els['led-play'];
      return {
        word: els['play-word'].textContent,
        label: btn.getAttribute('aria-label'),
        pressed: btn.getAttribute('aria-pressed'),
        on: led.classList.contains('on'),
        loading: led.classList.contains('loading'),
      };
    },
  };
}

test('Play key reads Play and is up with its light off while paused', () => {
  assert.deepEqual(loadPlayer().render({ paused: true, readyState: 4 }), {
    word: 'Play', label: 'Play', pressed: 'false', on: false, loading: false,
  });
});

test('Play key reads Loading and is down while the sound is still coming', () => {
  assert.deepEqual(loadPlayer().render({ paused: false, readyState: 1 }), {
    word: 'Loading', label: 'Loading', pressed: 'true', on: false, loading: true,
  });
});

test('Play key still reads Play, pressed with its light on, while playing', () => {
  assert.deepEqual(loadPlayer().render({ paused: false, readyState: 4 }), {
    word: 'Play', label: 'Play', pressed: 'true', on: true, loading: false,
  });
});
