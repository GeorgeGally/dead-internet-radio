# Dead Internet Radio — Website Requirements

> **Note (2026-07-05):** The `pages.json` generation described below was removed from `build_site.py` because the teletext page rendering was never implemented in the frontend. `build_site.py` still produces `playlist.json`, `shows.json`, per-show playlists, and copies static assets.
**Date:** 2026-06-13

---

## What We're Building

A static website simulating a 24/7 teletext broadcast for Dead Internet Radio. Visitors land and music is already playing — no seeking, no picking tracks, no going back. The visual layer is a fully realised teletext broadcast system: auto-cycling pages, bold colors, deadpan dead-world content.

The station has been transmitting since a fixed date. It will continue after the visitor leaves.

---

## Core Listening Experience

- Audio plays immediately on page load (or first interaction if browser blocks autoplay)
- Synchronized via a fixed epoch baked into `playlist.json` — `(Date.now() - EPOCH) % totalDuration` determines current track and seek offset
- All visitors hear the same thing at the same time
- No seek controls, no track list, no back button
- Audio continues across page navigation (single-page app or persistent audio element)
- On track end, JS auto-advances to next track; loops playlist

---

## Teletext Visual System

### Palette
Strict 8-color teletext palette only. No gradients, no blur, no transparency.

| Color   | Hex       | Use                          |
|---------|-----------|------------------------------|
| Black   | `#000000` | Background                   |
| White   | `#ffffff` | Body text                    |
| Cyan    | `#00ffff` | Header bars, nav, freq data  |
| Yellow  | `#ffff00` | Track title, headlines       |
| Green   | `#00ff00` | Transmitting band, good news |
| Red     | `#ff0000` | Ad headers, warnings         |
| Magenta | `#ff00ff` | Ad highlights, hotlines      |
| Blue    | `#0000ff` | Structural elements          |

### Typography
- Monospace bitmap font (Bedstead or equivalent teletext-accurate face)
- No anti-aliasing
- 40-character grid width, 25 rows — all pages conform to this grid

### Color Bands
Colored rows use the `▄▄▄` / `▀▀▀` block character technique:
```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  ← row in band color
 HEADER TEXT                                ← text row in band color
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  ← row in band color
```

### Mosaic Art
P100 features a mosaic graphic element — the visual centerpiece of the broadcast. Composition TBD during implementation (abstract signal, geometric form, or figure). Must be clean and considered. Rendered using CSS grid of 2×3 mosaic cells (Unicode block elements `▀▄▌▐█` + background-color), teletext-accurate technique.

### Navigation Bar
Every page shares a consistent footer:
```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 ◄ PREV                         NEXT ►   [cyan band]
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
```
Arrow keys and click both work.

---

## Pages

Pages auto-cycle every ~8 seconds. User can navigate with arrow keys or clicking PREV/NEXT.

### P100 — NOW PLAYING
- Page header: `P100 DEAD INTERNET RADIO    HH:MM:SS`
- Mosaic art element (cyan)
- Track title in yellow, large — full caption from `playlist.json`
- `BROADCAST 003 OF 024` in cyan
- BPM, key, frequency in white
- `▶ TRANSMITTING` green band (flashing `▶`)
- `ON AIR SINCE DD MMM YYYY` at footer

### P101 — HEADLINES
- Yellow header band: `HEADLINES`
- 4–5 AI-generated dead-world news items
- Deadpan bureaucratic voice — not dramatic, not post-apocalyptic. "Automated content generation reaches 18-month milestone." "Coastal monitoring station 7 reports nominal readings."
- `FOR FULL STORIES SEE P110` at footer (non-functional, feels real)

### P102–P104 — ADVERTISEMENTS
- 3 ad pages, each with a distinct color band header (red, magenta, green)
- AI-generated ads for things that no longer exist or that exist in a dead world
- Functional teletext ad format: property, travel, services, hotlines
- Example tone: "VISIT THE NORTHERN TERRITORIES BEFORE TRANSITION PERIOD ENDS. FAMILY PACKAGES FROM £199. SOME AREAS MAY BE RESTRICTED."
- Phone numbers like `0800 DEAD INTERNET`, hours like `00:00–00:00 DAILY`

### P105 — SIGNAL
- Green header band: `THIS IS DEAD INTERNET RADIO`
- Body: "ARE YOU A ROBOT" repeated to fill the entire 40×~18 character field, word-wrapped continuously, no line breaks
- No other content

---

## Build Workflow

Run after generating new tracks with `generate.py`:

```
python build_site.py
```

Steps:
1. Scan `output/` for MP3 files, sort by filename (track order)
2. Extract duration of each MP3 using `mutagen` or `ffprobe`
3. Compute cumulative offsets, write `dist/playlist.json`:
   ```json
   {
     "epoch": 1710460800000,
     "tracks": [
       { "file": "audio/track-01.mp3", "duration": 187000, "caption": "...", "bpm": 80, "key": "A MIN" }
     ]
   }
   ```
4. Call LLM (via existing OpenRouter setup) to generate `pages.json` — headlines and ad content. One LLM call per build, structured output.
5. Copy MP3 files → `dist/audio/`
6. Copy static assets (`index.html`, `style.css`, `app.js`, font files) → `dist/`
7. Write `dist/pages.json`

Deploy `dist/` to Netlify or Vercel. New content requires a rebuild and redeploy.

---

## Frontend Architecture

Single `index.html`, `style.css`, `app.js`. No framework, no build tooling on the frontend — vanilla JS.

`app.js` responsibilities:
- Load `playlist.json` and `pages.json` on start
- Calculate current track: `offset = (Date.now() - epoch) % totalDuration`
- Seek `<audio>` element to correct position, play
- Auto-advance on `ended` event, loop playlist
- Render current teletext page to DOM
- Cycle pages every 8s via `setInterval`
- Handle arrow key and click navigation
- Update P100 clock every second
- Update P100 track info when track changes

---

## Scope Boundaries

**In:**
- Synchronized playlist player (epoch-based seeking)
- Teletext page renderer (P100–P105)
- Auto-cycling + keyboard navigation
- AI-generated headlines and ad content at build time
- Mosaic art on P100
- Static deployment to Netlify/Vercel

**Out:**
- Generation controls on the site
- Live streaming infrastructure (no Icecast, no HLS)
- User accounts, comments, submissions
- Track archive / browse mode
- Page number input (arrow keys only for v1)
- Mobile-specific layout (teletext grid is inherently fixed-width; acceptable to display as-is on mobile)
- Dynamic content updates without rebuild

---

## Resolved Decisions

- **Epoch:** Set to a future date — the station broadcasts from after everything ended. Exact date TBD (something like 2031-01-01 or further). The visitor is receiving a transmission from the future.
- **Mosaic art:** Satellite broadcast dish on P100. Geometric, clean, pointing at nothing. Rendered in cyan on black using teletext mosaic technique.
- How many tracks will typically be in a playlist? (Affects how long before the loop repeats)
