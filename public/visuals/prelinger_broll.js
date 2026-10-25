'use strict';

visuals.register('prelinger_broll', (() => {
  let myP5 = null;

  // What to look for on archive.org. Each theme is a search; `words` pull it
  // in when the track's title, artist or show mentions them. Ads are short
  // and tiny (a few MB), so one is always in the mix and usually plays first.
  const THEMES = {
    ads:       { q: 'collection:classic_tv_commercials AND (year:[1900 TO 1989] OR 1950s OR 1960s OR 1970s OR 1980s OR vintage OR retro)', words: ['ad', 'buy', 'sale', 'product', 'brand', 'cereal', 'soda', 'cola', 'smoke'] },
    ufo:       { q: 'mediatype:movies AND (ufo OR "flying saucer" OR "flying saucers" OR "outer space") AND date:[1940-01-01 TO 1989-12-31]', words: ['ufo', 'alien', 'saucer', 'space', 'star', 'cosmic', 'orbit', 'signal', 'void'] },
    computers: { q: 'collection:computerchronicles OR (collection:prelinger AND (computer OR "electronic brain" OR automation OR robot))', words: ['computer', 'data', 'byte', 'binary', 'circuit', 'robot', 'machine', 'terminal', 'grid', 'code', 'cache', 'protocol', 'system', 'error'] },
    atomic:    { q: 'collection:prelinger AND (atomic OR "civil defense" OR "duck and cover" OR radiation)', words: ['atom', 'atomic', 'nuclear', 'reactor', 'fallout', 'radiation', 'bomb'] },
    mind:      { q: 'collection:prelinger AND (hypnosis OR psychic OR "mental health" OR dreams)', words: ['mind', 'dream', 'sleep', 'ghost', 'memory', 'hypno', 'trance', 'echo'] },
    tomorrow:  { q: 'collection:prelinger AND ("world of tomorrow" OR "home of tomorrow" OR future OR "push button")', words: ['future', 'tomorrow', 'neon', 'chrome', 'synth', 'electro'] },
    broadcast: { q: 'collection:prelinger AND (television OR telephone OR radio OR switchboard)', words: ['radio', 'broadcast', 'frequency', 'static', 'tv', 'phone', 'antenna', 'transmission'] },
    dance:     { q: 'collection:prelinger AND (dance OR teenagers OR dating OR party)', words: ['disco', 'dance', 'party', 'love', 'night', 'club', 'funk', 'groove'] },
    road:      { q: 'collection:prelinger AND (highway OR driving OR traffic OR freeway)', words: ['drive', 'road', 'highway', 'car', 'motor', 'travel', 'route'] },
    work:      { q: 'collection:prelinger AND (office OR factory OR assembly OR industry)', words: ['work', 'office', 'factory', 'industrial', 'steel', 'plant', 'rust', 'iron'] },
    suburb:    { q: 'collection:prelinger AND (suburb OR kitchen OR housewife OR family)', words: ['home', 'house', 'kitchen', 'family', 'garden', 'suburb', 'sunday'] },
    scifi:     { q: 'collection:sciencefiction', words: ['sci', 'fi', 'robot', 'alien', 'planet', 'galaxy'] },
  };
  const QUIRKY = ['ufo', 'mind', 'tomorrow', 'computers', 'atomic', 'broadcast', 'scifi'];
  // Single subjects in the spirit of the Giphy artwork's search list, looked up
  // across the old-film collections: a surprise picture for every track.
  const SUBJECTS = [
    'eyes', 'cows', 'kiss', 'crying', 'dance', 'party', 'aerial', 'moon',
    'rocket', 'satellite', 'telescope', 'radio', 'antenna', 'television',
    'robot', 'computer', 'surveillance', 'street', 'driving',
    'factory', 'neon', 'hypnosis', 'magic', 'circus',
    'swimming', 'skating', 'jet', 'monster', 'puppet', 'wrestling', 'cats',
  ];
  const ARCHIVES = 'collection:prelinger OR collection:classic_tv_commercials OR collection:sciencefiction OR collection:feature_films OR collection:computerchronicles';
  const queryFor = (theme) => theme.startsWith('subject:')
    ? `(${ARCHIVES}) AND "${theme.slice(8)}"`
    : THEMES[theme].q;

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
        key: `${t.artist || ''} ${t.title || ''} ${t.genre || ''} ${t.show || ''} ${t.caption || ''}`.trim(),
      };
    } catch (e) {
      return { bpm: 80, key: '' };
    }
  }

  const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

  // Three searches per track: an ad, the theme the track's words point at (or a
  // random one), and a wildcard (a quirky theme or a single subject), so the
  // reel is never the same twice.
  function pickThemes(info) {
    const hay = ` ${info.key.toLowerCase()} `;
    const scored = Object.entries(THEMES)
      .map(([name, th]) => ({ name, hits: th.words.filter((w) => hay.includes(w)).length + Math.random() * 0.5 }))
      .filter((x) => x.name !== 'ads')
      .sort((a, b) => b.hits - a.hits);
    const matched = scored[0].hits >= 1 ? scored[0].name : pickOne(Object.keys(THEMES).filter((n) => n !== 'ads'));
    const wild = Math.random() < 0.5
      ? 'subject:' + pickOne(SUBJECTS)
      : pickOne(QUIRKY.filter((n) => n !== matched));
    return ['ads', matched, wild];
  }

  // A random page of results instead of always the top ten. The hit count per
  // theme is remembered so this costs one request after the first visit.
  async function searchFilms(theme) {
    const q = `(${queryFor(theme)}) AND mediatype:movies`;
    const base = 'https://archive.org/advancedsearch.php?q=' + encodeURIComponent(q) + '&fl%5B%5D=identifier&output=json';
    const key = 'broll-count2:' + theme;
    let count = 0;
    try { count = Number(localStorage.getItem(key)) || 0; } catch (e) {}
    if (!count) {
      const res = await fetch(base + '&rows=0');
      if (!res.ok) throw new Error('search');
      count = (await res.json())?.response?.numFound || 0;
      try { localStorage.setItem(key, String(count)); } catch (e) {}
    }
    const rows = 20;
    const pages = Math.max(1, Math.min(Math.ceil(count / rows), 500));
    const res = await fetch(`${base}&rows=${rows}&page=${1 + Math.floor(Math.random() * pages)}`);
    if (!res.ok) throw new Error('search');
    const ids = ((await res.json())?.response?.docs || []).map((d) => d.identifier).filter(Boolean);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
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
    // ...but not the 120p postage stamps some items carry.
    const pick = (files.find((f) => f.h >= 200) || files[0] || {}).name || null;
    if (!pick) return null;
    // Through the app's same-origin proxy: archive.org's storage hosts send no
    // CORS headers, which would taint the canvas and switch every filter off.
    return `/broll/${encodeURIComponent(id)}/${pick.split('/').map(encodeURIComponent).join('/')}`;
  }

  // Resolves once the film can start from a random point past its opening
  // titles; rejects (and cleans up) if it takes too long. Cuts later check how
  // much is buffered ahead (nextBuffered), so big films don't hold up the reel.
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
    // Search the three themes at once, then deal the results out in turn so the
    // reel holds one film from each: ad, matched theme, wildcard.
    const lists = await Promise.all(pickThemes(info).map((th) => searchFilms(th).catch(() => [])));
    let ids = [];
    for (let i = 0; i < 6; i++) lists.forEach((l) => { if (l[i]) ids.push(l[i]); });
    ids = [...new Set(ids)];
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
        const video = await makeVideo(url, 'canplay');
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

  function bufferedAhead(v) {
    const b = v.buffered;
    for (let i = 0; i < b.length; i++) {
      if (b.start(i) <= v.currentTime + 0.1 && b.end(i) > v.currentTime) return b.end(i) - v.currentTime;
    }
    return 0;
  }

  // The next film in the rotation with a start buffered. Chrome stops filling a
  // paused video at about 2s, so ask for 1.5s; it keeps buffering once playing.
  function nextBuffered() {
    for (let k = 1; k < state.films.length; k++) {
      const i = (state.shot + k) % state.films.length;
      if (bufferedAhead(state.films[i].video) >= 1.5) return i;
    }
    return -1;
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

      // Many archive films carry black bars inside the file (4:3 pillarboxed
      // into 16:9, widescreen letterboxed into 4:3). Find the picture inside
      // them, once a second for the first few seconds of each clip.
      const probe = document.createElement('canvas');
      const probeCtx = probe.getContext('2d', { willReadFrequently: true });
      function pictureBox(v) {
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        const now = performance.now();
        if (v._box && (v._boxChecks >= 4 || now - v._boxAt < 1000)) return v._box;
        v._boxAt = now;
        v._boxChecks = (v._boxChecks || 0) + 1;
        const W = 96;
        const H = Math.max(8, Math.round(W * vh / vw));
        probe.width = W;
        probe.height = H;
        let d;
        try {
          probeCtx.drawImage(v, 0, 0, W, H);
          d = probeCtx.getImageData(0, 0, W, H).data;
        } catch (e) {
          return (v._box = v._box || { x: 0, y: 0, w: vw, h: vh });
        }
        // A line is picture if a few of its pixels are above black.
        const lit = (x0, y0, dx, dy, n) => {
          let on = 0;
          for (let k = 0; k < n; k++) {
            const i = 4 * ((y0 + dy * k) * W + (x0 + dx * k));
            if (d[i] + d[i + 1] + d[i + 2] > 90) on++;
          }
          return on > n * 0.06;
        };
        let x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1;
        while (x0 < W / 3 && !lit(x0, 0, 0, 1, H)) x0++;
        while (x1 > (W * 2) / 3 && !lit(x1, 0, 0, 1, H)) x1--;
        while (y0 < H / 3 && !lit(0, y0, 1, 0, W)) y0++;
        while (y1 > (H * 2) / 3 && !lit(0, y1, 1, 0, W)) y1--;
        // An all-dark frame (a fade) says nothing about the bars.
        if (x0 >= W / 3 && y0 >= H / 3) return (v._box = v._box || { x: 0, y: 0, w: vw, h: vh });
        const sx = vw / W;
        const sy = vh / H;
        const box = { x: x0 * sx, y: y0 * sy, w: (x1 - x0 + 1) * sx, h: (y1 - y0 + 1) * sy };
        // Bars don't move; a dark scene only makes the box look smaller. Keep
        // the widest box seen.
        if (v._box) {
          const r = Math.max(box.x + box.w, v._box.x + v._box.w);
          const btm = Math.max(box.y + box.h, v._box.y + v._box.h);
          box.x = Math.min(box.x, v._box.x);
          box.y = Math.min(box.y, v._box.y);
          box.w = r - box.x;
          box.h = btm - box.y;
        }
        v._box = box;
        return box;
      }

      // The picture covers the screen edge to edge: at least the screen's
      // width and height, never stretched, bars inside the file cut away.
      function drawVideoShot(v, alpha) {
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (!vw || !vh) return false;
        const b = pictureBox(v);
        const scale = Math.max(p.width / b.w, p.height / b.h) * 1.02;
        const dw = b.w * scale;
        const dh = b.h * scale;
        const ctx = p.drawingContext;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.drawImage(v, b.x, b.y, b.w, b.h, (p.width - dw) / 2, (p.height - dh) / 2, dw, dh);
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

        // Cut every 8 beats, but only onto a film with its start buffered; with
        // nothing else ready the current film just keeps playing.
        const beatMs = (60 / Math.max(40, state.bpm)) * 8 * 1000;
        const next = t - state.shotAt > beatMs ? nextBuffered() : -1;
        if (next >= 0) {
          const outgoing = state.films[state.prevShot];
          if (outgoing && state.prevShot !== state.shot) outgoing.video.pause();
          state.prevShot = state.shot;
          state.shot = next;
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

  return { name: 'B-roll', start, stop };
})());
