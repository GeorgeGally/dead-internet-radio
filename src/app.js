'use strict';

const EPOCH = 2051222400000;

const LOCAL_PREVIEW_PLAYLIST = {
  epoch: EPOCH,
  tracks: [
    {
      file: '',
      durationMs: 180000,
      title: 'Buffering Memories',
      artist: 'Dead Internet Radio',
      caption: 'Dead Internet Radio — Buffering Memories',
      bpm: 80,
      key: 'A MIN',
    },
    {
      file: '',
      durationMs: 180000,
      title: 'Lost Transmissions',
      artist: 'Dead Internet Radio',
      caption: 'Dead Internet Radio — Lost Transmissions',
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

function setupAudio(noSeek) {
  const tracks = playlist.tracks;
  const totalMs = tracks.reduce((sum, track) => sum + track.durationMs, 0);
  if (totalMs === 0 || tracks.every((track) => !track.file)) return;

  let seekSeconds = 0;

  if (noSeek) {
    currentTrack = 0;
  } else {
    const rawOffset = Date.now() - (playlist.epoch || EPOCH);
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
    seekSeconds = (offset - cumulative) / 1000;
  }

  const audio = document.getElementById('player');
  audio.src = playlistBase + tracks[currentTrack].file;

  setupAudioAnalysis();

  if (!noSeek) {
    const applySeek = () => {
      audio.currentTime = Math.min(seekSeconds, audio.duration || seekSeconds);
    };
    if (audio.readyState >= 1) applySeek();
    else audio.addEventListener('loadedmetadata', applySeek, { once: true });
  }

  audio.removeEventListener('ended', onTrackEnd);
  audio.addEventListener('ended', onTrackEnd);

  const tryPlay = (e) => {
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

  startVoiceoverIfNeeded();
}

let trackChangeInProgress = false;

function onTrackEnd() {
  if (trackChangeInProgress) return;
  if (playlist && playlist.tracks.length < 2 && showsList.length > 1) {
    nextStation();
    return;
  }
  trackChangeInProgress = true;
  try {
    stopVoiceover();
    currentTrack = (currentTrack + 1) % playlist.tracks.length;
    flashLed('led-next');
    visuals.next();
    visuals.notify('trackChange');
    updateTrackInfo();
    updatePlayBtn();
    const audio = document.getElementById('player');
    audio.volume = 1;
    audio.src = playlistBase + playlist.tracks[currentTrack].file;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    startVoiceoverIfNeeded();
  } finally {
    trackChangeInProgress = false;
  }
}

function updateNowPlaying() {
  updateTrackInfo();
}

function currentShowName() {
  if (playlist && playlist.showName) return playlist.showName;
  const show = showsList.find(s => s.id === currentShowId);
  return show ? (show.name || show.djName || '') : '';
}

function updateTrackInfo() {
  const showEl = document.querySelector('.npd-show');
  const trackEl = document.querySelector('.npd-track');
  const artistEl = document.querySelector('.npd-artist');
  const artworkEl = document.querySelector('.npd-artwork');
  const miniEl = document.getElementById('mini-track');

  if (showEl) showEl.textContent = currentShowName() || '—';

  if (!playlist) {
    if (trackEl) trackEl.textContent = '—';
    if (artistEl) artistEl.textContent = '';
    if (artworkEl) artworkEl.textContent = '';
    if (miniEl) miniEl.textContent = '—';
    return;
  }

    const track = playlist.tracks[currentTrack];
    if (!track) {
      if (trackEl) trackEl.textContent = '—';
      if (artistEl) artistEl.textContent = '';
      if (artworkEl) artworkEl.textContent = '';
      if (miniEl) miniEl.textContent = '—';
      return;
    }

    if (trackEl) trackEl.textContent = track.title || track.caption || track.file || '—';
    if (artistEl) artistEl.textContent = track.artist || 'Dead Internet Radio';

    const visName = visuals.getCurrentName ? visuals.getCurrentName() : '';
    const filtName = canvasFilters.getActiveName ? canvasFilters.getActiveName() : '';

    if (artworkEl) {
      let txt = visName || '';
      if (filtName && filtName !== 'none') txt += (txt ? '  ·  ' : '') + filtName;
      artworkEl.textContent = txt;
    }

    if (miniEl) {
      const trackParts = [];
      if (track.title) trackParts.push(track.title);
      if (track.artist) trackParts.push(track.artist);
      const miniParts = [];
      if (trackParts.length) {
        miniParts.push(trackParts.join(' · '));
      } else {
        miniParts.push(track.caption || track.file || '—');
      }
      const artworkName = track.caption || track.brief || '';
      if (artworkName) miniParts.push(artworkName);
      if (visName) miniParts.push(`visual: ${visName}`);
      if (filtName && filtName !== 'none') miniParts.push(`fx: ${filtName}`);
      miniParts.push('dir');
      miniEl.textContent = miniParts.join('  /  ');
    }
}

function setupDeckRetraction() {
  const deck = document.getElementById('deck');
  if (!deck) return;
  let idleTimer;

  function expand() {
    if (cooldown) return;
    deck.classList.add('expanded');
    clearTimeout(idleTimer);
  }

  function scheduleRetract() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      deck.classList.remove('expanded');
      cooldown = true;
      setTimeout(() => { cooldown = false; }, 400);
    }, 600);
  }

  let cooldown = false;

  deck.addEventListener('mouseenter', expand);
  deck.addEventListener('mousemove', () => clearTimeout(idleTimer));
  deck.addEventListener('mouseleave', scheduleRetract);

  const hitZone = document.createElement('div');
  hitZone.className = 'deck-hit-zone';
  hitZone.setAttribute('aria-hidden', 'true');
  document.body.appendChild(hitZone);
  hitZone.addEventListener('mouseenter', () => {
    clearTimeout(idleTimer);
    expand();
  });
}

function setupLogoHover() {
  const logo = document.querySelector('.deck-logo');
  const textEl = document.querySelector('.logo-text');
  const cursorEl = document.querySelector('.logo-cursor');
  if (!logo || !textEl || !cursorEl) return;
  const fullText = 'DEAD INTERNET RADIO';
  let typingTimer;

  function typeOut() {
    clearTimeout(typingTimer);
    textEl.textContent = '';
    cursorEl.style.display = 'inline';
    let i = 0;
    function step() {
      if (i <= fullText.length) {
        textEl.textContent = fullText.slice(0, i);
        if (i > 0) textEl.classList.add('has-text');
        i++;
        typingTimer = setTimeout(step, 55);
      } else {
        cursorEl.style.display = 'none';
      }
    }
    step();
  }

  function clearText() {
    clearTimeout(typingTimer);
    textEl.textContent = '';
    textEl.classList.remove('has-text');
    cursorEl.style.display = 'none';
  }

  logo.addEventListener('mouseenter', typeOut);
  logo.addEventListener('mouseleave', clearText);
}

function stopPlayback() {
  stopVoiceover();
  const audio = document.getElementById('player');
  if (!audio) return;
  audio.pause();
  audio.volume = 1;
  updatePlayBtn();
}

function togglePlay() {
  const audio = document.getElementById('player');
  if (!audio || !audio.src) return;
  if (audio.paused) {
    audio.play().catch(() => {});
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } else {
    stopPlayback();
  }
  updatePlayBtn();
}

function updatePlayBtn() {
  if (_flashActive) return;
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
  stopVoiceover();
  if (!playlist) return;
  currentTrack = (currentTrack - 1 + playlist.tracks.length) % playlist.tracks.length;
  visuals.notify('trackChange');
  updateTrackInfo();
  const audio = document.getElementById('player');
  audio.volume = 1;
  audio.src = playlistBase + playlist.tracks[currentTrack].file;
  audio.currentTime = 0;
  audio.play().catch(() => {});
  updatePlayBtn();
  startVoiceoverIfNeeded();
}

function nextTrack() {
  if (!playlist) return;
  onTrackEnd();
}

let voiceoverEndedHandler = null;

function stopVoiceover() {
  const vo = document.getElementById('voiceover-el');
  if (vo) {
    vo.pause();
    vo.src = '';
  }
  const player = document.getElementById('player');
  if (player) player.volume = 1;
  if (voiceoverEndedHandler && vo) {
    vo.removeEventListener('ended', voiceoverEndedHandler);
    voiceoverEndedHandler = null;
  }
}

function startVoiceoverIfNeeded() {
  if (!playlist) return;
  const track = playlist.tracks[currentTrack];
  if (!track || !track.voiceoverFile) return;

  const player = document.getElementById('player');
  const vo = document.getElementById('voiceover-el');
  if (!player || !vo) return;

  stopVoiceover();

  player.volume = 0.8;

  vo.src = playlistBase + track.voiceoverFile;
  vo.load();
  vo.play().catch(() => {});

  voiceoverEndedHandler = () => {
    player.volume = 1;
    vo.removeEventListener('ended', voiceoverEndedHandler);
    voiceoverEndedHandler = null;
  };
  vo.addEventListener('ended', voiceoverEndedHandler);
}

let _flashActive = false;

function flashLed(id, ms = 800) {
  const el = document.getElementById(id);
  if (!el) return;
  _flashActive = true;
  const playLed = document.getElementById('led-play');
  if (playLed) playLed.classList.remove('on');
  el.classList.add('on');
  clearTimeout(el._flashTimer);
  el._flashTimer = setTimeout(() => {
    el.classList.remove('on');
    _flashActive = false;
    updatePlayBtn();
  }, ms);
}

function setupControls() {
  visuals.onChange = updateNowPlaying;

  document.getElementById('btn-play').addEventListener('click', () => {
    togglePlay();
  });
  document.getElementById('btn-prev').addEventListener('click', () => {
    flashLed('led-prev');
    prevTrack();
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    flashLed('led-next');
    nextTrack();
  });
  const songPrev = document.getElementById('npd-song-prev');
  const songNext = document.getElementById('npd-song-next');
  if (songPrev) songPrev.addEventListener('click', () => { flashLed('led-prev'); prevTrack(); });
  if (songNext) songNext.addEventListener('click', () => { flashLed('led-next'); nextTrack(); });
  const artPrev = document.getElementById('npd-art-prev');
  const artNext = document.getElementById('npd-art-next');
  if (artPrev) artPrev.addEventListener('click', () => { visuals.prev(); });
  if (artNext) artNext.addEventListener('click', () => { visuals.next(); });
  const galleryToggle = document.getElementById('gallery-toggle');
  const galleryLed = document.getElementById('gallery-led');
  galleryToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    gallery.toggle();
  });
  const origToggle = gallery.toggle;
  gallery.toggle = function() {
    origToggle.call(gallery);
    const panel = document.querySelector('.gallery-panel');
    if (panel && panel.classList.contains('open')) {
      galleryToggle.classList.add('active');
      if (galleryLed) galleryLed.classList.add('on');
    } else {
      galleryToggle.classList.remove('active');
      if (galleryLed) galleryLed.classList.remove('on');
    }
  };
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'g' || e.key === '/') && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea')) {
      requestAnimationFrame(() => {
        const panel = document.querySelector('.gallery-panel');
        if (panel && panel.classList.contains('open')) {
          galleryToggle.classList.add('active');
          if (galleryLed) galleryLed.classList.add('on');
        } else {
          galleryToggle.classList.remove('active');
          if (galleryLed) galleryLed.classList.remove('on');
        }
      });
    }
  });

  const knob = document.getElementById('threshold-knob');
  const knobLed = document.getElementById('knob-led');
  const knobLabel = knob.parentElement.querySelector('.knob-label');
  const dialReadout = document.getElementById('dial-readout');
  let dialReadoutTimer;
  let knobVal = 40;
  updateKnob(knobVal);
  let knobDragging = false;

  // The dial drives each canvas filter's main variable. Map filter name ->
  // the parameter it controls, so the label/readout reflect the active filter.
  const FILTER_PARAM = {
    'Scanlines': 'thickness',
    'Circle Sampling': 'size',
    'Static Noise': 'intensity',
    'Chromatic Aberration': 'shift',
    'VHS Tracking': 'bands',
    'Posterize': 'levels',
    'Pixelate': 'size',
    'Color Invert': '—',
    'LED Grid': 'threshold',
  };
  function activeFilter() {
    const fx = canvasFilters.getActiveName ? canvasFilters.getActiveName() : 'none';
    if (!fx || fx === 'none') return { name: null, param: 'threshold' };
    const first = fx.split(' + ')[0].split(' · ')[0];
    return { name: first, param: FILTER_PARAM[first] || 'amount' };
  }

  // Persistent label under the knob always shows the active filter's param.
  let lastFxLabel = null;
  function syncDialLabel() {
    const { name, param } = activeFilter();
    const text = name ? param : 'threshold';
    if (text === lastFxLabel) return;
    lastFxLabel = text;
    if (knobLabel) knobLabel.textContent = text;
  }
  syncDialLabel();
  // Catches every path that changes the filter (keyboard, gallery, toggle).
  setInterval(syncDialLabel, 200);

  // Transient readout under the LED screen: what the dial is affecting + amount.
  function showDialReadout() {
    if (!dialReadout) return;
    const { name, param } = activeFilter();
    const pct = Math.round(((knobVal - 5) / 250) * 100);
    dialReadout.textContent = name ? `${name} · ${param} ${pct}%` : `no fx · ${pct}%`;
    dialReadout.classList.add('show');
    clearTimeout(dialReadoutTimer);
    dialReadoutTimer = setTimeout(() => dialReadout.classList.remove('show'), 1400);
  }
  function updateKnob(val) {
    knobVal = Math.max(5, Math.min(255, val));
    const deg = ((knobVal - 5) / 250) * 300 - 150;
    knob.querySelector('.knob-tick').style.transform = `rotate(${deg}deg)`;
    canvasFilters.setThreshold(knobVal);
    if (knobVal > 20) {
      knobLed.classList.add('on');
    } else {
      knobLed.classList.remove('on');
    }
  }
  knob.addEventListener('pointerdown', (e) => {
    knobDragging = true;
    knob.setPointerCapture(e.pointerId);
    knob.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!knobDragging) return;
    updateKnob(knobVal - e.movementY * 0.5);
    showDialReadout();
  });
  window.addEventListener('pointerup', () => {
    if (!knobDragging) return;
    knobDragging = false;
    knob.classList.remove('dragging');
  });
  knob.addEventListener('wheel', (e) => {
    e.preventDefault();
    updateKnob(knobVal + Math.sign(e.deltaY) * -3);
    showDialReadout();
  }, { passive: false });

  const sensKnob = document.getElementById('sensitivity-knob');
  const sensLed = document.getElementById('sens-led');
  let sensVal = 50;
  window.soundSensitivity = sensVal;
  updateSensKnob(sensVal);
  let sensDragging = false;
  function updateSensKnob(val) {
    sensVal = Math.max(0, Math.min(100, val));
    const deg = (sensVal / 100) * 300 - 150;
    sensKnob.querySelector('.knob-tick').style.transform = `rotate(${deg}deg)`;
    window.soundSensitivity = sensVal;
    if (sensVal > 5) {
      sensLed.classList.add('on');
    } else {
      sensLed.classList.remove('on');
    }
  }
  sensKnob.addEventListener('pointerdown', (e) => {
    sensDragging = true;
    sensKnob.setPointerCapture(e.pointerId);
    sensKnob.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!sensDragging) return;
    updateSensKnob(sensVal - e.movementY * 0.5);
  });
  window.addEventListener('pointerup', () => {
    if (!sensDragging) return;
    sensDragging = false;
    sensKnob.classList.remove('dragging');
  });
  sensKnob.addEventListener('wheel', (e) => {
    e.preventDefault();
    updateSensKnob(sensVal + Math.sign(e.deltaY) * -3);
  }, { passive: false });

  const origSetActive = canvasFilters.setActive;
  const origClearActive = canvasFilters.clearActive;
  canvasFilters.setActive = function(k) {
    origSetActive.call(canvasFilters, k);
    updateNowPlaying();
  };
  canvasFilters.clearActive = function() {
    origClearActive.call(canvasFilters);
    updateNowPlaying();
  };

  const audio = document.getElementById('player');
  audio.addEventListener('play', () => updatePlayBtn());
  audio.addEventListener('pause', () => updatePlayBtn());
  audio.addEventListener('ended', () => {
    updatePlayBtn();
    updateTrackInfo();
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

function pageDir() {
  return window.location.pathname.replace(/\/[^/]*$/, '/');
}

function apiUrl(path) {
  const port = location.port ? `:${location.port}` : '';
  const host = location.hostname;
  return `${location.protocol}//${host}${port}/api/v1${path}`;
}

async function loadBroadcastData() {
  // Use the Rails API whenever served over http(s). Static json fallback is
  // only for file:// previews of the exported dist/ bundle.
  if (location.protocol !== 'file:') {
    try {
      const data = await fetchJson(apiUrl('/playlist'));
      playlistBase = '';  // API returns root-absolute /media/... urls
      return data;
    } catch (e) {
      // API not available (e.g. static Netlify deploy), fall back to files
    }
  }

  const bases = [pageDir(), '../dist/', '/dist/', ''];

  for (const base of bases) {
    try {
      const data = await fetchJson(base + 'playlist.json');
      playlistBase = base;
      return data;
    } catch (error) {
      if (!isLocalPreview()) throw error;
    }
  }

  return LOCAL_PREVIEW_PLAYLIST;
}

let showsList = [];
let currentShowId = null;
let playlistBase = '';
let showsBase = '';

async function loadShows() {
  if (location.protocol !== 'file:') {
    try {
      const data = await fetchJson(apiUrl('/shows'));
      if (Array.isArray(data) && data.length > 0) {
        showsList = data;
        showsBase = '';
        const initialShow = showsList.find(s => s.trackCount > 1) || showsList[0];
        selectShow(initialShow.id);
        return;
      }
    } catch (e) {
      // API not available, fall back to static files
    }
  }

  const bases = [pageDir(), '../dist/', '/dist/', '../', ''];

  for (const base of bases) {
    try {
      const data = await fetchJson(base + 'shows.json');
      const shows = data.shows || [];
      if (shows.length) {
        showsList = shows;
        showsBase = base;
        const initialShow = showsList.find(s => s.trackCount > 1) || showsList[0];
        selectShow(initialShow.id);
        return;
      }
    } catch (e) {
      if (!isLocalPreview()) throw e;
    }
  }

  console.warn('No shows.json found');
}

function nextStation() {
  if (!showsList.length) return;
  const idx = showsList.findIndex(s => s.id === currentShowId);
  const next = showsList[(idx + 1) % showsList.length];
  selectShow(next.id);
}

async function selectShow(showId) {
  const show = showsList.find(s => s.id === showId);
  if (!show) return;

  let newPlaylist;

  if (show.playlist) {
    const resp = await fetch(showsBase + show.playlist).catch(() => {});
    if (!resp || !resp.ok) return;
    newPlaylist = await resp.json();
    playlistBase = showsBase + show.playlist.replace(/\/[^/]+$/, '/');
  } else {
    try {
      const resp = await fetch(apiUrl(`/shows/${showId}`));
      if (!resp.ok) return;
      const showData = await resp.json();
      newPlaylist = showDataToPlaylist(showData);
      playlistBase = '';  // API returns root-absolute /media/... urls
    } catch (e) {
      return;
    }
  }

  if (!Array.isArray(newPlaylist.tracks) || !newPlaylist.tracks.length) return;

  stopVoiceover();
  const audio = document.getElementById('player');
  if (audio) {
    audio.pause();
    audio.src = '';
  }

  playlist = newPlaylist;
  currentShowId = showId;

  visuals.notify('trackChange');
  setupAudio();
  updateTrackInfo();

  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (audio) {
    audio.play().catch(() => {});
  }
}

function showDataToPlaylist(showData) {
  const epoch = showData.generatedAt
    ? new Date(showData.generatedAt).getTime()
    : Date.now();
  return {
    epoch,
    showName: showData.name,
    djName: showData.djName,
    tracks: (showData.tracks || []).map((t, i) => ({
      file: t.file || '',
      durationMs: t.durationMs || 180000,
      title: t.title || `Track ${i + 1}`,
      artist: t.artist || showData.djName,
      caption: t.caption || '',
      bpm: t.bpm,
      key: t.key,
      voiceoverFile: t.voiceoverFile,
    })),
  };
}

//
// Shared wave infrastructure
//

let waveCanvas = null;
let waveCtx = null;
let waveHistory = [];
const WAVE_BARS = 140;

function initWave() {
  waveCanvas = document.getElementById('wave');
  if (waveCanvas) waveCtx = waveCanvas.getContext('2d');
}

function feedWave(amp) {
  waveHistory.push(amp);
  while (waveHistory.length > WAVE_BARS) waveHistory.shift();
}

const EQ_BARS = 24;

// Small EQ spectrum bar graph on the LED screen, driven by the FFT.
function drawWave() {
  const cv = waveCanvas;
  if (!cv || !waveCtx) return;
  const ctx = waveCtx;

  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round((cv.clientWidth || 240) * dpr);
  const ch = Math.round((cv.clientHeight || 48) * dpr);
  if (cw && cv.width !== cw) cv.width = cw;
  if (ch && cv.height !== ch) cv.height = ch;

  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);

  if (!analyser || !frequencyData) return;
  analyser.getByteFrequencyData(frequencyData);

  const usable = Math.floor(frequencyData.length * 0.7); // drop near-silent highs
  const per = Math.max(1, Math.floor(usable / EQ_BARS));
  const gap = Math.max(dpr, w * 0.012);
  const barW = (w - gap * (EQ_BARS - 1)) / EQ_BARS;

  ctx.fillStyle = '#ff5a1f';
  for (let b = 0; b < EQ_BARS; b++) {
    let sum = 0;
    for (let j = 0; j < per; j++) sum += frequencyData[b * per + j] || 0;
    const v = (sum / per) / 255;              // 0..1
    const bh = Math.max(dpr, v * v * h * 0.95); // v^2 = punchier dynamics
    ctx.fillRect(b * (barW + gap), h - bh, barW, bh);
  }
}

// One loop drives the EQ on every visual (per-visual draw calls only covered 4).
let eqRaf = null;
function startEqLoop() {
  if (eqRaf) return;
  const deck = document.getElementById('deck');
  const tick = () => {
    // Only redraw when the LED screen is actually visible (deck expanded).
    if (deck && deck.classList.contains('expanded')) drawWave();
    eqRaf = requestAnimationFrame(tick);
  };
  eqRaf = requestAnimationFrame(tick);
}

let audioCtx = null;
let analyser = null;
let frequencyData = null;
let timeData = null;
let audioAnalysisReady = false;

  async function init() {
  initWave();
  startEqLoop();
  window.addEventListener('resize', initWave);
  visuals.init();
  gallery.init();
  visuals.prewarmThumbnails();
  const origActivate = visuals.activate;
  visuals.activate = function(id) {
    origActivate.call(visuals, id);
    updateTrackInfo();
  };
  const origSetFilter = canvasFilters.setActive;
  canvasFilters.setActive = function(id) {
    origSetFilter.call(canvasFilters, id);
    updateTrackInfo();
  };
  const origClearFilter = canvasFilters.clearActive;
  canvasFilters.clearActive = function() {
    origClearFilter.call(canvasFilters);
    updateTrackInfo();
  };
  updateNowPlaying();
  setupControls();
  setupDeckRetraction();
  setupLogoHover();

  try {
    playlist = await loadBroadcastData();
    if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
      setupAudio();
      updateTrackInfo();
    }
  } catch (error) {
    console.warn('No playlist found');
  }

  loadShows();
}

document.addEventListener('DOMContentLoaded', init);
