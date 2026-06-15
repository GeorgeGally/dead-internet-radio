'use strict';

const EPOCH = 2051222400000;
let perlinX = 0.02;
// Random per-page-load seed — replaces the original blockhash-derived randomness.
const SESSION_SEED = Math.floor(Math.random() * 1e6);

function cyclePalette(trackIndex) {
  const idx = (SESSION_SEED + trackIndex * 31) % PALETTES.length;
  currentPalette = PALETTES[idx];
}

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

let playlist = null;
let currentTrack = 0;

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

function setupAudioAnalysis() {
  if (audioAnalysisReady) return;
  const audio = document.getElementById('player');
  if (!audio || !audio.src) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    audioAnalysisReady = true;
  } catch (e) {
    console.warn('Audio analysis not available:', e);
  }
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
  audio.src = playlistBase + tracks[currentTrack].file;

  setupAudioAnalysis();

  const applySeek = () => {
    audio.currentTime = Math.min(seekSeconds, audio.duration || seekSeconds);
  };
  if (audio.readyState >= 1) applySeek();
  else audio.addEventListener('loadedmetadata', applySeek, { once: true });

  audio.addEventListener('ended', onTrackEnd);

  const tryPlay = (e) => {
    // Clicks on the transport are handled by their own buttons — don't force
    // play here (that was overriding the stop button).
    if (e && e.target && e.target.closest && e.target.closest('.transport')) {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }
    audio.play().catch(() => {});
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    document.removeEventListener('keydown', tryPlay);
    document.removeEventListener('click', tryPlay, true);
  };

  audio.play().catch(() => {
    document.addEventListener('keydown', tryPlay);
    document.addEventListener('click', tryPlay, true);
  });
}

