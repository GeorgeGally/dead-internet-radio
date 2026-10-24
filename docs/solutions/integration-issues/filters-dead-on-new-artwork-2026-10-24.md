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

Since the FX unit rebuild (2026-10-24) every filter is a shader in
`public/visuals/filters.js`. The artwork's canvas is uploaded as a texture,
run through the slots that are on, mixed with the dry picture by dry/wet and
drawn on `#fx-canvas` above everything. There is no CPU path any more, so the
"heavy CPU filter" and "filtered in place" rows below are history. It still
only works if the artwork's frame reaches the unit as readable pixels.
Failures so far:

| Cause | What it looked like | Fix |
|---|---|---|
| Artwork never calls the hook, or calls `filters.applyToP5` (undefined) instead of `canvasFilters.applyToP5` | Nothing happens for any filter | Last line of `draw()`: `canvasFilters.applyToP5(p);` |
| Media from a host without CORS headers (archive.org storage) drawn into the canvas | Video plays, every filter dead (canvas tainted, `getImageData`/`texImage2D` throw); with `crossOrigin` set the video doesn't load at all | Serve it same-origin: `/broll/<item>/<file>` (Rails `BrollController`, or `bin/serve_public.py`) |
| Filters drawn into the sketch's own canvas | Sketches that fade the last frame (`background(0, 0, 0, 15)`) build on the filtered picture: circles pile up, alpha can't fade them | `applyToP5` now always filters a copy on the overlay; never filter in place |
| Heavy CPU filter on a full-res Retina frame | Fine in a 1x test, stalls or looks broken on the real screen | All filters are shaders now (`FILTERS` in `filters.js`) |
| `#fx-canvas` was only revealed when its inline style was `'none'`, but the stylesheet hides it | No GPU filter ever visible | Fixed: show whenever the inline style isn't `'block'` |
| Picking an unplayable rendition (Theora `.ogv`, audio-only) | Leader/black frame, filters "don't work" | Smallest `.mp4` that has a height; reject `videoWidth === 0` |

## Checklist for every new artwork

1. Draw into the p5 canvas created by `visuals.setupP5Canvas(p)` (it becomes
   `#defaultCanvas0`, which the FX unit falls back to reading). Don't paint into extra DOM canvases
   or leave a `<video>`/`<img>` showing on its own.
2. End `draw()` with `canvasFilters.applyToP5(p)`, including any early-return
   branch that still draws a picture. It names the canvas and renders the
   chain in the same frame, which WebGL artworks need (their buffer clears
   after compositing).
3. Any image or video from another host must send CORS headers (Giphy media
   does) or go through a same-origin proxy. Test: `getImageData` on the canvas
   must not throw.
4. Add the `<script>` to `public/index.html`.
5. Check on a 2x screen with Dither, Circle Sampling and Chromatic Aberration
   at full and at ~25% dry/wet.
6. Take its gallery preview with the player running:
   `node bin/capture-thumbnails.mjs <id>` (writes `public/visuals/thumbs/<id>.jpg`).

`tests/visuals_filter_contract_test.js` enforces 1–4 and 6 statically
(`node --test tests/`).

## Adding a filter

One entry in `FILTERS` (`public/visuals/filters.js`): `key`, `name`, two
`params` as `[label, default]` (labels ≤ 8 characters, they sit under the
knobs), and a GLSL `body` that returns a `vec4`. Uniforms: `uTex`, `uRes`,
`uP1`/`uP2` (0-1), `uTime` (s), `uScale` (canvas px per CSS px — multiply
sizes by it), `uLevel` (bass 0-1 × sensitivity). Helpers: `hash`, `luma`,
`bayer8`. `tests/canvas_filters_test.js` checks the shape; a shader compile
error shows as `fx shader compile failed` in the console.
