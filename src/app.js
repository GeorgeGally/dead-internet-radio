'use strict';

const EPOCH = 2051222400000;
let _welcomeActive = true;

let _welcomeNoiseRaf = null;

function startWelcomeNoise() {
  const canvas = document.getElementById('welcome-noise');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let w = 0, h = 0, frame = 0;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function frameLoop() {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);
    canvasFilters.setActive(1);
    canvasFilters.apply(ctx, w, h, frame);
    canvasFilters.setActive(3);
    canvasFilters.apply(ctx, w, h, frame);
    frame++;
    _welcomeNoiseRaf = requestAnimationFrame(frameLoop);
  }
  _welcomeNoiseRaf = requestAnimationFrame(frameLoop);
}

function stopWelcomeNoise() {
  if (_welcomeNoiseRaf) {
    cancelAnimationFrame(_welcomeNoiseRaf);
    _welcomeNoiseRaf = null;
  }
  canvasFilters.clearActive();
}

function showWelcome() {
  const splash = document.getElementById('welcome-splash');
  const audio = document.getElementById('welcome-audio');
  if (!splash || !audio) return;

  startWelcomeNoise();

  const n = Math.floor(Math.random() * 4) + 1;

  audio.src = 'welcome/welcome-' + n + '.wav';
  audio.play().catch(() => {});

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    stopWelcomeNoise();
    audio.volume = 0;
    audio.pause();
    splash.classList.add('fade-out');
    _welcomeActive = false;
    setTimeout(() => {
      visuals.cancelPrewarm();
      visuals.random();
      splash.style.display = 'none';
      if (playlist && playlist.tracks.length > 0) {
        setupAudio();
        updateTrackInfo();
      }
    }, 900);
  }

  splash.addEventListener('click', dismiss, { once: true });
  audio.addEventListener('ended', dismiss, { once: true });
  audio.addEventListener('error', dismiss, { once: true });
  setTimeout(dismiss, 10000);
}

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
    if (e && e.target && e.target.closest && (e.target.closest('.transport') || e.target.closest('.deck-transport') || e.target.closest('#btn-gallery'))) {
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
      const showName = currentShowName() || '—';
      const show = showsList.find(s => s.id === currentShowId);
      const djName = (show && show.djName) || (playlist && playlist.djName) || '—';
      const trackName = track.title || track.caption || track.file || '—';
      const artistName = track.artist || '—';
      const vName = visName || '—';
      miniEl.textContent = `SHOW: ${showName}  · DJ: ${djName}  · TRACK: ${trackName} · ${artistName}  · VISUAL: ${vName}`;
    }
}

