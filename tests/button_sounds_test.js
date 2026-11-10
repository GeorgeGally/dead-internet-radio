'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function page({ muted = false, volume = 1, failure } = {}) {
  const listeners = [];
  const played = [];
  let actions = 0;
  const player = { muted, volume };
  class Audio {
    constructor(src) { this.src = src; }
    play() {
      played.push(this.src);
      if (failure === 'throw') throw new Error('Audio unavailable');
      return failure === 'reject' ? Promise.reject(new Error('Playback refused')) : Promise.resolve();
    }
  }
  const document = {
    getElementById: (id) => id === 'player' ? player : null,
    addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture }),
  };
  const source = path.join(root, 'public/button-sounds.js');
  vm.runInNewContext(fs.existsSync(source) ? fs.readFileSync(source, 'utf8') : '', { document, Audio });
  function activate({ main = false, disabled = false, inert = false, trusted = true, detail = 1 } = {}) {
    const button = {
      matches: (selector) => selector === '.abtn' ? main : disabled,
      closest: (selector) => selector === '[inert]' && inert ? button : null,
    };
    const target = { closest: (selector) => selector === 'button' ? button : null };
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      for (const { type: event, handler, capture } of listeners) {
        if (event === type && capture) handler({ type, target, isTrusted: trusted, detail });
      }
    }
    if (!disabled && !inert) actions++;
  }
  return { activate, played, player, actions: () => actions };
}

test('main buttons play Switch A and minor buttons play Switch D once per activation', () => {
  const p = page();
  assert.deepEqual(p.played, []);
  p.activate({ main: true });
  p.activate();
  p.activate({ main: true, detail: 0 });
  assert.deepEqual(p.played, ['sounds/switch-1.mp3', 'sounds/switch-4.mp3', 'sounds/switch-1.mp3']);
  assert.equal(p.actions(), 3);
});

test('disabled, inert and programmatic clicks stay silent', () => {
  const p = page();
  p.activate({ disabled: true });
  p.activate({ inert: true });
  p.activate({ trusted: false });
  assert.deepEqual(p.played, []);
});

test('player mute and zero volume silence switches without blocking actions', () => {
  const p = page({ muted: true });
  p.activate();
  p.player.muted = false;
  p.player.volume = 0;
  p.activate();
  assert.deepEqual(p.played, []);
  p.player.volume = 1;
  p.activate();
  assert.deepEqual(p.played, ['sounds/switch-4.mp3']);
  assert.equal(p.actions(), 3);
});

test('audio failures never stop a button action or change radio state', async () => {
  for (const failure of ['reject', 'throw']) {
    const p = page({ failure });
    p.activate({ main: true });
    await new Promise(setImmediate);
    assert.equal(p.actions(), 1);
    assert.deepEqual(p.played, ['sounds/switch-1.mp3']);
    assert.deepEqual(p.player, { muted: false, volume: 1 });
  }
});
