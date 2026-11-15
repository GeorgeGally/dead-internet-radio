---
title: Admin generation shows its progress and can preview the plan before rendering
date: 2026-11-15
category: docs/solutions/integration-issues
module: dead-internet-radio
problem_type: integration_issue
component: admin-generation
tags:
  - generation
  - generation-pc
  - admin
---

## Problem

Pressing TRANSMIT on `/admin/generation/new` seemed to do nothing. The live log
showed the POST answered in 99 ms, but the browser asked for the job page 16 s
later, so the form just sat there. The job page then showed nothing at all for
a job waiting on the generation PC: it only followed `running` jobs, by
reloading itself every 5 s.

## What holds now

- The form's key goes dark and counts the seconds the moment it is pressed, and
  can't send twice.
- The job page follows any live job (pending or running) without reloading:
  the stage is the last line of the log, songs done of total, the time since it
  started. When the status changes or a plan is ready, the page fetches itself
  and swaps `.job-detail` in place.
- Jobs on the generation PC report only queued, generating and done, so their
  loader runs without a percentage. Per-song progress from the PC would need a
  new `dir-pc-gate` verb in the servers repo.

## Preview and edit before sending

- `generate.py --plan-out FILE` runs the producer, announcer and DJ only, writes
  the plan (show name, brief, DJ, opening words, each song's title, artist,
  caption, lyrics, BPM, key and length) and throws its folder away. It needs only
  OpenRouter, so `PlanShowJob` runs it on apps1.
- The edited plan goes back to generate.py as the slot: `plan {json}`. It rides
  in the slot, as `remix {json}` does, so the generation PC's
  `dir-pc-render.sh` passes it on unchanged. In plan mode generate.py makes no
  LLM calls before rendering and sends each song exactly as edited (no
  `ensure_voice`, no `spread_lengths`).
- The PC runs its own copy of `generate.py`. Rerun `apps/dir-pc-setup.sh` from
  the servers repo after deploying, or the PC reads `plan {...}` as a literal
  slot.
