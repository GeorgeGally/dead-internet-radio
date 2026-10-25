'use strict';

// The tracking layer, always on above every artwork and filter: a machine
// looking at what's on screen. MediaPipe detectors (loaded with the first
// frame) find faces and everyday objects (the 80 COCO classes: person, car,
// dog, cup...) in the artwork's canvas. Each gets corner brackets, a tag
// like "PAYLOAD 01 · WALKING 0.95" or "OBJECT 03 · CAR 0.91", a distance and
// pace readout, and orange dot trails.
//
// Models vendored in lib/ (blaze_face_short_range, efficientdet_lite0); WASM
// from jsdelivr.
const trackHud = (() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const ORANGE = '#ff5a1f';
  const MONO = '"IBM Plex Mono", "Courier New", monospace';

  const MODES = {
    face: {
      task: 'FaceDetector',
      options: { modelAssetPath: 'visuals/lib/face/blaze_face_short_range.tflite', minDetectionConfidence: 0.55 },
      every: 120,
    },
    object: {
      task: 'ObjectDetector',
      options: { modelAssetPath: 'visuals/lib/objects/efficientdet_lite0.tflite', scoreThreshold: 0.45, maxResults: 6 },
      every: 300,
    },
  };
  // Per mode: { detector, loading, failed, lastDetect, items, count }
  const state = {};
  let vision = null;
  let files = null;
  let canvas = null;
  let ctx = null;

  async function load(mode) {
    const m = state[mode];
    if (m.detector || m.loading || m.failed) return;
    m.loading = true;
    try {
      if (!vision) {
        vision = await import(`${LIB}/vision_bundle.mjs`);
        files = await vision.FilesetResolver.forVisionTasks(`${LIB}/wasm`);
      }
      const { task, options } = MODES[mode];
      const { modelAssetPath, ...rest } = options;
      const make = (delegate) => vision[task].createFromOptions(files, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        ...rest,
      });
      m.detector = await make('GPU').catch(() => make('CPU'));
    } catch (e) {
      m.failed = true;
      console.warn(`${mode} track: detector failed to load`, e);
    }
    m.loading = false;
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'hud-canvas';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(innerWidth * dpr);
    const h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // New detections in screen pixels, eased into the tracked ones so the
  // brackets glide instead of jumping.
  function track(mode, src, now) {
    const m = state[mode];
    if (!m.detector || now - m.lastDetect < MODES[mode].every) return;
    m.lastDetect = now;
    let res;
    try { res = m.detector.detectForVideo(src, now); } catch (e) { return; }
    const sx = innerWidth / src.width;
    const sy = innerHeight / src.height;
    const found = (res.detections || []).map((d) => {
      const b = d.boundingBox;
      return {
        x: b.originX * sx, y: b.originY * sy, w: b.width * sx, h: b.height * sy,
        score: d.categories && d.categories[0] ? d.categories[0].score : 0,
        name: d.categories && d.categories[0] ? (d.categories[0].categoryName || '').toUpperCase() : '',
        kp: (d.keypoints || []).map((k) => [k.x * innerWidth, k.y * innerHeight]),
      };
    });
    const next = [];
    for (const f of found) {
      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      let best = null;
      let bestD = Infinity;
      for (const o of m.items) {
        if (o.name !== f.name || next.includes(o)) continue;
        const d = Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy);
        if (d < bestD && d < Math.max(f.w, o.w)) { best = o; bestD = d; }
      }
      if (best) {
        const k = 0.45;
        ['x', 'y', 'w', 'h', 'score'].forEach((p) => { best[p] += (f[p] - best[p]) * k; });
        best.kp = f.kp.map((p, i) => (best.kp[i] ? [best.kp[i][0] + (p[0] - best.kp[i][0]) * k, best.kp[i][1] + (p[1] - best.kp[i][1]) * k] : p));
        // Speed in face-widths per second, eased, for the state and pace.
        const dt = Math.max(1, now - best.seen) / 1000;
        const v = Math.min(3, bestD / Math.max(1, f.w) / dt);
        best.speed = (best.speed || 0) * 0.8 + v * 0.2;
        best.travel = (best.travel || 0) + bestD / Math.max(1, f.w) * 0.18;
        best.seen = now;
        next.push(best);
      } else {
        m.count = (m.count % 99) + 1;
        const word = mode === 'face' ? ['MODEL', 'PAYLOAD', 'SUBJECT'][m.count % 3] : 'OBJECT';
        next.push({ ...f, look: m.count, word, dark: m.count % 2 === 0, born: now, seen: now, speed: 0, travel: 0 });
      }
    }
    // Keep a lost one a moment, so a missed frame doesn't blink the box.
    for (const o of m.items) if (!next.includes(o) && now - o.seen < 400) next.push(o);
    m.items = next;
  }

  function brackets(x, y, w, h) {
    const l = Math.min(w, h) * 0.22;
    ctx.beginPath();
    [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([px, py, dx, dy]) => {
      ctx.moveTo(px + dx * l, py);
      ctx.lineTo(px, py);
      ctx.lineTo(px, py + dy * l);
    });
    ctx.stroke();
  }

  // Square orange dots marching along a path, appearing one by one.
  function trail(points, now, born) {
    const shown = Math.min(points.length, Math.floor((now - born) / 45));
    ctx.fillStyle = ORANGE;
    for (let i = 0; i < shown; i++) {
      const [px, py] = points[i];
      const s = 5 + (i % 3 === 0 ? 1 : 0);
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 300 + i * 0.7) ** 2;
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function jaw(f) {
    // Ear (keypoint 4 or 5) down round the jaw to under the chin, then on
    // down the neck: a quarter ellipse plus a tail.
    const pts = [];
    const cx = f.x + f.w / 2;
    const side = f.kp[5] && f.kp[4] ? (f.kp[5][0] > f.kp[4][0] ? 5 : 4) : null;
    const ear = side != null ? f.kp[side] : [f.x + f.w, f.y + f.h * 0.45];
    const rx = Math.abs(ear[0] - cx);
    const ry = f.y + f.h * 1.02 - ear[1];
    const dir = ear[0] > cx ? 1 : -1;
    const step = Math.max(14, f.w * 0.07);
    const n = Math.max(6, Math.round((Math.PI / 2) * Math.max(rx, ry) / step));
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      pts.push([cx + dir * rx * Math.cos(a), ear[1] + ry * Math.sin(a)]);
    }
    const [lx, ly] = pts[pts.length - 1];
    for (let i = 1; i <= 8; i++) pts.push([lx - dir * i * step * 0.35, ly + i * step]);
    return pts;
  }

  function sideline(f) {
    // From the far ear out to the screen edge, slightly rising.
    const pts = [];
    const near = f.kp[4] && f.kp[5] ? (f.kp[4][0] < f.kp[5][0] ? f.kp[4] : f.kp[5]) : [f.x, f.y + f.h * 0.45];
    const step = Math.max(16, f.w * 0.08);
    for (let x = near[0] - step, i = 0; x > -step && i < 40; x -= step, i++) pts.push([x, near[1] - i * step * 0.06]);
    return pts;
  }

  // An object's trail drops from the middle of its base towards the floor.
  function drop(f) {
    const pts = [];
    const step = Math.max(14, f.w * 0.06);
    const x = f.x + f.w / 2;
    for (let y = f.y + f.h + step, i = 0; y < innerHeight + step && i < 40; y += step, i++) pts.push([x, y]);
    return pts;
  }

  // What the face is doing, from how fast its box moves.
  function activity(f) {
    const v = f.speed || 0;
    if (v > 0.9) return 'WALKING';
    if (v > 0.35) return 'LOOK';
    if (v > 0.12) return 'GLANCE';
    return 'STILL';
  }

  // "MODEL 01 · LOOK 0.96" or "OBJECT 03 · CAR 0.91" on a light or dark tag.
  function label(f) {
    const fs = Math.max(10, Math.min(14, f.w * 0.045));
    ctx.font = `500 ${fs}px ${MONO}`;
    ctx.textBaseline = 'middle';
    const what = f.name ? (activity(f) === 'STILL' ? f.name : `${f.name} ${activity(f)}`) : activity(f);
    const text = `${f.word} ${String(f.look).padStart(2, '0')} \u00b7 ${what} ${f.score.toFixed(2)}`;
    const tw = ctx.measureText(text).width;
    const pad = fs * 0.5;
    const y = f.y - fs * 1.4;
    ctx.fillStyle = f.dark ? 'rgba(12, 12, 14, 0.88)' : 'rgba(245, 243, 238, 0.92)';
    ctx.fillRect(f.x, y - fs * 0.75, tw + pad * 2, fs * 1.5);
    ctx.fillStyle = f.dark ? '#f2f0ea' : '#111';
    ctx.fillText(text, f.x + pad, y);
  }

  // Grey readout beside the box: distance covered and pace.
  function readout(f) {
    const fs = Math.max(10, Math.min(13, f.w * 0.04));
    ctx.font = `400 ${fs}px ${MONO}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(235, 233, 228, 0.75)';
    const x = f.x + f.w + fs;
    ctx.fillText(`G${f.look} \u2192 G${f.look + 1} \u00b7 ${(2 + f.travel).toFixed(1)} M`, x, f.y + fs * 0.4);
    ctx.fillText(`PACE ${(f.speed * 1.6).toFixed(1)} M/S`, x, f.y + fs * 1.8);
  }

  function draw(now, amount) {
    resize();
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.strokeStyle = 'rgba(245, 243, 238, 0.9)';
    ctx.lineWidth = 1.5;
    for (const mode of Object.keys(amount)) {
      const a = amount[mode];
      for (const f of state[mode].items) {
        // Faces get a finder a touch larger than the detector's box.
        const g = mode === 'face' ? { ...f, x: f.x - f.w * 0.12, y: f.y - f.h * 0.18, w: f.w * 1.24, h: f.h * 1.3 } : f;
        brackets(g.x, g.y, g.w, g.h);
        if (a > 0.2) label(g);
        if (a > 0.4) readout(g);
        if (a > 0.55) trail(mode === 'face' ? jaw(f) : drop(f), now, f.born);
        if (a > 0.75) trail(sideline(f), now, f.born + 300);
      }
    }
  }

  // How much of the HUD shows: brackets, tag, readout, dot trail; the line to
  // the screen edge (above 0.75) is left out.
  const AMOUNT = { face: 0.7, object: 0.7 };
  let lastFrame = 0;

  // Called by canvasFilters.source() with each frame an artwork draws.
  function frame(src) {
    const now = performance.now();
    if (!src || now - lastFrame < 8) return; // once per animation frame
    lastFrame = now;
    ensureCanvas();
    for (const mode of Object.keys(MODES)) {
      if (!state[mode]) state[mode] = { detector: null, loading: false, failed: false, lastDetect: 0, items: [], count: 0 };
      if (!state[mode].detector) load(mode);
      track(mode, src, now);
    }
    canvas.style.display = 'block';
    draw(now, AMOUNT);
  }

  // No frames for a moment (ident, splash, artwork switching): clear the
  // boxes rather than leave them frozen on screen.
  setInterval(() => { if (canvas && performance.now() - lastFrame > 500) hide(); }, 500);

  function hide() {
    if (canvas && canvas.style.display !== 'none') {
      canvas.style.display = 'none';
      Object.values(state).forEach((m) => { m.items = []; });
    }
  }

  return { frame, hide };
})();
