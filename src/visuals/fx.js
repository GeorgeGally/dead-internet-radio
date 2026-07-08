'use strict';

// GPU filter pipeline (proof: pixelate). Samples the active visual's canvas as
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

  // The active visual's canvas (p5 default, or the blocks canvas).
  function sourceCanvas() {
    const p5c = document.querySelector('canvas#defaultCanvas0');
    if (p5c && p5c.width > 0 && getComputedStyle(p5c).display !== 'none') return p5c;
    const block = document.getElementById('block-canvas');
    if (block && block.width > 0 && getComputedStyle(block).display !== 'none') return block;
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
    gl.uniform1f(prog.loc.uBlock, Math.max(4, window._pixelBlockSize || 16));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    if (canvas.style.display === 'none') canvas.style.display = 'block';
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
