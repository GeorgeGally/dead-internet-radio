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
const PORT = 9341;

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

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
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
  await sleep(SETTLE_MS);
  await evaluate(`document.getElementById('visual-notification')?.remove()`);
  const shot = await send('Page.captureScreenshot', {
    format: 'jpeg', quality: 80,
    clip: { x: 0, y: 0, width: 1280, height: 720, scale: 0.5 },
  });
  writeFileSync(path.join(outDir, `${id}.jpg`), Buffer.from(shot.data, 'base64'));
  console.log(`ok   ${id}`);
}

ws.close();
proc.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
