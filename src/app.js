'use strict';

// ─── Epoch: 2035-01-01T00:00:00Z ─────────────────────────────────────────────
const EPOCH = 2051222400000;

// ─── Teletext 8-colour palette ───────────────────────────────────────────────
const C = {
  black:   '#000000',
  white:   '#ffffff',
  cyan:    '#00ffff',
  yellow:  '#ffff00',
  green:   '#00ff00',
  red:     '#ff0000',
  magenta: '#ff00ff',
  blue:    '#0000ff',
};

// ─── Satellite dish mosaic (24 cols × 13 rows) ────────────────────────────────
// 0 = black, 1 = cyan
const DISH = [
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0],
];

// ─── State ───────────────────────────────────────────────────────────────────
let playlist = null;
let pages = null;
let currentTrack = 0;
let currentPage = 0;
let cycleTimer = null;

// ─── DOM helpers ─────────────────────────────────────────────────────────────
function el(tag, opts = {}) {
  const e = document.createElement(tag);
  if (opts.cls) e.className = opts.cls;
  if (opts.text !== undefined) e.textContent = opts.text;
  if (opts.html !== undefined) e.innerHTML = opts.html;
  if (opts.style) Object.assign(e.style, opts.style);
  return e;
}

function row(text, colorCls = 'row--white') {
  const e = el('span', { cls: `row ${colorCls}`, text });
  return e;
}

function makeBand(colorKey, text) {
  const band = el('div', { cls: `band band--${colorKey}` });
  const topChars = '▄'.repeat(40);   // ▄
  const botChars = '▀'.repeat(40);   // ▀
  const top = el('span', { cls: 'band-top', text: topChars });
  const mid = el('span', { cls: 'band-middle', text: ' ' + (text || '') });
  const bot = el('span', { cls: 'band-bottom', text: botChars });
  band.append(top, mid, bot);
  return band;
}

function spacer() {
  return el('span', { cls: 'spacer' });
}

function pad(str, len, char = ' ') {
  return String(str).substring(0, len).padEnd(len, char);
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 1) + '…' : str;
}

// ─── Mosaic renderer ─────────────────────────────────────────────────────────
function renderMosaic() {
  const cols = DISH[0].length;
  const wrapper = el('div', { cls: 'mosaic' });
  wrapper.style.gridTemplateColumns = `repeat(${cols}, 1ch)`;

  for (const row of DISH) {
    for (const cell of row) {
      wrapper.appendChild(el('span', { cls: `mosaic-cell mosaic-cell--${cell}` }));
    }
  }
  return wrapper;
}

// ─── Page renderer ───────────────────────────────────────────────────────────
function renderPage(index) {
  currentPage = index;
  updatePageHeader();

  const body = document.getElementById('page-body');
  body.innerHTML = '';

  switch (index) {
    case 0: renderP100(body); break;
    case 1: renderP101(body); break;
    case 2: renderPAd(body, (pages?.ads || [])[0] || null, 'P102'); break;
    case 3: renderPAd(body, (pages?.ads || [])[1] || null, 'P103'); break;
    case 4: renderPAd(body, (pages?.ads || [])[2] || null, 'P104'); break;
    case 5: renderP105(body); break;
  }
}

function renderP100(container) {
  if (!playlist) return;
  const track = playlist.tracks[currentTrack] || {};
  const num = String(currentTrack + 1).padStart(3, '0');
  const total = String(playlist.tracks.length).padStart(3, '0');

  // Transmitting band
  const txLabel = `▶ TRANSMITTING`;  // ▶
  const counter = `${num} / ${total}`;
  const spaces = 40 - 2 - txLabel.length - counter.length;
  const txBand = makeBand('green', txLabel + ' '.repeat(Math.max(1, spaces)) + counter);
  // Apply flash to the ▶
  const mid = txBand.querySelector('.band-middle');
  if (mid) {
    const flashSpan = el('span', { cls: 'flash', text: '▶' });
    const rest = el('span', { text: ' TRANSMITTING' + ' '.repeat(Math.max(1, spaces)) + counter });
    mid.innerHTML = ' ';
    mid.appendChild(flashSpan);
    mid.appendChild(rest);
  }
  container.appendChild(txBand);

  // Mosaic dish
  container.appendChild(renderMosaic());
  container.appendChild(spacer());

  // Track caption (yellow, truncated to 38 chars, word-wrapped if needed)
  const caption = (track.caption || 'DEAD INTERNET RADIO').toUpperCase();
  const lines = wrapText(caption, 38);
  for (const line of lines.slice(0, 3)) {
    container.appendChild(row(' ' + line, 'row--yellow'));
  }
  container.appendChild(spacer());

  // BPM + Key
  if (track.bpm || track.key) {
    const bpmStr = track.bpm ? String(track.bpm).padStart(3, '0') : '---';
    const keyStr = track.key || '-------';
    container.appendChild(row(` BPM  ${bpmStr}     KEY  ${keyStr}`, 'row--white'));
  }
  container.appendChild(row(' FREQ  0321.9 kHz', 'row--white'));
  container.appendChild(spacer());

  // On-air since
  container.appendChild(row(' ON AIR SINCE 01 JAN 2035', 'row--cyan'));
}