function onTrackEnd() {
  currentTrack = (currentTrack + 1) % playlist.tracks.length;
  cyclePalette(currentTrack);
  updateTrackTitle();
  updatePlayBtn();
  const audio = document.getElementById('player');
  audio.src = playlistBase + playlist.tracks[currentTrack].file;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function updateTrackTitle() {
  const el = document.getElementById('track-title');
  if (!el || !playlist) return;
  const track = playlist.tracks[currentTrack];
  if (!track) return;
  const name = [track.artist, track.title].filter(Boolean).join(' — ') || track.file || '';
  el.textContent = name || 'Dead Internet Radio';
}

function stopPlayback() {
  const audio = document.getElementById('player');
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  waveHistory = [];
  updatePlayBtn();
}

function togglePlay() {
  const audio = document.getElementById('player');
  if (!audio || !audio.src) return;
  if (audio.paused) {
    audio.play().catch(() => {});
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } else {
    audio.pause();
  }
}

function updatePlayBtn() {
  const audio = document.getElementById('player');
  const playing = audio && !audio.paused;
  const led = document.getElementById('led-play');
  if (led) led.classList.toggle('on', !!playing);
}

function playAudio() {
  const audio = document.getElementById('player');
  if (!audio || !audio.src) return;
  audio.play().catch(() => {});
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function prevTrack() {
  if (!playlist) return;
  currentTrack = (currentTrack - 1 + playlist.tracks.length) % playlist.tracks.length;
  cyclePalette(currentTrack);
  updateTrackTitle();
  const audio = document.getElementById('player');
  audio.src = playlistBase + playlist.tracks[currentTrack].file;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function nextTrack() {
  if (!playlist) return;
  onTrackEnd();
}

function setupControls() {
  document.getElementById('btn-play').addEventListener('click', () => {
    playAudio();
    updatePlayBtn();
  });
  document.getElementById('btn-prev').addEventListener('click', prevTrack);
  document.getElementById('btn-next').addEventListener('click', nextTrack);

  const stop = document.getElementById('btn-stop');
  if (stop) stop.addEventListener('click', stopPlayback);

  const audio = document.getElementById('player');
  audio.addEventListener('play', () => updatePlayBtn());
  audio.addEventListener('pause', () => updatePlayBtn());
  audio.addEventListener('ended', () => {
    updatePlayBtn();
    updateTrackTitle();
  });
}

function startClock() {
  document.getElementById('clock').textContent = currentTime();
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
      return await fetchJson(`${base}playlist.json`);
    } catch (error) {
      if (!isLocalPreview()) throw error;
    }
  }

  if (isLocalPreview()) {
    return LOCAL_PREVIEW_PLAYLIST;
  }

  throw new Error('broadcast data unavailable');
}

let showsList = [];
let currentShowId = null;
let playlistBase = '';
let showsBase = '';

async function loadShows() {
  const bases = ['', '../', '../../', '../dist/'];
  for (const base of bases) {
    try {
      const data = await fetchJson(`${base}shows.json`);
      showsList = data.shows || [];
      if (showsList.length) {
        showsBase = base;
        selectShow(showsList[0].id);
        return;
      }
    } catch (e) {}
  }
  console.warn('No shows.json found');
}

// Tune to the next station (cycles through shows).
function nextStation() {
  if (!showsList.length) return;
  const idx = showsList.findIndex(s => s.id === currentShowId);
  const next = showsList[(idx + 1) % showsList.length];
  selectShow(next.id);
}

async function selectShow(showId) {
  const show = showsList.find(s => s.id === showId);
  if (!show || !show.playlist) return;

  const newPlaylist = await fetchJson(showsBase + show.playlist);
  if (!Array.isArray(newPlaylist.tracks) || !newPlaylist.tracks.length) return;

  const audio = document.getElementById('player');
  if (audio) {
    audio.pause();
    audio.src = '';
  }

  // Resolve audio paths relative to the playlist URL
  playlistBase = showsBase + show.playlist.replace(/\/[^/]+$/, '/');

  playlist = newPlaylist;
  currentShowId = showId;
  currentTrack = 0;

  cyclePalette(currentTrack);
  blockColorMult = 5 + Math.floor(Math.random() * 30);
  blockStyle = Math.floor(Math.random() * BLOCK_STYLE_COUNT);
  blockStripes = 4 + Math.floor(Math.random() * 4);
  // Background always matches the topbar color (top of the #deck gradient).
  blockBg = TOPBAR_COLOR;
  // Ink contrasts the bg: light bg → black ink, dark bg → white ink.
  blockInk = isColorLight(blockBg.slice(1)) ? '#000000' : '#ffffff';
  initBlocks();

  // const stationEl = document.getElementById('station-id');
  // if (stationEl) stationEl.textContent = show.name || 'DEAD INTERNET RADIO';

  setupAudio();
  updateTrackTitle();

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (audio) {
    audio.play().catch(() => {});
  }
}

//
// Block Engine — ported from original generative art code
//

const PALETTES = [
  ['224b53', 'a0a8b0', '000000', 'af6075', 'ddd5d6', 'e8e6e3'],
  ['66a9a1', '425455', 'abafa2', 'abafa2', 'd6dddd', '425455'],
  ['5d9aa4', '3d6d6e', 'cbc19b', '2f505f', '9bada5', 'cbc19b', '5d9aa4'],
  ['8fea3f', 'ffe46e', 'a0e7d7', 'ffffff', '4f32ba', 'ff2ce3'],
  ['2f2e3a', 'e4cdb6', '656574', '758496', 'e4cdb6', 'bea999'],
  ['000000', 'ffb5b5', '000000', 'ffffff', 'ffb5b5', '000000'],
  ['E14D2A', 'FD841F', 'f1f1f1', '111111'],
  ['ff6e40', 'f5f0e1', '1e3d59'],
  ['bcc3c2', '302420', 'd6e3e2', 'b94d7a', 'd6e3e2'],
  ['E8D2A6', '000000', 'F55050'],
  ['411530', 'D1512D', 'F5C7A9', 'F5E8E4', 'FFFFFF'],
  ['fefbe8', 'f3d656', 'ec8a34', '77b4da'],
  ['DEC197', 'F5E1C9', 'F5D1C1', 'DE645F'],
  ['33312f', '566d7e', '6f7d92', '566d7e', 'e5dbd8'],
  ['b39c75', '58788c', 'ebddd3'],
  ['fff1d0', 'f0c808', '07a0c3', '086788'],
  ['eb5e28', '111111', '252422', '403d39', 'ccc5b9'],
  ['d37f64', 'beb8a1', 'ffffff', '3e3e3e', '6e97ad', 'eadadb'],
];

const BLOCK_DJ_NAMES = [
  'Bl0ckb3at', 'Bas32', 'C64', 'ZX', 'Antar3s',
  'P13iades', 'Summer-0n-Mars', '4lpha', 'STAN', 'Memp00l',
  'Y0ct0b1t', 'Syst3m', 'S3venH4sh', '0rdin41', 'Z0dia',
  'M3gacity', 'N0nce', 'Ph0t0n', 'Terraform', 'Byt3',
  'H3x', 'Sh0ck', 'Singu1arity', 'R0b0t0', 'Shutt13',
];

function sOS(x, y) {
  return Math.sin(Math.sin(Math.sin(x)) + Math.sin(Math.sin(y)));
}

 let perlin = (x, y, o = 2, p = .5, t = 1, m = 1, f = 1, a = 1) => {
      for (let i = 0; i < o; i++) t += sOS(x * f, y * f) * a, m += a, a *= p, f *= 2;
      return t / m
    }


// function perlin(x, y, octaves, persistence) {
//   octaves = octaves || 2;
//   persistence = persistence || 0.5;
//   let total = 1;
//   let amplitude = 1;
//   let frequency = 1;
//   let value = 1;
//   for (let i = 0; i < octaves; i++) {
//     value += sOS(x * frequency, y * frequency) * amplitude;
//     total += amplitude;
//     amplitude *= persistence;
//     frequency *= 2;
//   }
//   return value / total;
// }

function posHash(n) {
  return ((n * 2654435761) >>> 0) / 4294967296 * 100;
}

function colorIndexAt(col, row) {
  // Column-dominant noise: strong horizontal variation gives distinct vertical
  // bands; weak row variation makes long vertical runs of one index = stacked
  // repeating blocks (matches original's per-column read). Seed shifts the field.
  const sx = (col + SESSION_SEED * 0.13) * 0.00080;
  const sy = (row + SESSION_SEED * 0.07) * 0.5;
  const val = perlin(sx, sy, .3, 0.9);
  return Math.abs(Math.ceil(val * blockColorMult));
}

// let newC2 = (x, y) => NC(perlin((H(1, Z, x) + H(1, Z, eCnt + OF) + y + fC + T) / 2e5, (H(1, Z, y) + tot / Z + OF + x / NN) / 1e4, 9, .9))
// let newC = (x, y) => NC(perlin((eCnt + H(0, Z, OF) + H(0, Z, y) + fC / 10) / 200, (tot + OF + 2 * x) / Z, 3, .9))


function isColorLight(hex) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

function hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function textColorForBg(hex) {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum > 128 ? '#000000' : '#ffffff';
}

let blockCanvas = null;
let blockCtx = null;
let blocks = [];
let blockSize = 0;
let blockCols = 0;
let blockRows = 0;
let scrollOffset = 0;
let scrollSpeed = 2;
let currentPalette = PALETTES[0];
let blockAnimId = null;
let audioCtx = null;
let analyser = null;
let frequencyData = null;
let timeData = null;
let audioAnalysisReady = false;
let waveCanvas = null;
let waveCtx = null;
let waveHistory = [];
const WAVE_BARS = 72;
let blockFrameCount = 0;
let blockColorMult = 12;
const BLOCK_DENSITY = 64;

// One geometry style per load (like the original's global `T` type), so the
// whole screen is a coherent design that changes dramatically between loads.
let blockStyle = 0;
const BLOCK_STYLE_COUNT = 6;
// Stripe count for style 6, fixed per load so every striped block matches.
let blockStripes = 5;
// Ink color for the whole design: black OR white (never both), picked per load.
// Every block style draws palette-background + this single ink, two colors total.
let blockInk = '#000000';
// Background color for the whole design — matches the topbar (#deck) gradient
// top color in style.css. Screen is exactly 2 colors: this bg + blockInk.
const TOPBAR_COLOR = '#e0ddd5';
// Occasional 3rd color — orange accent (matches the UI accent in style.css).
const ACCENT_ORANGE = '#ff5a1f';
let blockBg = TOPBAR_COLOR;

class Block {
  constructor(col, row, style) {
    this.col = col;
    this.row = row;
    this.colorIndex = 0;
    this.style = style;
  }

  draw(ctx, x, y, size) {
    // One color only: blockInk. Cells are either transparent (the CSS gradient
    // background shows through) or solid/patterned ink. Noise parity decides.
    const on = (this.colorIndex % 2) === 1;
    if (!on) return; // transparent cell — let the gradient show
    // Overdraw cells on all four sides so adjacent ink cells overlap regardless
    // of which way coords round — kills the seam after the dpr CSS downscale.
    const ox = x - 1;
    const oy = y - 1;
    const os = size + 2;

    // Occasional 3rd color — orange is always a solid full block.
    if (this.colorIndex % 5 === 1) {
      ctx.fillStyle = ACCENT_ORANGE;
      ctx.fillRect(ox, oy, os, os);
      return;
    }
    ctx.fillStyle = blockInk;

    switch (this.style) {
      // 1 — tall stacked ink rects → vertical columns
      case 1: {
        const ratio = (this.colorIndex % 3) + 1;
        ctx.fillRect(ox, oy, os, size * ratio + 2);
        break;
      }
      // 2 — horizontal ink bars (transparent cell). Use ox/os so bars in
      // adjacent on-cells overlap horizontally — no seam between blocks.
      case 2: {
        for (let j = size / 8; j < size; j += size / 2) {
          ctx.fillRect(ox, y + j, os, size / 4);
        }
        break;
      }
      // 3 — ink sub-cell shapes keyed off colorIndex
      case 3: {
        const cc = this.colorIndex % 4;
        if (cc === 0) {
          const u = size / 3;
          for (let xx = 0; xx < size; xx += u) {
            for (let yy = 0; yy < size; yy += u) {
              ctx.fillRect(x + xx + u / 4, y + yy + u / 4, u / 2, u / 2);
            }
          }
        } else if (cc === 1) {
          ctx.fillRect(x, y, size / 2, size);
        } else if (cc === 2) {
          ctx.fillRect(x, y, size, size / 2);
        } else {
          ctx.fillRect(ox, oy, os, os);
        }
        break;
      }
      // 4 — ink scanlines (transparent cell)
      case 4: {
        const lh = Math.max(1, size / 6);
        for (let j = lh; j < size; j += lh * 2) {
          ctx.fillRect(ox, y + j, os, lh);
        }
        break;
      }
      // 5 — ink stripes, fixed count across all striped cells
      case 5: {
        const band = size / blockStripes;
        const sh = Math.max(1, band / 2);
        for (let i = 0; i < blockStripes; i++) {
          ctx.fillRect(ox, y + i * band + (band - sh) / 2, os, sh);
        }
        break;
      }
      // 0 — solid ink square
      default: {
        ctx.fillRect(ox, oy, os, os);
      }
    }
  }
}

function initBlockEngine() {
  blockCanvas = document.getElementById('block-canvas');
  if (!blockCanvas) return;
  blockCtx = blockCanvas.getContext('2d', { alpha: true });
  blockColorMult = 5 + Math.floor(Math.random() * 30);
  blockStyle = Math.floor(Math.random() * BLOCK_STYLE_COUNT);
  blockStripes = 4 + Math.floor(Math.random() * 4);
  currentPalette = PALETTES[SESSION_SEED % PALETTES.length];
  // Background always matches the topbar color (top of the #deck gradient).
  blockBg = TOPBAR_COLOR;
  // Ink contrasts the bg: light bg → black ink, dark bg → white ink.
  blockInk = isColorLight(blockBg.slice(1)) ? '#000000' : '#ffffff';
  resizeBlockGrid();
  window.addEventListener('resize', resizeBlockGrid);
  startBlockLoop();
}

function resizeBlockGrid() {
  if (!blockCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  blockCanvas.width = Math.round(w * dpr);
  blockCanvas.height = Math.round(h * dpr);
  blockCanvas.style.width = w + 'px';
  blockCanvas.style.height = h + 'px';
  blockSize = Math.ceil(blockCanvas.width / BLOCK_DENSITY);
  blockCols = Math.ceil(blockCanvas.width / blockSize);
  blockRows = Math.ceil(blockCanvas.height / blockSize);
  initBlocks();
}

function initBlocks() {
  blocks = [];
  for (let r = 0; r < blockRows; r++) {
    for (let c = 0; c < blockCols; c++) {
      const b = new Block(c, r, blockStyle);
      b.colorIndex = colorIndexAt(c, r);
      blocks.push(b);
    }
  }
}

function updateBlocks() {
  blockFrameCount++;

  if (blockFrameCount % 600 === 0) {
    const idx = (Math.floor(blockFrameCount / 600) + 3) % PALETTES.length;
    currentPalette = PALETTES[idx];
  }

  if (audioAnalysisReady && analyser && frequencyData) {
    const audio = document.getElementById('player');
    if (audio && audio.paused) {
      scrollSpeed = 0;
      return;
    }
    analyser.getByteFrequencyData(frequencyData);
    let totalEnergy = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      totalEnergy += frequencyData[i];
    }
    totalEnergy /= frequencyData.length * 255;
    scrollSpeed = totalEnergy > 0.015 ? 2 : 0;
  }
}

function renderBlocks() {
  const ctx = blockCtx;
  const w = blockCanvas.width;
  const h = blockCanvas.height;
  // Transparent — the CSS gradient behind the canvas is the background.
  ctx.clearRect(0, 0, w, h);

  const totalH = blockRows * blockSize;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    let y = (b.row * blockSize - scrollOffset) % totalH;
    if (y < 0) y += totalH;
    if (y < -blockSize || y > h + blockSize) continue;
    b.draw(ctx, Math.round(b.col * blockSize), Math.round(y), blockSize);
  }

  renderBlockText(ctx, w, h);
}

