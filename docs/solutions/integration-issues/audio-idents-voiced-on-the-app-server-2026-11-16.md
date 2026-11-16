---
title: Audio station IDs are voiced on the app server, not the generation PC
date: 2026-11-16
category: docs/solutions/integration-issues
module: dead-internet-radio
problem_type: integration_issue
component: audio-idents
tags:
  - kokoro
  - station-ids
  - admin
---

## What holds

- `/admin/audio_idents` voices a line with Kokoro through `announce.py`
  (`RenderIdentJob`). Kokoro-82M runs on the CPU in seconds, so it needs no
  ACE-Step and no hand-off to the generation PC; it needs `kokoro/.venv` on the
  server that runs the jobs. Without it the render fails with "Kokoro isn't
  installed on this server".
- Each render keeps its text, voice and settings (`ident_renders`). A preview's
  WAV stays in `tmp/ident-renders/`; a generated one moves to
  `public/station-ids/id-NN.wav` with the next unused number and a
  `StationIdent` row that starts off air.
- `push-code.sh` protects `station-ids/` and `.venv/` at any depth, so voiced
  clips and `kokoro/.venv` survive deploys. The repo ignores voiced clips
  (anything past `id-14.wav`).
- Delete keeps the row (`removed`), so a shipped clip whose file comes back with
  the next deploy stays off the list.
- `announce.py --vocoder-mix` now always applies at the mix asked for; it used
  to fire on 15% of runs. No pipeline caller sets it.
- Between-shows interludes bake the clips in when `build_interludes.py` runs; a
  new clip reaches them only after the next rebuild. The player's own clip
  rotation (`/api/v1/idents`) picks it up as soon as it is switched on.
