'use strict';

// The FX unit, laid out like a Traktor effects unit: three slots, each holding
// one filter that can be switched on or off, two parameter knobs that act on
// the focused slot, and a dry/wet dial over the whole chain.
//
// Every filter is a fragment shader. Each frame the visible artwork's canvas
// is uploaded once, run through the slots that are on (in slot order, ping-
// ponging between two framebuffers), then mixed with the untouched picture by
// dry/wet onto #fx-canvas, which sits above every artwork. Because the chain
// reads whatever canvas the artwork draws into, a new artwork works with every
// filter as long as it calls canvasFilters.applyToP5(p) at the end of draw();
// without the call the unit still finds the visible canvas, a frame late.
//
// Parameters are 0-1. Sizes are in CSS pixels (uScale converts), so a filter
// looks the same on a pixelDensity(1) artwork and a retina one.
const canvasFilters = (() => {
  const COMMON = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform vec2 uRes;
    uniform float uP1;
    uniform float uP2;
    uniform float uTime;
    uniform float uScale;
    uniform float uLevel;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
  `;

  const DOT_SCREEN = `
      vec2 px = vUv * uRes;
      float cell = mix(2.5, 7.0, uP1) * uScale;
      vec2 f = fract(px / cell) - 0.5;
      float m = 1.0 - smoothstep(0.3, 0.5, length(f));
      vec4 c = texture2D(uTex, vUv);
      return vec4(c.rgb * mix(0.45, 1.2, m), c.a);`;

  // key: the old number-key binding, kept so saved slots and keys still work.
  const FILTERS = [
    { key: 1, name: 'Scanlines', params: [['spacing', 0.35], ['depth', 0.6]], body: `
      vec4 c = texture2D(uTex, vUv);
      float s = mix(2.0, 16.0, uP1) * uScale;
      float y = vUv.y * uRes.y + uTime * 18.0 * uScale;
      float line = step(0.5, fract(y / s));
      float roll = smoothstep(0.0, 0.08, abs(fract(vUv.y + uTime * 0.07) - 0.5)) * 0.12 + 0.88;
      return vec4(c.rgb * (1.0 - uP2 * 0.9 * line) * roll, c.a);` },

    { key: 2, name: 'Circle Sampling', params: [['size', 0.35], ['gain', 0.5]], body: `
      vec2 px = vUv * uRes;
      float cell = mix(5.0, 44.0, uP1) * uScale;
      vec2 c = (floor(px / cell) + 0.5) * cell;
      vec4 s = texture2D(uTex, c / uRes);
      float r = sqrt(luma(s.rgb)) * cell * 0.5 * mix(0.6, 1.5, uP2) * (1.0 + uLevel * 0.25);
      float a = 1.0 - smoothstep(r - uScale, r, length(px - c));
      return vec4(s.rgb * a, 1.0);` },

    { key: 3, name: 'Static Noise', params: [['amount', 0.4], ['grain', 0.2]], body: `
      vec4 c = texture2D(uTex, vUv);
      float g = mix(1.0, 8.0, uP2) * uScale;
      float n = hash(floor(vUv * uRes / g) + floor(uTime * 30.0) * 17.0);
      float amt = uP1 * (0.6 + uLevel * 0.6);
      return vec4(mix(c.rgb, vec3(n), clamp(amt, 0.0, 1.0)), c.a);` },

    { key: 4, name: 'Chromatic Aberration', params: [['shift', 0.3], ['wobble', 0.4]], body: `
      float px = (uP1 * 30.0 + uLevel * uP2 * 24.0) * (1.0 + sin(uTime * 1.7) * uP2 * 0.6) * uScale;
      vec2 d = vec2(px / uRes.x, 0.0);
      vec4 c = texture2D(uTex, vUv);
      return vec4(texture2D(uTex, vUv + d).r, c.g, texture2D(uTex, vUv - d).b, c.a);` },

    { key: 5, name: 'VHS Tracking', params: [['tracking', 0.4], ['bleed', 0.4]], body: `
      float bandH = 24.0 * uScale;
      float row = floor(vUv.y * uRes.y / bandH);
      float tick = floor(uTime * 10.0);
      float h = hash(vec2(row, tick));
      float jump = step(1.0 - uP1 * 0.5, h) * (hash(vec2(row + 3.1, tick)) - 0.5) * uP1 * 0.12;
      float wave = sin(vUv.y * 40.0 + uTime * 3.0) * 0.0015 * uP1;
      vec2 uv = vec2(vUv.x + jump + wave, vUv.y);
      float b = uP2 * 8.0 * uScale / uRes.x;
      vec3 c = vec3(texture2D(uTex, uv + vec2(b, 0.0)).r, texture2D(uTex, uv).g, texture2D(uTex, uv - vec2(b, 0.0)).b);
      c = mix(c, vec3(luma(c)), 0.25);
      float noise = step(0.995 - uP1 * 0.01, hash(vec2(floor(vUv.y * uRes.y / uScale), tick)));
      return vec4(c + noise * 0.5, 1.0);` },

    { key: 6, name: 'Posterize', params: [['levels', 0.5], ['mono', 0.0]], body: `
      vec4 c = texture2D(uTex, vUv);
      float n = floor(mix(8.0, 2.0, uP1));
      vec3 col = mix(c.rgb, vec3(luma(c.rgb)), uP2);
      return vec4(floor(col * n + 0.5) / n, c.a);` },

    { key: 7, name: 'Pixelate', params: [['size', 0.3], ['stretch', 0.0]], body: `
      float s = mix(4.0, 64.0, uP1 * uP1) * uScale;
      vec2 cell = vec2(s * (1.0 + uP2 * 4.0), s);
      vec2 q = (floor(vUv * uRes / cell) + 0.5) * cell;
      return texture2D(uTex, q / uRes);` },

    { key: 8, name: 'Color Invert', params: [['solarize', 0.0], ['hue', 0.0]], body: `
      vec4 c = texture2D(uTex, vUv);
      vec3 inv = 1.0 - c.rgb;
      // Solarize: only what is brighter than the threshold flips.
      vec3 sol = mix(c.rgb, inv, step(vec3(1.0 - uP1), c.rgb));
      vec3 col = uP1 > 0.01 ? sol : inv;
      // Hue turn in YIQ.
      float a = uP2 * 6.2832;
      float Y = dot(col, vec3(0.299, 0.587, 0.114));
      float I = dot(col, vec3(0.596, -0.274, -0.322));
      float Q = dot(col, vec3(0.211, -0.523, 0.312));
      float I2 = I * cos(a) - Q * sin(a);
      float Q2 = I * sin(a) + Q * cos(a);
      col = vec3(Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2);
      return vec4(col, c.a);` },

    { key: 9, name: 'LED Grid', params: [['size', 0.3], ['cutoff', 0.25]], body: `
      vec2 px = vUv * uRes;
      float cell = mix(5.0, 28.0, uP1) * uScale;
      vec2 c = (floor(px / cell) + 0.5) * cell;
      vec3 s = texture2D(uTex, c / uRes).rgb;
      float l = luma(s);
      float lit = smoothstep(uP2 * 0.8, uP2 * 0.8 + 0.08, l);
      float d = length(px - c) / (cell * 0.5);
      float disc = 1.0 - smoothstep(0.62, 0.8, d);
      float glow = (1.0 - smoothstep(0.0, 1.0, d)) * 0.35;
      vec3 led = s / max(0.35, max(s.r, max(s.g, s.b)));
      vec3 col = mix(vec3(0.07), led, lit) * disc + led * glow * lit;
      return vec4(col + vec3(0.03), 1.0);` },

    { key: 10, name: 'Dither', params: [['cell', 0.15], ['inks', 0.5]], body: `
      float block = mix(2.0, 14.0, uP1) * uScale;
      vec2 cell = floor(vUv * uRes / block);
      vec2 c = (cell + 0.5) * block;
      float d = block * 0.25;
      vec3 rgb = (texture2D(uTex, (c + vec2(-d, -d)) / uRes).rgb
                + texture2D(uTex, (c + vec2( d, -d)) / uRes).rgb
                + texture2D(uTex, (c + vec2(-d,  d)) / uRes).rgb
                + texture2D(uTex, (c + vec2( d,  d)) / uRes).rgb) * 0.25;
      float b = bayer8(cell) + 0.5 / 64.0;
      // Inks: left green phosphor, middle ink on paper, right full colour.
      if (uP2 > 0.66) return vec4(floor(rgb * 3.0 + b) / 3.0, 1.0);
      bool ink = (1.0 - luma(rgb)) > b;
      bool green = uP2 < 0.33;
      vec3 inkC = green ? vec3(0.02, 0.08, 0.04) : vec3(0.102);
      vec3 paperC = green ? vec3(0.30, 1.0, 0.53) : vec3(0.914, 0.902, 0.875);
      return vec4(ink ? inkC : paperC, 1.0);` },

    // Bursts of torn horizontal slices: a few frames of damage, then clean
    // picture. Amount sets how often (bass hits add bursts), blocks how thick
    // the slices are. The split colour lives only inside a torn slice.
    { key: 11, name: 'Glitch', params: [['amount', 0.4], ['blocks', 0.4]], body: `
      float tick = floor(uTime * 14.0);
      float burst = step(1.0 - (uP1 * 0.45 + uLevel * uP1 * 0.6), hash(vec2(tick, 7.3)));
      float sliceH = mix(4.0, 70.0, uP2) * uScale;
      float row = floor(vUv.y * uRes.y / sliceH);
      float torn = burst * step(0.62, hash(vec2(row, tick)));
      float shift = (hash(vec2(row * 1.3, tick + 2.0)) - 0.5) * 0.12 * torn;
      vec2 uv = vec2(fract(vUv.x + shift), vUv.y);
      float split = torn * (4.0 + uP1 * 10.0) * uScale / uRes.x;
      vec4 c = texture2D(uTex, uv);
      vec3 col = vec3(texture2D(uTex, uv + vec2(split, 0.0)).r, c.g, texture2D(uTex, uv - vec2(split, 0.0)).b);
      return vec4(col, c.a);` },

    { key: 12, name: 'Black & White', params: [['contrast', 0.3], ['grain', 0.15]], body: `
      vec4 c = texture2D(uTex, vUv);
      float k = mix(0.8, 3.5, uP1);
      float l = (luma(c.rgb) - 0.5) * k + 0.5;
      l += (hash(vUv * uRes + floor(uTime * 24.0)) - 0.5) * uP2 * 0.5;
      return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);` },

    { key: 13, name: 'Mirror', params: [['folds', 0.2], ['spin', 0.0]], body: `
      vec2 p = vUv - 0.5;
      p.x *= uRes.x / uRes.y;
      float n = 2.0 + floor(uP1 * 6.99) * 1.0;
      float seg = 6.2832 / n;
      float a = atan(p.y, p.x) + uTime * uP2 * 0.8;
      a = mod(a, seg);
      a = abs(a - seg * 0.5);
      vec2 q = vec2(cos(a), sin(a)) * length(p);
      q.x /= uRes.x / uRes.y;
      return texture2D(uTex, clamp(q + 0.5, 0.0, 1.0));` },

    { key: 14, name: 'Edges', params: [['edges', 0.5], ['colour', 0.0]], body: `
      vec2 t = (1.0 + uP1 * 2.0) * uScale / uRes;
      float tl = luma(texture2D(uTex, vUv + vec2(-t.x,  t.y)).rgb);
      float tc = luma(texture2D(uTex, vUv + vec2( 0.0,  t.y)).rgb);
      float tr = luma(texture2D(uTex, vUv + vec2( t.x,  t.y)).rgb);
      float ml = luma(texture2D(uTex, vUv + vec2(-t.x,  0.0)).rgb);
      float mr = luma(texture2D(uTex, vUv + vec2( t.x,  0.0)).rgb);
      float bl = luma(texture2D(uTex, vUv + vec2(-t.x, -t.y)).rgb);
      float bc = luma(texture2D(uTex, vUv + vec2( 0.0, -t.y)).rgb);
      float br = luma(texture2D(uTex, vUv + vec2( t.x, -t.y)).rgb);
      float gx = tr + 2.0 * mr + br - tl - 2.0 * ml - bl;
      float gy = tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
      float e = clamp(length(vec2(gx, gy)) * (1.0 + uP1 * 3.0), 0.0, 1.0);
      vec3 c = texture2D(uTex, vUv).rgb;
      return vec4(mix(vec3(e), c * e * 1.6 + c * 0.15, uP2), 1.0);` },

    // The picture through a fine dot screen; track_hud.js draws the tracking
    // overlay (brackets, tag, dot trails) on top. p2 is how much of it.
    { key: 15, name: 'Face Track', params: [['screen', 0.35], ['hud', 0.8]], hud: 'face', body: DOT_SCREEN },
    // The same, for everyday objects: people, cars, dogs, cups, phones.
    { key: 17, name: 'Object Track', params: [['screen', 0.35], ['hud', 0.8]], hud: 'object', body: DOT_SCREEN },

    // Thin semi-transparent diagonal lines laid over the picture.
    { key: 16, name: 'Diagonals', params: [['spacing', 0.3], ['opacity', 0.35]], body: `
      vec4 c = texture2D(uTex, vUv);
      vec2 px = vUv * uRes;
      float s = mix(4.0, 28.0, uP1) * uScale;
      float d = fract((px.x + px.y) / s);
      float line = 1.0 - smoothstep(0.0, uScale * 1.2 / s, min(d, 1.0 - d));
      return vec4(mix(c.rgb, vec3(1.0), line * uP2), c.a);` },
  ];
  const byKey = new Map(FILTERS.map((f) => [f.key, f]));

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;
  // Last pass: the untouched picture under the chain's output, by dry/wet.
  const MIX = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform sampler2D uFx;
    uniform float uWet;
    varying vec2 vUv;
    void main() {
      gl_FragColor = mix(texture2D(uTex, vUv), texture2D(uFx, vUv), uWet);
    }
  `;

  // ---- State ----
  const blank = () => ({ key: null, on: false, p: [0.5, 0.5] });
  const slots = [blank(), blank(), blank()];
  let focus = 0;
  let wet = 1;          // target, 0-1
  let wetNow = 1;       // eased toward target each frame
  const listeners = new Set();

  function notify() {
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
    wake();
  }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function defaults(key) {
    const f = byKey.get(key);
    return f ? f.params.map(([, v]) => v) : [0.5, 0.5];
  }
  function setSlotFilter(i, key) {
    const s = slots[i];
    if (!s) return;
    key = byKey.has(key) ? key : null;
    if (s.key === key) return;
    s.key = key;
    s.p = defaults(key);
    if (key == null) s.on = false;
    notify();
  }
  function setSlotOn(i, on) {
    const s = slots[i];
    if (!s || (on && s.key == null)) return;
    s.on = !!on;
    notify();
  }
  function setParam(i, j, v) {
    const s = slots[i];
    if (!s) return;
    s.p[j] = Math.max(0, Math.min(1, v));
    notify();
  }
  function setFocus(i) {
    if (i < 0 || i > 2 || i === focus) return;
    focus = i;
    notify();
  }
  // Drag a slot to another position in the chain; focus follows its slot.
  function moveSlot(from, to) {
    if (from === to || !slots[from] || to < 0 || to > 2) return;
    const focused = slots[focus];
    const [moved] = slots.splice(from, 1);
    slots.splice(to, 0, moved);
    focus = slots.indexOf(focused);
    notify();
  }
  function setWet(v) {
    wet = Math.max(0, Math.min(1, v));
    window.filterStrength = wet * 100;
    notify();
  }

  // Snapshot for slot presets: [[key, on, p1, p2] x3].
  function getState() {
    return { slots: slots.map((s) => [s.key, s.on, s.p[0], s.p[1]]), focus };
  }
  function setState(st) {
    for (let i = 0; i < 3; i++) {
      const [key, on, p1, p2] = (st && st.slots && st.slots[i]) || [null, false];
      slots[i].key = byKey.has(key) ? key : null;
      slots[i].on = !!on && slots[i].key != null;
      const d = defaults(slots[i].key);
      slots[i].p = [p1 ?? d[0], p2 ?? d[1]];
    }
    if (st && st.focus != null) focus = st.focus;
    notify();
  }

  // ---- Old single-filter API, still used by keys, presets and app.js ----
  // Picking a filter puts it in the focused slot and turns it on.
  function setActive(key) {
    const s = slots[focus];
    if (s.key !== key) { s.key = byKey.has(key) ? key : null; s.p = defaults(s.key); }
    s.on = s.key != null;
    notify();
  }
  function toggleActive(key) {
    const s = slots[focus];
    if (s.key === key && s.on) { s.on = false; notify(); } else setActive(key);
  }
  function clearActive() {
    slots.forEach((s) => { s.on = false; });
    notify();
  }
  function getActiveKeys() {
    return new Set(slots.filter((s) => s.on).map((s) => s.key));
  }
  function hasActiveKey(key) {
    return slots.some((s) => s.on && s.key === key);
  }
  function getActiveName() {
    const names = slots.filter((s) => s.on).map((s) => byKey.get(s.key).name);
    return names.length ? names.join(' + ') : 'none';
  }
  function setStrength(val) { setWet(val / 100); }
  // The LED Grid artwork still reads the cutoff dial through this.
  function setThreshold(val) { window.ledThreshold = val; }

  // ---- GPU ----
  let canvas = null;
  let gl = null;
  let disabled = false;
  let quad = null;
  let srcTex = null;
  let targets = [];       // two { fb, tex, w, h } for ping-pong
  const programs = new Map(); // filter key -> program info; 'mix' -> mix program

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('fx shader compile failed:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  function build(frag) {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('fx program link failed:', gl.getProgramInfoLog(p));
      return null;
    }
    const loc = {};
    ['uTex', 'uFx', 'uRes', 'uP1', 'uP2', 'uTime', 'uScale', 'uLevel', 'uWet'].forEach((n) => { loc[n] = gl.getUniformLocation(p, n); });
    loc.aPos = gl.getAttribLocation(p, 'aPos');
    return { program: p, loc };
  }
  function texture() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  function ensureTargets(w, h) {
    if (targets.length && targets[0].w === w && targets[0].h === h) return;
    targets.forEach((t) => { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); });
    targets = [0, 1].map(() => {
      const tex = texture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { fb, tex, w, h };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function init() {
    canvas = document.getElementById('fx-canvas');
    if (!canvas) { disabled = true; return; }
    gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true });
    if (!gl) { disabled = true; console.warn('fx: no WebGL, filters off'); return; }
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    srcTex = texture();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    for (const f of FILTERS) {
      const prog = build(`${COMMON}\nvec4 fx() {${f.body}\n}\nvoid main() { gl_FragColor = fx(); }`);
      if (prog) programs.set(f.key, prog);
    }
    const mix = build(MIX);
    if (mix) programs.set('mix', mix);
    else disabled = true;
    wake();
  }

  // Bass level 0-1 for the filters that answer the music, scaled by the
  // sensitivity dial. Own buffer, so the artworks' frequencyData is untouched.
  let bins = null;
  function level() {
    try {
      if (!(audioAnalysisReady && analyser)) return 0;
      if (!bins || bins.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 1; i < 10; i++) sum += bins[i];
      return Math.min(1, (sum / 9 / 255) * ((window.audioInputGain ?? 50) / 50));
    } catch (e) {
      return 0;
    }
  }

  function pass(prog, input, target, w, h, s, scale, lvl) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(prog.loc.aPos);
    gl.vertexAttribPointer(prog.loc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(prog.loc.uTex, 0);
    gl.uniform2f(prog.loc.uRes, w, h);
    gl.uniform1f(prog.loc.uP1, s.p[0]);
    gl.uniform1f(prog.loc.uP2, s.p[1]);
    gl.uniform1f(prog.loc.uTime, performance.now() / 1000);
    gl.uniform1f(prog.loc.uScale, scale);
    gl.uniform1f(prog.loc.uLevel, lvl);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function anyOn() { return slots.some((s) => s.on); }

  function hide() {
    if (canvas && canvas.style.display !== 'none') canvas.style.display = 'none';
    if (typeof trackHud !== 'undefined') trackHud.hide();
  }

  function render(src) {
    if (disabled || !gl || !src || !src.width || !src.height) return;
    const w = src.width;
    const h = src.height;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (e) {
      return; // not readable this frame
    }
    ensureTargets(w, h);
    wetNow += (wet - wetNow) * 0.15;
    if (Math.abs(wet - wetNow) < 0.002) wetNow = wet;
    const scale = src.clientWidth ? w / src.clientWidth : 1;
    const lvl = level();
    let input = srcTex;
    let n = 0;
    for (const s of slots) {
      if (!s.on) continue;
      const prog = programs.get(s.key);
      if (!prog) continue;
      const t = targets[n % 2];
      pass(prog, input, t, w, h, s, scale, lvl);
      input = t.tex;
      n++;
    }
    const mix = programs.get('mix');
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(mix.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(mix.loc.aPos);
    gl.vertexAttribPointer(mix.loc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(mix.loc.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(mix.loc.uFx, 1);
    gl.uniform1f(mix.loc.uWet, wetNow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    if (canvas.style.display !== 'block') canvas.style.display = 'block';
    if (typeof trackHud !== 'undefined') {
      const hud = {};
      slots.forEach((x) => { if (x.on && byKey.get(x.key).hud) hud[byKey.get(x.key).hud] = x.p[1] * wetNow; });
      trackHud.frame(src, hud);
    }
  }

  // The canvas the current artwork draws into, reported by the artwork each
  // frame. Rendering right then (not in a later frame) keeps WebGL artworks,
  // whose buffers clear after compositing, readable.
  let lastSrc = null;
  let lastSrcAt = 0;
  let lastRenderAt = 0;
  function source(c) {
    if (!c) return;
    lastSrc = c;
    lastSrcAt = performance.now();
    if (!anyOn()) { hide(); return; }
    if (lastSrcAt - lastRenderAt < 6) return; // once per frame
    lastRenderAt = lastSrcAt;
    render(c);
  }

  // Fallback for artworks that never report: the visible canvas.
  function guessSource() {
    for (const sel of ['canvas#defaultCanvas0', '#block-canvas', '#overlay-canvas']) {
      const c = document.querySelector(sel);
      if (c && c.width > 0 && getComputedStyle(c).display !== 'none') return c;
    }
    return null;
  }

  let running = false;
  function wake() {
    if (disabled || running || !gl) return;
    if (!anyOn()) { hide(); return; }
    running = true;
    requestAnimationFrame(loop);
  }
  function loop() {
    if (!anyOn()) { hide(); running = false; return; }
    const now = performance.now();
    if (now - lastSrcAt > 150) {
      const c = guessSource();
      if (c) { lastRenderAt = now; render(c); } else hide();
    } else if (wetNow !== wet && now - lastRenderAt > 40 && lastSrc) {
      render(lastSrc);
    }
    requestAnimationFrame(loop);
  }

  // Artwork entry points. All three just name the canvas to filter.
  function applyToP5(p) { source(p && p.canvas); }
  function applyToOverlay(c) { source(c); }
  function apply(ctx) { source(ctx && ctx.canvas); }

  function list() {
    return FILTERS.map((f) => ({ key: f.key, name: f.name, params: f.params.map(([n]) => n) }));
  }

  function setupKeybindings() {
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key === '0') {
        e.preventDefault();
        clearActive();
        return;
      }
      const letter = e.ctrlKey || e.metaKey ? '' : e.key.toLowerCase();
      const num = { d: 10, x: 11, b: 12 }[letter] ?? parseInt(e.key, 10);
      if (byKey.has(num)) {
        e.preventDefault();
        if (e.shiftKey) toggleActive(num);
        else setActive(num);
      }
    });
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return {
    FILTERS, list, subscribe,
    getSlots: () => slots.map((s) => ({ key: s.key, on: s.on, p: s.p.slice() })),
    getFocus: () => focus,
    getWet: () => wet,
    setSlotFilter, setSlotOn, setParam, setFocus, setWet, moveSlot, getState, setState,
    setActive, toggleActive, clearActive, getActiveKeys, hasActiveKey, getActiveName,
    setStrength, setThreshold, apply, applyToOverlay, applyToP5, setupKeybindings,
  };
})();

canvasFilters.setupKeybindings();