function startBlockLoop() {
  function frame() {
    scrollOffset += scrollSpeed;
    updateBlocks();
    renderBlocks();
    renderWave();
    blockAnimId = requestAnimationFrame(frame);
  }
  blockAnimId = requestAnimationFrame(frame);
}

function initWave() {
  waveCanvas = document.getElementById('wave');
  if (waveCanvas) waveCtx = waveCanvas.getContext('2d');
}

function renderWave() {
  const cv = waveCanvas || (waveCanvas = document.getElementById('wave'));
  if (!cv) return;
  if (!waveCtx) waveCtx = cv.getContext('2d');
  const ctx = waveCtx;

  // Keep the backing store matched to the displayed size.
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round((cv.clientWidth || 600) * dpr);
  const ch = Math.round((cv.clientHeight || 40) * dpr);
  if (cw && cv.width !== cw) cv.width = cw;
  if (ch && cv.height !== ch) cv.height = ch;

  const w = cv.width;
  const h = cv.height;
  const mid = h / 2;
  ctx.clearRect(0, 0, w, h);

  const audio = document.getElementById('player');
  const playing = audio && !audio.paused;

  // Only advance history while playing — freezes when paused/stopped.
  if (playing) {
    let amp;
    if (audioAnalysisReady && analyser && timeData) {
      analyser.getByteTimeDomainData(timeData);
      let peak = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = Math.abs(timeData[i] / 128 - 1);
        if (v > peak) peak = v;
      }
      amp = peak;
    } else {
      // Fallback when analysis unavailable — lively pseudo level.
      const t = blockFrameCount / 9;
      amp = 0.18 + 0.14 * Math.abs(Math.sin(t)) + Math.random() * 0.06;
    }
    perlinX = amp*.20;
    waveHistory.push(amp);
    while (waveHistory.length > WAVE_BARS) waveHistory.shift();
  }

  // Draw the scrolling history: newest bar on the right, scrolling left.
  const n = waveHistory.length;
  const barW = w / WAVE_BARS;
  ctx.fillStyle = '#1a1a1a';
  for (let i = 0; i < n; i++) {
    const a = waveHistory[i];
    const x = w - (n - i) * barW;
    const bh = Math.max(1.5, a * h * 0.92);
    ctx.fillRect(x + barW * 0.2, mid - bh / 2, Math.max(1, barW * 0.6), bh);
  }
}

