'use strict';

const EPOCH = 2051222400000;
const PAGE_COUNT = 6;
const ERROR_MESSAGE = 'BROADCAST DATA UNAVAILABLE';
const PAGE_MENU = [
  { page: 100, label: 'Home', color: 'yellow' },
  { page: 101, label: 'Headlines', color: 'green' },
  { page: 102, label: 'Relocation', color: 'cyan' },
  { page: 103, label: 'Travel', color: 'magenta' },
  { page: 104, label: 'Public Notice', color: 'red' },
  { page: 105, label: 'Signal', color: 'yellow' },
];
const LOCAL_PREVIEW_PLAYLIST = {
  epoch: EPOCH,
  tracks: [
    {
      file: '',
      durationMs: 180000,
      title: 'Buffering Memories',
      artist: 'Null Cast',
      caption: 'Null Cast — Buffering Memories',
      bpm: 80,
      key: 'A MIN',
    },
    {
      file: '',
      durationMs: 180000,
      title: 'Lost Transmissions',
      artist: 'Datacorp FM',
      caption: 'Datacorp FM — Lost Transmissions',
      bpm: 72,
      key: 'C MIN',
    },
  ],
};
const LOCAL_PREVIEW_PAGES = {
  headlines: [
    'Coastal monitoring station 7 reports nominal readings',
    'Automated content generation continues without supervision',
    'New frequencies allocated to sector 4',
    'Council confirms 2038 maintenance plan',
    'Northern territories report no change',
  ],
  ads: [
    {
      header: 'Relocate With Confidence',
      lines: ['Northern territories', 'Sector 7 coastal zone', 'Population: 0'],
      footer: 'Call 0800 Dead Internet',
      footer2: 'Lines open 00:00-00:00 daily',
    },
    {
      header: 'Travel Sector 9',
      lines: ['Visit the eastern processing zone', 'All facilities operational'],
      footer: 'Call 0800 Dead Internet',
      footer2: 'Some zones may be restricted',
    },
    {
      header: 'Public Service Notice',
      lines: ['Continue monitoring all channels', 'The broadcast continues as planned'],
      footer: 'This message approved by',
      footer2: 'Sector administration 2035',
    },
  ],
};

const SKULL = [
  '...2222222...',
  '..222222222..',
  '.22222222222.',
  '.22222222222.',
  '2222222222222',
  '2222222222222',
  '2222222222222',
  '2222222222222',
  '22222...22222',
  '2222.....2222',
  '22222...22222',
  '2222222222222',
  '2222222222222',
  '222222.222222',
  '22222...22222',
  '.2222...2222.',
  '..222...222..',
];

const TERRITORY = [
  '....................',
  '...........111111...',
  '.........11111111...',
  '........1111111111..',
  '.......111111111111.',
  '......11111111111111',
  '.....111111111111111',
  '....1111111111111111',
  '...11111111111111111',
  '..111111111111111111',
  '.1111111111111111111',
  '11111111111111111111',
  '11111111111111111111',
  '11111111111111111111',
  '11111111111111111111',
  '11111111111111111111',
  '1111111..111111..111',
  '1111111..111111..111',
  '11111111111111111111',
  '11111111111111111111',
];

let playlist = null;
let pages = null;
let currentTrack = 0;
let currentPage = 0;
let cycleTimer = null;
let redrawTimer = null;

function el(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.cls) node.className = options.cls;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      node.setAttribute(name, value);
    }
  }
  return node;
}

function append(parent, ...children) {
  parent.append(...children.filter(Boolean));
  return parent;
}

function textBlock(tag, cls, text) {
  return el(tag, { cls, text: String(text || '').toUpperCase() });
}

function truncate(text, length) {
  return String(text || '').trim().slice(0, length);
}

function wrapText(text, maxWidth, maxLines = Infinity) {
  const source = String(text || '').trim().toUpperCase();
  if (!source) return [];

  const words = source.split(/\s+/).flatMap((word) => {
    if (word.length <= maxWidth) return [word];
    const pieces = [];
    for (let i = 0; i < word.length; i += maxWidth) {
      pieces.push(word.slice(i, i + maxWidth));
    }
    return pieces;
  });

  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }

  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

