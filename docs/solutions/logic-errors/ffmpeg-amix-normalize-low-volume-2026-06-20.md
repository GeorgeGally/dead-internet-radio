---
title: "FFmpeg amix normalize=true causes consistently low volume in DJ mixes"
date: 2026-06-20
category: logic-errors
module: audio-mixing
problem_type: logic_error
component: tooling
symptoms:
  - DJ mix MP3s are noticeably quieter than expected and than other audio content
  - Volume reduction occurs even during music-only sections where no voice input is active
  - Compounding volume loss across sequential overlay passes makes the final mix progressively quieter
  - Station IDs (loudnorm'd to -14 LUFS) sound disproportionately loud relative to the surrounding mix
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [ffmpeg, amix, volume, normalize, loudnorm, djmix, audio, mixing]
---

# FFmpeg amix normalize=true causes consistently low volume in DJ mixes

## Problem

DJ mixes produced by `djmix.py` had consistently low volume. The audio was noticeably quieter than expected compared to other content, degrading the listening experience.

## Symptoms

- Mixes sounded noticeably quieter than other audio content
- Volume was low even during music-only sections where no voice was active
- Station IDs (which used `loudnorm`) sounded louder than the surrounding mix
- Increasing `voice_gain` and `pre_gain_db` values only partially helped and introduced distortion at the voice layers

## What Didn't Work

- **`voice_gain=1.3`** and **`pre_gain_db=5`** for DJ voices were compensations for `amix`'s normalization, not fixes — they made voices louder relative to the already-normalized-down music, but didn't address the overall volume reduction (session history: these parameters were added to compensate for amix behavior)
- Station IDs were already loudnorm'd to `-14 LUFS` in `generate_station_ids.py`, but the final mix wasn't, creating an inconsistency where IDs punched through but the music bed underneath stayed quiet
- Any attempt to boost individual layers before `amix` was undercut by `amix` dividing by the total input count regardless of which inputs were active at any moment

## Solution

### Change 1: Disable amix normalization (`djmix.py:183`)

**Before:**
```python
mix_filter += "".join(mix_labels) + f"amix=inputs={num}:duration=first:weights={' '.join(mix_weights)}"
```

**After:**
```python
mix_filter += "".join(mix_labels) + f"amix=inputs={num}:duration=first:dropout_transition=2:normalize=false:weights={' '.join(mix_weights)}"
```

Added `normalize=false` to prevent `amix` from dividing volume by input count. Added `dropout_transition=2` for smooth 2-second fade-out when voice inputs end, avoiding abrupt volume jumps.

### Change 2: Add loudnorm to final MP3 encode (`djmix.py:440`)

**Before:**
```python
subprocess.run([
    "ffmpeg", "-y", "-i", str(with_ids),
    "-c:a", "libmp3lame", "-q:a", "2",
    str(output_path),
], check=True, capture_output=True)
```

**After:**
```python
subprocess.run([
    "ffmpeg", "-y", "-i", str(with_ids),
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=7",
    "-c:a", "libmp3lame", "-q:a", "2",
    str(output_path),
], check=True, capture_output=True)
```

## Why This Works

FFmpeg's `amix` with `normalize=true` (the default) divides the output volume by the number of inputs to prevent clipping. With music + DJ voice + station ID inputs, this scaled *everything* down — even during music-only moments where no voice was active. This normalization compounded across **two sequential overlay passes**: first DJ voices over music, then station IDs over that result, each pass reducing volume further.

Setting `normalize=false` tells `amix` to simply sum the inputs without automatic gain reduction. Since we control the relative levels via the `weights` parameter and `pre_gain_db`, we can mix without unexpected volume loss.

The `loudnorm=I=-14:TP=-1.5:LRA=7` on the final encode normalizes the completed mix to **-14 LUFS** (industry-standard streaming loudness) with a **true peak limit of -1.5 dB** and **loudness range of 7 LU**. This matches the loudness target already used by `generate_station_ids.py`, ensuring consistent loudness across the entire output. FFmpeg's two-pass loudnorm (applied internally when these parameters are present) handles any peaks that `normalize=false` might introduce.

## Prevention

- **Always specify `normalize=false`** when using FFmpeg's `amix` with inputs that have known/controlled relative levels — the default `normalize=true` is a silent volume killer
- **Always add `loudnorm` to final encodes** — treat loudness normalization as a required step, not optional; it should be the last audio filter before encoding
- **Watch for compounding normalization** — when chaining multiple `amix` calls (overlay voices then overlay IDs), each one with `normalize=true` multiplies the volume reduction
- **Band-aid gains on inputs are a red flag** — if you find yourself cranking up `voice_gain` or `pre_gain_db` to compensate for quiet output, the mixing stage is likely the problem, not the input levels

## Related Issues

- `generate_station_ids.py` uses `amix` with default normalization (no `normalize=false`) at lines 298-299 and 314-315 — same volume issue may persist there
- `docs/solutions/integration-issues/static-files-skipped-on-shows-only.md` — related DJ pipeline issue (voiceover audio path)