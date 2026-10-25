'use strict';

// The Face Track filter's overlay: a machine looking at whoever is on screen.
// MediaPipe's face detector (loaded only when the filter is first switched on)
// finds faces in the artwork's canvas; each gets corner brackets,  running from
// the ears along the jaw. The dot screen itself is the shader in filters.js.
//
// Model: blaze_face_short_range (vendored in lib/face/), WASM from jsdelivr.
const faceHud = (() => {
  const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'visuals/lib/face/blaze_face_short_range.tflite';
  const ORANGE = '#ff5a1f';
  const MONO = '"IBM Plex Mono", "Courier New", monospace';

  let detector = null;
  let loading = false;
  let failed = false;
  let canvas = null;
  let ctx = null;
  let lastDetect = 0;
  let faces = [];          // smoothed: { x, y, w, h, score, kp: [[x,y]...], look, seen }
  let looks = 0;

  async function load() {
    if (detector || loading || failed) return;
    loading = true;
    try {
      const vision = await import(`${LIB}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${LIB}/wasm`);
      const make = (delegate) => vision.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.55,
      });
      detector = await make('GPU').catch(() => make('CPU'));
    } catch (e) {
      failed = true;
      console.warn('face track: detector failed to load', e);
    }
    loading = false;
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

  // New detections in screen pixels, eased into the tracked faces so the
  // brackets glide instead of jumping.
  function track(src, now) {
    if (!detector || now - lastDetect < 90) return;
    lastDetect = now;
    let res;
    try { res = detector.detectForVideo(src, now); } catch (e) { return; }
    const sx = innerWidth / src.width;
    const sy = innerHeight / src.height;
    const found = (res.detections || []).map((d) => {
      const b = d.boundingBox;
      return {
        x: b.originX * sx, y: b.originY * sy, w: b.width * sx, h: b.height * sy,
        score: d.categories && d.categories[0] ? d.categories[0].score : 0,
        kp: (d.keypoints || []).map((k) => [k.x * innerWidth, k.y * innerHeight]),
      };
    });
    const next = [];
    for (const f of found) {
      const cx = f.x + f.w / 2;
      const cy = f.y + f.h / 2;
      let best = null;
      let bestD = Infinity;
      for (const o of faces) {
        const d = Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy);
        if (d < bestD && d < Math.max(f.w, o.w)) { best = o; bestD = d; }
      }
      if (best) {
        const k = 0.45;
        ['x', 'y', 'w', 'h', 'score'].forEach((p) => { best[p] += (f[p] - best[p]) * k; });
        best.kp = f.kp.map((p, i) => (best.kp[i] ? [best.kp[i][0] + (p[0] - best.kp[i][0]) * k, best.kp[i][1] + (p[1] - best.kp[i][1]) * k] : p));
        // Speed in face-widths per second, eased, for the state and pace.
        const dt = Math.max(1, now - best.seen) / 1000;
        const v = bestD / Math.max(1, f.w) / dt;
        best.speed = (best.speed || 0) * 0.8 + v * 0.2;
        best.travel = (best.travel || 0) + bestD / Math.max(1, f.w) * 0.18;
        best.seen = now;
        next.push(best);
      } else {
        looks = (looks % 99) + 1;
        const word = ['MODEL', 'PAYLOAD', 'SUBJECT'][looks % 3];
        next.push({ ...f, look: looks, word, dark: looks % 2 === 0, born: now, seen: now, speed: 0, travel: 0 });
      }
    }
    // Keep a lost face a moment, so a missed frame doesn't blink the box.
    for (const o of faces) if (!next.includes(o) && now - o.seen < 400) next.push(o);
    faces = next;
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

  // What the face is doing, from how fast its box moves.
  function state(f) {
    const v = f.speed || 0;
    if (v > 0.9) return 'WALKING';
    if (v > 0.35) return 'LOOK';
    if (v > 0.12) return 'GLANCE';
    return 'STILL';
  }

  // "MODEL 01 · LOOK 0.96" on a light or dark tag above the box.
  function label(f) {
    const fs = Math.max(10, Math.min(14, f.w * 0.045));
    ctx.font = `500 ${fs}px ${MONO}`;
    ctx.textBaseline = 'middle';
    const text = `${f.word} ${String(f.look).padStart(2, '0')} \u00b7 ${state(f)} ${f.score.toFixed(2)}`;
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
    for (const f of faces) {
      // A touch larger than the detector's box, as on a camera's finder.
      const g = { ...f, x: f.x - f.w * 0.12, y: f.y - f.h * 0.18, w: f.w * 1.24, h: f.h * 1.3 };
      brackets(g.x, g.y, g.w, g.h);
      if (amount > 0.2) label(g);
      if (amount > 0.4) readout(g);
      if (amount > 0.55) trail(jaw(f), now, f.born);
      if (amount > 0.75) trail(sideline(f), now, f.born + 300);
    }
  }

  // Called by the FX unit every rendered frame: the source canvas and the
  // filter's second parameter (how much HUD), or null to clear.
  function frame(src, amount) {
    if (src == null) { hide(); return; }
    ensureCanvas();
    if (!detector) load();
    const now = performance.now();
    track(src, now);
    canvas.style.display = 'block';
    draw(now, amount);
  }

  function hide() {
    if (canvas && canvas.style.display !== 'none') {
      canvas.style.display = 'none';
      faces = [];
    }
  }

  return { frame, hide };
})();
