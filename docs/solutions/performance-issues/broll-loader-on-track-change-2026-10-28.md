---
title: The b-roll loader came back on every track change
date: 2026-10-28
category: performance-issues
module: web_player_visuals
problem_type: performance_issue
component: prelinger_broll
severity: high
symptoms:
  - The leader and turning circle show for many seconds, often half a minute, on a track change
  - A single /broll range request sits for a minute or more in the Rails log
  - The same three shots loop while the player waits
tags: [broll, archive.org, prelinger, caching, range-requests]
---

# The b-roll loader came back on every track change

`/broll` proxies archive.org at roughly a megabyte a second, so the reel is
always the slowest thing on the page. Three things made that show as the
loader.

## 1. Every track change threw the reel away

`pullTrack` cleared `state.films` and set `ready = false` the moment the track
key changed, so the leader drew for the whole search, metadata and buffering
wait. Now the reel on screen keeps playing and the new one is handed over only
when its first film fires `canplay` (`promoteReel`). Nothing is disposed until
the swap, so the leader is left for the very first visit only.

Watch it with the harness at `/labs/prelinger-harness.html` (needs a server
that answers `/broll`: `bin/rails server` or `bin/serve_public.py`).

## 2. Some items have no small rendition at all

| Item | Only mp4 | Effect |
|---|---|---|
| `hump-night-at-the-double-feature-drive-in-...` | 1470 MB, 720p, 3.5 h | `bytes=209715200-` on the first seek; the request sat for minutes |

`filmVideo` used to take the smallest mp4 with height ≥ 200, which for those
items is the broadcast master. It now skips anything over 45 MB and takes the
next search hit instead. The seek is also capped at two minutes into the film:
the further into a file the random start lands, the longer archive.org hunts.

## 3. Media responses were uncacheable

`BrollController` sent `max-age=86400` and the session middleware added
`Set-Cookie` to every range response, which makes a response uncacheable by
proxies. It now sends `public, max-age=31536000, immutable`, the upstream
`ETag` and `Last-Modified`, `Accept-Ranges: bytes`, and skips the session
cookie. Archive items never change under a URL, so a replay is a cache hit.

Still worth doing someday: pre-encode 15-second 480p excerpts per item so the
player never pulls a whole film, and a service-worker cache for clips that
repeat. Neither was needed once the reel stopped being thrown away.
