'use strict';

// The webcam printed into a Japanese bank passbook. Each page is a ruled
// ledger of 24 rows; the camera fills rows 1-22 in passbook characters, light
// to dark. The pink page is live, the green page prints the same view ~1.5s
// later. Cutoff sets the contrast, resonance scrambles characters, sensitivity
// sets how hard bass hits misprint a row.
visuals.register('passbook_cam', (() => {
  let myP5 = null;
  let videoEl = null;
  let stream = null;
  let cameraState = 'idle';

  const RAMP = [' ', '.', '.', ',', "'", '-', '|', '1', '7', '0', '4', '2', '5', '9', '6', '8', '*', '入', '込', '料', '数', '振', '帳', '銀'];
  const PAPER = '#f4eedb';
  const RULE = '#e2864f';
  const INKC = '#2a2622';
  const PAGES = [
    { tint: 'rgba(238,160,140,0.32)', num: 19 },
    { tint: 'rgba(150,215,160,0.32)', num: 23 },
  ];
  const HEAD = ['年 月 日', '取扱局', 'お 預 り 金 額', 'お 支 払 金 額', '現在高(貸付高)'];
  const NOTES = [
    '○ この放送は、だれも聴いていなくても続きます。',
    '○ 信号が途切れた場合は、そのままお待ちください。',
    '○ 記帳された音は、払い戻しできません。',
    '○ たまには窓を開けて、外の音も聴いてみましょう。',
  ];
  const FONT = '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "MS Gothic", monospace';
  const COLS = 34;
  const ROWS = 22;

  function openCamera() {
    if (cameraState === 'ready' || cameraState === 'asking') return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { cameraState = 'unavailable'; return; }
    cameraState = 'asking';
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        stream = s;
        videoEl = document.createElement('video');
        videoEl.srcObject = s;
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.autoplay = true;
        cameraState = 'ready';
        return videoEl.play().catch(() => {});
      })
      .catch(() => { cameraState = 'denied'; });
  }

  function closeCamera() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    if (videoEl) { videoEl.srcObject = null; videoEl = null; }
    cameraState = 'idle';
  }

  function start() {
    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    openCamera();

    myP5 = new p5((p) => {
      let ctx;
      const small = document.createElement('canvas');
      small.width = COLS;
      small.height = ROWS;
      const sctx = small.getContext('2d', { willReadFrequently: true });
      const history = []; // [time, luminance grid]
      let bassAvg = 0;
      let misprint = { row: -1, until: 0, shift: 0 };

      p.setup = () => {
        visuals.setupP5Canvas(p);
        ctx = p.drawingContext;
      };

      // Luminance grid of the camera (mirrored), or a slow drifting blob without one.
      function sample(now) {
        const out = new Float32Array(COLS * ROWS);
        if (cameraState === 'ready' && videoEl && videoEl.videoWidth > 0) {
          const vw = videoEl.videoWidth;
          const vh = videoEl.videoHeight;
          // Crop the video to the page's aspect (cells are ~2:1 tall).
          const want = (COLS * 0.55) / ROWS;
          let sw = vw;
          let sh = vw / want;
          if (sh > vh) { sh = vh; sw = vh * want; }
          sctx.save();
          sctx.translate(COLS, 0);
          sctx.scale(-1, 1);
          sctx.drawImage(videoEl, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, COLS, ROWS);
          sctx.restore();
          const d = sctx.getImageData(0, 0, COLS, ROWS).data;
          for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
          // Auto-levels: stretch the 5th-95th percentile to the full ramp, so a
          // dim or flat camera still prints every character from '.' to '銀'.
          const sorted = Array.from(out).sort((a, b) => a - b);
          const lo = sorted[Math.floor(sorted.length * 0.05)];
          const hi = sorted[Math.floor(sorted.length * 0.95)];
          // A flat picture keeps a wide range so it doesn't blow up to black.
          const span = Math.max(0.35, hi - lo);
          // The typical tone prints light (dots); only detail prints dense.
          const median = sorted[Math.floor(sorted.length / 2)];
          const base = median - span * 0.7;
          for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (out[i] - base) / span));
        } else {
          const t = now / 1000;
          for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
              const dx = (c / COLS - 0.5 - Math.sin(t * 0.3) * 0.2) * 1.6;
              const dy = r / ROWS - 0.5 - Math.cos(t * 0.23) * 0.15;
              out[r * COLS + c] = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 1.5);
            }
          }
        }
        return out;
      }

      function audio() {
        const gain = (window.audioInputGain ?? 50) / 50;
        if (!(audioAnalysisReady && analyser && frequencyData)) return { bass: 0, level: 0 };
        analyser.getByteFrequencyData(frequencyData);
        let low = 0;
        let all = 0;
        const n = Math.floor(frequencyData.length * 0.6);
        for (let i = 0; i < n; i++) all += frequencyData[i];
        for (let i = 0; i < 12; i++) low += frequencyData[i];
        return { bass: Math.min(1, (low / (12 * 255)) * gain), level: Math.min(1, (all / (n * 255)) * 2 * gain) };
      }

      function page(x, y, w, h, spec, grid, now, level) {
        const r = Math.min(w, h) * 0.02;
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();

        const pad = w * 0.035;
        const fs = h * 0.0215;
        const headH = h * 0.075;
        const colH = h * 0.03;
        const rowsTop = y + headH + colH;
        const footH = h * 0.11;
        const rowH = (h - headH - colH - footH - fs * 0.6) / 24;
        const numW = w * 0.045;
        const gx = x + pad + numW;
        const gw = w - pad * 2 - numW * 2;

        // Header: arrows, title, page number, barcode.
        ctx.fillStyle = RULE;
        ctx.textBaseline = 'middle';
        ctx.font = `600 ${fs * 1.3}px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText('↑', x + pad * 0.6, y + headH * 0.5);
        ctx.textAlign = 'right';
        ctx.fillText('↑', x + w - pad * 0.6, y + headH * 0.5);
        ctx.textAlign = 'left';
        ctx.font = `500 ${fs * 1.2}px ${FONT}`;
        ctx.fillText('普通預金', gx, y + headH * 0.5);
        ctx.font = `400 ${fs * 0.8}px ${FONT}`;
        ctx.fillText('（兼お借入明細）', gx + fs * 5, y + headH * 0.52);
        ctx.font = `400 ${fs * 2}px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(spec.num), x + w - pad - numW - fs * 6, y + headH * 0.5);
        ctx.fillStyle = INKC;
        const bx = x + w - pad - numW - fs * 5;
        for (let i = 0; i < 28; i++) {
          if ((i * 7 + spec.num) % 3) ctx.fillRect(bx + i * fs * 0.16, y + headH * 0.3, fs * (i % 4 ? 0.06 : 0.11), headH * 0.4);
        }

        // Column heads.
        const colX = [0, 0.13, 0.25, 0.48, 0.72, 1].map((f) => gx + f * gw);
        ctx.fillStyle = RULE;
        ctx.font = `400 ${fs * 0.75}px ${FONT}`;
        ctx.textAlign = 'center';
        HEAD.forEach((t, i) => ctx.fillText(t, (colX[i] + colX[i + 1]) / 2, y + headH + colH * 0.5));

        // Rows.
        const cellW = gw / COLS;
        ctx.font = `400 ${Math.min(rowH * 0.78, cellW * 1.6)}px ${FONT}`;
        const contrast = 0.6 + (((window._cutoffVal ?? 130) - 5) / 250) * 1.2;
        const res = Math.max(0, Math.min(1, ((window._resonanceVal ?? 50) - 40) / 60));
        for (let rI = 0; rI < 24; rI++) {
          const fold = rI >= 12 ? fs * 0.6 : 0;
          const ry = rowsTop + rI * rowH + fold;
          if (rI % 2 === 0) { ctx.fillStyle = spec.tint; ctx.fillRect(gx, ry, gw, rowH); }
          ctx.fillStyle = RULE;
          ctx.font = `400 ${fs * 0.7}px ${FONT}`;
          ctx.textAlign = 'left';
          ctx.fillText(`◂${String(rI + 1).padStart(2, '0')}`, x + pad * 0.5, ry + rowH / 2);
          ctx.textAlign = 'right';
          ctx.fillText(`${String(rI + 1).padStart(2, '0')}▸`, x + w - pad * 0.5, ry + rowH / 2);
          ctx.font = `400 ${Math.min(rowH * 0.78, cellW * 1.6)}px ${FONT}`;
          ctx.fillStyle = INKC;
          ctx.textAlign = 'center';
          if (rI < ROWS && grid) {
            const shift = misprint.row === rI && now < misprint.until ? misprint.shift : 0;
            for (let c = 0; c < COLS; c++) {
              const src = Math.min(COLS - 1, Math.max(0, c - shift));
              // A fixed dither per cell breaks flat areas into mixed characters.
              const lum = grid[rI * COLS + src] + (((src * 7 + rI * 13) % 9) / 9 - 0.5) * 0.12;
              // Biased toward the light end: flat areas print as dots, like a passbook.
              const dark = Math.pow(Math.min(1, Math.max(0, (1 - lum - 0.5) * contrast + 0.5 + level * 0.1)), 1.6);
              let k = Math.floor(dark * (RAMP.length - 1));
              if (res && Math.random() < res * 0.08) k = Math.floor(Math.random() * RAMP.length);
              const ch = RAMP[k];
              if (ch !== ' ') ctx.fillText(ch, gx + (c + 0.5) * cellW, ry + rowH / 2 + 1, cellW * 1.05);
            }
          } else if (rI === 22) {
            const d = new Date();
            const date = `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const amount = Math.floor(now / 37) % 1000000;
            ctx.textAlign = 'center';
            ctx.fillText(date, (colX[0] + colX[1]) / 2, ry + rowH / 2, colX[1] - colX[0] - cellW * 0.4);
            ctx.fillText('****', (colX[1] + colX[2]) / 2, ry + rowH / 2);
            ctx.textAlign = 'right';
            ctx.fillText(amount.toLocaleString('en-US'), colX[3] - cellW, ry + rowH / 2);
            ctx.textAlign = 'left';
            ctx.fillText('振込', colX[3] + cellW * 0.5, ry + rowH / 2);
          } else if (rI === 23) {
            ctx.textAlign = 'right';
            ctx.fillText('*MONEY', colX[5] - cellW * 2, ry + rowH / 2);
          }
          // Row rule.
          ctx.fillStyle = 'rgba(226,134,79,0.35)';
          ctx.fillRect(gx, ry + rowH - 0.5, gw, 0.7);
        }
        // Column rules and the fold.
        ctx.fillStyle = 'rgba(226,134,79,0.6)';
        colX.forEach((cx) => ctx.fillRect(cx, y + headH, 0.8, 24 * rowH + colH + fs * 0.6));
        const foldY = rowsTop + 12 * rowH;
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.fillRect(x, foldY, w, fs * 0.6);

        // Notes.
        ctx.fillStyle = RULE;
        ctx.font = `400 ${fs * 0.72}px ${FONT}`;
        ctx.textAlign = 'left';
        const ny = rowsTop + 24 * rowH + fs * 0.6 + footH * 0.18;
        NOTES.forEach((t, i) => ctx.fillText(t, gx + gw * 0.03, ny + i * footH * 0.2));
        ctx.font = `600 ${fs * 1.3}px ${FONT}`;
        ctx.fillText('↑', x + pad * 0.6, ny + footH * 0.5);
        ctx.textAlign = 'right';
        ctx.fillText('↑', x + w - pad * 0.6, ny + footH * 0.5);
      }

      p.draw = () => {
        const now = p.millis();
        const W = p.width;
        const H = p.height;
        p.background(0);

        const grid = sample(now);
        history.push([now, grid]);
        while (history.length > 2 && history[1][0] < now - 1500) history.shift();
        const delayed = history[0][1];

        const a = audio();
        if (a.bass > 0.35 && a.bass > bassAvg * 1.35) {
          misprint = { row: Math.floor(Math.random() * ROWS), until: now + 250, shift: Math.round((Math.random() - 0.5) * 8) };
        }
        bassAvg = bassAvg * 0.95 + a.bass * 0.05;

        // Two pages side by side when there's room, one otherwise.
        const two = W / H > 1.15;
        const ph = H * 0.92;
        let pw = ph * 0.75;
        const gap = W * 0.025;
        if (two && pw * 2 + gap > W * 0.95) pw = (W * 0.95 - gap) / 2;
        if (!two && pw > W * 0.94) pw = W * 0.94;
        const total = two ? pw * 2 + gap : pw;
        const x0 = (W - total) / 2;
        const y0 = (H - ph) / 2;
        page(x0, y0, pw, ph, PAGES[0], grid, now, a.level);
        if (two) page(x0 + pw + gap, y0, pw, ph, PAGES[1], delayed, now, a.level);

        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => p.resizeCanvas(p.windowWidth, p.windowHeight);
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
    closeCamera();
  }

  return { name: 'Passbook Cam', start, stop };
})());
