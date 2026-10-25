// Retired station ident: "ASCII · block wall" (lab V23). It played between
// sets and during loads until 2026-10-25, when it was showing far too often.
// To bring it back, paste BLK_* and the IDENTS entry into public/ident.js;
// it needs the helpers at the top of that file (clamp, ramp, rng, h32, MONO,
// ORANGE).

  // ---------- V23 — ASCII blocks: a wall of block glyphs that resolves into the word ----------
  const BLK_RAMP = '█▓▒░';
  const BLK_FONT = {
    D: ['11110', '10001', '10001', '10001', '11110'],
    E: ['11111', '10000', '11110', '10000', '11111'],
    A: ['01110', '10001', '11111', '10001', '10001'],
    I: ['11111', '00100', '00100', '00100', '11111'],
    N: ['10001', '11001', '10101', '10011', '10001'],
    T: ['11111', '00100', '00100', '00100', '00100'],
    R: ['11110', '10001', '11110', '10100', '10011'],
    O: ['01110', '10001', '10001', '10001', '01110'],
  };
  const BLK_WORD = 'DEAD INTERNET RADIO';
  const BLK_COLS = BLK_WORD.length * 6 - 1;
  const BLK_MASK = [...BLK_WORD].reduce((g, ch, i) => {
    if (BLK_FONT[ch]) BLK_FONT[ch].forEach((row, y) => { for (let x = 0; x < 5; x++) if (row[x] === '1') g[y][i * 6 + x] = 1; });
    return g;
  }, Array.from({ length: 5 }, () => new Uint8Array(BLK_COLS)));

  const IDENTS = [
    {
      id: 'ascii-block-wall',
      name: 'ASCII · block wall',
      L: 11,
      draw(c, w, h, t, S) {
        if (!S.v) {
          const r = rng('3a7f1c9d0b5e4826fd91a74c');
          S.v = Array.from({ length: BLK_COLS }, () => 2.6 + r() * 7);
          S.o = Array.from({ length: BLK_COLS }, () => r() * 977);
          S.a = Array.from({ length: BLK_COLS }, () => .55 + r() * .7);
        }
        const u = h / 100;
        c.fillStyle = '#0b0b0a'; c.fillRect(0, 0, w, h);
        c.textBaseline = 'top';
        if (!S.aw) { c.font = MONO(100); S.aw = c.measureText(BLK_RAMP[0]).width; }
        const cw = (w - 8 * u) / BLK_COLS, fs = 100 * cw / S.aw, rh = fs;
        const rows = Math.max(9, Math.floor(h / rh) - 2), y0 = (h - rows * rh) / 2, x0 = (w - BLK_COLS * cw) / 2;
        c.font = MONO(fs);
        const band = Math.floor((rows - 5) / 2), fade = ramp(t, 0, 1.1), hold = ramp(t, 2.6, .7) * (1 - ramp(t, 7.6, .6));
        for (let col = 0; col < BLK_COLS; col++) {
          const p = (S.v[col] * t + S.o[col]) % 977, fr = Math.floor(p), ph = p - fr, x = x0 + col * cw, ca = S.a[col];
          for (let r = 0; r < rows; r++) {
            const y = y0 + (r - ph) * rh, wr = r - band;
            const edge = Math.min(ramp(r, -.5, 3), 1 - ramp(r, rows - 2.5, 3));
            const g = h32((r + fr) * 131 + col * 977) % 100, wa = fade * (.04 + .28 * edge) * ca * (.92 - .3 * hold);
            if (wr >= 0 && wr < 5 && BLK_MASK[wr][col]) {
              const rv = ramp(t, 2.2 + col * .0055 + wr * .03, .22), dv = ramp(t, 7.4 + (h32(wr * 977 + col * 131) % 1000) / 1000 * .8, .18);
              if (rv > 0 && dv < 1) {
                c.globalAlpha = rv * (1 - dv); c.fillStyle = ORANGE; c.fillText(BLK_RAMP[0], x, y);
                continue;
              }
            }
            c.globalAlpha = wa * (g < 40 ? 1 : .62);
            c.fillStyle = '#e8e4da';
            c.fillText(g < 24 ? BLK_RAMP[0] : g < 56 ? BLK_RAMP[1] : g < 82 ? BLK_RAMP[2] : BLK_RAMP[3], x, y);
          }
        }
        c.globalAlpha = 1; c.textBaseline = 'alphabetic';
      },
    },
  ];
