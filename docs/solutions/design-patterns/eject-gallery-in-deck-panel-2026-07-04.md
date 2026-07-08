---
title: "Eject button + gallery-in-deck panel pattern"
date: 2026-07-04
category: design-patterns
module: ui-deck
problem_type: design_pattern
component: development_workflow
severity: low
tags: [eject, gallery, deck, ui, cards, css-states, frontend]
---

# Eject button + gallery-in-deck panel pattern

## Problem

The gallery (filter + artwork grid) was a separate bottom overlay (`display: flex` panel sliding up below the deck). Opening it with the old `.rams-pushbtn` toggle didn't match the `.abtn` design language of the transport buttons. The overlay also competed with the deck for visual hierarchy.

## What Didn't Work

- **Bottom overlay panel** — the separate `.gallery-panel` / `.gallery-backdrop` sat outside `#deck`, creating a disjointed feel and requiring its own open/close/dismiss mechanics
- **`.rams-pushbtn` toggle** — a tab-like button with active state didn't match the matte-circle `.abtn` play/rewind/fwd buttons already used in the deck transport
- **Gallery positioned below deck content** — when the deck was `.expanded`, the gallery overlay sat below the `.deck-content` area, making the layout feel disconnected

## Solution

### Change 1: Replace gallery toggle with `.abtn` eject button

Removed the `.rams-pushbtn` toggle from the transport bar. Added an `.abtn` button (`#btn-eject`, ⏏ Unicode character) styled with blue-grey (`#8d9aa6`) to distinguish it from the media buttons.

The button sits first in the `.deck-transport` flex row. When clicked, it toggles only the `.ejected` class on `#deck` — it does not touch `.expanded`, so controls remain visible.

### Change 2: Migrate gallery content into the deck

Removed `.gallery-panel`, `.gallery-backdrop`, and their JS rendering path from `index.html` and `style.css`. Moved the Gallery.js render target from a standalone element to `.deck-gallery` inside `#deck > .deck-content`.

The `.ejected` class switches the deck layout:
- `.deck-content` goes full-viewport height (`inset: 0`) so the gallery fills the screen
- `.deck-transport` stays pinned at the bottom with `position: absolute; bottom: 0`
- When `.expanded` and `.ejected` are both present, `.deck-content` gets `height: 138px; bottom: auto` to keep the expanded album art above the full-height gallery

### Change 3: Card design system (filter + artwork)

A unified card design applied to both filter cards and artwork cards:

| Property | Value |
|---|---|
| Border | `24px solid white` (very thick) |
| Border radius | `4px` (minimal) |
| Width | `260px` |
| Aspect ratio | `1` (square) |
| Layout | 2-row horizontal scroll (`flex-direction: column; flex-wrap: wrap`) |
| Item gap | `24px` |
| Name text | `16px`, uppercase, `0.08em` letter-spacing |
| Track text | `13px` |

Section labels ("Filters", "Artwork") use 12px semibold (600) IBM Plex Mono. The Artwork label gets `padding-top: 40px` for visual separation.

Card label gradient: `linear-gradient(transparent, rgba(0,0,0,0.8) 25%)` with `padding: 40px 14px 16px` so text rests readable against any artwork.

### Change 4: Hover/schedule-awareness of `.ejected`

`setupDeckRetraction` in `app.js` now checks for `.ejected` before scheduling retraction. When the deck is ejected, mouse leave does not collapse it. Previously the hover-based expand/retract cycle would fight the eject state.

### Change 5: Audio-on-eject guard

The `tryPlay` autoplay-unlock handler (capture-phase `click` on `document`) was updated to skip clicks inside `.deck-transport` and on `#btn-gallery`. Without this guard, clicking the eject button while audio was paused would force a play().

## Why This Works

The deck is a natural container for the gallery — both are full-screen, immersive views. By embedding filters and artwork inside the deck:

- The deck controls remain visible and usable (close eject, play/pause, skip)
- CSS class state is simpler: `.ejected` controls gallery visibility, `.expanded` controls album art
- No overlay z-stacking issues or backdrop dismissal logic
- Cards read as an extension of the same visual system (thick borders = framed art, square = record cover metaphor)

The `.abtn` eject button fits the existing transport language because it shares the same `<button class="abtn">` base, just with a different icon and colour.

## Prevention

- **Keep gallery inside the deck** — any new deck-adjacent UI should render into `.deck-gallery` rather than a separate panel
- **Use `.abtn` for transport controls** — the `.rams-pushbtn` style is deprecated; all deck transport buttons should be `.abtn` with a distinguishing colour
- **Don't let one CSS class toggle another's behavior** — `.ejected` and `.expanded` are independent states; the code should check both explicitly rather than assuming one implies the other
- **Card borders are part of the design language** — the 24px white border is intentional; don't thin it without redesigning the whole card system
- **Guard capture-phase listeners** — any document-level click handler (like `tryPlay`) must explicitly exclude eject/gallery regions or it will fight user intent

## Related Files

- `src/index.html` — deck structure, `.deck-transport` button order, `.deck-gallery` container
- `src/style.css` — all CSS for deck states, cards, gallery grid, section labels, `.abtn` eject
- `src/visuals/gallery.js` — builds filter row + artwork grid, toggles `.ejected`/`.expanded`
- `src/app.js` — `tryPlay` (line 97), `setupDeckRetraction` (line 213)
