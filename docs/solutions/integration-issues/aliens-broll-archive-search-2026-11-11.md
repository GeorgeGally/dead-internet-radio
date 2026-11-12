---
title: Aliens B-roll searches archive.org for UFO footage
date: 2026-11-11
category: integration-issues
module: web_player_visuals
problem_type: integration_issue
component: aliens
tags: [broll, archive.org, aliens, ufo, footage, canvas, drawer]
---

# Aliens B-roll searches archive.org for UFO footage

The first Aliens artwork (2026-11-10) pinned two short excerpts from Killers
from Space and Invaders from Mars, so the same few seconds played every time.
`aliens.js` now passes `searches` to `createPrelingerBroll`: two archive.org
queries that replace the original's ad, matched-theme and wildcard themes.
Each track change runs both searches on a random results page, deals the
results out in turn and opens up to three films through the same
`/broll-index` search and metadata cache and same-origin `/broll/` proxy as
the original.

| Search | Finds |
| --- | --- |
| `aliens-sightings` | Titles or subjects naming UFOs, flying saucers or unidentified flying objects, 1900 to 1999 |
| `aliens-films` | Trailers, sci-fi, feature films, Prelinger and classic TV naming UFOs, aliens, martians, invaders, spaceships or outer space, 1900 to 1989 |

Both queries carry `item_size:[1000000 TO 90000000]`. The player only opens
an mp4 of 45 MB or less, and without the upper limit most UFO results are
single 130 to 260 MB files, so a page of twenty often held one usable film.
The lower limit and `NOT subject:"copyright blocked"` drop items whose only
video is archive.org's removal notice. Measured on 2026-11-11, the two
searches matched 56 and 101 items and most results had a usable mp4.

An artwork with `searches` never shows the original's stand-ins: no cached
film from the B-roll reel, no Giphy clip and no generic theme. With no
results, or when archive.org is down, the leader and the existing unavailable
line show. Search results are not checked shot by shot, so a reel can include
talking heads or titles from an alien film; the trade is fresh footage on
every track instead of two repeating shots.

## Same films every visit (2026-11-12)

Listeners reported Aliens "always seems to be playing same videos". Measured
on 2026-11-12, only about 130 of the two searches' results have an mp4 the
player opens (38 sightings, 90 films). Widening the queries mostly added
noise: after 1999 they find conspiracy talks and comedy uploads, and wider
terms pull in Alien franchise trailers and music videos. Raising the size
limit to 400 MB added 24 items, of which 2 in 10 had a usable mp4.

So the fix spreads picks over the pool the searches already have:

- `aliens.js` passes `recent: 100`. The engine keeps the last 100 films
  shown in `localStorage` (`broll-recent:aliens`) and orders each page's
  results with films not shown lately first, then those shown longest ago.
- The search that leads the deal changes each track. Before, the smaller
  sightings search always dealt first and took two of the three films.
- The hit count behind the random page is stored with its query and kept a
  day (`broll-count3:<search>`). The old count was kept forever by search
  name, so a changed or growing search stayed on its old first pages.

## The drawer tile

A report said Aliens showed in the admin list but not the player's artwork
drawer. Fresh headless loads of the live site and local dev showed the tile
third, after Giphy and B-roll, at desktop, iPad and phone sizes. Serving the
frontend from before the Aliens commit reproduced the symptom: the admin list
comes from the `public/visuals/*.js` files on disk, but a player tab opened
before the deploy only registers the scripts it loaded, so its drawer has no
tile until it reloads. `tests/drawer_playing_outline_test.js` loads the real
engine, B-roll and Aliens scripts in `index.html` order and checks the tile,
its thumbnail, its selection and its removal when switched off.

`node --test tests/video_reel_test.js tests/drawer_playing_outline_test.js`
covers the searches, a new reel on a track change, no fallback footage, the
filters, the original B-roll's themes and the drawer.