function compactLines(lines, limit) {
  return (lines || [])
    .map((line) => String(line || '').trim().toUpperCase())
    .filter(Boolean)
    .slice(0, limit);
}

function makeMosaic(pattern, cls) {
  const mosaic = el('div', {
    cls: `mosaic ${cls}`,
    attrs: { 'aria-hidden': 'true' },
  });
  const columns = pattern[0].length;
  mosaic.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  mosaic.style.gridTemplateRows = `repeat(${pattern.length}, 1fr)`;

  for (const row of pattern) {
    for (const cell of row) {
      mosaic.appendChild(el('span', {
        cls: `mosaic-cell mosaic-cell--${cell === '.' ? '0' : cell}`,
      }));
    }
  }

  return mosaic;
}

function page(className) {
  return el('article', { cls: `teletext-page ${className}` });
}

function renderPage(index, redraw = false) {
  currentPage = index;
  updatePageHeader();
  document.getElementById('screen').classList.toggle('is-home', index === 0);

  const body = document.getElementById('page-body');
  body.replaceChildren();

  const renderers = [
    renderP100,
    renderP101,
    renderP102,
    renderP103,
    renderP104,
    renderP105,
  ];

  body.appendChild(renderers[index]());
  if (redraw) triggerRedraw(body);
}

function triggerRedraw(body) {
  clearTimeout(redrawTimer);
  body.classList.remove('is-redrawing');
  void body.offsetWidth;
  body.classList.add('is-redrawing');
  redrawTimer = setTimeout(() => body.classList.remove('is-redrawing'), 160);
}

function renderP100() {
  const view = page('page--now-playing');
  const track = playlist?.tracks?.[currentTrack] || {};
  const tracks = playlist?.tracks || [];
  const nextIndex = tracks.length ? (currentTrack + 1) % tracks.length : 0;
  const nextTrack = tracks[nextIndex] || {};
  const currentTitle = wrapText(track.caption || 'NULL CAST', 19, 2).join('\n');
  const nextTitle = wrapText(nextTrack.caption || 'LOST TRANSMISSION', 19, 2).join('\n');

  const main = el('section', { cls: 'home-main' });
  const identity = el('div', { cls: 'home-identity' });
  const wordmark = el('h1', { cls: 'display solid-type home-wordmark' });
  append(
    wordmark,
    el('span', { cls: 'home-word home-word--dead', text: 'Dead' }),
    el('span', { cls: 'home-word home-word--internet', text: 'Internet' }),
    el('span', { cls: 'home-word home-word--radio', text: 'Radio' }),
  );
  append(
    identity,
    wordmark,
    el('div', { cls: 'home-data-mark', text: ':≡' }),
    makeMosaic(SKULL, 'home-skull'),
  );

  const calibration = el('div', {
    cls: 'home-calibration',
    attrs: { 'aria-hidden': 'true' },
  });
  ['blue', 'red', 'green', 'yellow', 'cyan', 'magenta'].forEach((color) => {
    calibration.appendChild(el('span', { cls: `bg--${color}` }));
  });

  const signal = el('section', { cls: 'home-signal' });
  const bars = el('div', {
    cls: 'signal-bars',
    attrs: { 'aria-label': 'Signal strength six of seven' },
  });
  for (let index = 0; index < 7; index += 1) {
    bars.appendChild(el('span', { cls: index < 6 ? 'is-live' : '' }));
  }
  append(
    signal,
    el('div', { cls: 'signal-label', text: 'Signal' }),
    bars,
    el('div', { cls: 'signal-divider' }),
    append(
      el('div', { cls: 'signal-status' }),
      el('span', { text: 'Status' }),
      el('strong', { text: 'Online' }),
      el('span', { text: 'Source' }),
      el('strong', { text: 'Somewhere' }),
    ),
  );

  append(
    main,
    identity,
    calibration,
    textBlock('p', 'home-strapline', 'Music for a connection\nthat does not exist'),
    signal,
  );

  const rail = el('aside', { cls: 'home-rail' });
  const onAir = el('section', { cls: 'rail-section home-on-air' });
  append(
    onAir,
    el('h2', { cls: 'solid-type rail-label', text: 'ON AIR' }),
    textBlock('p', 'solid-type rail-title color--yellow', currentTitle),
    el('p', {
      cls: 'rail-detail',
      text: `${track.bpm || '---'} BPM / ${track.key || '---'} / 0321.9 KHZ`,
    }),
  );

  const upNext = el('section', { cls: 'rail-section home-up-next' });
  append(
    upNext,
    el('h2', { cls: 'solid-type rail-label', text: 'UP NEXT' }),
    el('p', {
      cls: 'rail-time color--green',
      text: `${String(nextIndex + 1).padStart(2, '0')} / ${String(tracks.length).padStart(2, '0')}`,
    }),
    textBlock('p', 'solid-type rail-title color--yellow', nextTitle),
  );

  const menu = el('section', { cls: 'rail-section home-menu' });
  menu.appendChild(el('h2', { cls: 'solid-type rail-label', text: 'MENU' }));
  PAGE_MENU.forEach((item) => {
    const button = el('button', {
      cls: `menu-link color--${item.color}`,
      attrs: { type: 'button' },
    });
    append(
      button,
      el('span', { cls: 'menu-number', text: item.page }),
      el('span', { text: item.label }),
    );
    button.addEventListener('click', () => navigateToPage(item.page));
    menu.appendChild(button);
  });
  append(rail, onAir, upNext, menu);

  append(
    view,
    main,
    rail,
    el('p', { cls: 'home-footer-left', text: 'STAY TUNED. STAY GLITCHED.' }),
    el('p', { cls: 'home-footer-center', text: 'NO ALGORITHM. NO ADS. NO FUTURE.' }),
    el('p', { cls: 'home-footer-right', text: '0321.9 KHZ' }),
  );

  return view;
}

