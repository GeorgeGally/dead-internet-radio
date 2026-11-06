'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');

test('HTML has the radio player shell', () => {
  assert.match(html, /id="gif-bg"/);
  assert.match(html, /id="overlay-canvas"/);
  assert.match(html, /id="deck"/);
  assert.match(html, /id="player"/);
  assert.match(html, /id="voiceover-el"/);
  assert.match(html, /id="wave"/);
  assert.match(html, /id="track-title"/);
});

test('HTML has transport controls and speaker', () => {
  assert.match(html, /id="btn-play"/);
  for (const id of ['btn-gallery', 'btn-play', 'btn-request', 'btn-vote-up', 'btn-vote-down']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="`));
    assert.match(html, new RegExp(`class="abtn-label"[^>]*for="${id}"`));
  }
  assert.doesNotMatch(html, /id="btn-stop"/);
  assert.match(html, /class="speaker"/);
  assert.match(html, /class="marquee"/);
  assert.match(html, /class="transport"/);
});

test('CSS defines the deck, gif background, and overlay canvas', () => {
  assert.match(css, /#gif-bg/);
  assert.match(css, /#overlay-canvas/);
  assert.match(css, /#deck/);
  assert.match(css, /linear-gradient/);
  assert.match(css, /z-index:\s*10/);
});

test('CSS layers canvases correctly', () => {
  assert.match(css, /#overlay-canvas[\s\S]*pointer-events:\s*none/);
  assert.match(css, /#overlay-canvas[\s\S]*z-index:\s*3/);
  assert.match(css, /#block-canvas[\s\S]*z-index:\s*1/);
  assert.match(css, /#gif-bg[\s\S]*z-index:\s*0/);
});

test('CSS styles the waveform canvas and marquee', () => {
  assert.match(css, /#wave/);
  assert.match(css, /\.marquee/);
  assert.match(css, /\.marquee\.scrolling/);
  assert.match(css, /\.wave-wrap[\s\S]*height:\s*60px/);
  assert.match(css, /#wave[\s\S]*height:\s*36px/);
  assert.match(css, /\.marquee[\s\S]*height:\s*18px/);
  assert.match(css, /\.marquee span[\s\S]*line-height:\s*16px/);
  assert.match(css, /scroll-text/);
  assert.match(css, /content:\s*attr\(data-repeat\)/);
  assert.match(css, /transform:\s*translateX\(-50%\)/);
});

test('CSS styles the analogue-style transport plate and buttons', () => {
  assert.match(css, /\.transport[\s\S]*border-radius/);
  assert.match(css, /\.transport[\s\S]*inset/);
  assert.match(css, /\.abtn/);
  assert.match(css, /\.abtn:active/);
  assert.match(css, /\.led\.on/);
});

test('CSS respects reduced motion', () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /#gif-bg[\s\S]*display:\s*none/);
});

test('JavaScript sets up audio and track navigation', () => {
  assert.match(js, /function setupAudio/);
  assert.match(js, /playlist\.epoch \|\| EPOCH/);
  assert.match(js, /function onTrackEnd/);
  assert.match(js, /playlist\.tracks\.length < 2[\s\S]*nextStation\(/);
  assert.match(js, /function nextTrack/);
  assert.match(js, /function prevTrack/);
  assert.match(js, /function togglePlay/);
  assert.match(js, /togglePlay\(\)/);
  assert.doesNotMatch(js, /setupAudio\(true\)/);
  assert.match(js, /audio\.addEventListener\('ended'/);
  assert.match(js, /audio\.play\(\)/);
});

test('JavaScript handles local preview without broadcast JSON', () => {
  assert.match(js, /LOCAL_PREVIEW_PLAYLIST/);
  assert.match(js, /function isLocalPreview/);
  assert.match(js, /function loadBroadcastData/);
  assert.match(js, /showsList\.find\(s => s\.trackCount > 1\)/);
  assert.match(js, /'\.\.\/dist\/'/);
});

test('JavaScript renders the overlay and waveform', () => {
  assert.match(js, /function feedWave/);
  assert.match(js, /function drawWave/);
  assert.match(js, /visuals\.init\(\)/);
  assert.match(js, /randomArtwork/);
  assert.match(js, /WAVE_BARS/);
  const stopPlayback = js.match(/function stopPlayback\(\) \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(stopPlayback, /waveHistory\s*=\s*\[\]/);
  assert.doesNotMatch(stopPlayback, /currentTime\s*=\s*0/);
});

test('the player page is served uncached with hashed asset URLs', () => {
  const page = fs.readFileSync(path.join(root, 'lib/player_page.rb'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'config/application.rb'), 'utf8');
  assert.match(page, /"cache-control" => "no-cache"/);
  assert.match(page, /\?v=#\{Digest::SHA256\.file/);
  assert.match(app, /middleware\.insert_before 0, PlayerPage/);
});

test('every page head links the icon set, and the player hashes it', () => {
  const player = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const icons = fs.readFileSync(path.join(root, 'app/views/layouts/_icons.html.erb'), 'utf8');
  for (const file of ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'site.webmanifest']) {
    assert.ok(fs.existsSync(path.join(root, 'public', file)), file);
    assert.match(player, new RegExp(`href="${file}"`));
    assert.match(icons, new RegExp(`hashed_public_path "/${file}"`));
  }
  for (const layout of ['admin', 'login']) {
    const html = fs.readFileSync(path.join(root, `app/views/layouts/${layout}.html.erb`), 'utf8');
    assert.match(html, /render "layouts\/icons"/);
  }
  const { icons: listed } = JSON.parse(fs.readFileSync(path.join(root, 'public/site.webmanifest'), 'utf8'));
  for (const { src } of listed) assert.ok(fs.existsSync(path.join(root, 'public', src.split('?')[0])), src);
  const stamper = fs.readFileSync(path.join(root, 'lib/player_page.rb'), 'utf8');
  assert.match(stamper, /ico\|svg\|png\|webmanifest/);
});

test('the music drops under a DJ voice only once the voice is playing, and always comes back', () => {
  assert.match(js, /addEventListener\('playing', \(\) => setMusicLevel\(MUSIC_UNDER_VOICE\)/);
  for (const event of ['ended', 'error']) {
    assert.match(js, new RegExp(`addEventListener\\('${event}', \\(\\) => setMusicLevel\\(1\\)`));
  }
  assert.match(js, /function stopVoiceover[\s\S]*?setMusicLevel\(1\);\n}/);
});

test('a track change picks a weighted artwork, so no artwork always follows another', () => {
  assert.doesNotMatch(js, /whenQuiet\(\(\) => visuals\.next\(\)\)/);
});

test('Eyes never inherits the filters of the artwork before it', () => {
  const gallery = fs.readFileSync(path.join(root, 'public/visuals/gallery.js'), 'utf8');
  assert.match(gallery, /eyes: \{ filters: \[\], cutoff: 130, resonance: 50 \}/);
});
