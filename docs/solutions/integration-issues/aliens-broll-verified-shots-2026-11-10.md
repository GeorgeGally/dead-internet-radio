---
title: Keep alien B-roll inside verified shots
date: 2026-11-10
category: integration-issues
module: web_player_visuals
problem_type: integration_issue
component: aliens
tags: [broll, archive.org, aliens, footage, canvas]
---

# Keep alien B-roll inside verified shots

An alien search can return rockets, unrelated films or human scenes from an
alien film. The original B-roll also intentionally includes ads and wildcard
subjects, and its loading fallback can show a cached film or a Giphy clip.
Those choices remain appropriate for the original artwork.

`aliens.js` registers a separate artwork through the same renderer. It pins two
archive.org files and the verified intervals below. Both use the existing
same-origin `/broll/` proxy, so drawing them does not taint the filter canvas.

| Archive item and file | Interval in seconds | Picture |
| --- | --- | --- |
| [trailer-killers-from-space-1954](https://archive.org/details/trailer-killers-from-space-1954), `Trailer Killers from Space (1954).ia.mp4` | 39.0 to 47.7 | Bug-eyed alien close-up |
| [invaders-from-mars](https://archive.org/details/invaders-from-mars), `Invaders From Mars.ia.mp4` | 94.6 to 98.2 | Martian mutants and the alien head in its globe |

The renderer seeks to the selected start, loops at the selected end and checks
the interval again before drawing. It leaves the last valid frame up during a
seek. The alien reel never reads the original artwork's cached stand-in or
fetches a general Giphy fallback. If both files fail, the existing unavailable
state appears. Adding another file requires checking its exact shots and
updating the literal selection test, rather than widening an archive search.

These are short looping excerpts, not a large footage library. Archive.org
availability and range latency still govern first playback. Local verification
used the exact downloaded archival files through a task-owned range server;
it does not measure the production proxy or prove playback in physical iOS
Safari. No audio is taken from the films.

`node --test tests/video_reel_test.js tests/visuals_filter_contract_test.js`
checks the fixed selection, interval looping, track changes, artwork rotation,
filter integration and the original reel's search behavior.