function renderP101() {
  const view = page('page--headlines');
  const bulletins = el('div', { cls: 'bulletins' });
  const headlines = (pages?.headlines || []).slice(0, 5);

  headlines.forEach((headline, index) => {
    const item = el('section', { cls: 'bulletin' });
    append(
      item,
      el('span', {
        cls: 'bulletin-number',
        text: String(index + 1).padStart(2, '0'),
      }),
      textBlock('p', 'solid-type bulletin-copy', wrapText(headline, 33, 2).join('\n')),
    );
    bulletins.appendChild(item);
  });

  append(
    view,
    textBlock('h1', 'display solid-type headline-label', 'Headlines'),
    el('div', { cls: 'rule headline-rule' }),
    bulletins,
    el('p', {
      cls: 'headline-more',
      text: 'FOR FULL STORIES SEE P110',
    }),
  );

  return view;
}

function renderP102() {
  const view = page('page--ad-illustration');
  const ad = pages?.ads?.[0] || {};
  const copy = el('div', { cls: 'ad-copy-block' });
  const lines = compactLines(ad.lines, 5);

  append(
    copy,
    textBlock('h1', 'display solid-type ad-title', wrapText(ad.header || 'Advertisement', 12, 3).join('\n')),
    append(
      el('div', { cls: 'copy ad-lines' }),
      ...lines.map((line) => el('p', { text: truncate(line, 25) })),
    ),
  );

  append(
    view,
    el('div', {
      cls: 'marquee ad-strip bg--magenta',
      text: 'RELOCATION SERVICES / SECTOR CAPACITY AVAILABLE',
    }),
    copy,
    makeMosaic(TERRITORY, 'ad-mosaic'),
    el('div', {
      cls: 'solid-type ad-call',
      text: truncate(ad.footer || 'CALL 0800 DEAD INTERNET', 36),
    }),
    el('div', {
      cls: 'ad-fine',
      text: truncate(ad.footer2 || 'LINES OPEN 00:00-00:00 DAILY', 50),
    }),
  );

  return view;
}

