---
title: Generated mixes aired seconds of silence at every track boundary
date: 2026-11-19
category: logic-errors
module: audio_pipeline
problem_type: logic_error
component: djmix
severity: high
symptoms:
  - A song ends, then one to four seconds of silence, then the DJ and the next song
  - Cue points in the show mix do not line up with the sound
tags: [ffmpeg, silencedetect, crossfade, cues, ace-step]
---

# Dead air between tracks in generated mixes

`djmix.py` crossfaded full-length renders. ACE-Step writes a fixed duration and
fades into seconds of near-silence at both ends, so each crossfade overlapped
silence with silence rather than sound with sound. The cues came from those
full file lengths, so the player's marker also sat in the gap.

`MixOut` already trims the tail for the live station's timeline, but the mix
builder never used it: it read `get_duration()` for every track. A real show
showed 3.5 s of leading and 3 s of trailing silence per render, and a measured
1.37 s + 3.79 s silent stretch immediately after a cue in the finished MP3.

## What it does now

- `audible_span()` runs `ffmpeg silencedetect` (`-40dB`, 0.5 s, the same
  threshold as `MixOut`) on each render and returns the audible head and tail.
  A quiet lead-in of up to 12 s before the silent run is treated as head silence.
- Each track is trimmed to that span before `crossfade_chain()`, so fades meet
  sound to sound. A 0.1 s ring keeps a tail from being cut off mid-fade.
- `mix_start` and the `.cues.json` are computed after trimming, so `cue_seconds`
  matches what listeners hear. Internal pauses and the DJ opening offset are
  untouched.

## Testing it

`tests/test_djmix_no_gap.py` builds renders with known silent heads and tails,
checks `audible_span()`, and asserts the mix's cue times and the absence of a
silent stretch at the DJ/next-song boundary.

## Trade-off

A quiet intro below `-40dB` is treated as silence and trimmed. A render whose
first audible seconds are deliberately very quiet will start a little earlier;
the 0.1 s ring and the 0.5 s accumulated-silence requirement keep that narrow.
