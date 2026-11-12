'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

// Just enough DOM for the request line to build its card and render into it.
function node(tag) {
  const classes = new Set();
  const n = {
    tagName: tag.toUpperCase(),
    children: [],
    textContent: '',
    value: '',
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    listeners: {},
    setAttribute() {},
    addEventListener(type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); },
    fire(type, event) { return Promise.all((n.listeners[type] || []).map((fn) => fn(event || { preventDefault() {} }))); },
    focus() {},
    select() {},
    append(...kids) { kids.forEach((k) => n.children.push(k)); },
    appendChild(k) { n.children.push(k); return k; },
    replaceChildren(...kids) { n.children = kids; },
    contains: () => false,
    querySelector(sel) {
      const cls = sel.replace(/^\./, '');
      for (const k of n.children) {
        if (typeof k !== 'object') continue;
        if (k.classList.contains(cls)) return k;
        const deep = k.querySelector(sel);
        if (deep) return deep;
      }
      return null;
    },
  };
  return n;
}

function text(n) {
  if (typeof n === 'string') return n;
  return n.textContent + n.children.map(text).join('');
}

// Every element under n whose class list holds cls, in document order.
function all(n, cls, found = []) {
  for (const k of n.children) {
    if (typeof k !== 'object') continue;
    if (k.classList.contains(cls)) found.push(k);
    all(k, cls, found);
  }
  return found;
}

function loadRequestLine(fetch) {
  const body = node('body');
  let fullscreenAsks = 0;
  const els = { 'request-led': node('span'), 'btn-request': node('button') };
  const sandbox = {
    console,
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    Promise,
    JSON,
    Date,
    Intl,
    Audio: function Audio() { return { addEventListener() {}, pause() {}, play: () => Promise.resolve() }; },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      body,
      documentElement: { requestFullscreen: () => { fullscreenAsks += 1; return Promise.resolve(); } },
      fullscreenElement: null,
      activeElement: null,
      head: node('head'),
      createElement: node,
      getElementById: (id) => els[id] || null,
      addEventListener() {},
    },
    window: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/request.js'), 'utf8') + '\nthis.requestLine = requestLine;', sandbox);
  return { line: sandbox.requestLine, card: body.children[0], fullscreenAsks: () => fullscreenAsks };
}

test('a dropped line still fills the request page instead of leaving it blank', async () => {
  const { line, card } = loadRequestLine(() => Promise.reject(new TypeError('Failed to fetch')));
  await line.open();

  const body = card.querySelector('.rq-body');
  assert.ok(line.isOpen());
  assert.ok(body.children.length > 0, 'request page body is empty');
  assert.match(text(body), /The line went dead/);
});

// A signed-in listener whose request the station takes.
function signedInLine() {
  return loadRequestLine(async (url, opts) => {
    const reply = (data) => ({ ok: true, json: async () => data });
    if (url.endsWith('/me')) return reply({ signed_in: true, requests_left: 3, csrf_token: 't' });
    if (opts.method === 'POST') return reply({ status: 'accepted', message: 'Logged.', requests_left: 2 });
    return reply([]);
  });
}

test('the request line opens as a page without taking the browser full screen', async () => {
  const { line, fullscreenAsks } = signedInLine();
  await line.open();

  assert.ok(line.isOpen());
  assert.equal(fullscreenAsks(), 0);
});

test('once a request is sent, its key closes the line instead of offering another', async () => {
  const { line, card } = signedInLine();
  await line.open();
  const form = all(card, 'rq-form')[0];
  all(form, 'rq-input').forEach((input, i) => { input.value = ['Glass Saints', 'Static Hymn', 'cold electro'][i]; });
  await form.fire('submit');

  const keys = all(card, 'rq-go');
  assert.equal(keys.length, 1);
  assert.equal(text(keys[0].children[0]), 'close');
  assert.doesNotMatch(text(card), /another/i);
  await keys[0].fire('click');
  assert.equal(line.isOpen(), false);
});
