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
    const names = (json?.files || []).map((f) => String(f.name || ''));
    const pick =
      names.find((n) => /_512kb\.mp4$/i.test(n)) ||
      names.find((n) => /\.mp4$/i.test(n) && !/ia\.mp4$/i.test(n)) ||
      names.find((n) => /\.mp4$/i.test(n)) ||
      names.find((n) => /\.ogv$/i.test(n));
    if (!pick) return null;
    return `https://archive.org/download/${encodeURIComponent(id)}/${pick.split('/').map(encodeURIComponent).join('/')}`;
  }

  function makeVideo(url) {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.loop = true;
    v.src = url;
    v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
    document.body.appendChild(v);
    v.play().catch(() => {});
    return v;
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

    const films = [];
    for (const id of ids) {
      if (token !== state.loadToken) return;
      if (films.length >= 3) break;
      try {
        const url = await filmVideo(id);
        if (!url) continue;
        const video = makeVideo(url);
        films.push({ id, url, video });
        if (films.length === 1) {
          state.films = films;
          state.ready = true;
          state.failed = false;
          state.shot = 0;
          state.frame = 0;
          state.shotAt = performance.now();
        }
      } catch (e) {}
    }
    if (!films.length) throw new Error('no video');
    if (token !== state.loadToken) return;
    state.films = films;
    state.ready = true;
    state.failed = false;
  }

  function stopVideos() {
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
          state.films = [];
          loadForTrack(info, token).catch(() => {
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

        const beatMs = (60 / Math.max(40, state.bpm)) * 8 * 1000;
        if (t - state.shotAt > beatMs) {
          state.prevShot = state.shot;
          state.shot = (state.shot + 1) % state.films.length;
          state.shotAt = t;
          const v = state.films[state.shot].video;
          if (v) {
            v.play().catch(() => {});
          }
        }

        const film = state.films[state.shot];
        if (!film || !drawVideoShot(film.video, 1)) {
          leader(t);
          return;
        }

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

        if (typeof filters !== 'undefined' && filters.applyToP5) filters.applyToP5(p);
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
