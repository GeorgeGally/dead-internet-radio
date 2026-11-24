---
title: A 20-track show lost every render at the mix step, its file name too long
date: 2026-11-24
category: docs/solutions/logic-errors
module: dead-internet-radio
problem_type: logic_error
component: djmix
tags:
  - djmix
  - generation-pc
  - nightly-render
---

## Problem

The nightly `dir-render.service` on the generation PC hit its 4-hour timeout on
2026-11-23. It was not slow music: it was rendering admin generation 137, a
20-track "deep disco psytrance" show, for the fourth time.

`djmix.py` names the mix after every unique artist plus the slot. Twenty
artists made a 304-byte `mixes/<name>.mp3` (310 with `.cues.json`), past the
255 bytes a file name holds. Each attempt rendered all 20 tracks and voices
(about 3 hours), then ffmpeg's final `loudnorm` pass could not open the output
and djmix exited. The retry started a new show folder from nothing. On 11-21,
generation 133 failed the same way one step later, writing the cue file
(`OSError: [Errno 36] File name too long`).

The nightly show waited behind it: `dir-pc-render.sh` takes the render lock
(the 4-hour clock is already running while it waits), then works through queued
generations before the slot show. On 11-23 it waited 1h21m for the lock, then
spent the rest of its 4 hours on generation 137.

## What holds now

- `ShowMeta.output_filename` keeps the stem to `MAX_STEM` (200) characters:
  artists drop off the end until it fits, the slot stays. The ID3 title still
  names every artist.
- `tests/test_mix_filename.py` uses the artists of the failed show.

## Still in the PC script (servers repo)

A failed generation re-renders from the first track, and the nightly unit runs
the generation line before its own show inside one timeout.
