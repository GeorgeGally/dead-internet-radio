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
  const GIPHY_CACHE_KEY = 'dir_gif_cache';
  const GIPHY_CACHE_TTL = 86400000;
  const GIPHY_REFRESH_MS = 180000;

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

  let gifUrls = [];
  let gifCycleTimer = null;
  let gifRefreshTimer = null;
  let gifLoading = false;

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

  function pickSearchTerm() {
    return GIPHY_SEARCH_TERMS[Math.floor(Math.random() * GIPHY_SEARCH_TERMS.length)];
  }

  async function fetchGiphyGifs(force) {
    if (gifLoading) return;
    const cached = getCachedGifs();
    if (cached.length && !force) {
      gifUrls = cached;
      loadGif(gifUrls[Math.floor(Math.random() * gifUrls.length)]);
      scheduleNextGif();
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
      const fresh = data.data.map(g => g.images.fixed_height_small.url);
      const existing = new Set(gifUrls);
      for (const u of fresh) {
        if (!existing.has(u)) gifUrls.push(u);
      }
      if (gifUrls.length > 640) gifUrls = gifUrls.slice(-640);
      saveGifsToCache(gifUrls);
      loadGif(gifUrls[Math.floor(Math.random() * Math.min(fresh.length, gifUrls.length))]);
      scheduleNextGif();
      scheduleGifRefresh();
    } catch (e) {
      console.warn('Giphy fetch failed:', e.message);
      if (!gifUrls.length) {
        gifUrls = GIPHY_FALLBACK_URLS;
        loadGif(gifUrls[0]);
        scheduleNextGif();
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
      return cache.urls || [];
    } catch (e) {
      return [];
    }
  }

  function saveGifsToCache(urls) {
    try {
      localStorage.setItem(GIPHY_CACHE_KEY, JSON.stringify({ urls, ts: Date.now() }));
    } catch (e) {}
  }

  function loadGif(url) {
    const img = document.getElementById('gif-bg');
    if (!img) return;
    if (img.src === url) return;
    img.src = url;
  }

  function pickInterval() {
    return 10000 + Math.random() * 10000;
  }

  function scheduleNextGif() {
    if (gifCycleTimer) clearTimeout(gifCycleTimer);
    gifCycleTimer = setTimeout(() => {
      if (gifUrls.length < 2) {
        scheduleNextGif();
        return;
      }
      const img = document.getElementById('gif-bg');
      const current = img ? img.src : '';
      let idx;
      do {
        idx = Math.floor(Math.random() * gifUrls.length);
      } while (gifUrls[idx] === current && gifUrls.length > 1);
      loadGif(gifUrls[idx]);
      scheduleNextGif();
    }, pickInterval());
  }

  function resizeOverlay() {
    if (!overlayCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    overlayCanvas.width = Math.round(w * dpr);
    overlayCanvas.height = Math.round(h * dpr);
    overlayCanvas.style.width = w + 'px';
    overlayCanvas.style.height = h + 'px';
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

  function renderGiphyOverlay() {
    const ctx = overlayCtx;
    if (!ctx) return;
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);

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
            const bassEnergy = bassSum / (bassEnd * 255);
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
    window.removeEventListener('resize', resizeOverlay);

    const gifBg = document.getElementById('gif-bg');
    const overlay = document.getElementById('overlay-canvas');
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

  return { name: 'Giphy Feed', start, stop, onEvent };
})());
