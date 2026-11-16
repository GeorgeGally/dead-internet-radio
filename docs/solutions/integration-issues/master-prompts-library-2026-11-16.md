---
title: Master prompts are edited in the admin and travel with each job
date: 2026-11-16
category: docs/solutions/integration-issues
module: dead-internet-radio
problem_type: integration_issue
component: master-prompts
tags:
  - prompts
  - generation
  - generation-pc
---

## Problem

The system prompts that write the songs (Music, `prompts/dj.md`), the show
brief (Brief, `producer.md`), the re-render rewrite (Rewrite, `rerender.md`)
and the DJ voice (DJ, `announcer.md`) lived only in files, so trying a new
prompt meant editing a seed file on every machine that renders.

## What holds now

- `prompts/master_prompts.json` names the kinds, their seed file and the words
  the pipeline reads from the answers. Rails (`MasterPrompt`) and
  `generate.py` both read it.
- `master_prompts` rows are the library; one per kind is active. Each kind's
  "Original" is seeded from its file the first time the library is touched
  (or `bin/rails prompts:seed`).
- A job freezes its prompts at start (`GenerationJob#freeze_prompts!`) and
  sends them inside the slot, `prompts {"slot": ..., "prompts": {...}}`, the
  same way a confirmed plan rides along: the generation PC passes the slot on
  untouched, so no PC script change is needed for admin generations, remixes
  or re-renders. Requests carry them in the request JSON, sets and re-renders
  in their spec JSON.
- A run with no prompts of its own reads `output/active-prompts.json`, written
  by Rails whenever the library changes and by `Library.write_taste!`.
- `generate.py ask_llm` asks the kind's prompt; output the pipeline cannot
  read is asked again of the seed file and the run logs the fallback. Each
  show writes `prompts/master-prompts.json` and the job log prints
  `Master prompts: Music "..." vN`.

## Deploy order

The generation PC's checkout must have this `generate.py` before the server
sends a wrapped slot, or the PC renders a show named after the JSON.
