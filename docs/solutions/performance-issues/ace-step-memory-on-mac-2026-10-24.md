---
title: Track generation froze the Mac, then saved nothing
date: 2026-10-24
category: performance-issues
module: generation_pipeline
problem_type: performance_issue
component: ace_step
severity: high
symptoms:
  - Mac locks up or needs a hard reset during a set
  - ACE-Step killed by the memory watchdog while loading or decoding
  - "Download failed: HTTP Error 404" after a track finished generating
tags: [ace-step, memory, mps, mlx, ffmpeg, torchcodec]
---

# Track generation froze the Mac, then saved nothing

Two separate faults, both outside our code.

## 1. Memory: ACE-Step runs everything in float32 on a Mac

Measured with `footprint -p <ace-step pid>` (counts MLX/Metal buffers):

| | Models loaded | Peak (decode) |
|---|---|---|
| Stock ACE-Step | 23 GB | 32 GB+ (killed) |
| `ACESTEP_MPS_HALF=1` + `ACESTEP_MLX_VAE_FP16=1` + small decode chunks | 19 GB | 26 GB |

On MPS, ACE-Step picks `torch.float32` (`init_service_orchestrator.py`), and its
MLX DiT copy is converted with `.float()`, so every weight is held at double
size, twice. The 6 GB of checkpoints became 23 GB. This was always true; sets
worked in August only because the Mac had room to swap through it. With ~12 GB
of swap already used by other apps, the same peak froze the machine.

Fix: `patches/ace-step-mps-half.patch` (adds `ACESTEP_MPS_HALF`, bfloat16 for
the PyTorch models and the MLX DiT copy). `start-ace-step.sh` and
`AceStepManager` turn it on, plus the LM off, smallest decode chunks and the
watchdog. If `ACE-Step-1.5/` is re-cloned, re-apply:

    cd ACE-Step-1.5 && git apply ../patches/ace-step-mps-half.patch

Still tight (system free memory bottomed at 12% with Chrome open). Next cut:
drop the PyTorch DiT decoder once the MLX copy exists.

## 2. Saving: Homebrew upgraded x265 under FFmpeg 8

ACE-Step's MP3 output goes through torchcodec, which loads Homebrew's FFmpeg 8;
that FFmpeg links `libx265.216.dylib`, gone after Homebrew installed x265 4.3.
Every track generated, then failed to save (404 on download).
`DYLD_FALLBACK_LIBRARY_PATH` doesn't help: macOS strips it through `/bin/sh`.

Fix: `generate.py` asks ACE-Step for WAV (written by soundfile, no FFmpeg) and
encodes the MP3 itself with the `ffmpeg` on PATH. A failed encode keeps the WAV.

## Checking a run

    footprint -p $(lsof -ti tcp:8001 -sTCP:LISTEN) | grep phys_footprint
    cat log/ace_step_watchdog.log