function textRowsForTrack(trackIndex) {
  const track = playlist?.tracks?.[trackIndex] || {};
  const kind = track.kind || 'song';
  const isOpening = track.type === 'dj_announce';

  if (isOpening) {
    const text = [
      playlist.djName,
      '',
      track.script || track.caption,
    ].filter(s => s !== undefined && s !== '').join('\n\n');
    return { rows: [{ startRow: 4, text, size: 'large' }] };
  }

  if (kind === 'voiceover') {
    const text = [track.caption || '—'].filter(s => s !== '').join('\n\n');
    return { rows: [{ startRow: 4, text, size: 'medium' }] };
  }

  const artistTitle = [track.artist, track.title].filter(Boolean).join(' — ') || track.caption || track.file || '';
  const meta = [`${track.bpm || '---'} BPM`, track.key || '', '0321.9 KHZ'].filter(Boolean).join(' / ');
  const text = [
    artistTitle,
    '',
    meta,
  ].filter(s => s !== '').join('\n\n');
  return { rows: [{ startRow: 4, text, size: 'medium' }] };
}

function wrapTextForCanvas(ctx, text, maxWidth) {
  const paragraphs = text.split(/\n\n+/);
  const lines = [];

  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0 && lines.length) lines.push('');
    const words = paragraphs[pi].trim().split(/\s+/);
    if (!words[0]) continue;
    let line = '';

    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [text];
}

