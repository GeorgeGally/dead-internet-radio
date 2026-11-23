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
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains: (name) => classes.has(name),
    },
    scrollIntoView() {},
  };
}

function load(sources, rows, label) {
  const audioListeners = {};
  const listen = () => {};
  const parts = {
    '[data-show-play]': { classList: { contains: () => false, add() {}, remove() {} }, textContent: '', setAttribute() {}, addEventListener: listen },
    '[data-show-bar]': { setAttribute() {}, getBoundingClientRect: () => ({ left: 0, width: 100 }), addEventListener: listen },
    '[data-show-fill]': { style: {} },
    '[data-show-time]': { textContent: '' },
  };
  const player = { dataset: {}, querySelector: (sel) => parts[sel] };
  const document = {
    getElementById: () => ({ textContent: JSON.stringify(sources) }),
    querySelector(sel) {
      if (sel === '[data-show-player]') return player;
      if (sel === '[data-now-playing]') return label;
      const id = sel.match(/^table\.songs tr\[data-track='(.+)'\]$/);
      return id ? rows.find((r) => r.dataset.track === id[1]) || null : null;
    },
    querySelectorAll(sel) {
      if (sel === 'table.songs tr[data-track]') return rows;
      if (sel === 'table.songs tr.now') return rows.filter((r) => r.classList.contains('now'));
      return [];
    },
    addEventListener() {},
  };
  let audio;
  function Audio() {
    audio = this;
    this.dataset = {};
    this.currentTime = 0;
    this.addEventListener = (type, fn) => { (audioListeners[type] ||= []).push(fn); };
    this.removeEventListener = () => {};
  }
  const sandbox = { console: { log() {}, warn() {}, error() {} }, document, Audio, isFinite };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/admin-show-player.js'), 'utf8'), sandbox);
  return {
    at(time) {
      audio.currentTime = time;
      (audioListeners.timeupdate || []).forEach((fn) => fn());
    },
  };
}

test('the mix player names the song at each cue and starts idle', () => {
  const first = row('11', '0', '150000', 'Neon Hex — Wire Kiss');
  const second = row('12', '150', '120000', 'Violet Static — Night Bus');
  const label = { textContent: 'Press play to start the mix' };
  const player = load([{ src: '/mix.mp3' }], [ first, second ], label);
  assert.equal(label.textContent, 'Press play to start the mix');
  player.at(10);
  assert.equal(label.textContent, 'Neon Hex — Wire Kiss');
  assert.ok(first.classList.contains('now'));
  player.at(150);
  assert.equal(label.textContent, 'Violet Static — Night Bus');
  assert.ok(second.classList.contains('now'));
  assert.ok(!first.classList.contains('now'));
});
