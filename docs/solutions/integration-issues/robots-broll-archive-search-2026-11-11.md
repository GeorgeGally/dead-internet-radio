---
title: Robots B-roll searches archive.org for robot and AI footage
date: 2026-11-11
category: integration-issues
module: web_player_visuals
problem_type: integration_issue
component: robots
tags: [broll, archive.org, robots, artificial-intelligence, footage, drawer]
---

# Robots B-roll searches archive.org for robot and AI footage

`robots.js` is a third artwork built on `createPrelingerBroll`, beside the
original B-roll (Dead Telly) and Aliens. Like Aliens it passes two
archive.org `searches`, so it gets the same `/broll-index` cache, `/broll/`
proxy, buffering, filters and unavailable line, and never shows the
original's stand-ins.

| Search | Finds |
| --- | --- |
| `robots-footage` | Titles naming robots, robotics, artificial intelligence, an electronic brain, a thinking machine or an automaton, or subjects naming robots, robotics, artificial intelligence, automata or cybernetics, 1900 to 1999 |
| `robots-films` | Trailers, sci-fi, feature films, Prelinger and classic TV naming robots, artificial intelligence, an electronic brain, a thinking machine, androids or cyborgs, 1900 to 1999 |

Neither query searches for the bare token `AI`: archive.org matches it
against every field, so it pulls in unrelated items. Both exclude
`colorized`, because "colorized with artificial intelligence" newsreels
otherwise match. Both keep Aliens' `item_size:[1000000 TO 90000000]` and
`NOT subject:"copyright blocked"`, and stay under the 500-character limit in
`BrollIndexController` once `AND mediatype:movies` is added.

Measured on 2026-11-11: 93 and 40 matches, of which 85 and 39 had an mp4 the
player opens (45 MB or less). Examples: Robot Monster (1953), Cinderella 2000
(1977), Short Circuit (1986), Class of 1999 (1990), Mandroid (1993), Grasp Lab
(1985), a 1985 Transformers advert and Rearming the Spineless Opuntia, a
robotic artwork. Results are not checked shot by shot, so a reel can include
talking heads from a robot film.

`node --test tests/video_reel_test.js tests/drawer_playing_outline_test.js`
covers the searches, a new reel per track, no fallback footage, the filters,
the drawer tile and the admin's name for it.
