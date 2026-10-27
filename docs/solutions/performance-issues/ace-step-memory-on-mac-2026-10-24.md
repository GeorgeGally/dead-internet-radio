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

Still tight (system free memory bottomed at 12% with Chrome open).

### 2026-10-25: 29 GB -> 22 GB with the 4B LM on

With the 4B LM switched back on for quality the peak was 29 GB on a Mac with
28 GB usable, so every track swapped. Traced every 2 s through one 150 s track:

| Phase | Before | After |
|---|---|---|
| PyTorch DiT + text encoder + VAE loaded | 15 GB | 13 GB |
| + MLX DiT copy, + 4B LM | 21 GB | 19 GB |
| Diffusion | 23 GB | 21 GB |
| VAE decode (peak) | 27-29 GB | 21 GB |

`patches/ace-step-mlx-memory.patch` adds two switches, on in
`start-ace-step.sh` and `AceStepManager`:

- `ACESTEP_DROP_TORCH_DIT=1`: once the MLX DiT exists, the PyTorch decoder's
  1.5B transformer parameters are never used (diffusion runs on MLX), so they
  are freed. Lyric timestamps and lyric scoring need them; we use neither.
- `ACESTEP_MLX_CACHE_LIMIT_GB=1`: MLX keeps freed buffers in its own cache;
  capped, memory freed between LM, diffusion and decode goes back to the
  system. This removed the decode spike.

Plus `ACESTEP_MLX_VAE_CHUNK=96` (was 192). Decode time unchanged (13.3 s vs
14.7 s). Weights and precision are unchanged, so the sound is too. What's
left is mostly the 4B LM (~8 GB); the 1.7B saves ~4.5 GB but sounded worse.

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

### 2026-10-27: froze again, with Chrome at 19 GB and swap full

One song froze the Mac. ACE-Step itself finished (track saved, ~21 GB peak),
but Chrome held 19 GB and swap was already 13.6 of 15 GB used before the
render. The watchdog never fired: memory_pressure's "free %" stays above 12%
while macOS pushes everything into swap, and a full swap is what hangs it.

- `AceStepManager.check_memory!` refuses to start ACE-Step unless
  free + inactive + purgeable is at least `ACESTEP_MIN_FREE_GB` (default 20)
  and no more than 8 GB is already in swap (swap "free" means little: macOS
  grows the swap files on demand). The job fails with the numbers instead.
- `ace-step-watchdog.sh` also kills ACE-Step when swap used passes
  `MAX_SWAP_USED_MB` (default 12288).
- The freeze also took down Postgres on 5433 (Homebrew postgresql@14, started
  by hand): `pg_ctl -D /opt/homebrew/var/postgresql@14 -o "-p 5433" start`.
