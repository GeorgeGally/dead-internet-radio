'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadSetList() {
  const sandbox = {
    document: { getElementById: () => null, addEventListener() {} },
    window: { addEventListener() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, AbortController, Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${fs.readFileSync(path.join(root, 'public/setlist.js'), 'utf8')}\nthis.setList = setList;`, sandbox);
  return sandbox.setList;
}

test('a segment is played, on, or next by the station clock', () => {
  const setList = loadSetList();
  const seg = { startsAt: 1000, durationMs: 500 };
  assert.equal(setList.state(seg, 999), 'next');
  assert.equal(setList.state(seg, 1000), 'now');
  assert.equal(setList.state(seg, 1499), 'now');
  assert.equal(setList.state(seg, 1500), 'played');
});

test('durations read as minutes and seconds', () => {
  const setList = loadSetList();
  assert.equal(setList.length(190032), '3:10');
  assert.equal(setList.length(8000), '0:08');
  assert.equal(setList.length(240000), '4:00');
});

// A small DOM: enough elements for the key, its light, and the page rows.
function node(tag) {
  const classes = new Set();
  const handlers = {};
  const n = {
    tag, children: [], parent: null, attrs: {}, style: {}, textContent: '', offsetTop: 0, scrollTop: 0,
    get className() { return [...classes].join(' '); },
    set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    setAttribute(k, v) { n.attrs[k] = String(v); },
    getAttribute: (k) => n.attrs[k],
    addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
    fire(type, e = {}) { (handlers[type] || []).forEach((fn) => fn({ target: n, ...e })); },
    append(...kids) { kids.forEach((k) => { k.parent = n; n.children.push(k); }); },
    appendChild(k) { n.append(k); return k; },
    replaceChildren(...kids) { n.children = []; n.append(...kids); },
    get firstElementChild() { return n.children[0] || null; },
    contains(o) { for (let x = o; x; x = x.parent) if (x === n) return true; return false; },
    all() { return n.children.flatMap((k) => [k, ...k.all()]); },
    querySelectorAll(sel) {
      const want = sel.split('.').filter(Boolean);
      return n.all().filter((k) => want.every((c) => k.classList.contains(c)));
    },
    querySelector(sel) { return n.querySelectorAll(sel)[0] || null; },
  };
  return n;
}

function player(segments, serverTime) {
  const els = { 'btn-set': node('button'), 'set-led': node('span'), deck: node('header') };
  const body = node('body');
  const docHandlers = {};
  const calls = [];
  const timers = [];
  const sandbox = {
    document: {
      body,
      getElementById: (id) => els[id] || null,
      createElement: (tag) => node(tag),
      addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); },
    },
    window: { addEventListener() {} },
    fetch: async (url) => { calls.push(url); return { ok: true, json: async () => ({ serverTime, segments }) }; },
    setTimeout: () => 0, clearTimeout() {},
    setInterval: (fn) => { timers.push(fn); return timers.length; }, clearInterval() {},
    AbortController, Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/setlist.js'), 'utf8'), sandbox);
  const page = body.children.find((k) => k.attrs.role === 'dialog');
  return { els, body, page, calls, key: (e) => (docHandlers.keydown || []).forEach((fn) => fn(e)) };
}

const settle = () => new Promise((r) => setImmediate(r));

test('the Tracks key opens the set on air with played, now and next rows', async () => {
  // Three back-to-back segments; the server clock sits 30s into the second.
  const t = Date.now();
  const segs = [
    { startsAt: t - 90000, durationMs: 60000, title: 'Geiger Baseline', artist: 'Drift Anchor' },
    { startsAt: t - 30000, durationMs: 190032, title: 'Substation Hum', artist: 'Cold Storage', showName: 'Afternoon Collapse', djName: 'Polygon' },
    { startsAt: t + 160032, durationMs: 161000, title: 'Bad Girls Dismantle', artist: 'Scaffold Collapse' },
  ];
  const p = player(segs, t);
  p.els['btn-set'].fire('click');
  await settle();
  assert.deepEqual(p.calls, ['/api/v1/airing']);
  assert.ok(p.page.classList.contains('open'));
  assert.ok(p.els['set-led'].classList.contains('on'));
  assert.ok(p.body.classList.contains('set-open'));
  assert.ok(p.els.deck.classList.contains('expanded'), 'the deck stays open above the list');
  const rows = p.page.querySelectorAll('set-row');
  assert.deepEqual(rows.map((r) => r.className), ['set-row played enter', 'set-row now enter', 'set-row next enter']);
  assert.deepEqual(rows.map((r) => r.style.animationDelay), ['360ms', '405ms', '450ms'], 'the rows arrive one line at a time');
  assert.equal(p.page.querySelector('set-head').textContent, 'Polygon - Afternoon Collapse Tracklist');
  assert.equal(rows[1].querySelector('set-title').textContent, 'Substation Hum');
  assert.equal(rows[1].querySelector('set-len').textContent, '3:10');
});

test('Escape and a second press close the set list', async () => {
  const p = player([], Date.now());
  p.els['btn-set'].fire('click');
  await settle();
  assert.ok(p.page.querySelector('set-empty'), 'an empty airing says so');
  p.key({ key: 'Escape' });
  assert.ok(!p.page.classList.contains('open'));
  assert.ok(!p.body.classList.contains('set-open'));
  p.els['btn-set'].fire('click');
  p.els['btn-set'].fire('click');
  assert.ok(!p.page.classList.contains('open'));
});
