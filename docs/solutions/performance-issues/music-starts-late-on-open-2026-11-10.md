---
title: On open the player said it was playing for 10-30 s before any sound
date: 2026-11-10
category: performance-issues
module: player
problem_type: performance_issue
component: frontend
severity: high
symptoms:
  - Visuals show on open, no station ident, the play LED is lit and the label reads Stop
  - No sound for 10-30 s, then the music starts on its own
  - The audio element sits at readyState 1 after the seek to the live position
tags: [player, startup, autoplay, broll, network, audio]
---

# On open the player said it was playing for 10-30 s before any sound

## No ident is expected

When the browser allows autoplay, `skipWelcome()` goes straight on air and no
station ident plays. That is by design: idents mark a change of set and air at
most once every 30 minutes (`ident.js`). The splash with its ident only shows
when a click is needed.

## What held the music up

The music needs two requests before it sounds: the opening range, then the
range after the seek to the live position. On a cold open, those requests
were sent at the same time as a burst of artwork traffic on the one HTTP/2
connection to apps1, over a path about 270 ms long:

- B-roll searches and metadata, which wait on archive.org for 1-15 s each
- film pieces and the Giphy stand-in
- the face and object detector models for the tracking look

Measured on the live site: the second audio request reached Rails and got an
answer in 5 ms, but the browser did not receive it until the slow B-roll
searches came back 12 s later. Audio requests were only sent once a B-roll
fetch finished. `musicHasCushion()` was supposed to hold the artwork's
loading back, but it answered "go ahead" whenever the player had no source
yet, and on open the player has no source for the first few seconds.

The timeline request also waited behind the autoplay check and the artwork
list request, which added one more round trip before the music was asked for.

## Fix

- `musicHasCushion()` answers "wait" while the music is due but has no
  source yet. It answers "go ahead" again once the welcome splash is up (no
  music until the click) or once tuning in found nothing to play.
- The B-roll reel and the tracking detectors wait for it, the same as the
  Giphy warm-up and the next-track buffer already did. The B-roll stand-in is
  asked for once in the meantime.
- `/api/v1/broadcast` is requested in parallel with the autoplay check.
- While the player is asked to play but has no sound yet (`readyState < 3`),
  the play LED blinks and the label reads Loading.