function renderP101(container) {
  const headlines = pages?.headlines || [];
  container.appendChild(makeBand('yellow', 'HEADLINES'));
  container.appendChild(spacer());

  for (const h of headlines.slice(0, 5)) {
    const lines = wrapText(String(h).toUpperCase(), 36);
    container.appendChild(row(' ► ' + (lines[0] || ''), 'row--white'));  // ►
    for (const cont of lines.slice(1)) {
      container.appendChild(row('   ' + cont, 'row--white'));
    }
    container.appendChild(spacer());
  }

  container.appendChild(row(' FOR FULL STORIES SEE P110', 'row--cyan'));
}

function renderPAd(container, ad, pageId) {
  if (!ad) {
    container.appendChild(makeBand('red', 'ADVERTISEMENT'));
    container.appendChild(spacer());
    container.appendChild(row(' NO CONTENT', 'row--white'));
    return;
  }

  const color = ad.headerColor || 'red';
  container.appendChild(makeBand(color, (ad.header || '').toUpperCase()));
  container.appendChild(spacer());

  for (const line of (ad.lines || []).slice(0, 9)) {
    const text = String(line);
    if (text === '') {
      container.appendChild(spacer());
    } else {
      container.appendChild(row(' ' + truncate(text, 37), 'row--white'));
    }
  }

  container.appendChild(spacer());
  if (ad.footer)  container.appendChild(row(' ' + truncate(String(ad.footer), 37), 'row--cyan'));
  if (ad.footer2) container.appendChild(row(' ' + truncate(String(ad.footer2), 37), 'row--white'));
}

function renderP105(container) {
  container.appendChild(makeBand('green', 'THIS IS DEAD INTERNET RADIO'));
  container.appendChild(spacer());

  const phrase = 'ARE YOU A ROBOT  ';
  const charsPerRow = 38;
  const rowCount = 8;
  const total = charsPerRow * rowCount;
  const repeated = phrase.repeat(Math.ceil(total / phrase.length)).substring(0, total);

  for (let i = 0; i < rowCount; i++) {
    const chunk = repeated.substring(i * charsPerRow, (i + 1) * charsPerRow);
    container.appendChild(row(' ' + chunk, 'row--white'));
  }
}

// ─── Text utilities ───────────────────────────────────────────────────────────
function wrapText(text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!word) continue;
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

// ─── Page header ─────────────────────────────────────────────────────────────
function updatePageHeader() {
  const header = document.getElementById('page-header');
  if (!header) return;
  const pageNum = 100 + currentPage;
  const title = 'DEAD INTERNET RADIO';
  const time = currentTime();
  const left = `P${pageNum} ${title}`;
  const spaces = 40 - left.length - time.length;
  header.textContent = left + ' '.repeat(Math.max(1, spaces)) + time;
}

function currentTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// ─── Navigation ──────────────────────────────────────────────────────────────
const PAGE_COUNT = 6;

function navigate(delta) {
  currentPage = ((currentPage + delta) % PAGE_COUNT + PAGE_COUNT) % PAGE_COUNT;
  renderPage(currentPage);
  resetCycle();
}

function resetCycle() {
  clearInterval(cycleTimer);
  cycleTimer = setInterval(() => navigate(1), 8000);
}

function setupNav() {
  document.getElementById('nav-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    navigate(-1);
  });
  document.getElementById('nav-next').addEventListener('click', (e) => {
    e.stopPropagation();
    navigate(1);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });
}

// ─── Audio sync ──────────────────────────────────────────────────────────────
function setupAudio() {
  const tracks = playlist.tracks;
  const totalMs = tracks.reduce((s, t) => s + t.durationMs, 0);

  if (totalMs === 0) return;

  const rawOffset = Date.now() - EPOCH;
  const offset = ((rawOffset % totalMs) + totalMs) % totalMs;

  let cumulative = 0;
  currentTrack = 0;
  for (let i = 0; i < tracks.length; i++) {
    if (offset < cumulative + tracks[i].durationMs) {
      currentTrack = i;
      break;
    }
    cumulative += tracks[i].durationMs;
  }
  const seekMs = offset - cumulative;

  const audio = document.getElementById('player');
  audio.src = tracks[currentTrack].file;
  audio.currentTime = seekMs / 1000;

  audio.addEventListener('ended', onTrackEnd);

  // Attempt autoplay; fall back to first-interaction resume
  const tryPlay = () => {
    audio.play().catch(() => {});
    document.removeEventListener('keydown', tryPlay);
    document.removeEventListener('click', tryPlay, true);
  };

  audio.play()
    .catch(() => {
      document.addEventListener('keydown', tryPlay);
      document.addEventListener('click', tryPlay, { capture: true, once: true });
    });
}

function onTrackEnd() {
  currentTrack = (currentTrack + 1) % playlist.tracks.length;
  const audio = document.getElementById('player');
  audio.src = playlist.tracks[currentTrack].file;
  audio.currentTime = 0;
  audio.play().catch(() => {});
  if (currentPage === 0) renderPage(0);
}

// ─── Clock ───────────────────────────────────────────────────────────────────
function startClock() {
  setInterval(updatePageHeader, 1000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  try {
    [playlist, pages] = await Promise.all([
      fetch('playlist.json').then(r => r.json()),
      fetch('pages.json').then(r => r.json()),
    ]);
  } catch (e) {
    document.getElementById('page-body').textContent =
      'ERROR: COULD NOT LOAD BROADCAST DATA';
    return;
  }

  setupAudio();
  renderPage(0);
  startClock();
  resetCycle();
  setupNav();
}

document.addEventListener('DOMContentLoaded', init);
