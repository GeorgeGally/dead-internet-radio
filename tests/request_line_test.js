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
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    setAttribute() {},
    addEventListener() {},
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

function loadRequestLine(fetch) {
  const body = node('body');
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
      documentElement: {},
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
  return { line: sandbox.requestLine, card: body.children[0] };
}

test('a dropped line still fills the request page instead of leaving it blank', async () => {
  const { line, card } = loadRequestLine(() => Promise.reject(new TypeError('Failed to fetch')));
  await line.open();

  const body = card.querySelector('.rq-body');
  assert.ok(line.isOpen());
  assert.ok(body.children.length > 0, 'request page body is empty');
  assert.match(text(body), /The line went dead/);
});
