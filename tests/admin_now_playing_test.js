'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function row(track, cue, ms, now) {
  const classes = new Set();
  return {
    dataset: { track, cue, ms, now },
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      contains: (name) => classes.has(name),
    },
  };
}

function loadPlayer(rows, label) {
  const listeners = {};
  const noop = {
    style: {}, textContent: '', innerHTML: '', className: '',
    addEventListener() {}, removeEventListener() {}, remove() {},
    querySelector() { return noop; },
    setPointerCapture() {}, getBoundingClientRect() { return { left: 0, width: 100 }; },
  };
  const table = { querySelectorAll: (sel) => (sel === 'tr[data-track]' ? rows : []) };
  const document = {
    createElement: () => Object.create(noop),
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    querySelector(sel) {
      if (sel === '[data-now-playing]') return label;
      if (sel === 'table.songs') return table;
      const id = sel.match(/^table\.songs tr\[data-track="(.+)"\]$/);
      return id ? rows.find((r) => r.dataset.track === id[1]) || null : null;
    },
    querySelectorAll(sel) { return sel === 'table.songs tr[data-track]' ? rows : []; },
  };
  function Audio() {
    this.addEventListener = () => {};
    this.pause = () => {};
    this.load = () => {};
    this.play = () => {};
  }
  const sandbox = { console: { log() {}, warn() {}, error() {} }, document, Audio, AbortController };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/admin-player.js'), 'utf8'), sandbox);
  return {
    showSong: (id) => vm.runInContext(`showSong(${JSON.stringify(id)})`, sandbox),
    mixAt(time) { return { currentTime: time, matches: (sel) => sel === 'audio.show-mix' }; },
    fire(type, target) { (listeners[type] || []).forEach((fn) => fn({ type, target })); },
  };
}

function fixture() {
  const first = row('11', '0', '150000', 'Neon Hex — Wire Kiss');
  const second = row('12', '150', '120000', 'Violet Static — Night Bus');
  const label = { textContent: 'Press play to start the mix' };
  return { first, second, label, player: loadPlayer([ first, second ], label) };
}

test('selecting a track names it and marks only its row', () => {
  const { first, second, label, player } = fixture();
  player.showSong('11');
  assert.equal(label.textContent, 'Neon Hex — Wire Kiss');
  assert.ok(first.classList.contains('now'));
  assert.ok(!second.classList.contains('now'));
  player.showSong('12');
  assert.equal(label.textContent, 'Violet Static — Night Bus');
  assert.ok(second.classList.contains('now'));
  assert.ok(!first.classList.contains('now'));
});

test('the mix advances the label at each cue and ignores other audio', () => {
  const { label, player } = fixture();
  player.fire('timeupdate', player.mixAt(10));
  assert.equal(label.textContent, 'Neon Hex — Wire Kiss');
  player.fire('timeupdate', { currentTime: 150, matches: () => false });
  assert.equal(label.textContent, 'Neon Hex — Wire Kiss');
  player.fire('timeupdate', player.mixAt(150));
  assert.equal(label.textContent, 'Violet Static — Night Bus');
});
