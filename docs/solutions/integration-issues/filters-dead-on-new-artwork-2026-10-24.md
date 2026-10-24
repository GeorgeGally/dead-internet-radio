---
title: Filters silently do nothing on newly added artworks
date: 2026-10-24
category: integration-issues
module: web_player_visuals
problem_type: integration_issue
component: frontend_canvas
severity: high
symptoms:
  - A filter is selected but the artwork looks unchanged
  - Alpha cannot fade a filter out on some artworks
  - A filter "works" at 1x but stalls or looks broken on a Retina screen
tags: [filters, canvas, cors, webgl, artwork-checklist]
---

# Filters silently do nothing on newly added artworks

Filters run in two places: CPU filters (`public/visuals/filters.js`) read the
artwork's pixels and draw the result on `#overlay-canvas`; GPU filters
(`public/visuals/fx.js`: Pixelate, Dither, Chromatic Aberration, Black & White)
upload the artwork canvas as a texture and draw on `#fx-canvas`. Both only
work if the artwork's frame reaches them as readable pixels. Every failure so
far was one of these:

| Cause | What it looked like | Fix |
|---|---|---|
| Artwork never calls the hook, or calls `filters.applyToP5` (undefined) instead of `canvasFilters.applyToP5` | Nothing happens for any filter | Last line of `draw()`: `canvasFilters.applyToP5(p);` |
| Media from a host without CORS headers (archive.org storage) drawn into the canvas | Video plays, every filter dead (canvas tainted, `getImageData`/`texImage2D` throw); with `crossOrigin` set the video doesn't load at all | Serve it same-origin: `/broll/<item>/<file>` (Rails `BrollController`, or `bin/serve_public.py`) |
| Filters drawn into the sketch's own canvas | Sketches that fade the last frame (`background(0, 0, 0, 15)`) build on the filtered picture: circles pile up, alpha can't fade them | `applyToP5` now always filters a copy on the overlay; never filter in place |
| Heavy CPU filter on a full-res Retina frame | Fine in a 1x test, stalls or looks broken on the real screen | Port the filter to a shader in `fx.js` (`SHADERS[key]`, `block()` supplies the uniform) |
| `#fx-canvas` was only revealed when its inline style was `'none'`, but the stylesheet hides it | No GPU filter ever visible | Fixed: show whenever the inline style isn't `'block'` |
| Picking an unplayable rendition (Theora `.ogv`, audio-only) | Leader/black frame, filters "don't work" | Smallest `.mp4` that has a height; reject `videoWidth === 0` |

## Checklist for every new artwork

1. Draw into the p5 canvas created by `visuals.setupP5Canvas(p)` (it becomes
   `#defaultCanvas0`, which `fx.js` reads). Don't paint into extra DOM canvases
   or leave a `<video>`/`<img>` showing on its own.
2. End `draw()` with `canvasFilters.applyToP5(p)`, including any early-return
   branch that still draws a picture.
3. Any image or video from another host must send CORS headers (Giphy media
   does) or go through a same-origin proxy. Test: `getImageData` on the canvas
   must not throw.
4. Add the `<script>` to `public/index.html`.
5. Check on a 2x screen with Dither, Circle Sampling and Chromatic Aberration
   at full and at ~25% alpha.
6. Take its gallery preview with the player running:
   `node bin/capture-thumbnails.mjs <id>` (writes `public/visuals/thumbs/<id>.jpg`).

`tests/visuals_filter_contract_test.js` enforces 1–4 and 6 statically
(`node --test tests/`).
