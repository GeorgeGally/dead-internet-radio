'use strict';

visuals.register('prelinger_broll', (() => {
  let myP5 = null;

  const VIBES = {
    atomic: { q: 'atomic energy' },
    road: { q: 'highway driving' },
    office: { q: 'office business' },
    kitchen: { q: 'kitchen food' },
    factory: { q: 'factory industry' },
    suburban: { q: 'suburb family' },
  };

  const WORDS = [
    ['atomic', ['atom', 'atomic', 'nuclear', 'science', 'reactor', 'space', 'rocket', 'radiation']],
    ['road', ['drive', 'driving', 'road', 'highway', 'car', 'motor', 'travel', 'route', 'chase']],
    ['office', ['work', 'office', 'business', 'desk', 'job', 'boss', 'meeting', 'company', 'paper']],
    ['kitchen', ['kitchen', 'food', 'cook', 'dinner', 'eat', 'family', 'home', 'table', 'tea']],
    ['factory', ['factory', 'machine', 'industrial', 'steel', 'plant', 'build', 'engine', 'power']],
    ['suburban', ['suburb', 'house', 'garden', 'street', 'town', 'neighbour', 'kids', 'school']],
  ];

  const state = {
    films: [],
    shot: 0,
    prevShot: 0,
    shotAt: 0,
    loadToken: 0,
    ready: false,
    failed: false,
    bpm: 80,
    trackKey: '',
  };

  function trackInfo() {
    try {
      const t = playlist?.tracks?.[currentTrack] || {};
      return {
        bpm: Number(t.bpm) || 80,
        key: `${t.artist || ''} ${t.title || ''} ${t.genre || ''} ${t.show || ''}`.trim(),
      };
    } catch (e) {
      return { bpm: 80, key: '' };
    }
  }

  function pickVibes(info) {
    const hay = info.key.toLowerCase();
    const scored = WORDS.map(([name, words]) => ({
      name,
      hits: words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0),
    })).sort((a, b) => b.hits - a.hits);
    const picked = scored.filter((s) => s.hits > 0).map((s) => s.name);
    if (!picked.length) picked.push(info.bpm < 70 ? 'suburban' : info.bpm < 100 ? 'office' : 'road');
    while (picked.length < 3) picked.push(picked[0] === 'road' ? 'factory' : 'road');
    return picked.slice(0, 3);
  }

  async function searchFilms(vibe) {
    const q = `collection:prelinger AND mediatype:movies AND (${VIBES[vibe].q})`;
    const url =
      'https://archive.org/advancedsearch.php?q=' + encodeURIComponent(q) +
      '&fl%5B%5D=identifier&rows=10&page=1&output=json';
    const res = await fetch(url);
    if (!res.ok) throw new Error('search');
    const json = await res.json();
    return (json?.response?.docs || []).map((d) => d.identifier).filter(Boolean);
  }

  async function filmVideo(id) {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('meta');
    const json = await res.json();
    // Smallest mp4 that has a picture: many Prelinger items only carry a
    // multi-GB broadcast master besides the web derivative, and Chrome no
    // longer decodes Theora (.ogv plays as sound only).
    const files = (json?.files || [])
      .map((f) => ({ name: String(f.name || ''), size: Number(f.size) || Infinity, h: Number(f.height) || 0 }))
      .filter((f) => /\.mp4$/i.test(f.name) && f.h > 0)
      .sort((a, b) => a.size - b.size);
    const pick = files.length ? files[0].name : null;
    if (!pick) return null;
    // Through the app's same-origin proxy: archive.org's storage hosts send no
    // CORS headers, which would taint the canvas and switch every filter off.
    return `/broll/${encodeURIComponent(id)}/${pick.split('/').map(encodeURIComponent).join('/')}`;
  }

  // Resolves once the film is ready from a random point past the opening
  // titles: `canplay` for the first film (start fast), `canplaythrough` for the
  // ones cut to later. Rejects (and cleans up) if it takes too long.
  function makeVideo(url, readyEvent) {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.loop = true;
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    return new Promise((resolve, reject) => {
      const fail = () => {
        clearTimeout(timer);
        v.removeAttribute('src');
        v.remove();
        reject(new Error('video'));
      };
      const timer = setTimeout(fail, 30000);
      v.addEventListener('loadedmetadata', () => {
        if (isFinite(v.duration) && v.duration > 30) v.currentTime = v.duration * (0.1 + Math.random() * 0.6);
      }, { once: true });
      v.addEventListener(readyEvent, () => {
        if (!v.videoWidth) return fail();
        clearTimeout(timer);
        resolve(v);
      }, { once: true });
      v.addEventListener('error', fail, { once: true });
      v.src = url;
    });
  }

  function disposeVideos() {
    state.films.forEach((f) => {
      if (f.video) {
        try { f.video.pause(); } catch (e) {}
        f.video.remove();
      }
    });
  }

  async function loadForTrack(info, token) {
    const vibes = pickVibes(info);
    let ids = [];
    for (const v of vibes) {
      try {
        ids = ids.concat(await searchFilms(v));
      } catch (e) {}
      if (ids.length >= 9) break;
    }
    ids = [...new Set(ids)].slice(0, 8);
    if (!ids.length) throw new Error('none');

    // One film at a time: the first starts as soon as it can play through, and
    // each next one only joins the rotation once it is fully buffered.
    const films = [];
    state.films = films;
    for (const id of ids) {
      if (token !== state.loadToken) return;
      if (films.length >= 3) break;
      try {
        const url = await filmVideo(id);
        if (!url) continue;
        const video = await makeVideo(url, films.length ? 'canplaythrough' : 'canplay');
        if (token !== state.loadToken) {
          video.remove();
          return;
        }
        films.push({ id, url, video });
        if (films.length === 1) {
          video.play().catch(() => {});
          state.ready = true;
          state.failed = false;
          state.shot = 0;
          state.prevShot = 0;
          state.shotAt = performance.now();
        }
      } catch (e) {}
    }
    if (!films.length) throw new Error('no video');
  }

  // Something to watch while the first film buffers: one Giphy clip, looped.
  // Giphy's media host sends CORS headers, so the filters still work on it.
  const GIPHY_API_KEY = '23JUZnCbRcIFMOcQtjTZT1ZIwtfdbbc5';
  const STANDIN_TERMS = ['vintage film', 'old footage', '1950s', 'home movie', 'film grain', 'retro tv'];
  let standIn = null;

  async function loadStandIn() {
    try {
      const q = encodeURIComponent(STANDIN_TERMS[Math.floor(Math.random() * STANDIN_TERMS.length)]);
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${q}&limit=25&rating=pg-13`);
      const json = await res.json();
      const mp4s = (json?.data || []).map((g) => g?.images?.original?.mp4).filter(Boolean);
      if (!mp4s.length || state.ready) return;
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.playsInline = true;
      v.loop = true;
      v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
      document.body.appendChild(v);
      v.src = mp4s[Math.floor(Math.random() * mp4s.length)];
      v.play().catch(() => {});
      standIn = v;
    } catch (e) {}
  }

  function dropStandIn() {
    if (!standIn) return;
    try { standIn.pause(); } catch (e) {}
    standIn.remove();
    standIn = null;
  }

  function stopVideos() {
    dropStandIn();
    disposeVideos();
  }

  function start() {
    stop();
    if (typeof window !== 'undefined') window.__pb = state;

    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    myP5 = new p5((p) => {
      let scrollY = 0;

      p.setup = () => {
        if (typeof window !== 'undefined') window.__pbP5 = p;
        const c = p.createCanvas(p.windowWidth, p.windowHeight);
        c.position(0, 0);
        c.style('position', 'fixed');
        c.style('inset', '0');
        c.style('z-index', '1');
        p.pixelDensity(1);
      };

      p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);

      function pullTrack() {
        const info = trackInfo();
        state.bpm = info.bpm;
        if (info.key !== state.trackKey) {
          state.trackKey = info.key;
          state.loadToken += 1;
          const token = state.loadToken;
          state.ready = false;
          state.failed = false;
          disposeVideos();
          state.films = [];
          if (!standIn) loadStandIn();
          loadForTrack(info, token).catch((err) => {
            console.error('prelinger b-roll load failed:', err && err.message);
            if (token === state.loadToken) state.failed = true;
          });
        }
      }

      function bass() {
        if (typeof audioAnalysisReady === 'undefined' || !audioAnalysisReady) return 0;
        if (!analyser || !frequencyData) return 0;
        analyser.getByteFrequencyData(frequencyData);
        let sum = 0;
        for (let i = 1; i < 8; i++) sum += frequencyData[i];
        return Math.min(1, sum / (7 * 255));
      }

      function leader(t) {
        p.background(9, 9, 9);
        p.push();
        p.translate(p.width / 2, p.height / 2);
        const r = Math.min(p.width, p.height) * 0.29;
        p.noFill();
        p.stroke(232, 232, 226, 150);
        p.strokeWeight(1.4);
        p.circle(0, 0, r * 2);
        p.line(-r * 1.12, 0, r * 1.12, 0);
        p.line(0, -r * 1.12, 0, r * 1.12);
        p.strokeWeight(1);
        p.circle(0, 0, r * 1.55);
        p.noStroke();
        p.fill(232, 232, 226, 170);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(r * 0.95);
        p.text(String(3 - (p.floor(t / 1000) % 3)), 0, r * 0.02);
        p.textSize(11);
        p.fill(150);
        p.text('PRELINGER', 0, r * 1.28);
        p.pop();
      }

      function drawVideoShot(v, alpha) {
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (!vw || !vh) return false;
        const scale = Math.max(p.width / vw, p.height / vh) * 1.02;
        const dw = vw * scale;
        const dh = vh * scale;
        const ctx = p.drawingContext;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(v, (p.width - dw) / 2, (p.height - dh) / 2, dw, dh);
        ctx.restore();
        return true;
      }

      p.draw = () => {
        pullTrack();
        const t = p.millis();

        if (!state.ready || !state.films.length) {
          if (standIn && drawVideoShot(standIn, 1)) {
            canvasFilters.applyToP5(p);
            return;
          }
          leader(t);
          if (state.failed) {
            p.noStroke();
            p.fill(120);
            p.textAlign(p.CENTER, p.CENTER);
            p.textSize(11);
            p.text('B-ROLL UNAVAILABLE', p.width / 2, p.height / 2 + Math.min(p.width, p.height) * 0.22);
          }
          return;
        }

        dropStandIn();

        // Cut every 8 beats, but only onto a film that is already buffered;
        // with nothing else ready the current film just keeps playing.
        const beatMs = (60 / Math.max(40, state.bpm)) * 8 * 1000;
        if (t - state.shotAt > beatMs && state.films.length > 1) {
          const outgoing = state.films[state.prevShot];
          if (outgoing && state.prevShot !== state.shot) outgoing.video.pause();
          state.prevShot = state.shot;
          state.shot = (state.shot + 1) % state.films.length;
          state.shotAt = t;
          state.films[state.shot].video.play().catch(() => {});
        }

        // A film that hasn't produced a frame yet leaves the last picture up
        // rather than flashing the leader.
        const film = state.films[state.shot];
        if (!film || !drawVideoShot(film.video, 1)) return;

        const prev = state.films[state.prevShot];
        const fadeMs = 500;
        if (prev && prev !== film && t - state.shotAt < fadeMs) {
          drawVideoShot(prev.video, 1 - (t - state.shotAt) / fadeMs);
        }

        const bassLevel = bass();
        p.push();
        p.noStroke();
        p.fill(0, 0, 0, (0.05 + bassLevel * 0.12 + Math.random() * 0.05) * 255);
        p.rect(0, 0, p.width, p.height);

        const grain = Math.floor((p.width * p.height) / 2600);
        p.fill(255, 255, 245, 24);
        for (let i = 0; i < grain; i++) p.rect(Math.random() * p.width, Math.random() * p.height, 1, 1);

        if (Math.random() < 0.05) {
          p.stroke(240, 240, 230, 18);
          p.strokeWeight(1);
          const x = Math.random() * p.width;
          p.line(x, 0, x + Math.random() * 6 - 3, p.height);
        }

        const ctx2 = p.drawingContext;
        const grad = ctx2.createRadialGradient(
          p.width / 2, p.height / 2, Math.min(p.width, p.height) * 0.3,
          p.width / 2, p.height / 2, Math.max(p.width, p.height) * 0.72
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx2.fillStyle = grad;
        ctx2.fillRect(0, 0, p.width, p.height);
        p.pop();

        scrollY = (scrollY + 1.2 + bassLevel * 4) % 6;
        p.push();
        p.noStroke();
        p.fill(0, 0, 0, 34);
        for (let y = scrollY; y < p.height; y += 3) p.rect(0, y, p.width, 1);
        const bandY = ((t * 0.05) % (p.height + 240)) - 120;
        const band = p.drawingContext.createLinearGradient(0, bandY, 0, bandY + 120);
        band.addColorStop(0, 'rgba(255,255,255,0)');
        band.addColorStop(0.5, 'rgba(255,255,255,0.045)');
        band.addColorStop(1, 'rgba(255,255,255,0)');
        p.drawingContext.fillStyle = band;
        p.drawingContext.fillRect(0, bandY, p.width, 120);
        p.pop();

        if (typeof canvasFilters !== 'undefined' && canvasFilters.applyToP5) canvasFilters.applyToP5(p);
      };
    });
  }

  function stop() {
    state.ready = false;
    state.films = [];
    stopVideos();
    if (myP5) {
      myP5.remove();
      myP5 = null;
    }
  }

  return { name: 'Prelinger B-roll', start, stop };
})());