function setupDeckRetraction() {
  const deck = document.getElementById('deck');
  if (!deck) return;
  let idleTimer;

  function expand() {
    if (cooldown) return;
    if (deck.classList.contains('ejected')) return;
    deck.classList.add('expanded');
    clearTimeout(idleTimer);
  }

  function scheduleRetract() {
    if (deck.classList.contains('ejected')) return;
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
  const galleryBtn = document.getElementById('btn-gallery');
  const galleryLed = document.getElementById('gallery-led');
  galleryBtn.addEventListener('click', () => {
    gallery.toggle();
  });
  const origToggle = gallery.toggle;
  gallery.toggle = function() {
    origToggle.call(gallery);
    const panel = document.querySelector('.gallery-panel');
    if (panel && panel.classList.contains('open')) {
      if (galleryLed) galleryLed.classList.add('on');
    } else {
      if (galleryLed) galleryLed.classList.remove('on');
    }
  };
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'g' || e.key === '/') && !e.ctrlKey && !e.metaKey && !e.target.closest('input,textarea')) {
      requestAnimationFrame(() => {
        const panel = document.querySelector('.gallery-panel');
        if (panel && panel.classList.contains('open')) {
          if (galleryLed) galleryLed.classList.add('on');
        } else {
          if (galleryLed) galleryLed.classList.remove('on');
        }
      });
    }
  });

  const knob = document.getElementById('threshold-knob');
  const knobLed = document.getElementById('knob-led');
  const dialReadout = document.getElementById('dial-readout');
  let dialReadoutTimer;
  let knobVal = 130;
  window._cutoffVal = knobVal;
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
    'LED Grid': 'cutoff',
  };
  function activeFilter() {
    const fx = canvasFilters.getActiveName ? canvasFilters.getActiveName() : 'none';
    if (!fx || fx === 'none') return { name: null, param: 'cutoff' };
    const first = fx.split(' + ')[0].split(' · ')[0];
    return { name: first, param: FILTER_PARAM[first] || 'amount' };
  }

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
    window._cutoffVal = knobVal;
    window._pixelBlockSize = Math.round(knobVal * 0.3 + 4);
    const deg = ((knobVal - 5) / 250) * 300 - 150;
    knob.querySelector('.knob-tick').style.transform = `rotate(${deg}deg)`;
    canvasFilters.setThreshold(knobVal);
    if (knobVal > 20) {
      knobLed.classList.add('on');
    } else {
      knobLed.classList.remove('on');
    }
    gallery.saveCurrentPreset();
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
  knob.addEventListener('dblclick', () => {
    updateKnob(130);
    showDialReadout();
  });

  window._restoreCutoff = function(val) {
    updateKnob(val);
    showDialReadout();
  };

  const sensKnob = document.getElementById('sensitivity-knob');
  const sensLed = document.getElementById('sens-led');
  let sensVal = 50;
  window._resonanceVal = sensVal;
  window.soundSensitivity = sensVal;
  updateSensKnob(sensVal);
  let sensDragging = false;
  function updateSensKnob(val) {
    sensVal = Math.max(0, Math.min(100, val));
    window._resonanceVal = sensVal;
    const deg = (sensVal / 100) * 300 - 150;
    sensKnob.querySelector('.knob-tick').style.transform = `rotate(${deg}deg)`;
    window.soundSensitivity = sensVal;
    if (sensVal > 5) {
      sensLed.classList.add('on');
    } else {
      sensLed.classList.remove('on');
    }
    gallery.saveCurrentPreset();
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
  sensKnob.addEventListener('dblclick', () => {
    updateSensKnob(50);
  });

  window._restoreResonance = function(val) {
    updateSensKnob(val);
  };

  const strengthKnob = document.getElementById('strength-knob');
  const strengthLed = document.getElementById('strength-led');
  let strengthVal = 100;
  window._filterStrengthVal = strengthVal;
  canvasFilters.setStrength(strengthVal);
  updateStrengthKnob(strengthVal);
  let strengthDragging = false;
  function updateStrengthKnob(val) {
    strengthVal = Math.max(0, Math.min(100, val));
    window._filterStrengthVal = strengthVal;
    const deg = (strengthVal / 100) * 300 - 150;
    strengthKnob.querySelector('.knob-tick').style.transform = `rotate(${deg}deg)`;
    canvasFilters.setStrength(strengthVal);
    if (strengthVal > 5) {
      strengthLed.classList.add('on');
    } else {
      strengthLed.classList.remove('on');
    }
    gallery.saveCurrentPreset();
  }
  strengthKnob.addEventListener('pointerdown', (e) => {
    strengthDragging = true;
    strengthKnob.setPointerCapture(e.pointerId);
    strengthKnob.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!strengthDragging) return;
    updateStrengthKnob(strengthVal - e.movementY * 0.5);
  });
  window.addEventListener('pointerup', () => {
    if (!strengthDragging) return;
    strengthDragging = false;
    strengthKnob.classList.remove('dragging');
  });
  strengthKnob.addEventListener('wheel', (e) => {
    e.preventDefault();
    updateStrengthKnob(strengthVal + Math.sign(e.deltaY) * -3);
  }, { passive: false });
  strengthKnob.addEventListener('dblclick', () => {
    updateStrengthKnob(100);
  });

  window._restoreStrength = function(val) {
    updateStrengthKnob(val);
  };

  const inputGainKnob = document.getElementById('input-gain-knob');
  const inputGainLed = document.getElementById('input-gain-led');
  let inputGainVal = 100;
  window.audioInputGain = inputGainVal;
  updateInputGainKnob(inputGainVal);
  let inputGainDragging = false;
  function updateInputGainKnob(val) {
    inputGainVal = Math.max(0, Math.min(100, val));
    window.audioInputGain = inputGainVal;
    const deg = (inputGainVal / 100) * 300 - 150;
    inputGainKnob.querySelector('.knob-tick').style.transform = `rotate(${deg}deg)`;
    if (inputGainVal > 5) {
      inputGainLed.classList.add('on');
    } else {
      inputGainLed.classList.remove('on');
    }
    gallery.saveCurrentPreset();
  }
  inputGainKnob.addEventListener('pointerdown', (e) => {
    inputGainDragging = true;
    inputGainKnob.setPointerCapture(e.pointerId);
    inputGainKnob.classList.add('dragging');
  });
  window.addEventListener('pointermove', (e) => {
    if (!inputGainDragging) return;
    updateInputGainKnob(inputGainVal - e.movementY * 0.5);
  });
  window.addEventListener('pointerup', () => {
    if (!inputGainDragging) return;
    inputGainDragging = false;
    inputGainKnob.classList.remove('dragging');
  });
  inputGainKnob.addEventListener('wheel', (e) => {
    e.preventDefault();
    updateInputGainKnob(inputGainVal + Math.sign(e.deltaY) * -3);
  }, { passive: false });
  inputGainKnob.addEventListener('dblclick', () => {
    updateInputGainKnob(100);
  });

  function syncFilterLeds() {
    const hasFilter = canvasFilters.getActiveKeys().size > 0;
    if (!hasFilter) {
      knobLed.classList.remove('on');
      sensLed.classList.remove('on');
      strengthLed.classList.remove('on');
    } else {
      if (knobVal > 20) knobLed.classList.add('on');
      if (sensVal > 5) sensLed.classList.add('on');
      if (strengthVal > 5) strengthLed.classList.add('on');
    }
  }

  const origSetActive = canvasFilters.setActive;
  const origClearActive = canvasFilters.clearActive;
  const origToggleActive = canvasFilters.toggleActive;
  canvasFilters.setActive = function(k) {
    origSetActive.call(canvasFilters, k);
    updateNowPlaying();
    syncFilterLeds();
  };
  canvasFilters.clearActive = function() {
    origClearActive.call(canvasFilters);
    updateNowPlaying();
    syncFilterLeds();
  };
  canvasFilters.toggleActive = function(k) {
    origToggleActive.call(canvasFilters, k);
    syncFilterLeds();
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
    gallery.saveCurrentPreset();
    origActivate.call(visuals, id);
    updateTrackInfo();
    gallery.loadPreset(id);
  };
  const origSetFilter = canvasFilters.setActive;
  canvasFilters.setActive = function(id) {
    origSetFilter.call(canvasFilters, id);
    updateTrackInfo();
    gallery.saveCurrentPreset();
  };
  const origClearFilter = canvasFilters.clearActive;
  canvasFilters.clearActive = function() {
    origClearFilter.call(canvasFilters);
    updateTrackInfo();
    gallery.saveCurrentPreset();
  };
  updateNowPlaying();
  setupControls();
  gallery.saveCurrentPreset();
  setupDeckRetraction();
  setupLogoHover();

  showWelcome();

  try {
    playlist = await loadBroadcastData();
    if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
      updateTrackInfo();
      if (!_welcomeActive) {
        setupAudio();
      }
    }
  } catch (error) {
    console.warn('No playlist found');
  }

  loadShows();
}

document.addEventListener('DOMContentLoaded', init);
