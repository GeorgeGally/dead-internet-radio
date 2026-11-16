'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');

test('the silent probe is a valid empty WAV header', () => {
  const bytes = Buffer.from(js.match(/data:audio\/wav;base64,([^']+)'/)[1], 'base64');
  assert.equal(bytes.length, 44);
  assert.equal(bytes.toString('latin1', 0, 4), 'RIFF');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
  assert.equal(bytes.readUInt32LE(24), 8000);
});

test('the intro asks for a gesture as a terminal line, not a separate button', () => {
  assert.doesNotMatch(css, /welcome-letterbox|welcome-prompt/);
  assert.match(js, /'> press any key to tune in'/);
  assert.match(js, /'> tap to tune in'/);
});

const LINES_BEFORE_TAIL = [
  'the internet died.',
  'nobody switched off the radio.',
  'somewhere a server never got the shutdown order.',
  "it's been writing music ever since,",
  'credited to bands that were never born.',
];
const TAILS = [
  "still broadcasting. nobody's left to stop it.",
  "you're tuned in to the last transmission.",
  'dead internet. live radio.',
  'still broadcasting. just in case.',
  "i play music so the silence doesn't win.",
  'if you can hear this, say something.',
  'is anyone out there?',
];

function loadWelcome({ stored = {}, reduced = false, gsap = false } = {}) {
  const log = [];
  const store = new Map(Object.entries(stored).map(([k, v]) => [k, String(v)]));
  const element = (name) => ({
    name,
    className: '',
    textContent: '',
    children: [],
    style: {},
    classes: new Set(),
    clicks: [],
    classList: {
      add(c) { this.owner.classes.add(c); },
      remove(c) { this.owner.classes.delete(c); },
      toggle() {},
    },
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(type, fn) { if (type === 'click') this.clicks.push(fn); },
    getAttribute() { return this.src || null; },
    setAttribute() {},
    play() { this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  });
  const make = (name) => { const el = element(name); el.classList.owner = el; return el; };
  const splash = make('splash');
  const audio = make('audio');
  const box = make('lore');
  const els = { 'welcome-splash': splash, 'welcome-audio': audio, 'welcome-lore': box };
  const timers = [];
  let release = null;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    document: {
      getElementById: (id) => els[id] || null,
      createElement: (tag) => make(tag),
      createTextNode: (t) => ({ data: t }),
      addEventListener() {},
      removeEventListener() {},
    },
    window: {
      matchMedia: (q) => ({ matches: reduced && /reduce/.test(q) }),
      gsap: gsap ? { timeline() { throw new Error('animated despite reduced motion'); } } : undefined,
      addEventListener() {},
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {},
    setInterval: () => 0,
    visuals: { getList: () => [], getCurrentId: () => null, activate: () => false, cancelPrewarm() {} },
    idents: {
      pick: () => '',
      onAir: async () => ({ visual: [], audio: [3] }),
      clipName: (clips) => `station-ids/id-0${clips[0]}.wav`,
      playClip: (src) => {
        log.push({ at: 'clip', src, shown: box.children.map((l) => l.textContent) });
        return new Promise((resolve) => { release = resolve; });
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  const settle = async () => { for (let i = 0; i < 10; i += 1) await new Promise((r) => setImmediate(r)); };
  return {
    splash, audio, box, log, timers, settle, store,
    show: (allowed) => vm.runInContext(`showWelcome(${allowed})`, sandbox),
    endClip: () => release(),
    faded: () => splash.classes.has('fade-out'),
  };
}

for (const allowed of [true, false]) {
  test(`story, then station ID, then the music, ${allowed ? 'sound allowed' : 'after the click'}`, async () => {
    const w = loadWelcome();
    w.show(allowed);
    await w.settle();
    if (!allowed) {
      assert.equal(w.log.length, 0, 'nothing airs before the click');
      assert.equal(w.splash.clicks.length, 1);
      const prompt = w.box.children.at(-1);
      assert.equal(prompt.className, 'lore-line lore-prompt', 'the story ends asking to tune in');
      assert.equal(prompt.type, 'button');
      assert.equal(prompt.children[0].data, '> press any key to tune in');
      w.splash.clicks[0]();
      await w.settle();
    }
    assert.equal(w.log.length, 1);
    assert.equal(w.log[0].src, 'station-ids/id-03.wav');
    assert.deepEqual(w.log[0].shown.slice(0, 5), LINES_BEFORE_TAIL, 'the story is in before the ID');
    assert.equal(w.faded(), false, 'the music waits for the ID');
    w.endClip();
    await w.settle();
    assert.equal(w.faded(), true, 'the splash gives way to the music once the ID ends');
  });
}

test('the story is five lines and one tail, and the tail turns over each visit', () => {
  const seen = [];
  const store = {};
  for (let visit = 0; visit < TAILS.length + 1; visit += 1) {
    const w = loadWelcome({ stored: store });
    w.show(true);
    const lines = w.box.children.map((l) => l.textContent);
    assert.equal(lines.length, 7);
    assert.deepEqual(lines.slice(0, 5), LINES_BEFORE_TAIL);
    assert.equal(lines[5], '');
    seen.push(lines[6]);
    store['lore-tail'] = w.store.get('lore-tail');
  }
  assert.deepEqual(seen.slice(0, TAILS.length), TAILS, 'each tail comes once, in turn');
  assert.equal(seen[TAILS.length], TAILS[0], 'then it starts over');
});

test('reduced motion shows the whole story at once, without animating', () => {
  const w = loadWelcome({ reduced: true, gsap: true });
  w.show(true);
  assert.equal(w.box.children.length, 7);
  assert.equal(w.box.children[0].textContent, LINES_BEFORE_TAIL[0]);
});