function renderP103() {
  const view = page('page--ad-type');
  const ad = pages?.ads?.[1] || {};
  const lines = compactLines(ad.lines, 8);
  const offer = lines.slice(0, 3).join('\n') || 'SERVICE\nREMAINS\nAVAILABLE';
  const details = lines.slice(3, 7).join('\n');
  const call = String(ad.footer || '0800 DEAD INTERNET')
    .replace(/^CALL\s+/i, '')
    .replace(/\s+/g, '\n');

  append(
    view,
    el('div', {
      cls: 'marquee type-topline bg--magenta',
      text: '2035 SERVICE DIRECTORY / CONTINUOUS AVAILABILITY',
    }),
    textBlock('h1', 'display solid-type type-title', truncate(ad.header || 'Travel Sector 9', 22)),
    el('div', { cls: 'rule type-rule' }),
    textBlock('div', 'display solid-type type-offer', offer),
    textBlock('p', 'copy type-details', details),
    textBlock('div', 'display solid-type type-call', call),
    el('div', {
      cls: 'type-fine',
      text: truncate(ad.footer2 || 'SOME ZONES MAY BE RESTRICTED', 50),
    }),
  );

  return view;
}

function renderP104() {
  const view = page('page--ad-classified');
  const ad = pages?.ads?.[2] || {};
  const lines = compactLines(ad.lines, 7);
  const copy = el('div', { cls: 'copy classified-copy' });
  lines.forEach((line) => copy.appendChild(el('p', {
    text: truncate(line, 31),
  })));

  append(
    view,
    textBlock('h1', 'display solid-type classified-title', truncate(ad.header || 'Public Service Notice', 29)),
    el('div', {
      cls: 'solid-type classified-mark',
      attrs: { 'aria-hidden': 'true' },
      text: '!',
    }),
    copy,
    el('div', {
      cls: 'classified-call',
      text: truncate(ad.footer || 'THIS MESSAGE APPROVED BY', 48),
    }),
    el('div', {
      cls: 'classified-fine',
      text: truncate(ad.footer2 || 'SECTOR ADMINISTRATION 2035', 50),
    }),
  );

  return view;
}

function renderP105() {
  const view = page('page--signal');
  const placements = [
    [1, 11, 1], [11, 21, 1], [21, 31, 1], [31, 41, 1],
    [1, 9, 3], [9, 21, 3], [21, 33, 3], [33, 41, 3],
    [1, 14, 5], [14, 25, 5], [25, 34, 5], [34, 41, 5],
    [1, 11, 7], [11, 24, 7], [24, 33, 7], [33, 41, 7],
    [1, 15, 9], [15, 23, 9], [23, 35, 9], [35, 41, 9],
    [1, 9, 11], [9, 20, 11], [20, 31, 11], [31, 41, 11],
    [1, 13, 13], [13, 25, 13], [25, 34, 13], [34, 41, 13],
    [1, 10, 15], [10, 22, 15], [22, 33, 15], [33, 41, 15],
    [1, 15, 17], [15, 26, 17], [26, 35, 17], [35, 41, 17],
    [1, 11, 19], [11, 23, 19], [23, 32, 19], [32, 41, 19],
    [1, 13, 21], [13, 24, 21], [24, 35, 21], [35, 41, 21],
  ];

  placements.forEach(([start, end, row]) => {
    const phrase = el('span', {
      cls: 'solid-type signal-phrase',
      text: 'ARE YOU A ROBOT',
    });
    phrase.style.gridColumn = `${start} / ${end}`;
    phrase.style.gridRow = `${row} / span 2`;
    view.appendChild(phrase);
  });

  return view;
}

