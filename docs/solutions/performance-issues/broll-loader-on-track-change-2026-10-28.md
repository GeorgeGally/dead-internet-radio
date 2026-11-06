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

## 4. The rotation threw the reel away too (2026-11-06)

The artwork clock cuts in bursts of 1-4 s, so the rotation lands on B-roll for
a second or two at a time. `stop()` emptied the reel but left `trackKey` set,
so every return during the same track loaded nothing and the leader counted
down until the next track. On the live site that read as no video at all for
minutes, with `/broll` never requested.

- The reel now outlives the artwork. `stop()` only pauses it, a load in flight
  carries on, and an empty reel reloads every 20 s while on screen.
- Both video artworks start loading as soon as the track is known, before their
  first turn. Giphy holds two buffered clips across rotations.
- Cut timing uses `performance.now()`: `p.millis()` restarts with each sketch,
  and `shotAt` outlives the sketch.

## 5. A paused film pins a server thread

A paused `<video>` stops reading and keeps its range request open, so a reel
that stays around holds three Puma threads (of 16) and three archive.org
connections for the whole visit. `/broll` answers an open-ended range with
1 MB; the browser asks for the next piece when it wants one. Closed ranges,
which is what Safari sends, go through as asked. From apps1 a piece takes about
2 s with the redirect hop and less once the storage host is remembered.

Upstream errors are sent `no-store`: an archive.org 503 used to carry the
one-year `immutable` header.

**Measure on apps1, not the Mac.** Archive.org gives the Mac about 10 KB/s and
apps1 about 500 KB/s, so a local run says nothing about load times. Local dev
databases also have no tracks, which leaves the track key empty.

## 6. Some listeners can't reach archive.org

From the captain's Mac, direct calls to archive.org were reset or took 15-40 s,
so the search failed with `load failed: none` while `/broll` itself worked. The
artwork now asks `/broll-index/search` and `/broll-index/metadata/:item`. The
server gets the answer in about a second and keeps it for a day, so only the
first listener waits and a listener's own route to archive.org no longer matters.

Background loads also wait until the music has 20 s buffered (`musicHasCushion`).
On a link near 90 KB/s, three films and a next track otherwise starve the audio.
Giphy still loads straight from the listener's browser.
