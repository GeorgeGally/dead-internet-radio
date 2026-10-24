'use strict';

visuals.register('giphy', (() => {
  const GIPHY_API_KEY = '23JUZnCbRcIFMOcQtjTZT1ZIwtfdbbc5';
  const GIPHY_LIMIT = 40;
  const GIPHY_FALLBACK_URLS = [
    'https://media.giphy.com/media/3o7TKsQ8mG4T2FNG5W/giphy.gif',
    'https://media.giphy.com/media/l0HlBO7eyXz5kYdaQ/giphy.gif',
    'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
    'https://media.giphy.com/media/xT9DPIlGnuF5sEUX0Y/giphy.gif',
    'https://media.giphy.com/media/3o7TKMt1VVNkHV2PaE/giphy.gif',
    'https://media.giphy.com/media/l0HlKrB02QY0R6Noc/giphy.gif',
  ];
  // v2: entries are { mp4, gif } (v1 stored bare GIF urls).
  const GIPHY_CACHE_KEY = 'dir_gif_cache_v2';
  const GIPHY_CACHE_TTL = 86400000;
  const GIPHY_REFRESH_MS = 180000;
  const GIPHY_PRELOAD_TIMEOUT_MS = 20000;
  const GIPHY_RETRY_MS = 1500;

  const GIPHY_SEARCH_TERMS = [
    'glitch art', 'cyberpunk', 'sci-fi', 'surveillance camera',
    'dystopian', 'analog horror', 'crt tv static', 'matrix code',
    'void', 'data center', 'circuit board', 'abandoned factory',
    'midnight drive', 'pixel art dark', 'radio tower', 'robot',
    'technology', 'TV broadcast', 'radio antenna', 'telescope',
    'spaceship', 'satellite', 'computer', 'server farm',
    'data centre', 'empty street', 'crying', 'test pattern',
    'signal', 'glitch', 'space', 'love', 'kiss', 'cows', 'eyes','dance', 'party', 'aerial',
    'moon landing', 'space x',
  ];

  let gifItems = [];
  let freshItems = [];
  let gifCycleTimer = null;
  let gifRefreshTimer = null;
  let gifRetryTimer = null;
  let gifLoading = false;

  // Swap only when BOTH the dwell has elapsed and the next item is fully
  // buffered; until then the current one keeps looping. One preload at a time.
  let running = false;
  let loadToken = 0;
  let currentKey = '';
  let loadingEl = null;
  let nextEl = null;
  let nextKey = '';
  let dwellDone = false;

  let overlayCanvas = null;
  let overlayCtx = null;
  let overlayAnimId = null;
  let overlayFrame = 0;
  let glitchIntensity = 0;
  let bassSmoothed = 0;

  let textScrollY = 0;
  let textLines = [];
  let textBlockHeight = 0;
  let textTrackIndex = 0;

  function log(...args) {
    if (window.GIPHY_DEBUG) console.log('[giphy]', ...args);
  }

  function pickSearchTerm() {
    return GIPHY_SEARCH_TERMS[Math.floor(Math.random() * GIPHY_SEARCH_TERMS.length)];
  }

  function itemKey(item) {
    return item.mp4 || item.gif;
  }

  // Prefer Giphy's mp4 rendition (a fraction of the GIF's size, decodes
  // smoothly); keep the downsized GIF as a fallback if the video fails.
  function itemFromGiphy(g) {
    const im = g.images || {};
    const mp4 = (im.original && im.original.mp4) || (im.original_mp4 && im.original_mp4.mp4) || '';
    const gif = (im.downsized && im.downsized.url) || '';
    return mp4 || gif ? { mp4, gif } : null;
  }

  async function fetchGiphyGifs(force) {
    if (gifLoading) return;
    const cached = getCachedGifs();
    if (cached.length && !force) {
      gifItems = cached;
      queueNext();
      scheduleGifRefresh();
      return;
    }
    gifLoading = true;
    try {
      const term = encodeURIComponent(pickSearchTerm());
      const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${term}&limit=${GIPHY_LIMIT}&rating=pg-13&lang=en`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.data || !data.data.length) throw new Error('empty');
      const fresh = data.data.map(itemFromGiphy).filter(Boolean);
      const existing = new Set(gifItems.map(itemKey));
      freshItems = [];
      for (const it of fresh) {
        if (!existing.has(itemKey(it))) {
          gifItems.push(it);
          freshItems.push(it);
        }
      }
      if (gifItems.length > 640) gifItems = gifItems.slice(-640);
      saveGifsToCache(gifItems);
      queueNext();
      scheduleGifRefresh();
    } catch (e) {
      console.warn('Giphy fetch failed:', e.message);
      if (!gifItems.length) {
        gifItems = GIPHY_FALLBACK_URLS.map(gif => ({ mp4: '', gif }));
        queueNext();
      }
      scheduleGifRefresh();
    } finally {
      gifLoading = false;
    }
  }

  function scheduleGifRefresh() {
    if (gifRefreshTimer) clearTimeout(gifRefreshTimer);
    gifRefreshTimer = setTimeout(() => fetchGiphyGifs(true), GIPHY_REFRESH_MS);
  }

  function getCachedGifs() {
    try {
      const raw = localStorage.getItem(GIPHY_CACHE_KEY);
      if (!raw) return [];
      const cache = JSON.parse(raw);
      if (Date.now() - cache.ts > GIPHY_CACHE_TTL) {
        localStorage.removeItem(GIPHY_CACHE_KEY);
        return [];
      }
      return (cache.items || []).filter(it => it && (it.mp4 || it.gif));
    } catch (e) {
      return [];
    }
  }

  function saveGifsToCache(items) {
    try {
      localStorage.setItem(GIPHY_CACHE_KEY, JSON.stringify({ items, ts: Date.now() }));
    } catch (e) {}
  }

  // Drop a media element and stop its download/decoder.
  function discard(el) {
    if (!el) return;
    el.oncanplaythrough = el.onerror = null;
    if (el.tagName === 'VIDEO') el.pause();
    el.removeAttribute('src');
    if (el.tagName === 'VIDEO') el.load();
  }

  // Resolve with an off-DOM element once it can play to the end without
  // stalling (video: canplaythrough / HAVE_ENOUGH_DATA; img: decode()), or
  // null on error/timeout.
  function preloadMedia(url, isVideo) {
    return new Promise((resolve) => {
      const el = document.createElement(isVideo ? 'video' : 'img');
      el.crossOrigin = 'anonymous';
      el.setAttribute('aria-hidden', 'true');
      loadingEl = el;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (loadingEl === el) loadingEl = null;
        el.oncanplaythrough = el.onerror = null;
        if (!ok) discard(el);
        resolve(ok ? el : null);
      };
      const timer = setTimeout(() => finish(false), GIPHY_PRELOAD_TIMEOUT_MS);
      if (isVideo) {
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.preload = 'auto';
        el.oncanplaythrough = () => finish(el.readyState >= 4);
        el.onerror = () => finish(false);
        el.src = url;
        el.load();
      } else {
        el.alt = '';
        el.src = url;
        el.decode().then(() => finish(true), () => finish(false));
      }
    });
  }

  function pickNextItem() {
    const avoid = new Set([currentKey]);
    if (freshItems.length) {
      const it = freshItems.splice(Math.floor(Math.random() * freshItems.length), 1)[0];
      if (!avoid.has(itemKey(it))) return it;
    }
    if (!gifItems.length) return null;
    for (let tries = 0; tries < 8; tries++) {
      const it = gifItems[Math.floor(Math.random() * gifItems.length)];
      if (!avoid.has(itemKey(it))) return it;
    }
    return null;
  }

  // Start buffering exactly one next item in the background.
  async function queueNext() {
    if (!running || loadingEl || nextEl) return;
    const item = pickNextItem();
    if (!item) return;
    const token = loadToken;
    const key = itemKey(item);
    log('preload start', key);
    let el = item.mp4 ? await preloadMedia(item.mp4, true) : null;
    if (!el && item.gif && token === loadToken) el = await preloadMedia(item.gif, false);
    if (token !== loadToken || !running) {
      discard(el);
      return;
    }
    if (!el) {
      // Failed or too slow: the current one keeps looping; try another.
      log('preload failed', key);
      if (gifRetryTimer) clearTimeout(gifRetryTimer);
      gifRetryTimer = setTimeout(queueNext, GIPHY_RETRY_MS);
      return;
    }
    log('preload ready', key, el.tagName, el.tagName === 'VIDEO' ? `readyState=${el.readyState}` : 'decoded');
    nextEl = el;
    nextKey = key;
    maybeSwap();
  }

  function hasFrame(el) {
    if (!el) return false;
    if (el.tagName === 'VIDEO') return el.readyState >= 2 && el.videoWidth > 0;
    return el.complete && el.naturalWidth > 0;
  }

  // Hard cut: the buffered element replaces #gif-bg in one DOM operation, so
  // there is never a blank or half-loaded frame in between.
  function maybeSwap() {
    if (!running || !nextEl) return;
    const cur = document.getElementById('gif-bg');
    if (!dwellDone && hasFrame(cur)) return;
    const el = nextEl;
    nextEl = null;
    el.id = 'gif-bg';
    if (cur) {
      el.style.display = cur.style.display;
      cur.replaceWith(el);
      discard(cur);
    } else {
      document.body.prepend(el);
    }
    if (el.tagName === 'VIDEO') el.play().catch(() => {});
    log('swap', nextKey, el.tagName === 'VIDEO' ? `readyState=${el.readyState}` : 'decoded');
    currentKey = nextKey;
    scheduleNextGif();
    queueNext();
  }

  function pickInterval() {
    return 10000 + Math.random() * 10000;
  }

  // Minimum time on screen; the actual swap waits for the next item too.
  function scheduleNextGif() {
    if (gifCycleTimer) clearTimeout(gifCycleTimer);
    dwellDone = false;
    gifCycleTimer = setTimeout(() => {
      dwellDone = true;
      maybeSwap();
    }, pickInterval());
  }

  function resetTimer() {
    scheduleNextGif();
  }

  function resizeOverlay() {
    if (!overlayCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    overlayCanvas.width = Math.round(w * dpr);
    overlayCanvas.height = Math.round(h * dpr);
  }

  function buildTextBlock(trackIndex) {
    const entries = [];
    if (!playlist || !playlist.tracks[trackIndex]) {
      return [
        { text: 'DEAD INTERNET RADIO', size: 'large' },
        { text: '', size: 'small' },
        { text: '0321.9 KHZ — BROADCAST CONTINUES', size: 'small' },
      ];
    }
    const track = playlist.tracks[trackIndex];
    const kind = track.kind || 'song';
    const isDJ = track.type === 'dj_announce';
    if (isDJ) {
      const script = track.script || '';
      if (script) entries.push({ text: script, size: 'medium' });
    } else if (kind === 'voiceover') {
      const cap = track.caption || track.title || '';
      if (cap) entries.push({ text: cap, size: 'medium' });
    } else {
      const artist = track.artist || '';
      const title = track.title || '';
      const head = [artist, title].filter(Boolean).join(' — ') || track.caption || track.file || '---';
      entries.push({ text: head, size: 'medium' });
      const metaParts = [];
      if (track.bpm && track.bpm !== 'None') metaParts.push(`${track.bpm} BPM`);
      if (track.key) metaParts.push(track.key);
      metaParts.push('0321.9 KHZ');
      if (track.frequencyBand) metaParts.push(track.frequencyBand);
      if (track.modulationType) metaParts.push(track.modulationType);
      if (track.signalPath) metaParts.push(track.signalPath);
      entries.push({ text: '', size: 'small' }, { text: metaParts.join(' / '), size: 'small' });
      const brief = track.brief || '';
      if (brief && brief.length > 10) {
        entries.push({ text: '', size: 'small' }, { text: brief, size: 'small' });
      }
    }
    if (entries.length === 0) {
      return [
        { text: 'DEAD INTERNET RADIO', size: 'large' },
        { text: '', size: 'small' },
        { text: '0321.9 KHZ', size: 'small' },
      ];
    }
    return entries;
  }

  function wrapLine(ctx, text, maxWidth) {
    if (!text) return [''];
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [text];
  }

  function drawTextOverlay(ctx, w, h) {
    if (!playlist || !playlist.tracks.length) return;
    if (textTrackIndex >= playlist.tracks.length) textTrackIndex = 0;
    if (textLines.length === 0) {
      textLines = buildTextBlock(textTrackIndex);
    }
    const fontSizeBase = Math.min(w * 0.013, 24);
    const maxTextWidth = w * 0.55;
    const leftPad = Math.max(36, w * 0.04);
    const lineHeight = fontSizeBase * 1.6;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    const flicker = Math.random() < 0.04 ? 0.25 : 0.88;
    let y = textScrollY;
    for (const line of textLines) {
      if (!line.text && line.text !== '') continue;
      const sizeMult = line.size === 'large' ? 1.6 : line.size === 'small' ? 0.65 : 1;
      const fontSize = Math.round(fontSizeBase * sizeMult);
      ctx.font = `${fontSize}px "IBM Plex Mono", "Courier New", monospace`;
      const wrapped = wrapLine(ctx, line.text, maxTextWidth - leftPad);
      for (const wline of wrapped) {
        if (y + lineHeight > 0 && y < h) {
          ctx.globalAlpha = flicker;
          ctx.fillText(wline.toUpperCase(), leftPad, y);
        }
        y += lineHeight;
      }
    }
    ctx.restore();
    textBlockHeight = y - textScrollY;
    textScrollY -= 2;
    if (textScrollY + textBlockHeight < -lineHeight) {
      textTrackIndex = (textTrackIndex + 1) % playlist.tracks.length;
      textLines = buildTextBlock(textTrackIndex);
      textScrollY = h + 30;
    }
  }

  // Cover-fit the current GIF/video frame, matching #gif-bg's object-fit + CSS filter.
  function drawGifFrame(ctx, w, h) {
    const media = document.getElementById('gif-bg');
    if (!hasFrame(media)) return;
    const mw = media.videoWidth || media.naturalWidth;
    const mh = media.videoHeight || media.naturalHeight;
    const scale = Math.max(w / mw, h / mh);
    const dw = mw * scale;
    const dh = mh * scale;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(media, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function renderGiphyOverlay() {
    const ctx = overlayCtx;
    if (!ctx) return;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // The GIF is an <img> under this transparent canvas, so filters would only
    // touch the text. While a filter is on, paint the GIF in first so the CPU
    // filters (and the GPU pixelate, which samples this canvas) hit it too.
    if (canvasFilters.getActiveKeys().size) drawGifFrame(ctx, w, h);

    drawTextOverlay(ctx, w, h);

    const r = Math.random;
    const shouldGlitch = overlayFrame % 6 === 0 && (glitchIntensity > 0.005 || r() < 0.1);
    if (shouldGlitch) {
      const snap = document.createElement('canvas');
      snap.width = w;
      snap.height = h;
      snap.getContext('2d').drawImage(overlayCanvas, 0, 0);
      const bands = 1 + Math.floor(r() * 3);
      for (let b = 0; b < bands; b++) {
        const bandY = r() * h;
        const bandH = Math.max(2, h * (0.01 + r() * 0.06));
        const maxShift = Math.min(50, 5 + glitchIntensity * 35);
        const shift = (r() - 0.5) * maxShift * 2;
        ctx.drawImage(snap, 0, bandY, w, bandH, shift, bandY, w, bandH);
      }
      if (r() < 0.18) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, r() * h, w, 2 + r() * 5);
        ctx.restore();
      }
    }

    if (r() < 0.006) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    canvasFilters.apply(ctx, w, h, overlayFrame);
  }

  function startOverlayLoop() {
    function frame() {
      overlayFrame++;
      try {
        if (audioAnalysisReady && analyser && frequencyData) {
          const audio = document.getElementById('player');
          if (audio && !audio.paused) {
            analyser.getByteFrequencyData(frequencyData);
            const bassEnd = 12;
            let bassSum = 0;
            for (let i = 0; i < bassEnd; i++) bassSum += frequencyData[i];
            const gain = (window.audioInputGain != null ? window.audioInputGain : 50) / 50;
            const bassEnergy = bassSum / (bassEnd * 255) * gain;
            bassSmoothed = bassSmoothed * 0.7 + bassEnergy * 0.3;
            glitchIntensity = Math.min(0.4, Math.max(0, (bassSmoothed - 0.06) * 2.5));
          } else {
            bassSmoothed *= 0.95;
            glitchIntensity = Math.max(0.02, glitchIntensity - 0.005);
          }
        } else {
          glitchIntensity = 0.02;
        }

        renderGiphyOverlay();

        const audio = document.getElementById('player');
        const playing = audio && !audio.paused;
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
            const t = overlayFrame / 9;
            amp = 0.18 + 0.14 * Math.abs(Math.sin(t)) + Math.random() * 0.06;
          }
          feedWave(amp);
        }
        drawWave();
      } catch (e) {
        console.warn('giphy overlay error:', e);
      }
      overlayAnimId = requestAnimationFrame(frame);
    }
    overlayAnimId = requestAnimationFrame(frame);
  }

  function start() {
    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    const blockCanvas = document.getElementById('block-canvas');
    if (gifBg) gifBg.style.display = '';
    if (overlay) overlay.style.display = '';
    if (blockCanvas) blockCanvas.style.display = 'none';
    running = true;
    loadToken++;
    // Coming back to this visual: resume what was on screen and let it dwell.
    if (hasFrame(gifBg)) {
      if (gifBg.tagName === 'VIDEO') gifBg.play().catch(() => {});
      scheduleNextGif();
    }

    overlayCanvas = document.getElementById('overlay-canvas');
    if (overlayCanvas) {
      overlayCtx = overlayCanvas.getContext('2d', { alpha: true });
      textScrollY = overlayCanvas.height + 20;
      resizeOverlay();
    }
    window.addEventListener('resize', resizeOverlay);
    startOverlayLoop();
    fetchGiphyGifs();
  }

  function stop() {
    if (overlayAnimId) {
      cancelAnimationFrame(overlayAnimId);
      overlayAnimId = null;
    }
    if (gifCycleTimer) {
      clearTimeout(gifCycleTimer);
      gifCycleTimer = null;
    }
    if (gifRefreshTimer) {
      clearTimeout(gifRefreshTimer);
      gifRefreshTimer = null;
    }
    if (gifRetryTimer) {
      clearTimeout(gifRetryTimer);
      gifRetryTimer = null;
    }
    window.removeEventListener('resize', resizeOverlay);

    // Abandon the in-flight/buffered next item; stale preloads check loadToken.
    running = false;
    loadToken++;
    discard(loadingEl);
    loadingEl = null;
    discard(nextEl);
    nextEl = null;

    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
    if (gifBg && gifBg.tagName === 'VIDEO') gifBg.pause();
    if (gifBg) gifBg.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  }

  function onEvent(event) {
    if (event === 'trackChange') {
      textTrackIndex = currentTrack;
      textLines = buildTextBlock(textTrackIndex);
      textScrollY = (overlayCanvas ? overlayCanvas.height : window.innerHeight) + 30;
    }
  }

  return { name: 'Giphy Feed', start, stop, resetTimer, onEvent };
})());