function renderLoadError() {
  const body = document.getElementById('page-body');
  const view = page('page--error');
  append(
    view,
    textBlock('h1', 'display error-code', 'P500'),
    textBlock('p', 'display error-message', ERROR_MESSAGE),
    el('div', { cls: 'rule error-rule' }),
    el('p', {
      cls: 'error-detail',
      text: 'AUTOMATED RETRY NOT SCHEDULED / CHECK RECEIVER',
    }),
  );
  body.replaceChildren(view);
  document.getElementById('page-number').textContent = 'P500';
  document.getElementById('page-index').textContent = '500 / 500';
}

function updatePageHeader() {
  const pageNumber = 100 + currentPage;
  document.getElementById('page-number').textContent = `P${pageNumber}`;
  document.getElementById('page-index').textContent = `${pageNumber} / 105`;
  document.getElementById('clock').textContent = currentTime();
}

function currentTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function navigate(delta) {
  currentPage = ((currentPage + delta) % PAGE_COUNT + PAGE_COUNT) % PAGE_COUNT;
  renderPage(currentPage, true);
  resetCycle();
}

function navigateToPage(pageNumber) {
  const index = Math.max(0, Math.min(PAGE_COUNT - 1, pageNumber - 100));
  currentPage = index;
  renderPage(currentPage, true);
  resetCycle();
}

function resetCycle() {
  clearInterval(cycleTimer);
  cycleTimer = setInterval(() => navigate(1), 8000);
}

function setupNav() {
  document.getElementById('nav-prev').addEventListener('click', (event) => {
    event.stopPropagation();
    navigate(-1);
  });

  document.getElementById('nav-next').addEventListener('click', (event) => {
    event.stopPropagation();
    navigate(1);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
  });
}

function setupAudio() {
  const tracks = playlist.tracks;
  const totalMs = tracks.reduce((sum, track) => sum + track.durationMs, 0);
  if (totalMs === 0 || tracks.every((track) => !track.file)) return;

  const rawOffset = Date.now() - EPOCH;
  const offset = ((rawOffset % totalMs) + totalMs) % totalMs;

  let cumulative = 0;
  currentTrack = 0;
  for (let index = 0; index < tracks.length; index += 1) {
    if (offset < cumulative + tracks[index].durationMs) {
      currentTrack = index;
      break;
    }
    cumulative += tracks[index].durationMs;
  }

  const audio = document.getElementById('player');
  const seekSeconds = (offset - cumulative) / 1000;
  audio.src = tracks[currentTrack].file;

  const applySeek = () => {
    audio.currentTime = Math.min(seekSeconds, audio.duration || seekSeconds);
  };
  if (audio.readyState >= 1) applySeek();
  else audio.addEventListener('loadedmetadata', applySeek, { once: true });

  audio.addEventListener('ended', onTrackEnd);

  const tryPlay = () => {
    audio.play().catch(() => {});
    document.removeEventListener('keydown', tryPlay);
    document.removeEventListener('click', tryPlay, true);
  };

  audio.play().catch(() => {
    document.addEventListener('keydown', tryPlay, { once: true });
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

function startClock() {
  updatePageHeader();
  setInterval(() => {
    document.getElementById('clock').textContent = currentTime();
  }, 1000);
}

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

function isLocalPreview() {
  return location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

async function loadBroadcastData() {
  const bases = ['', '../dist/', '/dist/'];

  for (const base of bases) {
    try {
      const data = await Promise.all([
        fetchJson(`${base}playlist.json`),
        fetchJson(`${base}pages.json`),
      ]);
      return data;
    } catch (error) {
      if (!isLocalPreview()) throw error;
    }
  }

  if (isLocalPreview()) {
    return [LOCAL_PREVIEW_PLAYLIST, LOCAL_PREVIEW_PAGES];
  }

  throw new Error('broadcast data unavailable');
}

async function init() {
  setupNav();
  startClock();

  try {
    [playlist, pages] = await loadBroadcastData();

    if (!Array.isArray(playlist.tracks) || playlist.tracks.length === 0) {
      throw new Error('playlist has no tracks');
    }
  } catch (error) {
    renderLoadError();
    return;
  }

  setupAudio();
  renderPage(0);
  resetCycle();
}

document.addEventListener('DOMContentLoaded', init);
