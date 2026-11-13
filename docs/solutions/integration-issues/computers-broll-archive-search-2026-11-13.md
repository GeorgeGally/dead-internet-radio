---
title: Mainframe B-roll searches archive.org for computer footage
date: 2026-11-13
category: integration-issues
module: web_player_visuals
problem_type: integration_issue
component: computers
tags: [broll, archive.org, computers, mainframe, terminal, footage, drawer]
---

# Mainframe B-roll searches archive.org for computer footage

`computers.js` (shown as Mainframe) is a fourth artwork built on
`createPrelingerBroll`, after Aliens and Robots. It passes two archive.org
`searches` and keeps the last 100 films shown (`recent: 100`).

| Search | Finds |
| --- | --- |
| `computers-footage` | Titles naming computers, computing, mainframes, modems, punch cards, data processing, an electronic brain, teletypes, UNIVAC, ENIAC, IBM or programmers, or subjects naming computers, computing, data processing, mainframes, UNIVAC or IBM, 1900 to 1999 |
| `computers-films` | Prelinger, classic TV, features, trailers and sci-fi naming computers, mainframes, terminals, modems, hackers, an electronic brain, punch cards, teletypes or UNIVAC, 1900 to 1999 |

Both exclude `collection:computercommercials`: it holds hundreds of video game
adverts that otherwise fill a third of the results. Neither searches the bare
word `programming`, which matches TV "programming" promos. Both keep the
size limit, skip copyright-blocked and colorized items, and stay under the
500-character limit in `BrollIndexController` once `AND mediatype:movies`
is added.

Measured on 2026-11-13: 341 and 48 matches, of which 289 and 43 had an mp4
the player opens (45 MB or less). Examples: a 1983 IBM System/36 promotional
film, a 1956 UNIVAC advert, Queensland Computer Expo '85, MAGI Synthavision
demo reel (1982), WarGames, The Net, Hackers and Johnny Mnemonic.

`node --test tests/video_reel_test.js tests/drawer_playing_outline_test.js`
covers the searches, no fallback footage, the filters and the drawer tile.
