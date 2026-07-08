---
title: "feat: Block Visualization Layer — Audio-Reactive Generative Visuals"
status: active
date: 2026-06-14
---

## Summary

Replace the teletext page body content with a full-screen generative block visualization that reacts to the playing audio. Blocks scroll and animate in a grid, driven by frequency data from the Web Audio API. Text content (DJ scripts during announcements, track metadata during music) appears in solid block areas within the grid. The teletext header bar and navigation footer remain as framing. The visual system is adapted from the original generative art code — using its block grid, color palettes, DJ names list, and perlin-based coloring — simplified to focus on audio reactivity and text display.

---

## Problem Frame

The current website renders static teletext-style pages (P100-P105) as the visual layer. While fitting the broadcast aesthetic, these pages do not respond to the audio or leverage the generative art heritage of the project. The generation pipeline produces rich metadata (DJ scripts, lyrics, artist bio per track) that is currently invisible to listeners. The user wants the visual layer to feel alive — blocks that breathe with the music, text that appears in the gaps, and a modern-but-ASCII aesthetic that matches the robot-music ethos.

**Scope boundary:** The teletext header (`P100 DEAD INTERNET RADIO HH:MM:SS`) and navigation footer (`◄ PREV / NEXT ►`) remain. Only `#page-body` content area is replaced. Page cycling (P100-P105) is replaced by a single continuous block visualization. Audio engine (epoch sync, track advance) stays untouched.

---

## Requirements

- Block grid renders on a `<canvas>` element filling the page body area
- Blocks scroll/flow continuously (vertical direction based on audio energy)
- Block colors are driven by audio frequency data (low/mid/high bands map to color regions)
- Text content appears within solid block gaps — DJ script text when a DJ announcement is playing, track metadata when music plays
- Names from the original DJ names list (Bl0ckb3at, Bas32, C64, etc.) are used as DJ identities, cycling per broadcast session
- Color palettes from the original code (20+ palettes) are used, selected per track
- Teletext header and nav remain unchanged
- Page cycling (prev/next/8s timer) is removed — the visualization is continuous
- The feel is modern clean with an ASCII vibe — blocky, monochrome-leaning but with palette accent colors
- Build pipeline updated to include DJ scripts and lyrics in the browser-loadable data
- Respects `prefers-reduced-motion`

---

## Key Technical Decisions

**KTD1 — Canvas2D over DOM/CSS.**
Block grid rendering at 60fps with potentially hundreds of cells demands Canvas2D. DOM-based approaches would struggle with per-frame color updates. Canvas text rendering handles the ASCII-typography requirement directly.

**KTD2 — AudioContext from existing `<audio>` element via `createMediaElementSource`.**
The existing `<audio id="player">` is the audio source. `createMediaElementSource(audio)` feeds it into an `AnalyserNode`. This avoids a second decode or microphone capture.

**KTD3 — Two visualization modes: announcement vs track.**
Track 0 (DJ opening) triggers "announcement mode": blocks are subdued (slower, darker), DJ script text is prominent. Tracks 1+ trigger "track mode": blocks are energetic (audio-reactive), track info appears in block gaps.

**KTD4 — Expanded playlist.json with `script` and `lyrics` fields.**
Currently `playlist.json` carries minimal metadata. Add optional `script` (for DJ announcement text) and `lyrics` fields per track, sourced from the prompt JSONs at build time.

**KTD5 — Names list seeded per build from build timestamp.**
The 25 DJ names from the original code are shuffled using the build date as a seed. The first name in the shuffled list is the DJ for that broadcast session.

---

## High-Level Technical Design

### Data Flow

```
playlist.json ──→ app.js
  tracks[n]:
    file, durationMs, caption, bpm, key
    + script (dj text, track 0 only)
    + lyrics
    + artist, title

                        ↓
              AudioEngine (existing)
              ↓ plays MP3          ↓ AnalyserNode
         Canvas Block Engine ◄── frequency data (Uint8Array, 128 bins)
              ↓
         Render loop (requestAnimationFrame):
           1. Get frequency data
           2. Map bins → block colors
           3. Scroll blocks
           4. Determine text content from current track mode
           5. Draw blocks + overlay text
```

### Visualization Modes

| Mode | When | Blocks | Text |
|------|------|--------|------|
| Announcement | Track 0 playing | Slow scroll, muted palette, low reactivity | DJ script, large, centered in solid block areas |
| Track | Track 1+ playing | Audio-reactive, full palette, dynamic | Artist/title top, BPM/key bottom, caption scrolling through gaps |
| Transition | Between tracks (last 2s) | Blocks dissolve to noise pattern | "NEXT TRANSMISSION" flash |

### Block Color from Audio

