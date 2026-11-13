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
    tag, children: [], parent: null, attrs: {}, dataset: {}, style: { setProperty() {} },
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
    all() { return n.children.flatMap((k) => [k, ...k.all()]); },
    querySelectorAll(sel) { return n.all().filter((k) => k.classList.contains(sel.replace('.', ''))); },
    querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
    matches: () => false,
    setCustomValidity() {}, reportValidity() {}, blur() {},
  };
  return n;
}

async function signal() {
  const body = node('body');
  const posts = [];
  const opened = [];
  const sandbox = {
    document: {
      body,
      createElement: (tag) => node(tag),
      createTextNode: (text) => text,
      getElementById: () => null,
      querySelector: () => null,
    },
    window: { addEventListener() {}, innerHeight: 800 },
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ display: 'none' }),
    sessionStorage: { getItem: () => null },
    location: { protocol: 'https:', host: 'example.test' },
    WebSocket: function WebSocket() {},
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    AbortController, Date, JSON, Promise,
    async fetch(url, opts = {}) {
      if (opts.method === 'POST') posts.push({ url, body: opts.body });
      const data = url.endsWith('/me')
        ? { signed_in: true, csrf_token: 't', public_handle: 'Perth_1' }
        : { chat_enabled: true, messages: [], id: 'm1', kind: 'chat', body: 'hi' };
      return { ok: true, json: async () => data };
    },
    requestLine: { open: (reason) => opened.push(['request', reason]) },
    setList: { open: () => opened.push(['tracklist']) },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  const root = body.children[0];
  const form = root.querySelector('.signal-compose');
  return {
    posts, opened, form,
    input: root.querySelector('.signal-input'),
    hints: root.querySelector('.signal-commands'),
    hint: (name) => root.querySelectorAll('.signal-command').find((h) => h.dataset.command === name),
  };
}

for (const [typed, want] of [['/request', ['request', 'request']], ['/TrackList  ', ['tracklist']]]) {
  test(`typing ${typed.trim()} opens its page and posts nothing`, async () => {
    const s = await signal();
    s.input.value = typed;
    s.form.fire('submit');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(s.opened, [want]);
    assert.deepEqual(s.posts, []);
    assert.equal(s.input.value, '');
  });
}

test('a slash shows the commands, narrowed as the listener types', async () => {
  const s = await signal();
  assert.equal(s.hints.hidden, true);
  s.input.value = '/';
  s.input.fire('input');
  assert.equal(s.hints.hidden, false);
  assert.equal(s.hint('/request').hidden, false);
  assert.equal(s.hint('/tracklist').hidden, false);
  s.input.value = '/t';
  s.input.fire('input');
  assert.equal(s.hint('/request').hidden, true);
  s.hint('/tracklist').fire('click');
  assert.deepEqual(s.opened, [['tracklist']]);
  assert.equal(s.hints.hidden, true);
  assert.deepEqual(s.posts, []);
});

test('ordinary messages still transmit', async () => {
  const s = await signal();
  s.input.value = 'hello request line';
  s.form.fire('submit');
  await new Promise((r) => setImmediate(r));
  assert.equal(s.posts.length, 1);
  assert.deepEqual(s.opened, []);
});
