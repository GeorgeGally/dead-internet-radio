---
title: Sets died on stale free models, requests on a freeze that never thawed
date: 2026-11-12
category: docs/solutions/integration-issues
module: dead-internet-radio
problem_type: integration_issue
component: generation-pc
tags:
  - openrouter
  - generation-pc
  - cool-guard
  - requests
---

## Problem

Two failures on the generation PC on the same day.

- The nightly set stopped at the Announcer: `thinkingmachines/inkling:free failed (404)`,
  `qwen/qwen3.8-27b:free failed (404)`, `LLM call failed on every model`. Two of the
  four models pinned in `OPENROUTER_MODEL` had been removed from OpenRouter, and the
  other two returned null content or 429.
- A listener request sat at GENERATING for an hour, then failed. Each of its three
  tries froze about four minutes in (`frozen=1` in `log/temps-*.log`) and never woke:
  the frozen laptop only cooled to 63-65, above the cool guard's `COOL=62`. `generate.py`
  gave up with `ACE-Step went away (memory watchdog?)` and ACE-Step logged
  `service_generate exceeded 600s timeout` when it was finally continued.
- Earlier, a non-UTF-8 byte in a prompt log raised `UnicodeDecodeError` in
  `already_broadcast_names`, which only caught `JSONDecodeError` and `OSError`.

## What holds now

- See the [setup guide](../../../README.md#setup) for model selection. Set
  `OPENROUTER_MODEL=openrouter/free` in the untracked `.env` to avoid trying stale
  models first.
- Cue sheets and prompt logs are read with `errors="replace"`.
- The cool guard (servers repo, `apps/dir-pc-coolguard.sh`) needs a cap on how long a
  freeze lasts. ACE-Step's own 600s generation timeout counts wall-clock time, frozen
  time included, so a freeze longer than a few minutes always loses the song.
