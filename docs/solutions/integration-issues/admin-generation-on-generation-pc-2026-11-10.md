---
title: Admin generations from the live site render on the generation PC
date: 2026-11-10
category: docs/solutions/integration-issues
module: dead-internet-radio
problem_type: integration_issue
component: generation-line
tags:
  - generation
  - generation-pc
  - ace-step
---

## Problem

Trigger Generation on the live admin ran `GenerateShowJob` on apps1, which has
no ACE-Step. It failed in a second with `No such file or directory -
/var/www/dead-internet-radio/ACE-Step-1.5`. Only listener requests had a way to
the PC (`RequestLine`); admin generations had none.

## What holds now

- `GenerateShowJob` hands a non-dry-run job to the PC when
  `AceStepManager.installed?` is false: the job stays `pending` with
  `options.on_pc = true` and logs "Waiting for the generation PC".
- `GenerationLine.waiting` lists those jobs as `<id> <spec JSON>`;
  `GenerationLine.mark!` takes `queued`, `generating`, `failed`, `done <folder>`.
- The PC pulls, as with requests: apps1 never dials the PC, so the PC's address
  (LAN or Tailscale) does not matter to the server. The gate verbs
  `generations` / `generation` and the PC side live in the servers repo
  (`apps/dir-pc-gate.sh`, `dir-pc-requests.sh`, `dir-pc-render.sh`).
- Dry runs still run on apps1: they need only OpenRouter.
