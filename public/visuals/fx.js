'use strict';

// GPU filter pipeline (pixelate, dither). Samples the active visual's canvas as
// a texture and runs a fragment shader onto #fx-canvas. This replaces the CPU
// getImageData filters incrementally: keys ported here are registered via
// canvasFilters.setShaderKeys() so the CPU path skips them.
//
// Fails safe: if WebGL is unavailable the module disables itself and leaves the
// CPU filters (and the overlay hack) in charge, so nothing regresses.
const fxPipeline = (() => {
  // filter key -> { name, frag } fragment shader source. Add filters here as
  // they are ported; the key must match canvasFilters' registry key.
  const SHADERS = {
    7: {
      name: 'Pixelate',
      frag: `
        precision mediump float;
        uniform sampler2D uTex;
        uniform vec2 uRes;
        uniform float uBlock;
        varying vec2 vUv;
        void main() {
          vec2 coord = vUv * uRes;
          vec2 q = (floor(coord / uBlock) + 0.5) * uBlock;
          gl_FragColor = texture2D(uTex, q / uRes);
        }
      `,
      block: () => Math.max(4, window._pixelBlockSize || 16),
    },
    // Ordered (Bayer 8x8) dither in two inks, one decision per cell. The CPU
    // version read back the whole frame every tick; here it is one pass.
    10: {
      name: 'Dither',
      frag: `
        precision mediump float;
        uniform sampler2D uTex;
        uniform vec2 uRes;
        uniform float uBlock;
        uniform float uMode;
        varying vec2 vUv;
        float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          vec2 cell = floor(vUv * uRes / uBlock);
          vec2 c = (cell + 0.5) * uBlock;
          float d = uBlock * 0.25;
          // Four taps per cell so a moving picture doesn't shimmer.
          vec3 rgb = texture2D(uTex, (c + vec2(-d, -d)) / uRes).rgb
                   + texture2D(uTex, (c + vec2( d, -d)) / uRes).rgb
                   + texture2D(uTex, (c + vec2(-d,  d)) / uRes).rgb
                   + texture2D(uTex, (c + vec2( d,  d)) / uRes).rgb;
          rgb *= 0.25;
          float b = bayer8(cell) + 0.5 / 64.0;
          if (uMode > 1.5) {
            // colour: each channel dithered to four levels
            gl_FragColor = vec4(floor(rgb * 3.0 + b) / 3.0, 1.0);
            return;
          }
          bool ink = (1.0 - dot(rgb, vec3(0.299, 0.587, 0.114))) > b;
          vec3 inkC = uMode > 0.5 ? vec3(0.02, 0.08, 0.04) : vec3(0.102, 0.102, 0.102);
          vec3 paperC = uMode > 0.5 ? vec3(0.30, 1.0, 0.53) : vec3(0.914, 0.902, 0.875);
          gl_FragColor = vec4(ink ? inkC : paperC, 1.0);
        }
      `,
      // Resonance picks the inks: left green phosphor, centre (its rest
      // position) cream on black, right full colour.
      mode: () => {
        const r = window._resonanceVal ?? 50;
        return r < 34 ? 1 : r < 67 ? 0 : 2;
      },
      // Same cell size as the CPU version: the cutoff dial drives it, and the
      // scale comes from the sampled canvas so pixelDensity(1) artwork keeps
      // the same CSS-pixel grid.
      block: (scale = 1) => canvasFilters.ditherCell(scale),
    },
    // Red and blue pulled apart sideways, wobbling; same numbers as the CPU
    // version, which read back the whole frame twice per tick.
    4: {
      name: 'Chromatic Aberration',
      frag: `
        precision mediump float;
        uniform sampler2D uTex;
        uniform vec2 uRes;
        uniform float uBlock;
        varying vec2 vUv;
        void main() {
          vec2 d = vec2(uBlock / uRes.x, 0.0);
          vec4 c = texture2D(uTex, vUv);
          gl_FragColor = vec4(texture2D(uTex, vUv + d).r, c.g, texture2D(uTex, vUv - d).b, c.a);
        }
      `,
      // uBlock carries the shift in pixels: cutoff sets it, resonance the wobble.
      block: () => {
        const resonance = (window.soundSensitivity ?? 50) / 100;
        const base = Math.max(1, Math.round((window.ledThreshold || 40) / 10));
        const frame = performance.now() / (1000 / 60);
        return base + Math.sin(frame * 0.02) * (2 + resonance * 10);
      },
    },
    12: {
      name: 'Black & White',
      frag: `
        precision mediump float;
        uniform sampler2D uTex;
        uniform float uBlock;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(uTex, vUv);
          float l = (dot(c.rgb, vec3(0.299, 0.587, 0.114)) - 0.5) * uBlock + 0.5;
          gl_FragColor = vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
        }
      `,
      // uBlock carries the contrast here (cutoff dial).
      block: () => (window.monoContrast ? window.monoContrast() : 1.2),
    },
  };

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  let canvas = null;
  let gl = null;
  let disabled = false;
  let tex = null;
  let quad = null;
  const programs = new Map(); // key -> { program, loc:{aPos,uTex,uRes,uBlock} }

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('fx shader compile failed:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  function buildProgram(frag) {
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
    return {
      program: p,
      loc: {
        aPos: gl.getAttribLocation(p, 'aPos'),
        uTex: gl.getUniformLocation(p, 'uTex'),
        uRes: gl.getUniformLocation(p, 'uRes'),
        uBlock: gl.getUniformLocation(p, 'uBlock'),
        uMode: gl.getUniformLocation(p, 'uMode'),
      },
    };
  }

  function init() {
    canvas = document.getElementById('fx-canvas');
    if (!canvas) { disabled = true; return; }
    gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })
      || canvas.getContext('experimental-webgl');
    if (!gl) { disabled = true; return; }

    // full-screen quad (triangle strip)
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1, 1, 1,
    ]), gl.STATIC_DRAW);

    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    for (const key of Object.keys(SHADERS)) {
      const prog = buildProgram(SHADERS[key].frag);
      if (prog) programs.set(parseInt(key, 10), prog);
    }
    if (!programs.size) { disabled = true; return; }

    // Tell the CPU filter path to skip the keys we handle on the GPU.
    canvasFilters.setShaderKeys([...programs.keys()]);
    // Only run the render loop while a shader filter is on (perf: no idle rAF).
    canvasFilters.setOnFilterChange(syncLoop);
    syncLoop();
  }

  let running = false;
  function syncLoop() {
    if (disabled || running) return;
    if (activeShaderKey() != null) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  // The active visual's canvas (p5 default, the blocks canvas, or giphy's
  // overlay, which carries the GIF frame while a filter is on).
  function sourceCanvas() {
    const p5c = document.querySelector('canvas#defaultCanvas0');
    if (p5c && p5c.width > 0 && getComputedStyle(p5c).display !== 'none') return p5c;
    const block = document.getElementById('block-canvas');
    if (block && block.width > 0 && getComputedStyle(block).display !== 'none') return block;
    const overlay = document.getElementById('overlay-canvas');
    if (overlay && overlay.width > 0 && getComputedStyle(overlay).display !== 'none') return overlay;
    return null;
  }

  // First active key that has a shader program.
  function activeShaderKey() {
    for (const key of programs.keys()) {
      if (canvasFilters.hasActiveKey(key)) return key;
    }
    return null;
  }

  function hide() {
    if (canvas && canvas.style.display !== 'none') canvas.style.display = 'none';
  }

  function render(key, src) {
    const prog = programs.get(key);
    if (!prog) return;
    if (canvas.width !== src.width || canvas.height !== src.height) {
      canvas.width = src.width;
      canvas.height = src.height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.bindTexture(gl.TEXTURE_2D, tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (e) {
      return; // source not readable this frame
    }

    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(prog.loc.aPos);
    gl.vertexAttribPointer(prog.loc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(prog.loc.uTex, 0);
    gl.uniform2f(prog.loc.uRes, canvas.width, canvas.height);
    // Canvas pixels per CSS pixel, so shaders can size things in screen terms
    // whatever pixel density the artwork draws at.
    const scale = src.clientWidth ? src.width / src.clientWidth : 1;
    gl.uniform1f(prog.loc.uBlock, SHADERS[key].block(scale));
    if (prog.loc.uMode) gl.uniform1f(prog.loc.uMode, SHADERS[key].mode ? SHADERS[key].mode() : 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Alpha knob: fade the shader output over the untouched visual below.
    canvas.style.opacity = String(Math.max(0, Math.min(100, window.filterStrength ?? 100)) / 100);
    // The stylesheet hides #fx-canvas, so the inline style starts empty, not 'none'.
    if (canvas.style.display !== 'block') canvas.style.display = 'block';
  }

  function loop() {
    if (disabled) { running = false; return; }
    const key = activeShaderKey();
    if (key == null) {          // filter turned off -> hide and stop the loop
      hide();
      running = false;
      return;
    }
    const src = sourceCanvas();
    if (src) render(key, src);
    requestAnimationFrame(loop);
  }

  return { init, get disabled() { return disabled; } };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => fxPipeline.init());
} else {
  fxPipeline.init();
}
