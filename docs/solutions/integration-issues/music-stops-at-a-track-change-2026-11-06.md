---
title: The music stopped at track changes on a slow path or a server restart
date: 2026-11-06
category: integration-issues
module: web_player
problem_type: integration_issue
component: player_audio
severity: high
symptoms:
  - The radio goes quiet for about 30 s around a new set or a deploy
  - A track is skipped after a stall
  - The music never comes back after a failed /broadcast call
tags: [audio, broadcast, restart, buffering, apps1]
---

# The music stopped at track changes

Every live track end waited on `/api/v1/broadcast`, then cold-started the next
track over the network and seeked to the timeline. Nothing was buffered ahead.
So any slow patch paused the music, and a track that ran late skipped the next
one on the timeline. On 2026-11-06 the captain's Mac saw a `/broadcast` call take
15.5 s and 2.8 MB of track take 82 s. If `/broadcast` failed, as it does during
a restart, `goLive` returned and nothing ever tried again. A stream error had no
retry either.

## What it does now

- The next track is fetched whole into a blob as the current one starts, and
  plays from memory. If it isn't ready in time, the track streams as before.
- A track change uses the timeline already in hand. It waits at most 1.5 s for
  a newer one, so a request booked at the last moment still airs on time.
- The timeline refreshes every 30 s without touching what's playing. New sets
  reach the player that way.
- With no timeline left, `goLive` retries every 2 s. A stream error retries with
  backoff up to 8 s. Neither retries a stream the listener stopped.

## Testing it

Kill the server under a real browser, mid-track and across a track boundary.
With a fake station in Chrome, an 8 s kill mid-track and a 16 s kill across a
boundary left no gap in `currentTime`.
