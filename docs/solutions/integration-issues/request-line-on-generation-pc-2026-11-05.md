---
title: Listener requests render on the generation PC
date: 2026-11-05
category: docs/solutions/integration-issues
module: dead-internet-radio
problem_type: integration_issue
component: request-line
tags:
  - requests
  - generation-pc
  - forced-command
---

## Problem

Rendering moved to the generation PC, but requests still waited for an admin
click that started `FulfillRequestJob`, which needs ACE-Step and so cannot run on
apps1. Apps1 builds no sets either, so a rendered request had no way on air.

## What holds now

- Status: `accepted` (past the filter, the PC has not seen it), `queued` (safe on
  the PC's disk), `generating`, then `ready` and `scheduled`, or `failed`. `new`
  is not a usable enum key: Rails refuses it because it collides with `.new`.
- `RequestLine` is the PC's end, called through `dir-pc-gate` with `rails runner`.
  The key is the authentication, so there is no public route or token.
- The gate checks with `psql` first, so an idle poll never boots Rails. It reads
  `status = 7`: keep the enum value stable.
- Done puts the song on with `Station.insert_next`, then `RequestNotifier` moves
  it to `scheduled` and emails the time. A request show is never `airable`, so it
  airs this once and then joins the library for sets.
- `generate.py` writes `"kind": "request"` to `show.json`. Without it
  `dir-import.rb` would add the song to rotation as a show.

## PC side gotcha

`set -e` is off inside a function called from `||` or `&&`, and everything it
calls. The request path runs that way so that a failure leaves the nightly show
running, so every step there needs its own `|| return 1`. `send` deletes the
audio after its upload: without the check, a failed upload would delete it anyway.

Replace `dir-pc-render.sh` only when no render is running. Bash reads a running
script as it goes.