3-band mapping:
- **Low** (bins 0-15, ~20-250Hz) → bottom third of block grid — hue from palette[0]
- **Mid** (bins 16-60, ~250-2000Hz) → middle third — hue from palette[1-3]
- **High** (bins 61-127, ~2-20kHz) → top third — hue from palette[4-5]

Amplitude per band controls brightness of the palette color. Silence → dim/black.

---

## Output Structure

```
src/
  index.html          ← updated: canvas replaces teletext page body
  style.css           ← updated: canvas sizing
  app.js              ← updated: block engine + audio analysis added
  fonts/
    vt100-regular/    ← existing, used for canvas text rendering too

build_site.py         ← updated: include script/lyrics in playlist.json
```

---

## Implementation Units

### U1. Build Pipeline — Enhanced Metadata

**Goal:** `build_site.py` extracts DJ script text, lyrics, and full artist/title from all prompt JSONs and includes them in `playlist.json`. Assign a DJ name per build.

**Dependencies:** None.

**Files:**
- `build_site.py` (modify)
- `dist/playlist.json` (output shape changes)

**Approach:**

1. In `find_tracks()`, after selecting the matched prompt JSON, read the `type` field.
2. For track 0, extract `text` from the prompt JSON root → `script` field.
3. For all tracks, extract `payload.lyrics`, `payload.title`, `payload.artist`.
4. Define the 25 DJ names at the top of `build_site.py`.
5. Seed a PRNG with today's date string, shuffle names, pick first as `djName`.
6. Add `"djName": shuffled[0]` and expanded fields to the playlist.

**Test scenarios:**
- Track 0 with `type: "dj_announce"` and `text` → playlist entry has `script`, `type: "dj_announce"`
- Track 1 with lyrics → playlist entry has `lyrics`, `type: "track"`
- No prompt JSON → `script: ""`, `lyrics: ""`, `type: "track"`
- DJ name is stable per build date and in the names list

**Verification:** Run `build_site.py`, inspect `dist/playlist.json` for new fields.

---

### U2. Canvas Block Engine — Core Renderer

**Goal:** A block grid renders on a canvas element filling the page body area. Blocks scroll vertically, driven by a time-based scroll position. Color palettes from the original code are available.

**Dependencies:** U1 (for data), existing `index.html` and `style.css`.

**Files:**
- `src/index.html` (modify — add `<canvas id="block-canvas">` inside `#page-body`)
- `src/style.css` (modify — canvas sizing, `#page-body` no longer grid)
- `src/app.js` (modify — add block engine)

**Approach:**

`index.html` change:
```html
<section id="page-body">
  <canvas id="block-canvas"></canvas>
</section>
```

`style.css` changes:
- Remove teletext page grid rules from `#page-body`
- `#block-canvas` → `width: 100%; height: 100%; display: block;`
- Keep `#page-header` and `#page-nav` styling unchanged

`app.js` additions:
1. Palettes constant — port the `q` array from the original code
2. Names constant — port the `names` array
3. Block render logic — simplified from original `P` class
4. Grid initialization — on resize, calculate block size based on canvas dimensions and density (default ~32 wide)
5. Scroll logic — `scrollOffset` increments each frame, blocks wrap vertically
6. Color assignment — per frame, each block gets a color based on position (perlin noise, simplified) and audio amplitude
7. Render loop — `requestAnimationFrame` loop: clear, draw blocks, overlay text

**Test scenarios:**
- Canvas fills `#page-body` area on load and on resize
- 32x24 block grid renders with correct block sizes
- Blocks scroll vertically and wrap at boundaries
- Palette colors are valid hex strings
- Black background with no gaps between blocks

**Verification:** Open in browser — full block grid visible, blocks scrolling smoothly.

---

### U3. Audio Analysis Integration

**Goal:** `AnalyserNode` connected to existing audio element. Frequency data drives block brightness, scroll speed, and palette selection.

**Dependencies:** U2 (block engine exists), existing audio engine.

**Files:**
- `src/app.js` (modify — add audio analysis)

**Approach:**

1. Create analysis chain using `createMediaElementSource(audioElement)` → `AnalyserNode` (fftSize 256) → `audioCtx.destination`
2. Each frame: `analyser.getByteFrequencyData(frequencyData)`
3. Map 128 bins to 3 bands:
   - lowBand (bins 0-15) → scroll speed, bottom row brightness
   - midBand (bins 16-60) → middle row brightness, palette shift
   - highBand (bins 61-127) → top row brightness, glitch probability
4. Idle mode (no audio) → slow scroll, dim colors
5. Handle autoplay policy — AudioContext created on first user gesture

**Test scenarios:**
- Audio starts → analyser receives data → blocks react
- Audio silent → blocks dim to near-black, scroll slows
- Low frequency (kick) → bottom rows brighten
- High frequency (hi-hat) → top rows brighten