function renderBlockText(ctx, w, h) {
  const rows = textRowsForTrack(currentTrack);

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const leftPad = blockSize * 5;
  const maxTextWidth = w * 2 / 3;
  const totalH = blockRows * blockSize;
  const lineH = blockSize * 0.6;

  for (const def of rows.rows) {
    const text = def.text;
    if (!text) continue;

    if (def.size === 'small') {
      ctx.font = `${Math.min(blockSize * 0.75, 16) * .96}px "IBM Plex Mono", "Courier New", monospace`;
    } else if (def.size === 'medium') {
      ctx.font = `${Math.min(blockSize * 1.3, 32)* .96}px "IBM Plex Mono", "Courier New", monospace`;
    } else {
      ctx.font = `${Math.min(blockSize * 1.8, 40)* .96}px "IBM Plex Mono", "Courier New", monospace`;
    }

    const wrapped = wrapTextForCanvas(ctx, text, maxTextWidth - leftPad);
    if (!wrapped.length) continue;

    // Text sits on the transparent gradient — clear any ink blocks behind it.

    // Full-block separator above the text block
    let topY = ((def.startRow - 1) * blockSize - scrollOffset) % totalH;
    if (topY < 0) topY += totalH;
    ctx.clearRect(0, Math.round(topY), w, blockSize + 1);

    // Full-block separator below the text block
    const bottomStart = def.startRow * blockSize + wrapped.length * lineH;
    let bottomY = (bottomStart - scrollOffset) % totalH;
    if (bottomY < 0) bottomY += totalH;
    ctx.clearRect(0, Math.round(bottomY), w, blockSize + 1);

    for (let li = 0; li < wrapped.length; li++) {
      const lineY = def.startRow * blockSize + li * lineH - scrollOffset;
      let rowCenterY = (lineY + lineH * 0.5) % totalH;
      if (rowCenterY < 0) rowCenterY += totalH;
      if (rowCenterY < -lineH || rowCenterY > h + lineH) continue;

      ctx.clearRect(0, Math.round(rowCenterY - lineH * 0.5), w, Math.ceil(lineH) + 1);

      if (wrapped[li]) {
        ctx.fillStyle = blockInk;
        ctx.fillText(wrapped[li], leftPad, rowCenterY);
      }
    }
  }

  ctx.restore();
}

async function init() {
  initWave();
  window.addEventListener('resize', initWave);
  initBlockEngine();
  setupControls();

  try {
    playlist = await loadBroadcastData();

    if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
      cyclePalette(currentTrack);
      setupAudio();
      updateTrackTitle();
    }
  } catch (error) {
    console.warn('No playlist found, blocks running idle');
  }

  loadShows();
}

document.addEventListener('DOMContentLoaded', init);
