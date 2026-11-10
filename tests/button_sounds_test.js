'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function page({ failure } = {}) {
  const listeners = [];
  const played = [];
  let actions = 0;
  class Audio {
    constructor(src) { this.src = src; }
    play() {
      played.push(this.src);
      if (failure === 'throw') throw new Error('Audio unavailable');
      return failure === 'reject' ? Promise.reject(new Error('Playback refused')) : Promise.resolve();
    }
  }
  const document = {
    addEventListener: (type, handler, capture) => listeners.push({ type, handler, capture: capture === true }),
  };
  const source = path.join(root, 'public/button-sounds.js');
  vm.runInNewContext(fs.existsSync(source) ? fs.readFileSync(source, 'utf8') : '', { document, Audio });
  document.addEventListener('click', (event) => {
    if (!event.button.disabled && !event.button.inert) actions++;
  }, false);
  function activate({ main = false, disabled = false, inert = false, trusted = true, detail = 1 } = {}) {
    const button = {
      disabled,
      inert,
      matches: (selector) => selector === '.abtn' ? main : disabled,
      closest: (selector) => selector === '[inert]' && inert ? button : null,
    };
    const target = { closest: (selector) => selector === 'button' ? button : null };
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      let stopped = false;
      const event = {
        type, target, button, isTrusted: trusted, detail,
        stopPropagation: () => { stopped = true; },
        stopImmediatePropagation: () => { stopped = true; },
      };
      for (const phase of [true, false]) {
        for (const { type: name, handler, capture } of listeners) {
          if (name === type && capture === phase && !stopped) handler(event);
        }
      }
    }
  }
  return { activate, played, actions: () => actions };
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

test('audio failures never stop a button action', async () => {
  for (const failure of ['reject', 'throw']) {
    const p = page({ failure });
    p.activate({ main: true });
    await new Promise(setImmediate);
    assert.equal(p.actions(), 1);
    assert.deepEqual(p.played, ['sounds/switch-1.mp3']);
  }
});
