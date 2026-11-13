'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'public/signal.js'), 'utf8');

// Just enough DOM for the Signal overlay to build its composer.
function node(tag) {
  const classes = new Set();
  const handlers = {};
  const n = {
    tag, children: [], parent: null, attrs: {}, dataset: {}, style: { props: {}, setProperty(k, v) { n.style.props[k] = v; } },
    textContent: '', value: '', hidden: false, isConnected: true,
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    setAttribute(k, v) { n.attrs[k] = String(v); },
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    fire(type, e = {}) { (handlers[type] || []).forEach((fn) => fn({ preventDefault() {}, target: n, ...e })); },
    append(...kids) { kids.forEach((k) => { if (typeof k === 'object') { k.parent = n; n.children.push(k); } }); },
    get childElementCount() { return n.children.length; },
    get firstElementChild() { return n.children[0] || null; },
    remove() { if (n.parent) n.parent.children = n.parent.children.filter((k) => k !== n); n.isConnected = false; },
    all() { return n.children.flatMap((k) => [k, ...k.all()]); },
    querySelectorAll(sel) { return n.all().filter((k) => k.classList.contains(sel.replace('.', ''))); },
    querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
    matches: () => false,
    setCustomValidity() {}, reportValidity() {}, blur() { n.blurred = true; },
  };
  return n;
}

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

// A fake clock so timed station messages can be stepped through.
function clock(start) {
  let now = start;
  let seq = 0;
  const timers = [];
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const schedule = (fn, ms = 0, every = 0) => { timers.push({ id: ++seq, fn, at: now + ms, every }); return seq; };
  return {
    Date: FakeDate,
    setTimeout: (fn, ms) => schedule(fn, ms),
    setInterval: (fn, ms) => schedule(fn, ms, ms),
    clear(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        now = t.at;
        if (t.every) t.at += t.every; else timers.shift();
        t.fn();
        await flush();
      }
      now = end;
    },
  };
}