**Verification:** Blocks pulse in sync with music. High energy = brighter/faster blocks.

---

### U4. Text Overlay in Block Gaps

**Goal:** Text content appears within solid block areas in the grid. Two modes: announcement (DJ script) and track (metadata). Text rendered on canvas using VT100 font.

**Dependencies:** U2 (canvas context), U3 (mode from current track).

**Files:**
- `src/app.js` (modify — add text renderer)

**Approach:**

1. Designate 1-2 block rows as "text rows" — these blocks render as solid background color instead of audio-reactive patterns
2. Text drawn centered within these rows using VT100 font, uppercase, no anti-alias
3. Announcement mode (track 0): 3-4 center rows = solid background, DJ script scrolls through, DJ name in top
4. Track mode (tracks 1+): top rows = artist/title, middle = caption scrolling, bottom = BPM/key
5. Text rows scroll with blocks (ticker effect)
6. Crossfade text content on track change

**Test scenarios:**
- Track 0 → DJ script visible in center rows, scrolling
- Track 1 → artist/title in top, BPM/key in bottom
- Lyrics present → scrolling through mid row
- No text → text rows are solid blocks (no empty areas)
- Text wraps correctly, crisp, uppercase

**Verification:** Play through playlist — observe text transitions.

---

### U5. State Machine — Mode Switching and Integration

**Goal:** Wire block engine, audio analysis, and text overlay into existing audio system. Remove page cycling.

**Dependencies:** U2, U3, U4. Existing audio engine.

**Files:**
- `src/app.js` (modify — replace page renderer, wire state)

**Approach:**

1. Remove page cycling timer and page renderer functions
2. Add mode state: ANNOUNCEMENT / TRACK / TRANSITION
3. Hook into track change via `onTrackEnd` and initial `setupAudio`
4. Header shows `P100 DEAD INTERNET RADIO HH:MM:SS` without broadcast counter
5. Canvas resizes with window
6. PREV/NEXT cycle through color palettes instead of pages
7. Single `requestAnimationFrame` loop for block rendering

**Test scenarios:**
- Page load (no audio) → slow dim blocks
- First interaction → audio starts, blocks animate, text appears
- Track 0 → announcement mode active
- Track 1 → track mode active
- PREV/NEXT → palette changes
- Resize → canvas recalculates

**Verification:** Full playlist playback — visualization changes at each track boundary. Header and nav remain framed correctly.

---

### U6. Teletext Page Cleanup and Reduced Motion

**Goal:** Remove unused teletext page code. Handle `prefers-reduced-motion`.

**Dependencies:** U5 (page cycling removed).

**Files:**
- `src/app.js` (modify — remove unused code)
- `src/style.css` (modify — remove unused page-specific rules)

**Approach:**

1. Remove `renderP100`-`renderP105`, `makeMosaic`, `SKULL`, `TERRITORY`, `PAGE_MENU`, `LOCAL_PREVIEW_PAGES`
2. Remove `.page--*` CSS rules that are no longer used
3. Keep mosaic utility functions if referenced elsewhere
4. Add reduced-motion query: when `prefers-reduced-motion: reduce` is active, blocks render as static grid (no scroll) with audio-reactive color only
5. Remove `cycleTimer`, `navigate()`, `navigateToPage()`, `resetCycle()`

**Test scenarios:**
- No console errors from removed functions
- Reduced motion preference → static block grid
- Page renders without teletext page artifacts

**Verification:** Open in browser — no console errors. Enable `prefers-reduced-motion` in DevTools → blocks static.

---

## Scope Boundaries

**In scope:** Block visualization replacing teletext page body. Audio-reactive block colors. Text in block gaps. DJ names integration. Build pipeline metadata expansion.

**Deferred to follow-up work:**
- Mobile-specific block density tuning (default density fine for v1)
- Full perlin noise color system from original code (simplified 3-band mapping for v1)
- Keyboard shortcuts to switch visual types (T=0-9 from original code)
- WAV DJ voiceover playback in browser

**Out of scope:** Audio synthesis in browser. Blockchain data integration. Page cycling.

---

## Open Questions

- Should PREV/NEXT cycle palettes or do nothing? Decision in U5: cycle palettes (adds interactivity without page cycling).
- Should the old teletext pages remain accessible via keyboard shortcut? Deferred — can add `p` key to toggle teletext overlay in later iteration.

---

## Sources & Research

- Original generative art code: Provided by user — block grid, palettes, names list, perlin coloring
- Existing website plan: `docs/plans/2026-06-13-001-feat-dead-internet-radio-website-plan.md`
- Requirements: `docs/brainstorms/2026-06-13-website-requirements.md`
- Web Audio API: `developer.mozilla.org/en-US/docs/Web/API/AnalyserNode`
- Canvas text rendering: uses loaded VT100 font family
