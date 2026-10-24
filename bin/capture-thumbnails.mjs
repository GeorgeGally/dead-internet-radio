#!/usr/bin/env node
// Screenshot every artwork (or the ids given) into public/visuals/thumbs/<id>.jpg,
// the fixed previews the gallery shows.
//
//   node bin/capture-thumbnails.mjs                 # all artworks
//   node bin/capture-thumbnails.mjs eyes giphy      # just these
//
// Needs the player running (bin/dev, or PLAYER_URL=http://localhost:3100/).
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const visualsDir = path.join(root, 'public/visuals');
const outDir = path.join(visualsDir, 'thumbs');
const url = process.env.PLAYER_URL || 'http://localhost:3000/';
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SETTLE_MS = Number(process.env.SETTLE_MS || 6000);
// Drawings that build up over time look empty after a few seconds.
const SLOW = {
  trail: 40000, twirlz: 40000, particle_machine: 40000, particle_drawings: 40000,
  delayed_lerp_points2c: 40000, delayed_lerp_points_1600: 40000, delayed_lerp_points7: 40000,
  delayed_lerp_points7b: 40000, delayed_lerp_points8: 40000, bubbles: 30000,
};
const PORT = 9341;
const OUT = 600; // square tile, px

const all = readdirSync(visualsDir)
  .filter((f) => f.endsWith('.js'))
  .flatMap((f) => [...readFileSync(path.join(visualsDir, f), 'utf8').matchAll(/visuals\.register\('([\w-]+)'/g)].map((m) => m[1]));
const ids = process.argv.length > 2 ? process.argv.slice(2) : all;

const profile = mkdtempSync(path.join(tmpdir(), 'dir-thumbs-'));
const proc = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = pages.find((p) => p.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  const onMsg = (e) => {
    const m = JSON.parse(e.data);
    if (m.id !== id) return;
    ws.removeEventListener('message', onMsg);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  };
  ws.addEventListener('message', onMsg);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true })).result.value;

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
await send('Page.navigate', { url });
await sleep(4000);
// Only the artwork: no deck, splash, captions or gallery.
await evaluate(`(() => {
  visuals.cancelPrewarm();
  const s = document.createElement('style');
  s.textContent = '#welcome-splash,#deck,#visual-notification,[id*="gallery"],[class*="gallery"]{display:none!important}';
  document.head.appendChild(s);
})()`);

mkdirSync(outDir, { recursive: true });
for (const id of ids) {
  const ok = await evaluate(`(() => { visuals.cancelPrewarm(); const ok = !!visuals.activate(${JSON.stringify(id)});
    // Plain artwork: drop any filter its saved preset switched on.
    canvasFilters.clearActive();
    return ok;
  })()`);
  if (!ok) { console.log(`skip ${id}`); continue; }
  await sleep(SLOW[id] || SETTLE_MS);
  // A track change or the rotation timer can switch artworks mid-wait.
  for (let tries = 0; tries < 3 && await evaluate(`visuals.getCurrentId()`) !== id; tries++) {
    await evaluate(`visuals.activate(${JSON.stringify(id)}); canvasFilters.clearActive()`);
    await sleep(SLOW[id] || SETTLE_MS);
  }
  // A preset can switch a filter on after activation; screenshots are of the plain artwork.
  await evaluate(`document.getElementById('visual-notification')?.remove(); canvasFilters.clearActive()`);
  await sleep(500);
  // Most artworks are thin drawings on a big empty field; a whole-screen
  // shot shrunk to a tile reads as nothing. Find where the drawing is and
  // crop a square around it, zooming in on sparse ones.
  const full = await send('Page.captureScreenshot', { format: 'png' });
  const crop = await evaluate(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${'${full.data}'}';
    await img.decode();
    const W = 320, H = 180, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    // Background = the most common colour along the border.
    const counts = new Map();
    const q = (i) => ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const k = q(4 * (y * W + x)); counts.set(k, (counts.get(k) || 0) + 1); }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const k = q(4 * (y * W + x)); counts.set(k, (counts.get(k) || 0) + 1); }
    const bg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const br = ((bg >> 8) & 15) * 16 + 8, bgG = ((bg >> 4) & 15) * 16 + 8, bb = (bg & 15) * 16 + 8;
    const rows = new Array(H).fill(0), cols = new Array(W).fill(0);
    let total = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = 4 * (y * W + x);
      if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgG) + Math.abs(d[i + 2] - bb) > 60) { rows[y]++; cols[x]++; total++; }
    }
    if (total < 20) return null;
    // Trim 3% of the drawing off each side so stray specks don't widen the box.
    const edge = (arr) => { let acc = 0, lo = 0, hi = arr.length - 1;
      for (let i = 0; i < arr.length; i++) { acc += arr[i]; if (acc > total * 0.03) { lo = i; break; } }
      acc = 0; for (let i = arr.length - 1; i >= 0; i--) { acc += arr[i]; if (acc > total * 0.03) { hi = i; break; } }
      return [lo, hi]; };
    const [y0, y1] = edge(rows), [x0, x1] = edge(cols);
    const sx = 1280 / W;
    const cx = ((x0 + x1) / 2) * sx, cy = ((y0 + y1) / 2) * sx;
    const side = Math.max(260, Math.min(720, Math.max(x1 - x0, y1 - y0) * sx * 1.15));
    return { x: Math.max(0, Math.min(1280 - side, cx - side / 2)), y: Math.max(0, Math.min(720 - side, cy - side / 2)), side };
  })()`);
  const box = crop || { x: 280, y: 0, side: 720 };
  const shot = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 85,
    clip: { x: box.x, y: box.y, width: box.side, height: box.side, scale: OUT / box.side / 2 },
  });
  writeFileSync(path.join(outDir, `${id}.jpg`), Buffer.from(shot.data, 'base64'));
  console.log(`ok   ${id}`);
}

ws.close();
proc.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