async function signal({ signedIn = true, chatEnabled = true, bulletins, reply, reducedMotion = true } = {}) {
  const body = node('body');
  const time = clock(240000 * 1000);
  const listeners = {};
  const page = { modalOpen: false };
  const posts = [];
  const opened = [];
  const sandbox = {
    document: {
      body,
      createElement: (tag) => node(tag),
      createTextNode: (text) => text,
      getElementById: () => null,
      querySelector: () => (page.modalOpen ? {} : null),
    },
    window: { addEventListener: (type, fn) => (listeners[type] ||= []).push(fn), innerHeight: 800 },
    matchMedia: () => ({ matches: reducedMotion }),
    getComputedStyle: () => ({ display: 'none' }),
    sessionStorage: { getItem: () => null },
    location: { protocol: 'https:', host: 'example.test' },
    WebSocket: function WebSocket() {},
    setTimeout: time.setTimeout, clearTimeout: time.clear,
    setInterval: time.setInterval, clearInterval: time.clear,
    AbortController, Date: time.Date, JSON, Promise,
    async fetch(url, opts = {}) {
      if (opts.method === 'POST') posts.push({ url, body: opts.body });
      if (url.endsWith('/signal/bulletins')) {
        if (!bulletins) throw new Error('offline');
        return { ok: true, json: async () => ({ lines: bulletins }) };
      }
      if (reply && opts.method === 'POST') return { ok: reply.ok, json: async () => reply.data };
      const data = url.endsWith('/me')
        ? { signed_in: signedIn, csrf_token: 't', public_handle: 'Perth_1' }
        : { chat_enabled: chatEnabled, messages: [], id: 'm1', kind: 'chat', body: 'hi' };
      return { ok: true, json: async () => data };
    },
    requestLine: { open: (reason) => opened.push(['request', reason]) },
    setList: { open: () => opened.push(['tracklist']) },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  await flush();
  const root = body.children[0];
  const form = root.querySelector('.signal-compose');
  const stack = root.querySelector('.signal-stack');
  return {
    posts, opened, form, time, page, stack: () => stack,
    input: root.querySelector('.signal-input'),
    lines: () => stack.children.map((line) => line.querySelector('.signal-copy').textContent),
    copies: () => stack.children.map((line) => line.querySelector('.signal-copy')),
    safety: () => stack.children.filter((line) => line.classList.contains('signal-safety')),
    track: (detail) => (listeners['dir:track'] || []).forEach((fn) => fn({ detail })),
  };
}

async function submit(s, text) {
  s.input.value = text;
  s.form.fire('submit');
  await new Promise((r) => setImmediate(r));
}

const states = [
  ['signed in, chat on', {}],
  ['signed out', { signedIn: false }],
  ['chat offline', { chatEnabled: false }],
  ['signed out, chat offline', { signedIn: false, chatEnabled: false }],
];
for (const [label, state] of states) {
  for (const [typed, want] of [['/request', ['request', 'request']], ['/TrackList  ', ['tracklist']], ['/playlist', ['tracklist']], ['/SetList', ['tracklist']]]) {
    test(`typing ${typed.trim()} opens its page and posts nothing (${label})`, async () => {
      const s = await signal(state);
      assert.notEqual(s.input.readOnly, true);
      await submit(s, typed);
      assert.deepEqual(s.opened, [want]);
      assert.deepEqual(s.posts, []);
      assert.equal(s.input.value, '');
    });
  }
}

test('focusing the composer while signed out does not ask for sign-in', async () => {
  const s = await signal({ signedIn: false });
  s.input.fire('pointerdown');
  s.input.fire('focus');
  assert.deepEqual(s.opened, []);
});

test('ordinary messages still transmit', async () => {
  const s = await signal();
  await submit(s, 'hello request line');
  assert.equal(s.posts.length, 1);
  assert.deepEqual(s.opened, []);
});

test('a signed-out ordinary message asks for sign-in and posts nothing', async () => {
  const s = await signal({ signedIn: false });
  await submit(s, 'hello');
  assert.deepEqual(s.opened, [['request', 'chat']]);
  assert.deepEqual(s.posts, []);
});

for (const [label, state] of [['signed in', {}], ['signed out', { signedIn: false }]]) {
  test(`an ordinary message while chat is offline says so and keeps the text (${label})`, async () => {
    const s = await signal({ ...state, chatEnabled: false });
    await submit(s, 'hello');
    assert.deepEqual(s.posts, []);
    assert.deepEqual(s.opened, []);
    assert.equal(s.input.value, 'hello');
    assert.equal(s.input.blurred, true);
    assert.deepEqual(s.lines(), ['Chat is offline']);
    await s.time.advance(15000);
    assert.equal(s.lines().includes('Chat is offline'), false);
  });
}

test('each track change posts one now playing message', async () => {
  const s = await signal();
  s.track({ title: 'Buffering Memories', artist: 'Dead Internet Radio' });
  s.track({ title: 'Buffering Memories', artist: 'Dead Internet Radio' });
  assert.deepEqual(s.lines(), ['Now playing: Buffering Memories · Dead Internet Radio']);
  s.track({ title: 'Dial Tone Lullaby', artist: 'Modem Choir' });
  assert.deepEqual(s.lines(), [
    'Now playing: Buffering Memories · Dead Internet Radio',
    'Now playing: Dial Tone Lullaby · Modem Choir',
  ]);
});

test('a track that changes while the overlay is hidden is announced once it shows', async () => {
  const s = await signal();
  await s.time.advance(1500);
  s.page.modalOpen = true;
  await s.time.advance(1500);
  s.track({ title: 'Buffering Memories', artist: 'Dead Internet Radio' });
  assert.deepEqual(s.lines(), []);
  s.page.modalOpen = false;
  await s.time.advance(1500);
  assert.deepEqual(s.lines().filter((l) => l.startsWith('Now playing')),
    ['Now playing: Buffering Memories · Dead Internet Radio']);
});

test('a bulletin arrives within seconds of the overlay showing, then every four minutes', async () => {
  const s = await signal();
  await s.time.advance(8000);
  assert.equal(s.safety().length, 1);
  const first = s.safety()[0].querySelector('.signal-copy').textContent;
  await s.time.advance(3 * 60000);
  assert.equal(s.safety().length, 0);
  await s.time.advance(60000);
  assert.equal(s.safety().length, 1);
  assert.notEqual(s.safety()[0].querySelector('.signal-copy').textContent, first);
});

test('bulletins use the lines the station serves', async () => {
  const served = ['DIR FICTION / The moon has been deprecated. Please migrate to the sun.'];
  const s = await signal({ bulletins: served });
  await s.time.advance(8000);
  assert.deepEqual(s.safety().map((l) => l.querySelector('.signal-copy').textContent),
    ['The moon has been deprecated. Please migrate to the sun.']);
});

test('bulletins fall back to built-in lines when the station is out of reach', async () => {
  const s = await signal();
  await s.time.advance(8000);
  assert.equal(s.safety().length, 1);
  assert.ok(s.safety()[0].querySelector('.signal-copy').textContent.length > 10);
});

test('a refused transmission is told in the stream, not a popup', async () => {
  const s = await signal({ reply: { ok: false, data: { message: "That transmission doesn't belong on this frequency." } } });
  await submit(s, 'something nasty');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(s.lines(), ["That transmission doesn't belong on this frequency."]);
  assert.equal(s.input.value, 'something nasty');
});

test('a signed-out message is answered in the stream as well as opening sign-in', async () => {
  const s = await signal({ signedIn: false });
  await submit(s, 'hello');
  assert.deepEqual(s.lines(), ['Sign in to transmit']);
});

test('blacked-out words are drawn as redaction bars', async () => {
  const s = await signal({ reply: { ok: true, data: { id: 'm9', kind: 'chat', name: 'Perth_1', body: '\u2588\u2588\u2588\u2588 this' } } });
  await submit(s, 'fuck this');
  await new Promise((r) => setImmediate(r));
  const bars = s.copies()[0].children.filter((c) => c.classList.contains('signal-redacted'));
  assert.equal(bars.length, 1);
  assert.equal(bars[0].textContent, '\u2588\u2588\u2588\u2588');
});

test('an unknown slash command lists the commands in the stream and posts nothing', async () => {
  const s = await signal();
  await submit(s, '/dance');
  assert.deepEqual(s.posts, []);
  assert.deepEqual(s.opened, []);
  assert.equal(s.input.value, '');
  assert.deepEqual(s.lines(), ['Commands: /request, /tracklist']);
});

test('a line stays until its climb finishes, however late the climb runs', async () => {
  const s = await signal({ reducedMotion: false });
  s.track({ title: 'Buffering Memories', artist: 'Dead Internet Radio' });
  const [line] = s.stack().children;
  await s.time.advance(30000);
  assert.equal(line.isConnected, true);
  line.fire('animationend', { animationName: 'signal-appear' });
  assert.equal(line.isConnected, true);
  line.fire('animationend', { animationName: 'signal-rise' });
  assert.equal(s.lines().some((l) => l.startsWith('Now playing')), false);
});

test('with reduced motion a station line leaves after its 12 second life', async () => {
  const s = await signal();
  s.track({ title: 'Buffering Memories', artist: 'Dead Internet Radio' });
  const [line] = s.stack().children;
  await s.time.advance(11999);
  assert.equal(line.isConnected, true);
  await s.time.advance(1);
  assert.equal(line.isConnected, false);
});

test('a line on screen when the overlay hides is gone when it shows again', async () => {
  const s = await signal({ reducedMotion: false });
  await s.time.advance(1500);
  s.track({ title: 'Buffering Memories', artist: 'Dead Internet Radio' });
  s.page.modalOpen = true;
  await s.time.advance(1500);
  s.page.modalOpen = false;
  await s.time.advance(1500);
  assert.deepEqual(s.lines().filter((l) => l.startsWith('Now playing')), []);
});

test('a line whose climb never finishes still leaves within three of its lifetimes', async () => {
  const s = await signal({ reducedMotion: false });
  s.track({ title: 'Buffering Memories', artist: 'Dead Internet Radio' });
  const [line] = s.stack().children;
  await s.time.advance(36000);
  assert.equal(line.isConnected, false);
});
