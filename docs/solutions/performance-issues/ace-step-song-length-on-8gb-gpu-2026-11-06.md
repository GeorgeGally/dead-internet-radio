---
title: How long a song the generation PC can render
date: 2026-11-06
category: performance-issues
module: generation_pipeline
problem_type: performance_issue
component: ace_step
severity: high
tags: [ace-step, generation-pc, duration, vram, oom]
---

# How long a song the generation PC can render

ACE-Step's tier 3 table allows 480 s with the LM loaded, but the PC's RTX 2070 Super
(7.6 GiB usable) cannot reach it. A 360 s song dies with `torch.OutOfMemoryError` in
the DiT's self-attention, after the LM has spent four minutes on its codes. One
failed song ends the show, because `poll_ace_step` exits on a failed task.

Real renders on 2026-11-06, a fresh ACE-Step for each, same env as `dir-pc-render.sh`:

| Song | Peak VRAM | LM codes | Render, with cool guard freezes |
|------|-----------|----------|--------------------------------|
| 270 s | 6742 MiB | 191 s | 403 s |
| 300 s | 7124 MiB | 214 s | 452 s |
| 330 s | 7590 MiB | 237 s | 593 s |
| 360 s | out of memory | 260 s | failed |

Peak VRAM grows about 14 MiB per second of audio. `MAX_TRACK_SECONDS` defaults to 300
to keep about 650 MiB spare. Raising it needs a real render on the PC first: ask
`/release_task` for the length and watch `nvidia-smi`, since no log warns of the limit.

A song takes about 1.1x its length to render when the laptop is cool and about 2x
once the cool guard is freezing it. `poll_ace_step` allows six times the song's
length, at least 900 s.
