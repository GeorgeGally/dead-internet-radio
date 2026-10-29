'use strict';

visuals.register('ascii_rest', (() => {
  const MONO = '"IBM Plex Mono", "Courier New", monospace';
  const BLACK = '#000000';
  const GREEN = '#02170c';
  const DIM = 'rgba(92,224,138,0.30)';
  const MID = 'rgba(126,250,168,0.82)';
  const HOT = 'rgba(234,255,240,0.96)';
  const RAMP = ' .:-=+*#%@';
  const DIM_CH = " .·,`':_";
  const HOT_CH = '█▓';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (x) => x * x * (3 - 2 * x);
  const hash = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b));

  const heat = (c) =>
    c === ' ' || c === '' ? 0 : DIM_CH.indexOf(c) >= 0 ? 0 : HOT_CH.indexOf(c) >= 0 ? 2 : 1;

  const put = (G, x, y, c) => {
    x = x | 0;
    y = y | 0;
    if (x >= 0 && x < G.cols && y >= 0 && y < G.rows) G.a[y][x] = c;
  };
  const text = (G, x, y, s) => {
    for (let i = 0; i < s.length; i++) put(G, x + i, y, s[i]);
  };
  const centre = (G, y, s) => text(G, Math.floor((G.cols - s.length) / 2), y, s);
  const hline = (G, x0, x1, y, c) => {
    for (let x = Math.max(0, x0); x <= Math.min(G.cols - 1, x1); x++) put(G, x, y, c);
  };
  const vline = (G, x, y0, y1, c) => {
    for (let y = Math.max(0, y0); y <= Math.min(G.rows - 1, y1); y++) put(G, x, y, c);
  };
  const box = (G, x0, y0, x1, y1) => {
    hline(G, x0 + 1, x1 - 1, y0, '─');
    hline(G, x0 + 1, x1 - 1, y1, '─');
    vline(G, x0, y0 + 1, y1 - 1, '│');
    vline(G, x1, y0 + 1, y1 - 1, '│');
    put(G, x0, y0, '╭');
    put(G, x1, y0, '╮');
    put(G, x0, y1, '╰');
    put(G, x1, y1, '╯');
  };
  const bar = (G, x, y, w, f, on, off) => {
    const n = Math.round(clamp(f, 0, 1) * w);
    for (let i = 0; i < w; i++) put(G, x + i, y, i < n ? on : off);
  };
  const wrap = (s, w) => {
    const out = [];
    let line = '';
    s.split(' ').forEach((word) => {
      if (line && line.length + 1 + word.length > w) {
        out.push(line);
        line = word;
      } else line = line ? line + ' ' + word : word;
    });
    if (line) out.push(line);
    return out;
  };

  const LAND_MASK = [
    '                                                                                          ',
    '                                                                                          ',
    '                     ###### #############         ##                ##                    ',
    '              # #  ##         ##########                    ##      #####      ##         ',
    '              ##### # ####     ########                   #   # #############   ##        ',
    '#   ############  # #####  ##   #####            ###### # ##### ##########################',
    '     ####################  ##   ###    ##      ### #######################################',
    '   ##### ############     ##                  ####  ################################ #    ',
    '            ###########   ####                 ## #############################     ##    ',
    '             ##################             # ###################################   #     ',
    '              ############### ##            #####################################         ',
    '              ###############                ### ###   ######################## #         ',
    '              ############                 ##     # #########################             ',
    '               ###########                   ###      #####################    #          ',
    '                #########                  ###### #   #####################               ',
    '                #####   #                 ############### #################               ',
    '                 ####                    ############# ####   ############                ',
    '                   ## #                  ############# ####    #### #####                 ',
    '                     ###                 ############## ##     ##    ###                  ',
    '                       #   #             ###############        #      #                  ',
    '                         #####            ################                  #             ',
    '                          ######               ##########            ##  #                ',
    '                         #######               #########              # ##                ',
    '                         ##########             #######                    #   ##         ',
    '                         ###########            #######                  #     ###        ',
    '                          ##########            #######                       # #         ',
    '                          #########             ####### #                   ### #         ',
    '                           ########             ######  #                  #######        ',
    '                           ######                #####  #                ##########       ',
    '                           ######                ####                     #########       ',
    '                           #####                  ##                      ### #####       ',
    '                           ####                                                 ###     # ',
    '                           ##                                                             ',
    '                           ##                                                          #  ',
    '                          ###                                                             ',
    '                          ##                                                              ',
    '                                                                                          ',
    '                                                                                          ',
    '                                                                                          ',
    '                            #                           ######   #################        ',
    '                   #      ####            #################### #########################  ',
    '        ####################            ##############################################    ',
    '        ##################      ##    ###############################################     ',
    '  #    #################################################################################  ',
    '##########################################################################################',
  ];
  const LAND_W = 90;
  const LAND_H = LAND_MASK.length;
  const landAt = (lat, lon) => {
    const ly = clamp(Math.floor((90 - lat) / 4), 0, LAND_H - 1);
    const lx = (((Math.floor((lon + 180) / 4) % LAND_W) + LAND_W) % LAND_W) | 0;
    return LAND_MASK[ly][lx] === '#';
  };

  const ROCKET = [
    '   /\\   ',
    '  /%%\\  ',
    ' /%%%%\\ ',
    ' |%%%%| ',
    ' |%oo%| ',
    ' |%%%%| ',
    ' |%%%%| ',
    ' |%%%%| ',
    ' |%%%%| ',
    '/%%%%%%\\',
    '/%%%%%%\\',
    ' ||  || ',
    '  \\  /  ',
  ];

  const SEG = {
    0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
    5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  };
  const SEGS = {
    a: [0, 0, 0, 2], b: [0, 2, 2, 2], c: [2, 2, 4, 2],
    d: [4, 0, 4, 2], e: [2, 0, 4, 0], f: [0, 0, 2, 0], g: [2, 0, 2, 2],
  };

  const MESSAGES = [
    'the station is still broadcasting.',
    'no one is listening. that is fine.',
    'signal acquired from a dead satellite.',
    'we found the internet. it was mostly bots.',
    'somewhere a modem is screaming into the void.',
    'this show was generated at 03:12 local time.',
    'the archive is open. bring your own silence.',
    'requests are read by nobody and often granted.',
    'streaming from an empty room in the suburbs.',
    'the dj has no face and a lot of opinions.',
    'your listener count went up by one, then down.',
    'music for the hours nobody clocks in for.',
    'the adverts are gone. they were never here.',
    'every track on this station is a first take.',
    'reception is best when the weather is wrong.',
    'the tape hiss is on purpose.',
    'we play what the algorithm could not sell.',
    'a ghost in the studio, turning the dials.',
    'if you can hear this the antenna is still warm.',
    'all requests are honoured eventually.',
    'the transmitter hums in b flat.',
    'ninety percent of the internet is a rerun.',
    'the record is warped and we kept it anyway.',
    'dead air is a genre now.',
    'somebody out there is still awake.',
    'we take no callers, only static.',
    'the copyright office is closed for the night.',
    'this is a test of the emergency broadcast nothing.',
    'the station does not sleep, it buffers.',
    'a very slow modem dials the moon.',
    'tonight the playlist was decided by a coin flip.',
    'the archive smells like a warm amplifier.',
    'nobody asked for this show. it exists anyway.',
    'the internet died but the radio kept going.',
    'you are the only human on this frequency.',
    'low bandwidth, high atmosphere.',
    'the server is in a cupboard in berlin.',
    'requests from the dead are queued too.',
    'our sponsor is the sound of a fan.',
    'the loop is four minutes long and always new.',
    'tune past the static for a surprise.',
    'we have been on air since before the last outage.',
  ];

  const SCENES = [
    {
      name: 'earth',
      bg: BLACK,
      len: 16,
      draw(G, t) {
        const W = G.cols;
        const H = G.rows;
        const ry = Math.min(H * 0.4, W * 0.19);
        const rx = Math.min(W * 0.46, ry * 2.05);
        const cx = W / 2;
        const cy = H / 2;
        const spin = -0.35 + t * 0.34;
        const cs = Math.cos(spin);
        const sn = Math.sin(spin);
        const land = new Uint8Array(W * H);
        const shade = new Float32Array(W * H);
        const disc = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const nx = (x + 0.5 - cx) / rx;
            const ny = (cy - y - 0.5) / ry;
            const d2 = nx * nx + ny * ny;
            if (d2 >= 1) {
              const star = hash(x * 1.7, y * 2.3);
              if (d2 < 1.035 && hash(x * 3.1, y * 5.7) < 0.22) put(G, x, y, '.');
              else if (star < 0.009) put(G, x, y, star < 0.003 ? '+' : '.');
              continue;
            }
            const i = y * W + x;
            const nz = Math.sqrt(1 - d2);
            disc[i] = 1;
            const tilt = 0.34;
            const wy = ny * Math.cos(tilt) + nz * Math.sin(tilt);
            const wz0 = nz * Math.cos(tilt) - ny * Math.sin(tilt);
            const wx = nx * cs - wz0 * sn;
            const wz = nx * sn + wz0 * cs;
            const lat = (Math.asin(clamp(wy, -1, 1)) * 180) / Math.PI;
            const lon = (Math.atan2(wx, wz) * 180) / Math.PI;
            land[i] = landAt(lat, lon) ? 1 : 0;
            shade[i] = nx * -0.3 + ny * 0.3 + nz * 0.9;
          }
        }
        const water = (x, y) => x < 0 || y < 0 || x >= W || y >= H || !disc[y * W + x] || !land[y * W + x];
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!disc[i]) continue;
            const n = hash(x * 13.7 + 3, y * 7.3 + 5);
            if (!land[i]) {
              const s = shade[i] + (n - 0.5) * 0.1;
              put(G, x, y, s < 0.3 ? '.' : s < 0.58 ? '·' : s < 0.84 ? (n > 0.72 ? '-' : '·') : '~');
              continue;
            }
            const s = shade[i] * 1.05 + (n - 0.5) * 0.2;
            if (s < 0.05) {
              if (n < 0.1) put(G, x, y, '.');
              continue;
            }
            const coast = water(x - 1, y) || water(x + 1, y) || water(x, y - 1) || water(x, y + 1);
            if (coast) put(G, x, y, s > 0.5 ? '%' : '+');
            else put(G, x, y, RAMP[clamp(1 + Math.round(Math.pow(s, 1.25) * 8), 1, 9)]);
          }
        }
      },
    },

    {
      name: 'rocket',
      bg: BLACK,
      len: 23,
      draw(G, t) {
        const cycle = 22;
        const u = t % cycle;
        let lift = 0;
        let thrust = 0;
        if (u < 1.4) {
          lift = 0;
          thrust = 0.35 * (u / 1.4);
        } else if (u < 8.4) {
          lift = smooth((u - 1.4) / 7);
          thrust = 1;
        } else if (u < 12.4) {
          lift = 1;
          thrust = 0.7 + 0.2 * Math.sin(t * 6);
        } else if (u < 19.4) {
          const k = (u - 12.4) / 7;
          lift = 1 - smooth(k);
          thrust = k > 0.55 ? 0.75 : 0.25;
        } else {
          lift = 0;
          thrust = 0;
        }
        const ground = G.rows - 2;
        const rise = Math.round(lift * (G.rows * 0.66));
        const drift = Math.floor(lift * 16 + (u > 12.4 && u < 19.4 ? -6 * (1 - lift) : 0));
        const top = ground - ROCKET.length + 1 - rise;
        const rx = Math.floor((G.cols - ROCKET[0].length) / 2) + drift;

        for (let y = 0; y < G.rows; y++) {
          for (let x = 0; x < G.cols; x++) {
            const st = hash(x * 1.3, y * 2.1);
            if (st < 0.014) {
              const sy = (y + rise * 1.6 + t * 0.4) % G.rows;
              put(G, x, sy, st < 0.005 ? '*' : hash(y, x) < 0.35 ? '+' : '.');
            }
          }
        }

        hline(G, 0, G.cols - 1, ground + 1, '▀');
        hline(G, 2, G.cols - 3, ground, '▁');

        const gx = Math.max(2, Math.floor(G.cols * 0.16));
        const gh = Math.min(13, ground - 4);
        for (let y = ground - gh; y < ground; y++) {
          put(G, gx, y, '│');
          put(G, gx + 3, y, '│');
          if ((y + Math.floor(t * 2)) % 2 === 0) {
            put(G, gx + 1, y, '─');
            put(G, gx + 2, y, '─');
          }
        }
        hline(G, gx, gx + 6, ground - gh, '─');
        hline(G, gx - 1, gx + 5, ground - gh + 4, '─');
        put(G, gx + 4 + (Math.floor(t * 4) % 2), ground - gh - 1, '▪');

        if (thrust > 0.02) {
          const base = ground - rise;
          const fl = Math.round(thrust * (4 + 3.2 * Math.abs(Math.sin(t * 24))));
          for (let i = 1; i <= fl; i++) {
            const u = i / (fl + 1);
            const w = Math.max(0, Math.round((1 - u) * 2.2));
            for (let k = -w; k <= w; k++) {
              const jitter = hash(k + 9, i + Math.floor(t * 18));
              if (jitter < u * 0.5) continue;
              const core = Math.abs(k) < w * 0.5 ? 1 : 0;
              const ch = i < 3 ? (core ? '█' : '▓') : u < 0.5 ? (core ? '▓' : '▒') : u < 0.8 ? '░' : '·';
              put(G, rx + 4 + k, base + i, ch);
            }
          }
          put(G, rx + 3, base + 1, '╲');
          put(G, rx + 5, base + 1, '╱');
          if (u < 2.2 || u > 19.4) {
            for (let k = 0; k < 14; k++) {
              const ph = hash(k, 3);
              const yy = base + 3 + ((t * 3 + ph * 9) % 8);
              const xx = rx + 4 + Math.round((ph - 0.5) * (6 + (yy - base) * 1.4));
              if (hash(k, Math.floor(t * 4)) > 0.35) put(G, xx, yy, ph > 0.5 ? '▒' : '░');
            }
          }
        }

        const SKIN = '=+*#%@';
        ROCKET.forEach((line, i) => {
          const first = line.search(/\S/);
          const last = line.trimEnd().length - 1;
          for (let k = 0; k < line.length; k++) {
            const c = line[k];
            if (c === ' ') continue;
            if (c !== '%' && c !== 'o') {
              put(G, rx + k, top + i, c);
              continue;
            }
            if (c === 'o') {
              put(G, rx + k, top + i, '◎');
              continue;
            }
            const t01 = last > first ? (k - first) / (last - first) : 0.5;
            const lit = 1 - Math.abs(t01 - 0.34) / 0.68;
            put(G, rx + k, top + i, SKIN[clamp(Math.round(lit * 5), 0, 5)]);
          }
        });
      },
    },

    {
      name: 'landscape',
      bg: GREEN,
      len: 15,
      draw(G, t) {
        const W = G.cols;
        const H = G.rows;
        const horizon = Math.round(H * 0.58);
        for (let y = 0; y < horizon - 2; y++) {
          for (let x = 0; x < W; x++) {
            const h = hash(x * 1.7, y * 2.9);
            if (h < 0.008) put(G, x, y, h < 0.002 ? '+' : '.');
          }
        }
        const mr = clamp(Math.round(Math.min(W / 26, H / 9)), 3, 6);
        const mx = Math.round(W * 0.74);
        const my = Math.max(mr + 1, Math.round(horizon * 0.32));
        for (let dy = -mr; dy <= mr; dy++) {
          for (let dx = -mr * 2; dx <= mr * 2; dx++) {
            const dd = (dx * dx) / (4 * mr * mr) + (dy * dy) / (mr * mr);
            if (dd > 1) continue;
            const limb = dd > 0.72;
            const shade = 1 - (dx + mr * 2) / (mr * 4);
            const crater = hash(Math.floor((dx + 30) / 3), Math.floor((dy + 30) / 2)) < 0.14 && dd < 0.62;
            put(G, mx + dx, my + dy, limb ? (shade > 0.55 ? '%' : '+') : crater ? '+' : shade > 0.45 ? '#' : '*');
          }
        }
        const ridges = [
          { base: horizon - 3, amp: H * 0.3, f: 0.06, ph: 0.4, fill: '.', p: 0.55 },
          { base: horizon - 1, amp: H * 0.22, f: 0.11, ph: 2.1, fill: '+', p: 0.7 },
          { base: horizon + 1, amp: H * 0.16, f: 0.18, ph: 4.4, fill: '%', p: 0.85 },
        ];
        ridges.forEach((r, idx) => {
          for (let x = 0; x < W; x++) {
            const h = r.base - r.amp * (0.45 + 0.32 * Math.sin(x * r.f + r.ph) + 0.23 * Math.sin(x * r.f * 2.7 + r.ph * 1.7));
            const top = Math.max(1, Math.round(h));
            for (let y = top; y <= horizon + 2; y++) {
              const d = (y - top) / Math.max(1, horizon + 2 - top);
              if (y === top) {
                put(G, x, y, r.fill);
                continue;
              }
              const keep = hash(x * 1.9 + y * 3.3, idx * 7 + 1);
              if (d < 0.55 || keep < r.p - (d - 0.55) * 0.9) put(G, x, y, y - top > 2 && keep < 0.1 ? '.' : r.fill);
            }
          }
        });
        for (let y = horizon + 3; y < H; y++) {
          const d = (y - horizon - 3) / Math.max(1, H - 1 - horizon - 3);
          for (let x = 0; x < W; x++) {
            const wave = Math.sin(x * 0.18 + t * 1.4 + y * 0.8);
            const keep = hash(x * 1.7 + y * 5.1, Math.floor(t * 1.5));
            if (keep < 0.16 + d * 0.16) put(G, x, y, wave > 0.4 ? '-' : wave < -0.6 ? '.' : '~');
            const glow = (1 - d) * mr * 1.3 + 1;
            if (Math.abs(x - mx) < glow && keep < 0.42) put(G, x, y, '~');
          }
        }
      },
    },

    {
      name: 'jellyfish',
      bg: BLACK,
      len: 17,
      draw(G, t) {
        const W = G.cols;
        const H = G.rows;
        const bh = Math.min(H * 0.22, W * 0.13);
        const bw = bh * 2.7;
        const cx = W / 2 + 2 * Math.sin(t * 0.31);
        const cy = H * 0.38 + 1.2 * Math.sin(t * 0.6);
        const pulse = Math.sin(t * 2.1);
        for (let i = 0; i < 34; i++) {
          const sp = hash(i, 7);
          const y = ((sp * H - t * (1.4 + sp * 3.4)) % (H + 4) + H + 4) % (H + 4);
          put(G, sp * W + Math.sin(t * 0.6 + i) * 1.5, y, sp > 0.72 ? '·' : '.');
        }
        const y1 = Math.round(cy + bh * 0.35);
        const arcs = [
          { f: 1, ch: '%' },
          { f: 0.86, ch: '*' },
          { f: 0.45, ch: '.' },
        ];
        arcs.forEach((arc, idx) => {
          const steps = Math.max(24, Math.round(bw * 3));
          for (let i = 0; i <= steps; i++) {
            const th = (i / steps) * Math.PI;
            const x = Math.round(cx + (bw / 2) * arc.f * Math.cos(th) * (1 - 0.1 * pulse));
            const y = Math.round(cy - bh * arc.f * Math.sin(th) * (1 - 0.24 * pulse));
            put(G, x, y, arc.ch);
          }
          if (idx === 0) {
            for (let u = 0.15; u < 0.9; u += 0.1) {
              const th = u * Math.PI;
              put(G, cx + (bw / 2) * 0.93 * Math.cos(th), cy - bh * 0.93 * Math.sin(th), '.');
            }
          }
        });
        for (let x = Math.round(cx - bw / 2); x <= Math.round(cx + bw / 2); x++) {
          const t2 = (x - cx) / (bw / 2);
          if (Math.abs(t2) > 1) continue;
          put(G, x, y1, (x + 60) % 2 === 0 ? '~' : (Math.abs(t2) > 0.85 ? '`' : '-'));
        }
        for (let k = 0; k < 7; k++) {
          const spread = -0.9 + (1.8 * k) / 6;
          const len = Math.min(H - y1 - 2, Math.round(bh * 1.6 + hash(k, 3) * bh * 1.3));
          let prev = Math.round(cx + spread * bw * 0.42);
          for (let i = 1; i <= len; i++) {
            const u = i / len;
            const x = Math.round(
              cx + spread * bw * 0.42 + spread * u * bw * 0.16 +
                Math.sin(u * 3.1 - t * 1.6 + k * 1.7) * (0.3 + u * 3.2)
            );
            if (Math.abs(x - prev) > 1) {
              for (let xx = Math.min(x, prev) + 1; xx < Math.max(x, prev); xx++) put(G, xx, y1 + i, '─');
            }
            const ch = u > 0.9 ? ':' : u > 0.6 ? '.' : x > prev ? '\\' : x < prev ? '/' : '|';
            if (u < 0.55 || (i + k) % 2 === 0) put(G, x, y1 + i, ch);
            prev = x;
          }
        }
      },
    },

    {
      name: 'maze',
      bg: GREEN,
      len: 21,
      init() {
        const mw = clamp(Math.floor(Gcols / 4), 6, 16);
        const mh = clamp(Math.floor((Grows - 3) / 2), 4, 10);
        this.mw = mw;
        this.mh = mh;
        const seen = new Uint8Array(mw * mh);
        const stack = [0];
        const links = [];
        seen[0] = 1;
        while (stack.length) {
          const cur = stack[stack.length - 1];
          const x = cur % mw;
          const y = (cur / mw) | 0;
          const opts = [];
          if (x > 0 && !seen[cur - 1]) opts.push(cur - 1);
          if (x < mw - 1 && !seen[cur + 1]) opts.push(cur + 1);
          if (y > 0 && !seen[cur - mw]) opts.push(cur - mw);
          if (y < mh - 1 && !seen[cur + mw]) opts.push(cur + mw);
          if (!opts.length) {
            stack.pop();
            links.push(-1);
            continue;
          }
          const nx = opts[ri(0, opts.length)];
          seen[nx] = 1;
          stack.push(nx);
          links.push(nx);
        }
        this.links = links;
        this.rate = 54;
        const parent = new Int16Array(mw * mh).fill(-1);
        const visited = new Uint8Array(mw * mh);
        const queue = [0];
        visited[0] = 1;
        for (let q = 0; q < queue.length; q++) {
          const cur = queue[q];
          const x = cur % mw;
          const y = (cur / mw) | 0;
          const nb = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
          nb.forEach((p) => {
            if (p[0] < 0 || p[1] < 0 || p[0] >= mw || p[1] >= mh) return;
            const idx = p[1] * mw + p[0];
            if (visited[idx]) return;
            visited[idx] = 1;
            parent[idx] = cur;
            queue.push(idx);
          });
        }
        const way = [];
        for (let cur = mw * mh - 1; cur !== -1; cur = parent[cur]) way.push(cur);
        this.way = way.reverse();
      },
      draw(G, t) {
        const mw = this.mw;
        const mh = this.mh;
        const links = this.links;
        const phase = t % this.len;
        const step = Math.min(links.length, Math.floor(phase * this.rate));
        const carved = new Uint8Array(mw * mh);
        const open = new Uint8Array(mw * mh * 4);
        const walk = [0];
        carved[0] = 1;
        for (let i = 0; i < step; i++) {
          const next = links[i];
          if (next < 0) {
            if (walk.length > 1) walk.pop();
            continue;
          }
          const from = walk[walk.length - 1];
          const dx = (next % mw) - (from % mw);
          const dy = ((next / mw) | 0) - ((from / mw) | 0);
          const side = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
          open[from * 4 + side] = 1;
          open[next * 4 + ((side + 2) % 4)] = 1;
          carved[next] = 1;
          walk.push(next);
        }
        const wallH = (x, y) => {
          if (y <= 0 || y >= mh) return true;
          const a = (y - 1) * mw + x;
          const b = y * mw + x;
          if (!carved[a] || !carved[b]) return true;
          return open[a * 4 + 2] === 0;
        };
        const wallV = (x, y) => {
          if (x <= 0 || x >= mw) return true;
          const a = y * mw + x - 1;
          const b = y * mw + x;
          if (!carved[a] || !carved[b]) return true;
          return open[a * 4 + 1] === 0;
        };
        const ox = Math.max(0, Math.floor((G.cols - (mw * 4 + 1)) / 2));
        const oy = Math.max(1, Math.floor((G.rows - (mh * 2 + 1)) / 2));
        const corner = (u, d, l, r) => {
          if (u && d && l && r) return '┼';
          if (u && d && r) return '├';
          if (u && d && l) return '┤';
          if (l && r && d) return '┬';
          if (l && r && u) return '┴';
          if (u && d) return '│';
          if (l && r) return '─';
          if (d && r) return '┌';
          if (d && l) return '┐';
          if (u && r) return '└';
          if (u && l) return '┘';
          if (d || u) return '│';
          return '─';
        };
        for (let y = 0; y <= mh; y++) {
          for (let x = 0; x <= mw; x++) {
            const up = wallV(x, y - 1);
            const down = wallV(x, y);
            const left = wallH(x - 1, y);
            const right = wallH(x, y);
            put(G, ox + x * 4, oy + y * 2, corner(up, down, left, right));
          }
          if (y < mh) {
            for (let x = 0; x <= mw; x++) put(G, ox + x * 4, oy + y * 2 + 1, wallV(x, y) ? '│' : ' ');
          }
        }
        for (let y = 0; y <= mh; y++) {
          for (let x = 0; x < mw; x++) {
            if (!wallH(x, y)) continue;
            put(G, ox + x * 4 + 1, oy + y * 2, '─');
            put(G, ox + x * 4 + 2, oy + y * 2, '─');
            put(G, ox + x * 4 + 3, oy + y * 2, '─');
          }
        }
        for (let y = 0; y < mh; y++) {
          for (let x = 0; x < mw; x++) {
            if (carved[y * mw + x]) continue;
            if (hash(x * 3, y * 5) < 0.5) put(G, ox + x * 4 + 2, oy + y * 2 + 1, '·');
          }
        }
        const solved = clamp((phase - links.length / this.rate - 0.5) / 2.6, 0, 1);
        if (solved > 0) {
          const way = this.way;
          const n = Math.round(way.length * solved);
          for (let i = 0; i < n; i++) {
            const c = way[i];
            const px = ox + (c % mw) * 4 + 2;
            const py = oy + ((c / mw) | 0) * 2 + 1;
            put(G, px, py, '·');
            if (i + 1 >= n) continue;
            const d = way[i + 1] - c;
            if (d === 1) put(G, px + 1, py, '·');
            if (d === -1) put(G, px - 1, py, '·');
            if (d === mw) put(G, px, py + 1, '·');
            if (d === -mw) put(G, px, py - 1, '·');
          }
        }
        if (step < links.length && walk.length) {
          const head = walk[walk.length - 1];
          put(G, ox + (head % mw) * 4 + 2, oy + ((head / mw) | 0) * 2 + 1, '▓');
        } else if (solved >= 1 && Math.floor(t * 2) % 2 === 0) {
          const end = mw * mh - 1;
          put(G, ox + (end % mw) * 4 + 2, oy + ((end / mw) | 0) * 2 + 1, '▓');
        }
      },
    },

    {
      name: 'boot log',
      bg: GREEN,
      len: 26,
      init() {
        const lines = [];
        let at = 0.2;
        const push = (gap, gen) => {
          at += gap;
          lines.push({ at, gen });
        };
        const pad = (label, value, tail) => {
          const head = label.padEnd(10) + value;
          return tail ? head + '.'.repeat(Math.max(2, 58 - head.length - tail.length)) + tail : head;
        };
        push(0, () => 'dead internet radio  firmware 2.31.0');
        push(0.1, () => '─'.repeat(58));
        push(0.2, () => 'self test');
        push(0.15, () => pad('cpu', '4 cores, 8 threads at 2.40 GHz', 'ok'));
        push(0.15, () => pad('cache', 'l1 256 KB  l2 2 MB  l3 8 MB', 'ok'));
        push(0.2, (t) => {
          const k = clamp((t - at) / 1.5, 0, 1);
          return pad('memory', (Math.floor(k * 16384) + ' MB of 16384 MB').padStart(19), k < 1 ? 'test' : 'ok');
        });
        push(0.1, (t) => {
          const k = clamp((t - at) / 1.6, 0, 1);
          const w = 30;
          const f = Math.round(k * w);
          const blocks = '█'.repeat(f) + (f < w ? '░'.repeat(w - f) : '');
          return ' '.repeat(9) + blocks + ' 0x' + (k * 0x3ffffff).toString(16).toUpperCase().padStart(7, '0');
        });
        push(0.15, () => pad('display', '1920 x 1080 at 60 Hz', 'ok'));
        push(0.15, () => pad('storage', 'sata 0: disk 0, 512 GB', 'ok'));
        push(0.15, () => pad('network', '1 port, 1000 Mb/s', 'link up'));
        push(0.15, () => pad('sensors', 'cpu 41C  board 33C  fan 2400 rpm', 'ok'));
        push(0.15, () => pad('audio', 'codec 0: 48 kHz stereo out', 'ok'));
        push(0.2, () => '─'.repeat(58));
        push(0.15, () => 'F2 setup   F12 boot menu   esc skip memory test');
        push(0.9, () => '');
        push(0.2, () => 'loading kernel 6.8.0 ................... ok');
        push(0.1, () => 'loading station archive ................ ok');
        push(0.1, () => '[    0.000000] console [tty0] enabled');
        push(0.06, () => '[    0.004120] memory: 16384 MB available');
        push(0.06, () => '[    0.087311] usb 1-1: new high speed device, number 2');
        push(0.06, () => '[    0.104882] eth0: link up, 1000 Mb/s, full duplex');
        push(0.2, () => '[  OK  ] mounted root file system');
        push(0.1, () => '[  OK  ] started journal service');
        push(0.1, () => '[  OK  ] started load kernel modules');
        push(0.1, () => '[  OK  ] reached target sockets');
        push(0.1, () => '[  OK  ] reached target basic system');
        push(0.35, () => '[ WARN ] clock not synced, using hardware time');
        push(0.3, () => '[  OK  ] synced clock to network time');
        push(0.15, () => '[  OK  ] started deadinternet.service');
        push(0.1, () => '[  OK  ] started stream.service');
        push(0.25, () => '[  OK  ] reached target multi-user system');
        push(0.6, () => '');
        push(0.2, () => 'station login: ');
        this.lines = lines;
        this.total = at + 9;
      },
      draw(G, t) {
        const phase = t % this.len;
        const shown = [];
        this.lines.forEach((l) => {
          if (phase >= l.at) shown.push(l.gen(phase));
        });
        const rows = G.rows;
        const start = Math.max(0, shown.length - rows);
        const mx = Math.max(1, Math.floor(G.cols * 0.04));
        for (let i = 0; i < rows && start + i < shown.length; i++) {
          const line = shown[start + i];
          text(G, mx, i, line.slice(0, G.cols - mx - 1));
          if (start + i === shown.length - 1 && phase % 1 < 0.55) {
            put(G, Math.min(G.cols - 2, mx + line.length), i, '▌');
          }
        }
      },
    },

    {
      name: 'digital clock',
      bg: GREEN,
      len: 13,
      draw(G, t) {
        const now = new Date();
        const show = [now.getHours(), now.getMinutes(), now.getSeconds()];
        const s = clamp(Math.min(Math.floor(G.cols / 28), Math.floor((G.rows - 4) / 5)), 1, 4);
        const dw = 3 * s;
        const gap = s;
        const colonW = s;
        const width = 27 * s;
        let x = Math.floor((G.cols - width) / 2);
        const y = Math.floor(G.rows / 2) - (5 * s) / 2 - 1;
        const on = '█';
        const digit = (num, dx, dy) => {
          const segs = SEG[num];
          Object.keys(SEGS).forEach((key) => {
            if (segs.indexOf(key) < 0) return;
            const [y0, x0, y1, x1] = SEGS[key];
            for (let yy = y0; yy <= y1; yy++) {
              for (let xx = x0; xx <= x1; xx++) {
                for (let a = 0; a < s; a++) {
                  for (let b = 0; b < s; b++) put(G, dx + xx * s + b, dy + yy * s + a, on);
                }
              }
            }
          });
        };
        const blink = now.getSeconds() % 2 === 0 || now.getMilliseconds() < 500;
        const colon = (dx, dy) => {
          for (let a = 0; a < s; a++) {
            for (let b = 0; b < s; b++) {
              put(G, dx + b, dy + 1 * s + a, blink ? on : '.');
              put(G, dx + b, dy + 3 * s + a, blink ? on : '.');
            }
          }
        };
        show.forEach((num, i) => {
          if (i) {
            x += gap;
            colon(x, y);
            x += colonW + gap;
          }
          const str = String(num).padStart(2, '0');
          digit(+str[0], x, y);
          x += dw + gap;
          digit(+str[1], x, y);
          x += dw;
        });
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
        if (G.rows > 14) {
          const date = days[now.getDay()] + ' ' + now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();
          centre(G, y + 5 * s + 2, date);
        }
      },
    },

    {
      name: 'file tree',
      bg: BLACK,
      len: 22,
      init() {
        this.lines = [
          [0, 'dead-internet-radio/', true],
          [1, 'mixes/', true],
          [2, '2026-10-28-late-night/', true],
          [3, 'show-01.mp3', false],
          [3, 'cue-sheet.json', false],
          [1, 'output/', true],
          [2, 'track-01/', true],
          [3, 'music.wav', false],
          [3, 'captions.txt', false],
          [1, 'prompts/', true],
          [2, 'late-night.md', false],
          [1, 'station-ids/', true],
          [2, 'ident-03.wav', false],
          [1, 'public/', true],
          [2, 'visuals/', true],
          [3, 'ascii_rest.js', false],
          [3, 'glyph_board.js', false],
          [1, 'generate.py', false],
          [1, 'djmix.py', false],
          [1, 'README.md', false],
        ];
        this.dirs = [];
        this.lines.forEach((line, i) => {
          if (line[2]) this.dirs.push(i);
        });
        this.openAt = {};
        this.dirs.forEach((d, i) => {
          this.openAt[d] = 0.8 + i * 0.62;
        });
      },
      lastAt(i) {
        const d = this.lines[i][0];
        for (let k = i + 1; k < this.lines.length; k++) {
          if (this.lines[k][0] < d) return true;
          if (this.lines[k][0] === d) return false;
        }
        return true;
      },
      ancestors(i) {
        const out = [];
        let d = this.lines[i][0];
        for (let k = i - 1; k >= 0 && d > 0; k--) {
          if (this.lines[k][0] < d) {
            out.unshift(k);
            d = this.lines[k][0];
          }
        }
        return out;
      },
      draw(G, t) {
        const phase = t % this.len;
        const opening = phase < this.len * 0.58;
        const isOpen = (i) => {
          const at = this.openAt[i] ?? 0;
          return opening ? phase > at : phase > this.len * 0.74 - at * 0.85;
        };
        const rows = [];
        this.lines.forEach((line, i) => {
          const chain = this.ancestors(i);
          if (!chain.every((a) => isOpen(a))) return;
          const prefix = chain
            .map((a, k) => (k === chain.length - 1 ? (this.lastAt(i) ? '└─' : '├─') : this.lastAt(a) ? '    ' : '│   '))
            .join('');
          const child = line[2] && this.lines.some((l, k) => k > i && l[0] === line[0] + 1);
          rows.push(prefix + line[1] + (child && !isOpen(i) ? ' +' : ''));
        });
        const width = rows.reduce((m, r) => Math.max(m, r.length), 18);
        const x0 = Math.max(1, Math.floor((G.cols - width) / 2));
        const y0 = Math.max(1, Math.floor((G.rows - rows.length) / 2) - 1);
        rows.forEach((line, i) => text(G, x0, y0 + i, line));
        const files = this.lines.filter((l) => !l[2]).length;
        text(G, x0, y0 + rows.length + 1, `${this.dirs.length} directories, ${files} files`);
      },
    },

    {
      name: 'git graph',
      bg: GREEN,
      len: 19,
      init() {
        this.rows = [
          ['*   ', 'merge branch feat/ascii-artwork'],
          ['|\\  ', ''],
          ['| * ', 'ascii: rocket and its exhaust'],
          ['| * ', 'ascii: landscape under the moon'],
          ['| * ', 'ascii: a globe that turns'],
          ['* | ', 'docs: note the licence'],
          ['|/  ', ''],
          ['*   ', 'merge branch feat/station-ids'],
          ['|\\  ', ''],
          ['| * ', 'idents: a jingle between sets'],
          ['| * ', 'idents: warmer tape hiss'],
          ['| * ', 'idents: short station sweep'],
          ['* | ', 'djmix: hold the voiceover bus'],
          ['|/  ', ''],
          ['*   ', 'merge branch fix/track-order'],
          ['|\\  ', ''],
          ['| * ', 'scheduler: keep the queue sorted'],
          ['* | ', 'scheduler: rebuild after a skip'],
          ['|/  ', ''],
          ['*   ', 'release 0.6.0'],
          ['*   ', 'prompts: leave the seeds alone'],
          ['*   ', 'admin: a play count per track'],
          ['*   ', 'visuals: prewarm the thumbnails'],
          ['*   ', 'player: reconnect the stream'],
        ];
      },
      draw(G, t) {
        const phase = t % this.len;
        const head = `$ git log --graph --oneline`;
        text(G, 0, 0, head);
        const visible = Math.max(2, G.rows - 3);
        const scroll = phase * 2.2;
        const start = Math.floor(scroll);
        const frac = scroll - start;
        for (let i = 0; i < visible; i++) {
          const row = this.rows[(start + i) % this.rows.length];
          const typing = i === visible - 1 ? clamp(frac * 2.4, 0, 1) : 1;
          const msg = row[1].slice(0, Math.ceil(row[1].length * typing));
          const sha = Math.floor(hash(start + i, 3) * 0xfffffff).toString(16).padStart(7, '0');
          const line = row[0] + (row[1] ? sha + ' ' + msg : '');
          text(G, 0, 2 + i, line.slice(0, G.cols));
        }
        const commits = this.rows.filter((r) => r[1]).length;
        text(G, 0, G.rows - 1, ` ${commits} commits  ·  ${(phase * 2.2) | 0} shown`);
      },
    },

    {
      name: 'pipeline',
      bg: BLACK,
      len: 23,
      init() {
        this.stages = ['install', 'lint', 'test', 'build', 'deploy'];
        this.runs = [
          { label: 'feat/ascii-artwork', sha: 'a3f9c21', fail: 2 },
          { label: 'feat/ascii-artwork', sha: '7c41de0', fail: -1 },
        ];
        this.lens = [
          [2.6, 1.5, 3.4, 2.4, 2.1],
          [2.2, 1.3, 3.1, 2.2, 2.0],
        ];
      },
      draw(G, t) {
        const phase = t % this.len;
        const which = phase < this.len * 0.5 ? 0 : 1;
        const startT = which === 0 ? 0.6 : this.len * 0.5;
        const run = this.runs[which];
        const lens = this.lens[which];
        const w = Math.min(G.cols - 2, 68);
        const x0 = Math.max(0, Math.floor((G.cols - w) / 2));
        const y0 = Math.max(1, Math.floor((G.rows - 12) / 2));
        box(G, x0, y0, x0 + w, y0 + 11);
        const title = ` ci · ${run.label} · ${run.sha} `;
        text(G, x0 + 3, y0, title);
        let elapsed = phase - startT;
        const total = lens.reduce((a, b) => a + b, 0);
        const spin = '|/-\\'[Math.floor(t * 9) % 4];
        let acc = 0;
        let current = -1;
        this.stages.forEach((stage, i) => {
          const y = y0 + 2 + i;
          const s = acc;
          acc += lens[i];
          const local = clamp((elapsed - s) / lens[i], 0, 1);
          const failed = run.fail === i && local >= 1;
          const queued = elapsed < s;
          const skipped = run.fail >= 0 && i > run.fail;
          text(G, x0 + 2, y, stage.slice(0, 9).padEnd(9));
          if (queued || skipped) {
            put(G, x0 + 12, y, '·');
            hline(G, x0 + 15, x0 + 15 + 16, y, '·');
            text(G, x0 + 35, y, skipped ? 'skipped' : 'queued');
            return;
          }
          const f = failed ? 0.62 : local;
          bar(G, x0 + 15, y, 17, f, failed ? '▓' : '█', '░');
          text(G, x0 + 34, y, (Math.min(local, 1) * lens[i]).toFixed(1).padStart(5) + 's');
          if (local < 1) {
            current = i;
            put(G, x0 + 12, y, spin);
            text(G, x0 + 43, y, 'running');
          } else {
            put(G, x0 + 12, y, failed ? 'x' : '+');
            text(G, x0 + 43, y, failed ? 'failed' : 'passed');
          }
        });
        const idx = current >= 0 ? current : run.fail >= 0 ? run.fail : this.stages.length - 1;
        const stage = this.stages[idx];
        const out = {
          install: 'added 412 packages in 9s',
          lint: '0 problems',
          test: run.fail >= 0 ? '126 passed, 2 failed  nav.test.ts' : '128 passed',
          build: 'dist/ built in 7.9s, 42 kB',
          deploy: 'ready  https://example.invalid',
        }[stage];
        if (G.rows > 15) {
          text(G, x0 + 2, y0 + 8, '$ npm run ' + stage);
          text(G, x0 + 4, y0 + 9, (out || '').slice(0, w - 6));
        }
        const mins = Math.floor(elapsed / 60);
        const secs = Math.floor(elapsed % 60);
        const summary =
          elapsed < 0
            ? 'queued · waiting for a runner'
            : run.fail >= 0 && idx === run.fail
              ? `failed at ${stage} · ${mins}:${String(secs).padStart(2, '0')}`
              : `passed · deployed in ${mins}:${String(secs).padStart(2, '0')}`;
        text(G, x0 + 2, y0 + 10, (elapsed < total ? 'running · stage ' + (idx + 1) + ' of 5' : summary).slice(0, w - 4));
      },
    },

    {
      name: 'progress bar',
      bg: GREEN,
      len: 15,
      init() {
        this.labels = ['fetching', 'unpacking', 'indexing', 'building', 'linking'];
        this.rates = [4.6, 3.2, 5.4, 3.9, 4.9];
        this.offsets = [0.2, 2.1, 1.1, 3.4, 0.6];
        this.styles = [
          (f, w) => {
            const n = Math.floor(f * w);
            const inner = '='.repeat(n) + (n < w ? '>' + ' '.repeat(w - n - 1) : '');
            return '[' + inner + ']';
          },
          (f, w) => {
            const units = Math.round(f * w * 8);
            const full = units >> 3;
            const part = ' ▏▎▍▌▋▊▉'[units & 7];
            return '▕' + '▉'.repeat(full) + (full < w ? part + ' '.repeat(w - full - 1) : '') + '▏';
          },
          (f, w) => {
            const n = Math.floor(f * w);
            return '[' + '#'.repeat(n) + '.'.repeat(w - n) + ']';
          },
          (f, w) => {
            const n = Math.round(f * (w / 2));
            return ('▉ '.repeat(n) + '░ '.repeat(Math.max(0, w / 2 - n))).slice(0, w);
          },
          (f, w) => {
            const n = Math.floor(f * w * 2);
            const full = n >> 1;
            return '━'.repeat(full) + (full < w ? (n & 1 ? '╾' : '─') + '─'.repeat(w - full - 1) : '');
          },
        ];
      },
      draw(G, t) {
        const phase = t % this.len;
        const w = Math.min(G.cols - 20, 32);
        const x0 = Math.max(1, Math.floor((G.cols - (w + 18)) / 2));
        const y0 = Math.floor((G.rows - 9) / 2);
        this.labels.forEach((label, i) => {
          const cycle = this.rates[i];
          const raw = (phase + this.offsets[i]) / cycle;
          const f = raw - Math.floor(raw);
          text(G, x0, y0 + i * 2, label.padEnd(10));
          text(G, x0 + 11, y0 + i * 2, this.styles[i](f, w));
          text(G, x0 + 12 + w, y0 + i * 2, (Math.floor(f * 100) + '%').padStart(4));
        });
      },
    },

    {
      name: 'cpu meters',
      bg: BLACK,
      len: 17,
      init() {
        this.cores = Array.from({ length: 8 }, (_, i) => ({ base: 0.1 + hash(i, 3) * 0.22, ph: hash(i, 7) * 6 }));
        this.procs = [
          ['build', 'app'], ['indexer', 'app'], ['server', 'app'], ['ffmpeg', 'root'],
          ['sync', 'app'], ['editor', 'app'], ['shell', 'app'],
        ].map((p, i) => ({
          cmd: p[0], user: p[1], pid: 1024 + Math.floor(hash(i, 11) * 40000),
          virt: 0.4 + hash(i, 2) * 3, res: 0.3 + hash(i, 5) * 3,
          time: 12 + hash(i, 9) * 2400, share: 0.3 + hash(i, 4),
        }));
        this.mem = 4.6;
        this.swap = 0.13;
        this.load = [1.62, 1.24, 0.91];
      },
      draw(G, t, env) {
        const level = env.lvl || 0;
        const W = G.cols;
        const H = G.rows;
        const cells = 16;
        const meterW = 27;
        const twoCol = W >= meterW * 2 + 3;
        const blockW = twoCol ? meterW * 2 + 3 : meterW;
        const x0 = Math.max(0, Math.round((W - blockW) / 2));
        const table = H >= 20;
        const totalH = 4 + 3 + (table ? 7 : 0);
        const y0 = Math.max(0, Math.round((H - totalH) / 2));
        const meter = (label, frac, sys, pct) => {
          const used = Math.round(clamp(frac, 0, 1) * cells);
          const extra = Math.round(clamp(sys, 0, 1 - frac) * cells);
          let bar = '';
          for (let i = 0; i < cells; i++) bar += i < used ? '|' : i < used + extra ? '#' : ' ';
          return String(label).padStart(2) + '[' + bar + ']' + pct.padStart(6);
        };
        for (let i = 0; i < this.cores.length; i++) {
          if (!twoCol && i >= 4) break;
          const c = this.cores[i];
          const used = clamp(c.base + 0.3 * Math.abs(Math.sin(t * 0.7 + c.ph)) + level * 0.3, 0.01, 0.98);
          const sys = clamp(used * (0.1 + 0.2 * Math.abs(Math.sin(t * 0.31 + c.ph))), 0, 1 - used);
          const col = i < 4 ? 0 : 1;
          const row = i % 4;
          text(G, x0 + col * (meterW + 3), y0 + row, meter(i, used, sys, ((used + sys) * 100).toFixed(1) + '%'));
        }
        const rightX = x0 + (twoCol ? meterW + 3 : 0);
        const my = y0 + 4;
        text(G, x0, my, meter('Mem', this.mem / 15.5, 0.01, this.mem.toFixed(1) + '/15G'));
        text(G, x0, my + 1, meter('Swp', this.swap / 2, 0, this.swap.toFixed(2) + '/2G'));
        const up = Math.floor(t + 18240);
        text(G, rightX, my, `Tasks: 141, 418 thr; ${1 + Math.floor(level * 3)} running`);
        text(G, rightX, my + 1, 'Load avg: ' + this.load.map((v) => (v + level * 0.5).toFixed(2)).join(' '));
        text(G, rightX, my + 2, `Uptime: 3 days, ${String(Math.floor(up / 3600) % 24).padStart(2, '0')}:${String(Math.floor(up / 60) % 60).padStart(2, '0')}:${String(up % 60).padStart(2, '0')}`);
        if (!table) return;
        const ty = y0 + 7;
        text(G, x0, ty, '  PID USER       VIRT   RES S   CPU%  MEM%      TIME+  Command');
        const sorted = this.procs
          .map((p, i) => ({ ...p, score: p.share * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.9 + i))) + level * p.share }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        sorted.forEach((p, i) => {
          const cpu = Math.min(99, p.score * 100).toFixed(1);
          const line =
            String(p.pid).padStart(5) + ' ' + p.user.padEnd(8) + ' ' +
            (p.virt.toFixed(1) + 'G').padStart(5) + ' ' +
            ((p.res * 3).toFixed(1) + 'M').padStart(5) + ' ' +
            (+cpu > 30 ? 'R' : 'S') + ' ' +
            cpu.padStart(6) + ' ' + (p.res * 2).toFixed(1).padStart(5) + ' ' +
            (Math.floor(p.time) + ':12.44').padStart(9) + '  ' + p.cmd;
          text(G, x0, ty + 1 + i, line);
        });
      },
    },

    {
      name: 'heartbeat',
      bg: BLACK,
      len: 15,
      beat(u) {
        if (u < 0.1) return 0;
        if (u < 0.14) return -0.14 * ((u - 0.1) / 0.04);
        if (u < 0.22) return -0.14 + 1.14 * ((u - 0.14) / 0.08);
        if (u < 0.27) return 1 - 1.3 * ((u - 0.22) / 0.05);
        if (u < 0.36) return -0.3 + 0.3 * ((u - 0.27) / 0.09);
        if (u < 0.52) return 0.22 * Math.sin(((u - 0.36) / 0.16) * Math.PI);
        return 0;
      },
      draw(G, t, env) {
        const W = G.cols;
        const H = G.rows;
        const bpm = 60 + Math.round((env.lvl || 0) * 44) + Math.round(2 * Math.sin(t * 0.5));
        const panel = 18;
        const x1 = Math.max(10, W - panel);
        const mid = Math.round(H * 0.56);
        const amp = clamp(Math.round(H * 0.26), 3, 9);
        for (let y = 2; y < H - 1; y += 3) {
          for (let x = 0; x < x1; x += 6) put(G, x, y, '·');
        }
        let prev = null;
        for (let x = 0; x < x1; x++) {
          const u = ((t / (60 / bpm)) + (x / x1) * 1.7) % 1;
          const y = Math.round(mid - this.beat(u) * amp);
          const slope = prev === null ? 0 : y - prev;
          const ch = Math.abs(slope) >= 2 ? '│' : slope < -0.5 ? '╱' : slope > 0.5 ? '╲' : '─';
          if (prev === null) put(G, x, y, ch);
          else if (Math.abs(slope) >= 2) {
            const lo = Math.min(prev, y);
            const hi = Math.max(prev, y);
            for (let yy = lo; yy <= hi; yy++) put(G, x, yy, ch);
          } else put(G, x, y, ch);
          prev = y;
        }
        vline(G, x1 + 1, 1, H - 2, '│');
        const bx = x1 + 3;
        text(G, bx, 1, 'ecg  ii');
        const blockFont = {
          0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['##.', '.#.', '.#.', '.#.', '###'],
          2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'],
          4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
          6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '..#', '..#'],
          8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
        };
        const digits = String(bpm).split('');
        const dw = 7;
        const dx = x1 + 2;
        digits.forEach((d, i) => {
          blockFont[d].forEach((line, yy) => {
            for (let xx = 0; xx < 3; xx++) {
              if (line[xx] !== '#') continue;
              put(G, dx + i * dw + xx * 2, 3 + yy, '█');
              put(G, dx + i * dw + xx * 2 + 1, 3 + yy, '█');
            }
          });
        });
        text(G, bx, 9, 'bpm');
        text(G, bx, H - 2, '25 mm/s');
      },
    },

    {
      name: 'typewriter',
      bg: GREEN,
      len: 24,
      init() {
        this.order = MESSAGES.map((_, i) => i).sort(() => Math.random() - 0.5);
        this.at = 0;
        this.next = this.order[0];
        this.order = this.order.slice(1).concat(this.order.slice(0, 1));
        this.shown = '';
        this.target = MESSAGES[this.next];
        this.phase = 'type';
        this.wait = 0.4;
        this.last = 0;
        this.blink = 0;
      },
      draw(G, t) {
        if (!this.at) this.at = t;
        const dt = clamp(t - this.last, 0, 0.12);
        this.last = t;
        this.wait -= dt;
        this.blink += dt;
        if (this.wait <= 0) {
          if (this.phase === 'type') {
            const n = this.shown.length + 1;
            this.shown = this.target.slice(0, n);
            const ch = this.target[n - 1];
            this.wait = 0.045 + Math.random() * 0.09 + (ch === ' ' ? 0.05 : 0) + (Math.random() < 0.04 ? 0.35 : 0);
            if (n >= this.target.length) {
              this.phase = 'hold';
              this.wait = 2.2 + Math.random() * 1.2;
            }
          } else if (this.phase === 'hold') {
            this.phase = 'del';
            this.wait = 0;
          } else {
            this.shown = this.shown.slice(0, Math.max(0, this.shown.length - 1));
            this.wait = 0.03;
            if (!this.shown.length) {
              this.phase = 'type';
              this.next = this.order[0];
              this.order = this.order.slice(1).concat(this.order[0]);
              this.target = MESSAGES[this.next];
              this.wait = 0.5;
            }
          }
        }
        const w = Math.max(16, Math.min(G.cols - 6, 62));
        const lines = wrap(this.shown || ' ', w);
        const cursorOn = this.blink % 1.06 < 0.55;
        const y0 = Math.floor(G.rows / 2) - Math.floor(lines.length / 2);
        const x0 = Math.floor((G.cols - w) / 2);
        lines.forEach((line, i) => {
          text(G, x0, y0 + i, line);
          if (i === lines.length - 1 && cursorOn) put(G, x0 + line.length, y0 + i, '▌');
        });
      },
    },
  ];

  let Gcols = 80;
  let Grows = 30;
  let grid = null;
  let myP5 = null;
  let sceneIdx = 0;
  let sceneAt = 0;
  let switchAt = -1;
  let switched = false;

  const FADE = 0.9;

  function level() {
    if (!(typeof audioAnalysisReady !== 'undefined' && audioAnalysisReady && analyser && frequencyData)) {
      return { bass: 0, lvl: 0 };
    }
    const gain = (window.audioInputGain ?? 50) / 50;
    analyser.getByteFrequencyData(frequencyData);
    let bass = 0;
    let all = 0;
    for (let i = 1; i < 12; i++) bass += frequencyData[i];
    for (let i = 1; i < 200; i++) all += frequencyData[i];
    const b = Math.min(1, (bass / 11 / 255) * gain);
    const l = Math.min(1, (all / 199 / 255) * 1.6 * gain);
    return { bass: isFinite(b) ? b : 0, lvl: isFinite(l) ? l : 0 };
  }

  function start() {
    ['block-canvas', 'gif-bg', 'overlay-canvas'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    myP5 = new p5((p) => {
      let ctx;
      let cw = 8;
      let chh = 14;
      let ox = 0;
      let oy = 0;

      function layout() {
        const W = p.width;
        const H = p.height;
        const cutoff = window._cutoffVal ?? 130;
        const fs = Math.round(clamp((W / 50) * (0.85 + (cutoff / 255) * 0.5), 10, 40));
        ctx.font = `400 ${fs}px ${MONO}`;
        cw = Math.max(4, ctx.measureText('MMMMMMMMMMMMMMMMMMMM').width / 20);
        chh = Math.max(6, Math.round(fs * 1.06));
        Gcols = Math.max(18, Math.floor(W / cw));
        const top = Math.max(52, Math.round(H * 0.055));
        const usable = H - top - 10;
        Grows = Math.max(10, Math.floor(usable / chh));
        ox = Math.round((W - Gcols * cw) / 2);
        oy = top + Math.round((usable - Grows * chh) / 2);
        if (grid && grid.cols === Gcols && grid.rows === Grows) return;
        grid = { cols: Gcols, rows: Grows, a: [] };
        for (let y = 0; y < Grows; y++) grid.a.push(new Array(Gcols).fill(' '));
        SCENES[sceneIdx].init && SCENES[sceneIdx].init();
      }

      function paint(G) {
        ctx.font = `400 ${Math.round(chh * 0.94)}px ${MONO}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let y = 0; y < G.rows; y++) {
          const row = G.a[y];
          let x = 0;
          while (x < G.cols) {
            if (row[x] === ' ') {
              x++;
              continue;
            }
            const h = heat(row[x]);
            let x2 = x + 1;
            while (x2 < G.cols && row[x2] !== ' ' && heat(row[x2]) === h) x2++;
            ctx.fillStyle = h === 0 ? DIM : h === 1 ? MID : HOT;
            ctx.fillText(row.slice(x, x2).join(''), ox + Math.round(x * cw), oy + Math.round(y * chh));
            x = x2;
          }
        }
      }

      p.setup = () => {
        visuals.setupP5Canvas(p);
        ctx = p.drawingContext;
        layout();
        sceneAt = 0;
        switchAt = -1;
        switched = false;
        sceneIdx = 0;
        SCENES[sceneIdx].init && SCENES[sceneIdx].init();
      };

      p.draw = () => {
        const now = p.millis() / 1000;
        const W = p.width;
        const H = p.height;
        if (Gcols !== Math.max(18, Math.floor(W / cw)) || Grows !== Math.max(10, Math.floor((H - Math.max(52, Math.round(H * 0.055)) - 10) / chh))) layout();
        const scene = SCENES[sceneIdx];
        const { bass, lvl } = level();

        if (switchAt < 0 && now - sceneAt >= scene.len) {
          switchAt = now;
          switched = false;
        }
        if (switchAt >= 0) {
          const k = (now - switchAt) / FADE;
          if (!switched && k >= 0.5) {
            switched = true;
            sceneIdx = (sceneIdx + 1) % SCENES.length;
            sceneAt = now;
            grid.a.forEach((row) => row.fill(' '));
            SCENES[sceneIdx].init && SCENES[sceneIdx].init();
          }
          if (k >= 1) switchAt = -1;
        }

        grid.a.forEach((row) => row.fill(' '));
        const cur = SCENES[sceneIdx];
        cur.draw(grid, now - sceneAt, { bass, lvl });

        ctx.fillStyle = cur.bg;
        ctx.fillRect(0, 0, W, H);
        paint(grid);

        if (switchAt >= 0) {
          const k = (now - switchAt) / FADE;
          const a = clamp(k < 0.5 ? k * 2 : (1 - k) * 2, 0, 1);
          ctx.fillStyle = `rgba(0,0,0,${a})`;
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = `rgba(150,255,190,${0.10 * (1 - a)})`;
          ctx.fillRect(0, Math.round(k * H), W, Math.max(2, Math.round(H * 0.018)));
        }

        canvasFilters.applyToP5(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
        layout();
      };
    });
  }

  function stop() {
    visuals.stopP5(myP5);
    myP5 = null;
  }

  return { name: 'ASCII Rest', start, stop };
})());
